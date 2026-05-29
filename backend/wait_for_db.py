import asyncio
import os
import sys

import asyncpg
from sqlalchemy.engine import make_url


async def main() -> int:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 1

    url = make_url(database_url)
    host = url.host or "localhost"
    port = url.port or 5432
    database = url.database
    username = url.username
    password = url.password

    print(f"Waiting for database at {host}:{port}/{database}...")

    last_error: Exception | None = None
    for attempt in range(1, 61):
        try:
            conn = await asyncpg.connect(
                host=host,
                port=port,
                user=username,
                password=password,
                database=database,
                timeout=5,
            )
            await conn.close()
            print("Database is ready.")
            return 0
        except Exception as exc:
            last_error = exc
            print(f"Database not ready yet ({attempt}/60): {exc}")
            await asyncio.sleep(1)

    print(f"Database did not become ready: {last_error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
