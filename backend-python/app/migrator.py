"""SQL file-based migration runner. Tracks applied migrations in a DB table."""
import os
import glob
from .database import get_pool

MIGRATIONS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "migrations")


def _split_sql(sql: str) -> list:
    """Split SQL into statements, handling DO $$ ... END $$ blocks."""
    statements = []
    current = []
    in_dollar = False

    for line in sql.split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue

        if "DO $$" in stripped or "DO $" in stripped:
            in_dollar = True
        if in_dollar:
            current.append(line)
            if stripped.endswith("$$;") or stripped == "END $$":
                statements.append("\n".join(current))
                current = []
                in_dollar = False
            continue

        # Normal mode — split by semicolons
        if ";" in line:
            parts = line.split(";")
            current.append(parts[0])
            stmt = "\n".join(current).strip()
            if stmt:
                statements.append(stmt)
            current = []
            for part in parts[1:-1]:
                if part.strip():
                    statements.append(part.strip())
            if parts[-1].strip():
                current.append(parts[-1])
        else:
            current.append(line)

    if current:
        stmt = "\n".join(current).strip()
        if stmt:
            statements.append(stmt)

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
