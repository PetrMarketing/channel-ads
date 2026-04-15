"""Periodic booking reminder — sends notifications 24h and 2h before appointments."""
import asyncio
from datetime import datetime, timedelta
from ..database import fetch_all, execute

_task = None


async def _check_reminders():
    while True:
        try:
            now = datetime.utcnow() + timedelta(hours=3)  # MSK offset

            # 24h reminders
            window_24_start = now + timedelta(hours=23)
            window_24_end = now + timedelta(hours=25)
            bookings_24 = await fetch_all(
                """SELECT b.*, s.name as service_name, sp.name as specialist_name
                   FROM service_bookings b
                   LEFT JOIN services s ON s.id = b.service_id
                   LEFT JOIN service_specialists sp ON sp.id = b.specialist_id
                   WHERE b.status NOT IN ('cancelled')
                     AND b.notified_24h = FALSE
                     AND (b.booking_date + b.start_time) BETWEEN $1 AND $2""",
                window_24_start, window_24_end,
            )
            for b in bookings_24:
                await _send_reminder(b, "24h")
                await execute("UPDATE service_bookings SET notified_24h = TRUE WHERE id = $1", b["id"])

            # 2h reminders
            window_2_start = now + timedelta(hours=1, minutes=30)
            window_2_end = now + timedelta(hours=2, minutes=30)
            bookings_2 = await fetch_all(
                """SELECT b.*, s.name as service_name, sp.name as specialist_name
                   FROM service_bookings b
                   LEFT JOIN services s ON s.id = b.service_id
                   LEFT JOIN service_specialists sp ON sp.id = b.specialist_id
                   WHERE b.status NOT IN ('cancelled')
                     AND b.notified_2h = FALSE
                     AND (b.booking_date + b.start_time) BETWEEN $1 AND $2""",
                window_2_start, window_2_end,
            )
            for b in bookings_2:
                await _send_reminder(b, "2h")
                await execute("UPDATE service_bookings SET notified_2h = TRUE WHERE id = $1", b["id"])

        except Exception as e:
            print(f"[BookingReminder] Error: {e}")

        await asyncio.sleep(600)  # Check every 10 minutes


async def _send_reminder(booking, reminder_type):
    """Send reminder to client via bot."""
    try:
        from .messenger import send_to_user

        service_name = booking.get("service_name", "Услуга")
        specialist_name = booking.get("specialist_name", "")
        date = booking.get("booking_date", "")
        start = booking.get("start_time", "")

        if reminder_type == "24h":
            text = f"Напоминаем о записи завтра!\n\n{service_name}"
        else:
            text = f"Ваша запись через 2 часа!\n\n{service_name}"

        if specialist_name:
            text += f" у {specialist_name}"
        text += f"\n{date} в {start}"

        uid = booking.get("client_max_user_id")
        if uid:
            await send_to_user(uid, "max", text)
        elif booking.get("client_telegram_id"):
            await send_to_user(int(booking["client_telegram_id"]), "telegram", text)
    except Exception as e:
        print(f"[BookingReminder] Send error: {e}")


def start_booking_reminder():
    global _task
    _task = asyncio.create_task(_check_reminders())
    print("[BookingReminder] Started (interval: 10m)")


def stop_booking_reminder():
    global _task
    if _task:
        _task.cancel()
        _task = None
