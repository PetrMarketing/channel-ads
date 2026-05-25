"""Пересчитать scheduled_at для всех pending funnel_progress по новой
logic (см. _compute_step_scheduled_at в funnel_processor.py).

Использует leads.created_at как baseline (момент подписки), затем
последовательно нанизывает шаги через _compute_step_scheduled_at.
МСК-таймеры считаются правильно (UTC+3).

Использование (внутри контейнера channel-ads):
    # Посмотреть что изменится без апдейта:
    docker exec channel-ads python3 /tmp/reschedule_pending.py --dry-run

    # Применить:
    docker exec channel-ads python3 /tmp/reschedule_pending.py
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta

import asyncpg


async def main():
    dry_run = "--dry-run" in sys.argv

    # Подгружаем хелпер из app
    sys.path.insert(0, "/app/backend-python")
    from app.services.funnel_processor import _compute_step_scheduled_at

    pool = await asyncpg.create_pool(os.environ["DATABASE_URL"])

    # Все pending записи + информация о шаге и leade
    rows = await pool.fetch("""
        SELECT fp.id AS fp_id, fp.lead_id, fp.funnel_step_id,
               fp.scheduled_at AS old_scheduled_at,
               fs.step_number, fs.delay_minutes, fs.delay_config,
               l.created_at AS lead_created_at
        FROM funnel_progress fp
        JOIN funnel_steps fs ON fs.id = fp.funnel_step_id
        JOIN leads l ON l.id = fp.lead_id
        WHERE fp.status = 'pending'
        ORDER BY fp.lead_id, fs.step_number
    """)

    if not rows:
        print("Нет pending записей в funnel_progress — пересчитывать нечего.")
        await pool.close()
        return

    # Группируем по lead_id (сохраняя порядок step_number)
    by_lead: dict[int, list] = {}
    for r in rows:
        by_lead.setdefault(r["lead_id"], []).append(r)

    print(f"Обнаружено {len(rows)} pending записей по {len(by_lead)} лидам.")
    print(f"{'DRY-RUN — ничего не меняем.' if dry_run else 'РЕЖИМ APPLY — обновляем БД.'}")
    print()

    changes = 0
    unchanged = 0
    for lead_id, steps in by_lead.items():
        # Baseline для первого шага = момент подписки лида
        # (lead.created_at в БД — timestamp without TZ, naive UTC)
        baseline = steps[0]["lead_created_at"]
        if baseline is None:
            print(f"  ✗ lead {lead_id}: created_at пустой, пропускаем")
            continue

        prev_at_utc = baseline
        for r in steps:
            step = {
                "delay_minutes": r["delay_minutes"],
                "delay_config": r["delay_config"],
                "id": r["funnel_step_id"],
            }
            new_at = _compute_step_scheduled_at(prev_at_utc, step)
            old_at = r["old_scheduled_at"]

            # Если разница > 60 сек — считаем изменением (защита от микросдвигов)
            if abs((new_at - old_at).total_seconds()) > 60:
                old_msk = old_at + timedelta(hours=3)
                new_msk = new_at + timedelta(hours=3)
                diff_h = round((new_at - old_at).total_seconds() / 3600, 1)
                print(f"  lead={lead_id} step#{r['step_number']} fp_id={r['fp_id']}: "
                      f"{old_msk:%Y-%m-%d %H:%M} МСК → {new_msk:%Y-%m-%d %H:%M} МСК (Δ {diff_h:+}ч)")
                if not dry_run:
                    await pool.execute(
                        "UPDATE funnel_progress SET scheduled_at = $1 WHERE id = $2",
                        new_at, r["fp_id"],
                    )
                changes += 1
            else:
                unchanged += 1
            prev_at_utc = new_at

    print()
    print(f"Итого: {changes} записей {'будет обновлено' if dry_run else 'обновлено'}, {unchanged} без изменений.")
    await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
