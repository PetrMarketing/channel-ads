import json
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from typing import Dict, Any, Optional

from ..middleware.auth import get_current_user
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()


async def _get_owned_channel(tc: str, uid: int):
    from ..middleware.auth import get_channel_for_user
    return await get_channel_for_user(tc, uid, "payments")


# --- Payment Plans ---

@router.get("/{tc}/plans")
async def list_plans(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    plans = await fetch_all("SELECT * FROM payment_plans WHERE channel_id = $1 ORDER BY created_at DESC", channel["id"])
    return {"success": True, "plans": plans}


@router.post("/{tc}/plans")
async def create_plan(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    body = await request.json()
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    pid = await execute_returning_id(
        """INSERT INTO payment_plans (channel_id, product_id, course_id, name, plan_type, total_amount, installment_count, interval_days)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id""",
        channel["id"], body.get("product_id"), body.get("course_id"),
        body.get("name", ""), body.get("plan_type", "one_time"),
        body.get("total_amount", 0), body.get("installment_count", 1), body.get("interval_days", 30),
    )
    return {"success": True, "planId": pid}


@router.put("/{tc}/plans/{plan_id}")
async def update_plan(tc: str, plan_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("name", "plan_type", "total_amount", "installment_count", "interval_days", "is_active"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([plan_id, channel["id"]])
    await execute(f"UPDATE payment_plans SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/{tc}/plans/{plan_id}")
async def delete_plan(tc: str, plan_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM payment_plans WHERE id = $1 AND channel_id = $2", plan_id, channel["id"])
    return {"success": True}


# --- Payments ---

@router.get("/{tc}/payments")
async def list_payments(tc: str, status: Optional[str] = None, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    sql = "SELECT * FROM payments WHERE channel_id = $1"
    params = [channel["id"]]
    if status:
        sql += " AND payment_status = $2"
        params.append(status)
    sql += " ORDER BY created_at DESC LIMIT 200"
    payments = await fetch_all(sql, *params)
    return {"success": True, "payments": payments}


@router.post("/{tc}/payments")
async def record_payment(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    body = await request.json()
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    pid = await execute_returning_id(
        """INSERT INTO payments (channel_id, order_id, client_id, amount, payment_method, payment_status, plan_id, installment_number, paid_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING id""",
        channel["id"], body.get("order_id"), body.get("client_id"),
        body.get("amount", 0), body.get("payment_method"),
        body.get("payment_status", "paid"), body.get("plan_id"),
        body.get("installment_number", 1),
    )

    # Update client total_spent
    if body.get("client_id") and body.get("amount"):
        await execute(
            "UPDATE clients SET total_spent = total_spent + $1 WHERE id = $2",
            body["amount"], body["client_id"],
        )

    # Loyalty points / cashback
    if body.get("client_id"):
        client = await fetch_one("SELECT * FROM clients WHERE id = $1", body["client_id"])
        if client:
            program = await fetch_one("SELECT * FROM loyalty_programs WHERE channel_id = $1 AND is_active = 1", channel["id"])
            if program:
                points = int(float(body.get("amount", 0)) * float(program.get("points_per_ruble", 0)))
                if points > 0:
                    await execute(
                        "UPDATE clients SET loyalty_points = loyalty_points + $1 WHERE id = $2",
                        points, body["client_id"],
                    )
                    await execute(
                        """INSERT INTO loyalty_transactions (client_id, channel_id, transaction_type, points, description, reference_type, reference_id)
                           VALUES ($1,$2,'earn',$3,'Payment reward','payment',$4)""",
                        body["client_id"], channel["id"], points, pid,
                    )

    return {"success": True, "paymentId": pid}


@router.post("/{tc}/payments/{payment_id}/refund")
async def refund_payment(tc: str, payment_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    body = await request.json()
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    payment = await fetch_one("SELECT * FROM payments WHERE id = $1 AND channel_id = $2", payment_id, channel["id"])
    if not payment:
        raise HTTPException(status_code=404, detail="Платёж не найден")

    refund_amount = body.get("amount", payment["amount"])
    await execute(
        "UPDATE payments SET payment_status = 'refunded', refund_amount = $1 WHERE id = $2",
        refund_amount, payment_id,
    )

    # Reverse client total_spent
    if payment.get("client_id"):
        await execute(
            "UPDATE clients SET total_spent = total_spent - $1 WHERE id = $2",
            refund_amount, payment["client_id"],
        )

    return {"success": True}


# --- Analytics ---

@router.get("/{tc}/analytics")
async def payment_analytics(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    daily = await fetch_all("""
        SELECT DATE(paid_at) as date, SUM(amount) as revenue, COUNT(*) as count
        FROM payments WHERE channel_id = $1 AND payment_status = 'paid' AND paid_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(paid_at) ORDER BY date
    """, channel["id"])

    by_method = await fetch_all("""
        SELECT payment_method, SUM(amount) as total, COUNT(*) as count
        FROM payments WHERE channel_id = $1 AND payment_status = 'paid'
        GROUP BY payment_method ORDER BY total DESC
    """, channel["id"])

    top_products = await fetch_all("""
        SELECT p.title, SUM(pay.amount) as revenue, COUNT(*) as count
        FROM payments pay
        JOIN orders o ON o.id = pay.order_id
        JOIN products p ON p.id = o.product_id
        WHERE pay.channel_id = $1 AND pay.payment_status = 'paid'
        GROUP BY p.title ORDER BY revenue DESC LIMIT 10
    """, channel["id"])

    return {"success": True, "daily": daily, "byMethod": by_method, "topProducts": top_products}
