"""SQL file-based migration runner. Tracks applied migrations in a DB table."""
import os
import glob
from .database import get_pool

MIGRATIONS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "migrations")


def _split_sql(sql: str) -> list:
    """Split SQL into statements. Honors:
    - dollar-quoted strings $$...$$ или $tag$...$tag$ (PostgreSQL string literals)
    - однострочные комментарии -- (только если ВСЯ строка — комментарий)
    - точки с запятой ВНУТРИ $$...$$ не считаются разделителями
    """
    statements = []
    buf = []
    i = 0
    n = len(sql)
    dollar_tag = None  # текущий открытый dollar-quoted tag, например '$$' или '$body$'

    while i < n:
        ch = sql[i]
        # Если внутри dollar-quoted строки — ищем закрывающий тег
        if dollar_tag is not None:
            if sql.startswith(dollar_tag, i):
                buf.append(dollar_tag)
                i += len(dollar_tag)
                dollar_tag = None
                continue
            buf.append(ch)
            i += 1
            continue
        # Однострочный комментарий -- (до конца строки) — но только если
        # начинается с начала строки или после пробелов (не внутри URL/style)
        if ch == "-" and i + 1 < n and sql[i+1] == "-":
            # Проверяем что мы в начале токена (предыдущий символ — \n или пусто)
            prev_nl = sql.rfind("\n", 0, i)
            between = sql[prev_nl+1:i].strip() if prev_nl != -1 else sql[:i].strip()
            if between == "":
                # реальный комментарий — съедаем до конца строки
                end = sql.find("\n", i)
                if end == -1:
                    i = n
                else:
                    i = end + 1
                continue
        # Открытие dollar-quoted строки: $$ или $tag$
        if ch == "$":
            # Пробуем найти tag: $[A-Za-z0-9_]*$
            j = i + 1
            while j < n and (sql[j].isalnum() or sql[j] == "_"):
                j += 1
            if j < n and sql[j] == "$":
                tag = sql[i:j+1]  # $$ или $tag$
                dollar_tag = tag
                buf.append(tag)
                i = j + 1
                continue
        # Разделитель statement'а
        if ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1

    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


async def run_migrations():
    """Run all pending SQL migration files in order."""
    pool = await get_pool()

    # Create migrations tracking table
    await pool.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            id SERIAL PRIMARY KEY,
            filename TEXT UNIQUE NOT NULL,
            applied_at TIMESTAMP DEFAULT NOW()
        )
    """)

    # Get already applied migrations
    rows = await pool.fetch("SELECT filename FROM _migrations ORDER BY filename")
    applied = {r["filename"] for r in rows}

    # Find all .sql files, sorted by name
    pattern = os.path.join(MIGRATIONS_DIR, "*.sql")
    files = sorted(glob.glob(pattern))

    if not files:
        print("[Migrator] No migration files found")
        return

    count = 0
    for filepath in files:
        filename = os.path.basename(filepath)
        if filename in applied:
            continue

        print(f"[Migrator] Applying {filename}...")
        with open(filepath, "r") as f:
            sql = f.read()

        # Split on semicolons but handle DO $$ ... END $$ blocks
        statements = _split_sql(sql)

        errors = 0
        for stmt in statements:
            try:
                await pool.execute(stmt)
            except Exception as e:
                err = str(e)
                if "already exists" in err or "duplicate" in err.lower():
                    pass
                else:
                    print(f"[Migrator] Warning in {filename}: {err[:200]}")
                    errors += 1

        await pool.execute(
            "INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
            filename,
        )
        count += 1
        status = f" ({errors} warnings)" if errors else ""
        print(f"[Migrator] Applied {filename}{status}")

    if count == 0:
        print("[Migrator] All migrations up to date")
    else:
        print(f"[Migrator] Applied {count} migration(s)")
