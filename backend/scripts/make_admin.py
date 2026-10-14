"""Grant or revoke admin rights for an existing CashFlo account.

Usage (from the backend folder, with MONGO_URL and DB_NAME set in .env):
    python scripts/make_admin.py ty@example.com
    python scripts/make_admin.py ty@example.com --revoke

Admin rights live only in the database. The account must already exist,
so register in the app first, then run this script.
"""
import argparse
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


async def main(email: str, revoke: bool) -> None:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    flags = {"is_admin": not revoke}
    if not revoke:
        flags["is_pro"] = True
    result = await db.users.update_one(
        {"email": email.strip().lower()},
        {"$set": flags},
        collation={"locale": "en", "strength": 2},
    )
    client.close()
    if result.matched_count == 0:
        raise SystemExit(f"Nie znaleziono konta {email}. Najpierw zarejestruj się w aplikacji.")
    print(f"{email}: admin {'odebrany' if revoke else 'nadany'}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Nadaj lub odbierz uprawnienia admina.")
    parser.add_argument("email")
    parser.add_argument("--revoke", action="store_true", help="odbierz uprawnienia admina")
    args = parser.parse_args()
    asyncio.run(main(args.email, args.revoke))
