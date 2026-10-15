from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, Query, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import Any, List, Optional, Dict
from datetime import date, datetime, time as dtime, timedelta
from collections import Counter
from passlib.context import CryptContext
import jwt
from bson import ObjectId
from typing import Literal
from fastapi.responses import HTMLResponse, Response
from starlette.concurrency import run_in_threadpool
import calendar
import base64
import hashlib
import hmac
import json
import html
import re
import secrets
import smtplib
import ssl
from email.message import EmailMessage
import stripe

import importer
import insights
import exporter

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration (secret MUST be provided via environment)
SECRET_KEY = os.environ.get('JWT_SECRET_KEY')
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY environment variable is required")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

# Stripe Configuration
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '')
stripe.api_key = STRIPE_API_KEY

# Stripe price IDs for each Pro plan (Stripe Dashboard -> Product catalog)
STRIPE_PRICES = {
    "monthly": os.environ.get('STRIPE_PRICE_MONTHLY', ''),
    "yearly": os.environ.get('STRIPE_PRICE_YEARLY', ''),
    "lifetime": os.environ.get('STRIPE_PRICE_LIFETIME', ''),
}

# Public address of this server, used for the page Stripe returns to after paying.
# Falls back to the address the request came in on.
PUBLIC_API_URL = os.environ.get('PUBLIC_API_URL', '').rstrip('/')

# Web addresses of the app (Expo web build) that checkout may send people back to
ALLOWED_RETURN_ORIGINS = [
    o.strip().rstrip('/') for o in os.environ.get('ALLOWED_RETURN_ORIGINS', '').split(',') if o.strip()
]

# Deep-link scheme of the mobile app (app.json -> expo.scheme)
APP_SCHEME = os.environ.get('APP_SCHEME', 'cashflo')

# E-mail (password reset codes). Works with any SMTP server, e.g. Gmail with an app password.
SMTP_HOST = os.environ.get('SMTP_HOST', '')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
SMTP_FROM = os.environ.get('SMTP_FROM', '') or SMTP_USER

# Waitlist form on cashflo.cash (Tally): signed webhook -> thank-you e-mail to the person who signed up
TALLY_SIGNING_SECRET = os.environ.get('TALLY_SIGNING_SECRET', '')

def read_date_setting(name: str) -> Optional[date]:
    """Reads a YYYY-MM-DD date from the environment; empty or invalid means not set."""
    raw = os.environ.get(name, '').strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        logging.getLogger(__name__).warning(f"{name} should look like 2026-12-31, got {raw!r}; ignoring it")
        return None


# Test period: everyone has Pro for free up to and including this day (e.g. BETA_PRO_UNTIL=2026-12-31).
# Used while the app is in closed testing on Google Play, before in-app purchases exist there.
BETA_PRO_UNTIL = read_date_setting('BETA_PRO_UNTIL')

# Free plan limits
FREE_GOAL_LIMIT = 1
FREE_CUSTOM_CATEGORY_LIMIT = 3
FREE_IMPORT_LIMIT = 1          # bank statement / spreadsheet imports
FREE_RECURRING_LIMIT = 3       # active recurring payments

# Receipts are stored as data URLs; keep them small so lists stay fast
MAX_RECEIPT_CHARS = 2_500_000

PASSWORD_MIN_LENGTH = 6
RESET_CODE_TTL_MINUTES = 15
RESET_CODE_MAX_ATTEMPTS = 5

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# ============= MODELS =============

class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __modify_schema__(cls, field_schema):
        field_schema.update(type="string")


# User Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=128)
    name: str = Field(min_length=1, max_length=60)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    is_pro: bool = False
    is_admin: bool = False
    pro_plan: Optional[str] = None
    # Why Pro is on: "paid" (or granted by an admin), "admin", "beta" (free test period), None when off
    pro_source: Optional[str] = None
    beta_pro_until: Optional[str] = None
    can_manage_subscription: bool = False
    created_at: datetime
    last_login: Optional[datetime] = None
    login_count: int = 0

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=128)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# Transaction Models
class TransactionCreate(BaseModel):
    amount: float = Field(gt=0, lt=100_000_000)
    type: Literal["expense", "income"]
    category: str = Field(min_length=1, max_length=60)
    description: Optional[str] = Field(default="", max_length=500)
    date: datetime
    is_recurring: bool = False
    recurring_day: Optional[int] = Field(default=None, ge=1, le=31)  # Day of month for recurring transactions
    receipt_image: Optional[str] = None  # data URL (base64)

class TransactionUpdate(BaseModel):
    amount: Optional[float] = Field(default=None, gt=0, lt=100_000_000)
    type: Optional[Literal["expense", "income"]] = None
    category: Optional[str] = Field(default=None, min_length=1, max_length=60)
    description: Optional[str] = Field(default=None, max_length=500)
    date: Optional[datetime] = None
    is_recurring: Optional[bool] = None
    recurring_day: Optional[int] = Field(default=None, ge=1, le=31)
    receipt_image: Optional[str] = None
    remove_receipt: bool = False

class TransactionResponse(BaseModel):
    id: str
    user_id: str
    amount: float
    type: str
    category: str
    description: str
    date: datetime
    is_recurring: bool
    recurring_day: Optional[int] = None
    recurring_parent_id: Optional[str] = None
    recurring_id: Optional[str] = None   # the recurring payment this transaction came from
    imported: bool = False               # added by importing a bank statement / spreadsheet
    receipt_image: Optional[str] = None
    has_receipt: bool = False
    created_at: datetime


# Category Models
class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    icon: str = Field(min_length=1, max_length=40)
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    type: Literal["expense", "income"] = "expense"

class CategoryResponse(BaseModel):
    id: str
    user_id: str
    name: str
    icon: str
    color: str
    type: str = "expense"
    is_default: bool = False


# Goal Models
class GoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    target_amount: float = Field(gt=0, lt=100_000_000)
    current_amount: float = Field(default=0, ge=0, lt=100_000_000)
    deadline: Optional[datetime] = None

class GoalUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    target_amount: Optional[float] = Field(default=None, gt=0, lt=100_000_000)
    current_amount: Optional[float] = Field(default=None, ge=0, lt=100_000_000)
    deadline: Optional[datetime] = None

class GoalResponse(BaseModel):
    id: str
    user_id: str
    name: str
    target_amount: float
    current_amount: float
    deadline: Optional[datetime] = None
    progress: float
    created_at: datetime


# Budget Models
class BudgetCreate(BaseModel):
    monthly_limit: float = Field(ge=0, lt=100_000_000)
    # Pro: spending limit per expense category, e.g. {"Jedzenie i Picie": 800}
    category_limits: Optional[Dict[str, float]] = None

class BudgetResponse(BaseModel):
    id: str
    user_id: str
    monthly_limit: float
    category_limits: dict
    current_month_spending: float
    category_spending: Dict[str, float] = {}   # this month, for categories that have a limit
    category_limits_active: bool = False       # limits are a Pro feature


# Stats Models
class MonthlyStats(BaseModel):
    total_income: float          # this month
    total_expenses: float        # this month
    balance: float               # all-time balance (all income minus all expenses)
    month_balance: float = 0     # this month's income minus expenses
    expenses_by_category: dict
    top_categories: List[dict]


# Payment Models
class CheckoutRequest(BaseModel):
    plan: Literal["monthly", "yearly", "lifetime"]
    platform: Literal["native", "web"] = "native"
    origin_url: Optional[str] = None  # web only: where the app runs

class PaymentStatusResponse(BaseModel):
    status: str
    payment_status: str
    is_pro_activated: bool = False


# ============= UTILITY FUNCTIONS =============

def _utc_timestamp(dt: datetime) -> int:
    """Seconds since epoch for a naive UTC datetime."""
    return calendar.timegm(dt.utctimetuple())


def create_access_token(data: dict):
    to_encode = data.copy()
    now = datetime.utcnow()
    expire = now + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "iat": _utc_timestamp(now)})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Case-insensitive match for e-mail lookups (also finds older accounts
# that were stored with capital letters).
EMAIL_COLLATION = {"locale": "en", "strength": 2}


def normalize_email(email: str) -> str:
    return email.strip().lower()


def to_object_id(value: str, not_found: str = "Not found") -> ObjectId:
    """Turn a path id into an ObjectId, answering 404 instead of 500 for malformed ids."""
    if not value or not ObjectId.is_valid(value):
        raise HTTPException(status_code=404, detail=not_found)
    return ObjectId(value)


def stripe_ready() -> bool:
    return bool(STRIPE_API_KEY)


def sget(obj, key, default=None):
    """Read a field from a Stripe object or a dict, whichever it is."""
    if obj is None:
        return default
    try:
        value = obj[key]
    except (KeyError, IndexError, TypeError, AttributeError):
        return default
    return default if value is None else value


def public_base_url(request: Request) -> str:
    return PUBLIC_API_URL or str(request.base_url).rstrip('/')


def smtp_ready() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)


def send_email(to: str, subject: str, body: str, reply_to: Optional[str] = None) -> None:
    """Send a plain-text e-mail through the configured SMTP server (blocking: run it in a thread)."""
    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(body)
    context = ssl.create_default_context()
    if SMTP_PORT == 465:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context, timeout=20) as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
            server.starttls(context=context)
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)


def hash_reset_code(user_id: str, code: str) -> str:
    return hmac.new(SECRET_KEY.encode(), f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def user_to_response(user: dict) -> UserResponse:
    is_admin = user.get("is_admin", False)
    source = pro_source(user)
    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        name=user["name"],
        is_pro=source is not None,
        is_admin=is_admin,
        pro_plan=user.get("pro_plan"),
        pro_source=source,
        beta_pro_until=BETA_PRO_UNTIL.isoformat() if source == "beta" else None,
        can_manage_subscription=bool(user.get("stripe_customer_id") and user.get("stripe_subscription_id")),
        created_at=user["created_at"],
        last_login=user.get("last_login"),
        login_count=user.get("login_count", 0),
    )


def beta_pro_active() -> bool:
    return BETA_PRO_UNTIL is not None and datetime.utcnow().date() <= BETA_PRO_UNTIL


def pro_source(user: dict) -> Optional[str]:
    if user.get("is_pro", False):
        return "paid"
    if user.get("is_admin", False):
        return "admin"
    if beta_pro_active():
        return "beta"
    return None


def is_pro_user(user: dict) -> bool:
    return pro_source(user) is not None


def validate_receipt(receipt: Optional[str]) -> None:
    if receipt is None:
        return
    if not receipt.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Receipt must be an image")
    if len(receipt) > MAX_RECEIPT_CHARS:
        raise HTTPException(status_code=413, detail="Receipt image is too large")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = verify_token(token)
    user_id = payload.get("user_id")
    if not user_id or not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Sessions started before the last password change stop working
    changed_at = user.get("password_changed_at")
    if changed_at and payload.get("iat", 0) < _utc_timestamp(changed_at):
        raise HTTPException(status_code=401, detail="Session expired")

    return user


# ============= DEFAULT CATEGORIES =============

DEFAULT_CATEGORIES = [
    {"name": "Wypłata", "icon": "wallet", "color": "#4CAF50", "type": "income"},
    {"name": "Premia", "icon": "gift", "color": "#66BB6A", "type": "income"},
    {"name": "Inne przychody", "icon": "cash", "color": "#81C784", "type": "income"},
    {"name": "Jedzenie i Picie", "icon": "fast-food", "color": "#FF6B6B", "type": "expense"},
    {"name": "Transport", "icon": "car", "color": "#4ECDC4", "type": "expense"},
    {"name": "Dom i Rachunki", "icon": "home", "color": "#45B7D1", "type": "expense"},
    {"name": "Rozrywka", "icon": "game-controller", "color": "#FFA07A", "type": "expense"},
    {"name": "Zakupy", "icon": "cart", "color": "#98D8C8", "type": "expense"},
    {"name": "Zdrowie", "icon": "medical", "color": "#FF7F50", "type": "expense"},
    {"name": "Edukacja", "icon": "book", "color": "#6C5CE7", "type": "expense"},
    {"name": "Inne", "icon": "ellipsis-horizontal", "color": "#95A5A6", "type": "expense"},
]


# Admin rights come only from the is_admin flag stored in the database.
# Grant them with: python scripts/make_admin.py <email>
# (Registration does not verify e-mail ownership, so an e-mail address alone
# must never grant admin access.)


# ============= HEALTH CHECK =============

@api_router.get("/health")
async def health():
    """Used by the hosting platform to check the server and its database are up."""
    try:
        await db.command("ping")
    except Exception as e:
        logger.error(f"Health check: database unreachable: {e}")
        raise HTTPException(status_code=503, detail="Database unreachable")
    return {"status": "ok"}


# ============= AUTH ENDPOINTS =============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    email = normalize_email(user_data.email)
    name = user_data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    existing_user = await db.users.find_one({"email": email}, collation=EMAIL_COLLATION)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    now = datetime.utcnow()
    user_dict = {
        "email": email,
        "password_hash": pwd_context.hash(user_data.password),
        "name": name,
        "is_pro": False,
        "is_admin": False,
        "created_at": now,
        "last_login": now,
        "login_count": 1,
        "login_history": [now],
    }
    result = await db.users.insert_one(user_dict)
    user_id = str(result.inserted_id)
    user_dict["_id"] = result.inserted_id

    # Default categories for the new user
    await db.categories.insert_many([
        {
            "user_id": user_id,
            "name": cat["name"],
            "icon": cat["icon"],
            "color": cat["color"],
            "type": cat.get("type", "expense"),
            "is_default": True,
        }
        for cat in DEFAULT_CATEGORIES
    ])

    access_token = create_access_token({"user_id": user_id})
    return TokenResponse(access_token=access_token, user=user_to_response(user_dict))


@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    user = await db.users.find_one({"email": normalize_email(user_data.email)}, collation=EMAIL_COLLATION)
    if not user or not pwd_context.verify(user_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    now = datetime.utcnow()
    # Keep only the last 100 logins for retention metrics
    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {"last_login": now},
            "$inc": {"login_count": 1},
            "$push": {"login_history": {"$each": [now], "$slice": -100}},
        },
    )
    user["last_login"] = now
    user["login_count"] = user.get("login_count", 0) + 1

    access_token = create_access_token({"user_id": str(user["_id"])})
    return TokenResponse(access_token=access_token, user=user_to_response(user))


@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return user_to_response(current_user)


@api_router.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    """E-mail a 6-digit code for setting a new password.

    Answers the same way whether or not the address has an account,
    so it can't be used to check who is registered.
    """
    if not smtp_ready():
        logger.error("Password reset requested, but SMTP is not configured")
        raise HTTPException(status_code=503, detail="Password reset is not available")

    user = await db.users.find_one({"email": normalize_email(body.email)}, collation=EMAIL_COLLATION)
    if not user:
        return {"status": "ok"}

    now = datetime.utcnow()
    last_sent = user.get("reset_requested_at")
    if last_sent and now - last_sent < timedelta(seconds=60):
        return {"status": "ok"}

    code = f"{secrets.randbelow(1_000_000):06d}"
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {
            "reset_code_hash": hash_reset_code(str(user["_id"]), code),
            "reset_expires_at": now + timedelta(minutes=RESET_CODE_TTL_MINUTES),
            "reset_attempts": 0,
            "reset_requested_at": now,
        }},
    )

    text = (
        f"Cześć {user.get('name', '')},\n\n"
        f"Twój kod do ustawienia nowego hasła w CashFlo: {code}\n\n"
        f"Kod jest ważny przez {RESET_CODE_TTL_MINUTES} minut. "
        "Jeśli to nie Ty, zignoruj tę wiadomość. Twoje hasło się nie zmieni.\n\n"
        "Zespół CashFlo"
    )
    try:
        await run_in_threadpool(send_email, user["email"], "Kod do zmiany hasła w CashFlo", text)
    except Exception as e:
        logger.error(f"Could not send password reset e-mail: {e}")
        raise HTTPException(status_code=503, detail="Could not send e-mail")

    return {"status": "ok"}


@api_router.post("/auth/reset-password")
async def reset_password(body: ResetPasswordRequest):
    invalid = HTTPException(status_code=400, detail="Invalid or expired code")

    user = await db.users.find_one({"email": normalize_email(body.email)}, collation=EMAIL_COLLATION)
    if not user or not user.get("reset_code_hash"):
        raise invalid

    now = datetime.utcnow()
    expires_at = user.get("reset_expires_at")
    if not expires_at or expires_at < now:
        raise invalid
    if user.get("reset_attempts", 0) >= RESET_CODE_MAX_ATTEMPTS:
        raise invalid

    expected = user["reset_code_hash"]
    given = hash_reset_code(str(user["_id"]), body.code.strip())
    if not hmac.compare_digest(expected, given):
        await db.users.update_one({"_id": user["_id"]}, {"$inc": {"reset_attempts": 1}})
        raise invalid

    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": pwd_context.hash(body.new_password),
                "password_changed_at": now,
            },
            "$unset": {
                "reset_code_hash": "",
                "reset_expires_at": "",
                "reset_attempts": "",
                "reset_requested_at": "",
            },
        },
    )
    logger.info(f"Password reset for user {user['_id']}")
    return {"status": "ok"}


class DeleteAccountRequest(BaseModel):
    password: str


USER_DATA_COLLECTIONS = (
    "transactions", "goals", "budgets", "categories",
    "recurring_payments", "recurring_dismissed", "imports", "import_sessions",
)


async def delete_user_data(user_id: str) -> None:
    for name in USER_DATA_COLLECTIONS:
        await db[name].delete_many({"user_id": user_id})


async def cancel_stripe_subscription(user: dict) -> None:
    """Cancel the user's Stripe subscription so they are not charged again.

    Raises an error (and the account is kept) if the subscription can't be cancelled.
    """
    sub_id = user.get("stripe_subscription_id")
    if not sub_id:
        return
    if not stripe_ready():
        raise HTTPException(status_code=503, detail="Could not cancel subscription")
    try:
        await run_in_threadpool(stripe.Subscription.cancel, sub_id)
    except Exception as e:
        try:
            subscription = await run_in_threadpool(stripe.Subscription.retrieve, sub_id)
            if sget(subscription, "status") == "canceled":
                return
        except Exception:
            pass
        logger.error(f"Could not cancel subscription {sub_id}: {e}")
        raise HTTPException(status_code=502, detail="Could not cancel subscription")


@api_router.post("/auth/delete-account")
async def delete_own_account(
    body: DeleteAccountRequest,
    current_user: dict = Depends(get_current_user),
):
    """Permanently delete the signed-in user's account and all their data.

    Required by the App Store for apps with sign-up, and by GDPR (right to erasure).
    The password is asked again so a borrowed, unlocked phone can't wipe the account.
    """
    if not pwd_context.verify(body.password, current_user["password_hash"]):
        raise HTTPException(status_code=403, detail="Invalid password")

    # Stop future charges first; if that fails, nothing is deleted
    await cancel_stripe_subscription(current_user)

    user_id = str(current_user["_id"])
    await delete_user_data(user_id)
    # Keep payment records for accounting, but strip everything that identifies the person
    await db.payment_transactions.update_many(
        {"user_id": user_id},
        {
            "$set": {"user_id": None, "account_deleted_at": datetime.utcnow()},
            "$unset": {"metadata.user_email": ""},
        },
    )
    await db.users.delete_one({"_id": current_user["_id"]})

    logger.info(f"User {user_id} deleted their account")
    return {"status": "deleted"}


# ============= TRANSACTION ENDPOINTS =============

def transaction_to_response(t: dict, include_receipt: bool = True) -> TransactionResponse:
    receipt = t.get("receipt_image")
    return TransactionResponse(
        id=str(t["_id"]),
        user_id=t["user_id"],
        amount=t["amount"],
        type=t["type"],
        category=t["category"],
        description=t.get("description") or "",
        date=t["date"],
        is_recurring=bool(t.get("is_recurring") or t.get("recurring_id")),
        recurring_day=t.get("recurring_day"),
        recurring_parent_id=t.get("recurring_parent_id"),
        recurring_id=t.get("recurring_id"),
        imported=bool(t.get("import_id")),
        receipt_image=receipt if include_receipt else None,
        has_receipt=bool(receipt) if include_receipt else bool(t.get("has_receipt")),
        created_at=t["created_at"],
    )


@api_router.post("/transactions", response_model=TransactionResponse)
async def create_transaction(
    transaction: TransactionCreate,
    current_user: dict = Depends(get_current_user)
):
    validate_receipt(transaction.receipt_image)
    user_id = str(current_user["_id"])
    now = datetime.utcnow()

    transaction_dict = {
        "user_id": user_id,
        "amount": round(transaction.amount, 2),
        "type": transaction.type,
        "category": transaction.category.strip(),
        "description": (transaction.description or "").strip(),
        "date": transaction.date,
        "is_recurring": False,
        "recurring_day": None,
        "recurring_parent_id": None,
        "receipt_image": transaction.receipt_image,
        "created_at": now,
    }

    # "Repeat every month": this transaction is the first payment, the next ones are added automatically
    if transaction.is_recurring:
        await ensure_can_add_recurring(current_user)
        first_day = transaction.date.date()
        anchor = transaction.recurring_day or first_day.day
        recurring_doc = {
            "user_id": user_id,
            "name": transaction_dict["description"] or transaction_dict["category"],
            "amount": transaction_dict["amount"],
            "type": transaction.type,
            "category": transaction_dict["category"],
            "frequency": "monthly",
            "anchor_day": anchor,
            "next_date": insights.at_noon(insights.next_occurrence(first_day, "monthly", anchor)),
            "is_subscription": False,
            "active": True,
            "source": "transaction",
            "created_at": now,
        }
        result = await db.recurring_payments.insert_one(recurring_doc)
        transaction_dict["recurring_id"] = str(result.inserted_id)

    result = await db.transactions.insert_one(transaction_dict)
    transaction_dict["_id"] = result.inserted_id
    return transaction_to_response(transaction_dict)


# ============= RECURRING PAYMENTS =============
#
# A recurring payment (rent, phone, Netflix, salary...) has the date of its next payment.
# Whenever the app loads data, payments that are due are added as ordinary transactions
# (linked by recurring_id) and next_date moves on. No background job is needed.

RECURRING_MAX_CATCHUP = 60


def _end_of_today() -> datetime:
    now = datetime.utcnow()
    return datetime(now.year, now.month, now.day, 23, 59, 59)


async def migrate_legacy_recurring(user_id: str) -> None:
    """Older app versions marked a transaction as a monthly template; turn those into recurring payments."""
    templates = await db.transactions.find({
        "user_id": user_id,
        "is_recurring": True,
        "recurring_parent_id": None,
        "recurring_id": None,
    }).to_list(200)
    for template in templates:
        day = template.get("recurring_day") or template["date"].day
        latest = await db.transactions.find_one(
            {"recurring_parent_id": str(template["_id"])}, sort=[("date", -1)]
        )
        last_date = (latest or template)["date"].date()
        rec = await db.recurring_payments.insert_one({
            "user_id": user_id,
            "name": (template.get("description") or "").strip() or template["category"],
            "amount": template["amount"],
            "type": template["type"],
            "category": template["category"],
            "frequency": "monthly",
            "anchor_day": day,
            "next_date": insights.at_noon(insights.next_occurrence(last_date, "monthly", day)),
            "is_subscription": False,
            "active": True,
            "source": "legacy",
            "created_at": datetime.utcnow(),
        })
        rec_id = str(rec.inserted_id)
        await db.transactions.update_one({"_id": template["_id"]}, {"$set": {"recurring_id": rec_id, "is_recurring": False}})
        await db.transactions.update_many({"recurring_parent_id": str(template["_id"])}, {"$set": {"recurring_id": rec_id}})


async def process_due_recurring(user_id: str) -> int:
    """Add the transactions of recurring payments that are due (today or missed days). Returns how many."""
    await migrate_legacy_recurring(user_id)
    cutoff = _end_of_today()
    created = 0
    due = await db.recurring_payments.find({
        "user_id": user_id,
        "active": True,
        "next_date": {"$lte": cutoff},
    }).to_list(500)
    for rec in due:
        frequency = rec.get("frequency", "monthly")
        anchor = rec.get("anchor_day")
        current = rec["next_date"].date()
        dates = []
        while insights.at_noon(current) <= cutoff and len(dates) < RECURRING_MAX_CATCHUP:
            dates.append(current)
            current = insights.next_occurrence(current, frequency, anchor)
        # Claim the payment first, so two requests at the same time can't add it twice
        claimed = await db.recurring_payments.update_one(
            {"_id": rec["_id"], "next_date": rec["next_date"]},
            {"$set": {"next_date": insights.at_noon(current), "last_generated_at": datetime.utcnow()}},
        )
        if claimed.modified_count == 0 or not dates:
            continue
        now = datetime.utcnow()
        await db.transactions.insert_many([
            {
                "user_id": user_id,
                "amount": rec["amount"],
                "type": rec.get("type", "expense"),
                "category": rec["category"],
                "description": rec.get("name", ""),
                "date": insights.at_noon(day),
                "is_recurring": False,
                "recurring_day": None,
                "recurring_parent_id": None,
                "recurring_id": str(rec["_id"]),
                "receipt_image": None,
                "created_at": now,
            }
            for day in dates
        ])
        created += len(dates)
    return created


async def process_due_recurring_safely(user_id: str) -> None:
    try:
        await process_due_recurring(user_id)
    except Exception as e:
        logger.error(f"Error processing recurring payments: {e}")


@api_router.get("/transactions", response_model=List[TransactionResponse])
async def get_transactions(
    current_user: dict = Depends(get_current_user),
    limit: int = 100,
    skip: int = 0,
    tx_type: Optional[Literal["expense", "income"]] = Query(default=None, alias="type"),
):
    user_id = str(current_user["_id"])

    # Add payments of recurring transactions that are due
    await process_due_recurring_safely(user_id)

    limit = max(1, min(limit, 200))
    skip = max(0, skip)
    match = {"user_id": user_id}
    if tx_type:
        match["type"] = tx_type

    pipeline = [
        {"$match": match},
        {"$sort": {"date": -1, "_id": -1}},
        {"$skip": skip},
        {"$limit": limit},
        # Receipt photos are large: the list only says whether there is one.
        {"$addFields": {"has_receipt": {"$gt": [{"$ifNull": ["$receipt_image", None]}, None]}}},
        {"$project": {"receipt_image": 0}},
    ]
    transactions = await db.transactions.aggregate(pipeline).to_list(limit)
    return [transaction_to_response(t, include_receipt=False) for t in transactions]


@api_router.get("/transactions/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(
    transaction_id: str,
    current_user: dict = Depends(get_current_user)
):
    transaction = await db.transactions.find_one({
        "_id": to_object_id(transaction_id, "Transaction not found"),
        "user_id": str(current_user["_id"])
    })
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction_to_response(transaction)


@api_router.put("/transactions/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: str,
    transaction_update: TransactionUpdate,
    current_user: dict = Depends(get_current_user)
):
    fields = transaction_update.model_dump()
    remove_receipt = fields.pop("remove_receipt", False)
    update_data = {k: v for k, v in fields.items() if v is not None}

    if "receipt_image" in update_data:
        validate_receipt(update_data["receipt_image"])
    if remove_receipt:
        update_data["receipt_image"] = None
    if "amount" in update_data:
        update_data["amount"] = round(update_data["amount"], 2)
    if "description" in update_data:
        update_data["description"] = update_data["description"].strip()

    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    tx_id = to_object_id(transaction_id, "Transaction not found")
    result = await db.transactions.update_one(
        {"_id": tx_id, "user_id": str(current_user["_id"])},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")

    updated_transaction = await db.transactions.find_one({"_id": tx_id})
    return transaction_to_response(updated_transaction)


@api_router.delete("/transactions/{transaction_id}")
async def delete_transaction(
    transaction_id: str,
    current_user: dict = Depends(get_current_user)
):
    result = await db.transactions.delete_one({
        "_id": to_object_id(transaction_id, "Transaction not found"),
        "user_id": str(current_user["_id"])
    })

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")

    return {"message": "Transaction deleted successfully"}


# ============= STATS ENDPOINTS =============

def month_range(year: int, month: int):
    start = datetime(year, month, 1)
    end = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
    return start, end


async def sums_by_type_and_category(match: dict) -> List[dict]:
    """Totals grouped by type and category, computed by the database (fast even for many transactions)."""
    return await db.transactions.aggregate([
        {"$match": match},
        {"$group": {"_id": {"type": "$type", "category": "$category"}, "total": {"$sum": "$amount"}}},
    ]).to_list(None)


@api_router.get("/transactions/stats/monthly", response_model=MonthlyStats)
async def get_monthly_stats(
    current_user: dict = Depends(get_current_user),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    month: Optional[int] = Query(default=None, ge=1, le=12),
):
    user_id = str(current_user["_id"])
    await process_due_recurring_safely(user_id)

    if not year or not month:
        now = datetime.utcnow()
        year, month = now.year, now.month
    start_date, end_date = month_range(year, month)

    monthly = await sums_by_type_and_category({"user_id": user_id, "date": {"$gte": start_date, "$lt": end_date}})
    all_time = await db.transactions.aggregate([
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
    ]).to_list(None)

    monthly_income = sum(g["total"] for g in monthly if g["_id"]["type"] == "income")
    monthly_expenses = sum(g["total"] for g in monthly if g["_id"]["type"] == "expense")
    totals = {g["_id"]: g["total"] for g in all_time}
    total_balance = totals.get("income", 0) - totals.get("expense", 0)

    expenses_by_category: Dict[str, float] = {}
    for g in monthly:
        if g["_id"]["type"] == "expense":
            name = g["_id"].get("category") or "Inne"
            expenses_by_category[name] = round(expenses_by_category.get(name, 0) + g["total"], 2)

    top_categories = [
        {"category": cat, "amount": amount}
        for cat, amount in sorted(expenses_by_category.items(), key=lambda x: x[1], reverse=True)[:5]
    ]

    return MonthlyStats(
        total_income=round(monthly_income, 2),
        total_expenses=round(monthly_expenses, 2),
        balance=round(total_balance, 2),  # all-time balance from all transactions
        month_balance=round(monthly_income - monthly_expenses, 2),
        expenses_by_category=expenses_by_category,
        top_categories=top_categories,
    )


# ============= CATEGORY ENDPOINTS =============

def category_to_response(c: dict) -> CategoryResponse:
    return CategoryResponse(
        id=str(c["_id"]),
        user_id=c["user_id"],
        name=c["name"],
        icon=c["icon"],
        color=c["color"],
        type=c.get("type", "expense"),
        is_default=c.get("is_default", False),
    )


@api_router.get("/categories", response_model=List[CategoryResponse])
async def get_categories(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])

    # Backfill: ensure user has income categories (added later for existing users)
    income_count = await db.categories.count_documents({
        "user_id": user_id,
        "type": "income"
    })
    if income_count == 0:
        income_defaults = [c for c in DEFAULT_CATEGORIES if c.get("type") == "income"]
        await db.categories.insert_many([
            {
                "user_id": user_id,
                "name": cat["name"],
                "icon": cat["icon"],
                "color": cat["color"],
                "type": "income",
                "is_default": True,
            }
            for cat in income_defaults
        ])

    categories = await db.categories.find({"user_id": user_id}).to_list(200)
    return [category_to_response(c) for c in categories]


@api_router.post("/categories", response_model=CategoryResponse)
async def create_category(
    category: CategoryCreate,
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user["_id"])
    name = category.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")

    if not is_pro_user(current_user):
        custom_count = await db.categories.count_documents({"user_id": user_id, "is_default": {"$ne": True}})
        if custom_count >= FREE_CUSTOM_CATEGORY_LIMIT:
            raise HTTPException(
                status_code=403,
                detail=f"Free users can create up to {FREE_CUSTOM_CATEGORY_LIMIT} custom categories. Upgrade to Pro for unlimited categories.",
            )

    duplicate = await db.categories.find_one(
        {"user_id": user_id, "type": category.type, "name": name},
        collation=EMAIL_COLLATION,
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Category already exists")

    category_dict = {
        "user_id": user_id,
        "name": name,
        "icon": category.icon,
        "color": category.color.upper(),
        "type": category.type,
        "is_default": False,
    }
    await db.categories.insert_one(category_dict)
    return category_to_response(category_dict)


@api_router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete one of the user's own categories. Past transactions keep their category name."""
    category = await db.categories.find_one({
        "_id": to_object_id(category_id, "Category not found"),
        "user_id": str(current_user["_id"]),
    })
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.get("is_default"):
        raise HTTPException(status_code=400, detail="Default categories can't be deleted")

    await db.categories.delete_one({"_id": category["_id"]})
    return {"status": "deleted"}


# ============= GOAL ENDPOINTS =============

@api_router.post("/goals", response_model=GoalResponse)
async def create_goal(
    goal: GoalCreate,
    current_user: dict = Depends(get_current_user)
):
    # Check if user is Pro or has reached free tier limit
    user_id = str(current_user["_id"])

    if not is_pro_user(current_user):
        # Count existing goals for free users
        existing_goals_count = await db.goals.count_documents({"user_id": user_id})
        if existing_goals_count >= FREE_GOAL_LIMIT:
            raise HTTPException(
                status_code=403,
                detail=f"Free users can create only {FREE_GOAL_LIMIT} goal. Upgrade to Pro for unlimited goals."
            )

    goal_dict = {
        "user_id": user_id,
        "name": goal.name.strip(),
        "target_amount": goal.target_amount,
        "current_amount": goal.current_amount,
        "deadline": goal.deadline,
        "created_at": datetime.utcnow()
    }
    
    result = await db.goals.insert_one(goal_dict)
    
    progress = (goal.current_amount / goal.target_amount * 100) if goal.target_amount > 0 else 0
    
    return GoalResponse(
        id=str(result.inserted_id),
        user_id=goal_dict["user_id"],
        name=goal_dict["name"],
        target_amount=goal_dict["target_amount"],
        current_amount=goal_dict["current_amount"],
        deadline=goal_dict["deadline"],
        progress=progress,
        created_at=goal_dict["created_at"]
    )


@api_router.get("/goals", response_model=List[GoalResponse])
async def get_goals(current_user: dict = Depends(get_current_user)):
    goals = await db.goals.find(
        {"user_id": str(current_user["_id"])}
    ).to_list(100)
    
    return [
        GoalResponse(
            id=str(g["_id"]),
            user_id=g["user_id"],
            name=g["name"],
            target_amount=g["target_amount"],
            current_amount=g["current_amount"],
            deadline=g.get("deadline"),
            progress=(g["current_amount"] / g["target_amount"] * 100) if g["target_amount"] > 0 else 0,
            created_at=g["created_at"]
        )
        for g in goals
    ]


@api_router.get("/goals/count")
async def get_goals_count(current_user: dict = Depends(get_current_user)):
    """Get count of user's goals and check if they can add more"""
    user_id = str(current_user["_id"])
    is_pro = is_pro_user(current_user)
    count = await db.goals.count_documents({"user_id": user_id})

    return {
        "count": count,
        "is_pro": is_pro,
        "can_add_more": is_pro or count < FREE_GOAL_LIMIT,
        "limit": "unlimited" if is_pro else FREE_GOAL_LIMIT
    }


@api_router.put("/goals/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: str,
    goal_update: GoalUpdate,
    current_user: dict = Depends(get_current_user)
):
    update_data = {k: v for k, v in goal_update.dict().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    result = await db.goals.update_one(
        {"_id": to_object_id(goal_id, "Goal not found"), "user_id": str(current_user["_id"])},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    updated_goal = await db.goals.find_one({"_id": to_object_id(goal_id, "Goal not found")})
    
    progress = (updated_goal["current_amount"] / updated_goal["target_amount"] * 100) if updated_goal["target_amount"] > 0 else 0
    
    return GoalResponse(
        id=str(updated_goal["_id"]),
        user_id=updated_goal["user_id"],
        name=updated_goal["name"],
        target_amount=updated_goal["target_amount"],
        current_amount=updated_goal["current_amount"],
        deadline=updated_goal.get("deadline"),
        progress=progress,
        created_at=updated_goal["created_at"]
    )


@api_router.delete("/goals/{goal_id}")
async def delete_goal(
    goal_id: str,
    current_user: dict = Depends(get_current_user)
):
    result = await db.goals.delete_one({
        "_id": to_object_id(goal_id, "Goal not found"),
        "user_id": str(current_user["_id"])
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    return {"message": "Goal deleted successfully"}


# ============= BUDGET ENDPOINTS =============

async def budget_to_response(budget: dict, current_user: dict) -> BudgetResponse:
    user_id = str(current_user["_id"])
    now = datetime.utcnow()
    start, end = month_range(now.year, now.month)
    groups = await sums_by_type_and_category({"user_id": user_id, "type": "expense", "date": {"$gte": start, "$lt": end}})
    spent_by_category: Dict[str, float] = {}
    for g in groups:
        name = g["_id"].get("category") or "Inne"
        spent_by_category[name] = spent_by_category.get(name, 0) + g["total"]
    limits = budget.get("category_limits") or {}
    return BudgetResponse(
        id=str(budget["_id"]),
        user_id=user_id,
        monthly_limit=budget.get("monthly_limit", 0),
        category_limits=limits,
        current_month_spending=round(sum(spent_by_category.values()), 2),
        category_spending={name: round(spent_by_category.get(name, 0), 2) for name in limits},
        category_limits_active=is_pro_user(current_user),
    )


@api_router.post("/budget", response_model=BudgetResponse)
async def create_or_update_budget(
    budget: BudgetCreate,
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user["_id"])
    existing = await db.budgets.find_one({"user_id": user_id})

    limits = (existing or {}).get("category_limits") or {}
    if budget.category_limits is not None:
        if not is_pro_user(current_user):
            if budget.category_limits and budget.category_limits != limits:
                raise HTTPException(status_code=403, detail="Category limits are a Pro feature")
        else:
            cleaned = {}
            for name, value in list(budget.category_limits.items())[:60]:
                name = (name or "").strip()[:60]
                if name and value and 0 < value < 100_000_000:
                    cleaned[name] = round(float(value), 2)
            limits = cleaned

    doc = {"user_id": user_id, "monthly_limit": budget.monthly_limit, "category_limits": limits}
    if existing:
        await db.budgets.update_one({"_id": existing["_id"]}, {"$set": doc})
        doc["_id"] = existing["_id"]
    else:
        result = await db.budgets.insert_one(doc)
        doc["_id"] = result.inserted_id
    return await budget_to_response(doc, current_user)


@api_router.get("/budget", response_model=BudgetResponse)
async def get_budget(current_user: dict = Depends(get_current_user)):
    budget = await db.budgets.find_one({"user_id": str(current_user["_id"])})
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    return await budget_to_response(budget, current_user)


# ============= RECURRING PAYMENT ENDPOINTS =============

class RecurringCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    amount: float = Field(gt=0, lt=100_000_000)
    type: Literal["expense", "income"] = "expense"
    category: str = Field(min_length=1, max_length=60)
    frequency: Literal["monthly", "weekly", "yearly"] = "monthly"
    next_date: datetime
    is_subscription: bool = False
    # When adding a detected payment: its past transactions get linked to it
    suggestion_key: Optional[str] = Field(default=None, max_length=120)
    link_transaction_ids: List[str] = Field(default_factory=list, max_length=60)


class RecurringUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    amount: Optional[float] = Field(default=None, gt=0, lt=100_000_000)
    type: Optional[Literal["expense", "income"]] = None
    category: Optional[str] = Field(default=None, min_length=1, max_length=60)
    frequency: Optional[Literal["monthly", "weekly", "yearly"]] = None
    next_date: Optional[datetime] = None
    is_subscription: Optional[bool] = None
    active: Optional[bool] = None


class RecurringResponse(BaseModel):
    id: str
    name: str
    amount: float
    type: str
    category: str
    frequency: str
    next_date: datetime
    is_subscription: bool
    active: bool
    monthly_amount: float
    created_at: datetime


class DismissSuggestionRequest(BaseModel):
    key: str = Field(min_length=1, max_length=120)


def recurring_to_response(r: dict) -> RecurringResponse:
    frequency = r.get("frequency", "monthly")
    return RecurringResponse(
        id=str(r["_id"]),
        name=r.get("name") or r.get("category", ""),
        amount=r["amount"],
        type=r.get("type", "expense"),
        category=r.get("category", "Inne"),
        frequency=frequency,
        next_date=r["next_date"],
        is_subscription=bool(r.get("is_subscription")),
        active=bool(r.get("active", True)),
        monthly_amount=round(insights.monthly_equivalent(r["amount"], frequency), 2),
        created_at=r.get("created_at") or r["next_date"],
    )


async def ensure_can_add_recurring(current_user: dict) -> None:
    if is_pro_user(current_user):
        return
    count = await db.recurring_payments.count_documents({"user_id": str(current_user["_id"]), "active": True})
    if count >= FREE_RECURRING_LIMIT:
        raise HTTPException(
            status_code=403,
            detail=f"Free users can have up to {FREE_RECURRING_LIMIT} recurring payments. Upgrade to Pro for unlimited.",
        )


@api_router.get("/recurring")
async def list_recurring(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    await process_due_recurring_safely(user_id)
    items = await db.recurring_payments.find({"user_id": user_id}).sort("next_date", 1).to_list(500)
    responses = [recurring_to_response(r) for r in items]
    active = [r for r in responses if r.active]
    expenses = [r for r in active if r.type == "expense"]
    subscriptions = [r for r in expenses if r.is_subscription]
    pro = is_pro_user(current_user)
    return {
        "items": responses,
        "summary": {
            "monthly_expenses": round(sum(r.monthly_amount for r in expenses), 2),
            "monthly_income": round(sum(r.monthly_amount for r in active if r.type == "income"), 2),
            "subscriptions_monthly": round(sum(r.monthly_amount for r in subscriptions), 2),
            "subscriptions_count": len(subscriptions),
            "yearly_expenses": round(sum(r.monthly_amount for r in expenses) * 12, 2),
            "active_count": len(active),
        },
        "limit": None if pro else FREE_RECURRING_LIMIT,
        "can_add": pro or len(active) < FREE_RECURRING_LIMIT,
    }


@api_router.post("/recurring", response_model=RecurringResponse)
async def create_recurring(body: RecurringCreate, current_user: dict = Depends(get_current_user)):
    await ensure_can_add_recurring(current_user)
    user_id = str(current_user["_id"])
    first_day = body.next_date.date()
    doc = {
        "user_id": user_id,
        "name": body.name.strip(),
        "amount": round(body.amount, 2),
        "type": body.type,
        "category": body.category.strip(),
        "frequency": body.frequency,
        "anchor_day": first_day.day,
        "next_date": insights.at_noon(first_day),
        "is_subscription": body.is_subscription,
        "active": True,
        "source": "detected" if body.suggestion_key else "manual",
        "suggestion_key": body.suggestion_key,
        "created_at": datetime.utcnow(),
    }
    result = await db.recurring_payments.insert_one(doc)
    doc["_id"] = result.inserted_id

    ids = [ObjectId(i) for i in body.link_transaction_ids if ObjectId.is_valid(i)]
    if ids:
        await db.transactions.update_many(
            {"_id": {"$in": ids}, "user_id": user_id, "recurring_id": None},
            {"$set": {"recurring_id": str(result.inserted_id)}},
        )
    # A payment due today (or earlier) is added straight away
    await process_due_recurring_safely(user_id)
    doc = await db.recurring_payments.find_one({"_id": result.inserted_id})
    return recurring_to_response(doc)


@api_router.put("/recurring/{recurring_id}", response_model=RecurringResponse)
async def update_recurring(recurring_id: str, body: RecurringUpdate, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    rec_id = to_object_id(recurring_id, "Recurring payment not found")
    existing = await db.recurring_payments.find_one({"_id": rec_id, "user_id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Recurring payment not found")

    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update.get("active") and not existing.get("active", True):
        await ensure_can_add_recurring(current_user)
    if "name" in update:
        update["name"] = update["name"].strip()
    if "amount" in update:
        update["amount"] = round(update["amount"], 2)
    if "next_date" in update:
        day = update["next_date"].date()
        update["next_date"] = insights.at_noon(day)
        update["anchor_day"] = day.day
    if not update:
        raise HTTPException(status_code=400, detail="No data to update")

    await db.recurring_payments.update_one({"_id": rec_id}, {"$set": update})
    await process_due_recurring_safely(user_id)
    return recurring_to_response(await db.recurring_payments.find_one({"_id": rec_id}))


@api_router.delete("/recurring/{recurring_id}")
async def delete_recurring(recurring_id: str, current_user: dict = Depends(get_current_user)):
    """Stop a recurring payment. Transactions it already added stay."""
    result = await db.recurring_payments.delete_one({
        "_id": to_object_id(recurring_id, "Recurring payment not found"),
        "user_id": str(current_user["_id"]),
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Recurring payment not found")
    return {"status": "deleted"}


@api_router.get("/recurring/suggestions")
async def recurring_suggestions(current_user: dict = Depends(get_current_user)):
    """Payments that look like subscriptions or bills, found in the user's past transactions."""
    user_id = str(current_user["_id"])
    since = datetime.utcnow() - timedelta(days=400)
    transactions = await db.transactions.find(
        {"user_id": user_id, "type": "expense", "date": {"$gte": since}, "recurring_id": None, "recurring_parent_id": None},
        {"date": 1, "amount": 1, "description": 1, "category": 1, "type": 1},
    ).to_list(None)
    for t in transactions:
        t["id"] = str(t["_id"])

    existing = await db.recurring_payments.find({"user_id": user_id}, {"name": 1, "suggestion_key": 1}).to_list(500)
    known = {insights.merchant_key(r.get("name") or "") for r in existing} | {r["suggestion_key"] for r in existing if r.get("suggestion_key")}
    dismissed = {d["key"] for d in await db.recurring_dismissed.find({"user_id": user_id}).to_list(500)}

    found = insights.detect_recurring(transactions, datetime.utcnow().date(), known, dismissed)
    return {"suggestions": found}


@api_router.post("/recurring/suggestions/dismiss")
async def dismiss_suggestion(body: DismissSuggestionRequest, current_user: dict = Depends(get_current_user)):
    await db.recurring_dismissed.update_one(
        {"user_id": str(current_user["_id"]), "key": body.key},
        {"$set": {"user_id": str(current_user["_id"]), "key": body.key, "created_at": datetime.utcnow()}},
        upsert=True,
    )
    return {"status": "ok"}


# ============= IMPORT (bank statements and spreadsheets) =============
#
# 1. POST /import/preview with the file: the server reads it and answers with the rows it found
#    (dates, amounts, suggested categories, which ones are already in the app).
# 2. If the columns weren't recognised, POST /import/remap with the right columns.
# 3. POST /import/commit with the rows the user left ticked. The file itself is kept for 2 hours only.

class ImportRemapRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=40)
    mapping: Dict[str, Any]


class ImportRowChange(BaseModel):
    category: Optional[str] = Field(default=None, min_length=1, max_length=60)
    type: Optional[Literal["expense", "income"]] = None


class ImportCommitRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=40)
    excluded: List[int] = Field(default_factory=list, max_length=importer.MAX_ROWS)
    changes: Dict[str, ImportRowChange] = Field(default_factory=dict)


async def imports_used(user_id: str) -> int:
    return await db.imports.count_documents({"user_id": user_id})


async def can_import(current_user: dict) -> bool:
    return is_pro_user(current_user) or await imports_used(str(current_user["_id"])) < FREE_IMPORT_LIMIT


async def load_import_session(session_id: str, user_id: str) -> dict:
    session = await db.import_sessions.find_one({"_id": to_object_id(session_id, "Import session expired"), "user_id": user_id})
    if not session:
        raise HTTPException(status_code=404, detail="Import session expired")
    return session


async def import_rows(session: dict, user_id: str):
    """Rows of the stored file with suggested categories and duplicate marks."""
    table = session["table"]
    width = max((len(r) for r in table), default=0)
    mapping = importer.Mapping.from_dict(session.get("mapping") or {}, width)
    parsed = importer.parse_file(b"", session.get("file_name", ""), mapping=mapping, table=table, header_row=session.get("header_row"))
    categories = await db.categories.find({"user_id": user_id}, {"name": 1, "type": 1, "is_default": 1}).to_list(300)
    importer.refine_assumed_types(parsed.result, categories)

    extracted = parsed.result.rows
    hashes = importer.hashes_for(extracted)
    rows = []
    for i, (r, h) in enumerate(zip(extracted, hashes)):
        rows.append({
            "i": i,
            "date": r.date.isoformat(),
            "amount": r.amount,
            "type": r.type,
            "description": r.description,
            "category": importer.suggest_category(r.description, r.type, r.category_hint, categories),
            "hash": h,
            "duplicate": None,
        })

    if rows:
        first = min(r.date for r in extracted) - timedelta(days=1)
        last = max(r.date for r in extracted) + timedelta(days=2)
        existing = await db.transactions.find(
            {"user_id": user_id, "date": {"$gte": datetime.combine(first, dtime.min), "$lt": datetime.combine(last, dtime.min)}},
            {"date": 1, "amount": 1, "type": 1, "import_hash": 1},
        ).to_list(None)
        known_hashes = {e["import_hash"] for e in existing if e.get("import_hash")}
        # Transactions typed in by hand: same amount and type within a day may be the same payment
        pool = Counter(
            (e["date"].date(), round(e["amount"], 2), e["type"]) for e in existing if not e.get("import_hash")
        )
        for row in rows:
            if row["hash"] in known_hashes:
                row["duplicate"] = "exact"
                continue
            day = date.fromisoformat(row["date"])
            for delta in (0, -1, 1):
                key = (day + timedelta(days=delta), round(row["amount"], 2), row["type"])
                if pool[key] > 0:
                    pool[key] -= 1
                    row["duplicate"] = "possible"
                    break
    return parsed, rows, categories


async def import_preview_response(session: dict, current_user: dict) -> dict:
    user_id = str(current_user["_id"])
    parsed, rows, _ = await import_rows(session, user_id)
    fresh = [r for r in rows if r["duplicate"] != "exact"]
    expenses = [r for r in fresh if r["type"] == "expense"]
    incomes = [r for r in fresh if r["type"] == "income"]
    dates = [r["date"] for r in rows]
    used = await imports_used(user_id)
    pro = is_pro_user(current_user)
    return {
        "session_id": str(session["_id"]),
        "file_name": session.get("file_name", ""),
        "source": session.get("source", "CSV"),
        "columns": parsed.columns[:30],
        "sample": parsed.sample(5),
        "mapping": parsed.mapping.as_dict(),
        "header_found": parsed.header_row is not None,
        "rows": [{k: v for k, v in r.items() if k != "hash"} for r in rows],
        "summary": {
            "count": len(fresh),
            "expenses_count": len(expenses),
            "expenses_total": round(sum(r["amount"] for r in expenses), 2),
            "income_count": len(incomes),
            "income_total": round(sum(r["amount"] for r in incomes), 2),
            "date_from": min(dates) if dates else None,
            "date_to": max(dates) if dates else None,
            "duplicates_exact": sum(1 for r in rows if r["duplicate"] == "exact"),
            "duplicates_possible": sum(1 for r in rows if r["duplicate"] == "possible"),
        },
        "skipped": parsed.result.skipped,
        "foreign_currency": parsed.result.foreign_currency,
        "assumed_expenses": parsed.result.assumed_expenses,
        "can_commit": pro or used < FREE_IMPORT_LIMIT,
        "imports_used": used,
        "import_limit": None if pro else FREE_IMPORT_LIMIT,
    }


@api_router.post("/import/preview")
async def import_preview(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    content = await file.read(importer.MAX_FILE_BYTES + 1)
    file_name = (file.filename or "plik")[:120]
    try:
        parsed = await run_in_threadpool(importer.parse_file, content, file_name)
    except importer.ImportFileError as e:
        raise HTTPException(status_code=400, detail=f"Import error: {e.code}")
    except Exception as e:
        logger.error(f"Could not read import file: {e}")
        raise HTTPException(status_code=400, detail="Import error: unreadable")

    table = [[cell[:500] for cell in row[:40]] for row in parsed.table]
    mapping = parsed.mapping.as_dict()
    mapping.update({"currency": parsed.mapping.currency, "status": parsed.mapping.status})
    session = {
        "user_id": str(current_user["_id"]),
        "created_at": datetime.utcnow(),
        "file_name": file_name,
        "source": parsed.source,
        "table": table,
        "header_row": parsed.header_row,
        "mapping": mapping,
    }
    result = await db.import_sessions.insert_one(session)
    session["_id"] = result.inserted_id
    return await import_preview_response(session, current_user)


@api_router.post("/import/remap")
async def import_remap(body: ImportRemapRequest, current_user: dict = Depends(get_current_user)):
    """The user pointed out which columns hold the date, amount and description."""
    session = await load_import_session(body.session_id, str(current_user["_id"]))
    width = max((len(r) for r in session["table"]), default=0)
    chosen = importer.Mapping.from_dict(body.mapping, width)
    if not chosen.usable():
        raise HTTPException(status_code=400, detail="Import error: mapping")
    mapping = chosen.as_dict()
    old = session.get("mapping") or {}
    mapping.update({"currency": old.get("currency"), "status": old.get("status")})
    header_row = session.get("header_row")
    if body.mapping.get("first_row_is_header") is not None:
        header_row = 0 if body.mapping.get("first_row_is_header") else None
    await db.import_sessions.update_one({"_id": session["_id"]}, {"$set": {"mapping": mapping, "header_row": header_row}})
    session.update({"mapping": mapping, "header_row": header_row})
    return await import_preview_response(session, current_user)


@api_router.post("/import/commit")
async def import_commit(body: ImportCommitRequest, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    session = await load_import_session(body.session_id, user_id)
    if not await can_import(current_user):
        raise HTTPException(status_code=403, detail=f"Free users can import {FREE_IMPORT_LIMIT} file. Upgrade to Pro for unlimited imports.")

    _, rows, categories = await import_rows(session, user_id)
    names = {
        "expense": {c["name"] for c in categories if (c.get("type") or "expense") == "expense"},
        "income": {c["name"] for c in categories if c.get("type") == "income"},
    }
    excluded = set(body.excluded)
    chosen = []
    for row in rows:
        if row["i"] in excluded or row["duplicate"] == "exact":
            continue
        change = body.changes.get(str(row["i"]))
        if change:
            if change.type:
                row["type"] = change.type
            if change.category and change.category in names[row["type"]]:
                row["category"] = change.category
        if row["category"] not in names[row["type"]]:
            row["category"] = importer.suggest_category(row["description"], row["type"], "", categories)
        chosen.append(row)
    if not chosen:
        raise HTTPException(status_code=400, detail="Nothing to import")

    now = datetime.utcnow()
    dates = [r["date"] for r in chosen]
    import_doc = {
        "user_id": user_id,
        "created_at": now,
        "file_name": session.get("file_name", ""),
        "source": session.get("source", "CSV"),
        "count": len(chosen),
        "date_from": min(dates),
        "date_to": max(dates),
        "expenses_total": round(sum(r["amount"] for r in chosen if r["type"] == "expense"), 2),
        "income_total": round(sum(r["amount"] for r in chosen if r["type"] == "income"), 2),
    }
    result = await db.imports.insert_one(import_doc)
    import_id = str(result.inserted_id)

    docs = [
        {
            "user_id": user_id,
            "amount": r["amount"],
            "type": r["type"],
            "category": r["category"],
            "description": r["description"],
            "date": insights.at_noon(date.fromisoformat(r["date"])),
            "is_recurring": False,
            "recurring_day": None,
            "recurring_parent_id": None,
            "receipt_image": None,
            "import_id": import_id,
            "import_hash": r["hash"],
            "created_at": now,
        }
        for r in chosen
    ]
    for start in range(0, len(docs), 1000):
        await db.transactions.insert_many(docs[start:start + 1000])
    await db.import_sessions.delete_one({"_id": session["_id"]})
    logger.info(f"User {user_id} imported {len(docs)} transactions ({import_doc['source']})")
    return {"imported": len(docs), "import_id": import_id}


@api_router.get("/import/history")
async def import_history(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    items = await db.imports.find({"user_id": user_id}).sort("created_at", -1).to_list(50)
    pro = is_pro_user(current_user)
    return {
        "imports": [
            {
                "id": str(i["_id"]),
                "created_at": i["created_at"],
                "file_name": i.get("file_name", ""),
                "source": i.get("source", ""),
                "count": i.get("count", 0),
                "date_from": i.get("date_from"),
                "date_to": i.get("date_to"),
            }
            for i in items
        ],
        "imports_used": len(items),
        "limit": None if pro else FREE_IMPORT_LIMIT,
        "can_import": pro or len(items) < FREE_IMPORT_LIMIT,
    }


@api_router.delete("/import/{import_id}")
async def undo_import(import_id: str, current_user: dict = Depends(get_current_user)):
    """Remove everything one import added (e.g. the wrong file was chosen)."""
    user_id = str(current_user["_id"])
    imp = await db.imports.find_one({"_id": to_object_id(import_id, "Import not found"), "user_id": user_id})
    if not imp:
        raise HTTPException(status_code=404, detail="Import not found")
    removed = await db.transactions.delete_many({"user_id": user_id, "import_id": import_id})
    await db.imports.delete_one({"_id": imp["_id"]})
    return {"status": "deleted", "removed": removed.deleted_count}


# ============= MONTHLY SUMMARY =============

REPORT_FIELDS = {"date": 1, "amount": 1, "type": 1, "category": 1, "description": 1, "recurring_id": 1}


@api_router.get("/reports/monthly")
async def monthly_report(
    current_user: dict = Depends(get_current_user),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    month: Optional[int] = Query(default=None, ge=1, le=12),
):
    """Summary of one month with comparisons and plain-language conclusions.

    Free plan: totals, categories and the first conclusion. Pro: everything.
    """
    user_id = str(current_user["_id"])
    await process_due_recurring_safely(user_id)
    today = datetime.utcnow().date()
    if not year or not month:
        year, month = today.year, today.month
    start, end = month_range(year, month)
    prev_start, _ = month_range(year - 1, 12) if month == 1 else month_range(year, month - 1)

    current = await db.transactions.find({"user_id": user_id, "date": {"$gte": start, "$lt": end}}, REPORT_FIELDS).to_list(None)
    previous = await db.transactions.find({"user_id": user_id, "date": {"$gte": prev_start, "$lt": start}}, REPORT_FIELDS).to_list(None)
    budget = await db.budgets.find_one({"user_id": user_id})
    recurring = await db.recurring_payments.find({"user_id": user_id, "active": True}).to_list(500)

    return insights.build_monthly_report(
        year, month, current, previous, today,
        budget=budget, recurring=recurring, is_pro=is_pro_user(current_user),
    )


# ============= EXPORT (Pro) =============

EXPORT_TOKEN_MINUTES = 10


@api_router.post("/export/link")
async def export_link(request: Request, current_user: dict = Depends(get_current_user)):
    """A short-lived link the phone can open in the browser to download the Excel file."""
    if not is_pro_user(current_user):
        raise HTTPException(status_code=403, detail="Export is a Pro feature")
    now = datetime.utcnow()
    token = jwt.encode(
        {"user_id": str(current_user["_id"]), "purpose": "export", "iat": _utc_timestamp(now),
         "exp": now + timedelta(minutes=EXPORT_TOKEN_MINUTES)},
        SECRET_KEY, algorithm=ALGORITHM,
    )
    return {"url": f"{public_base_url(request)}/api/export/download?token={token}"}


@api_router.get("/export/download")
async def export_download(token: str = Query(min_length=10, max_length=2000)):
    payload = verify_token(token)
    if payload.get("purpose") != "export" or not ObjectId.is_valid(payload.get("user_id", "")):
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"_id": ObjectId(payload["user_id"])})
    if not user or not is_pro_user(user):
        raise HTTPException(status_code=403, detail="Export is a Pro feature")

    transactions = await db.transactions.find(
        {"user_id": str(user["_id"])}, {"date": 1, "amount": 1, "type": 1, "category": 1, "description": 1}
    ).to_list(None)
    content = await run_in_threadpool(exporter.build_workbook, transactions, user.get("name", ""))
    file_name = f"cashflo-transakcje-{datetime.utcnow().strftime('%Y-%m-%d')}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"', "Cache-Control": "no-store"},
    )


# ============= STRIPE PAYMENT ENDPOINTS =============
#
# Flow: the app asks for a Checkout session for a plan -> the user pays on Stripe's page ->
# Stripe sends them back (web: straight to the app, phone: to /api/payments/return, which
# hands them back to the app) -> the app asks /payments/status, and the signed webhook
# confirms the same thing in the background. Both paths only activate Pro for checkout
# sessions this server created for that user.

ACTIVE_SUBSCRIPTION_STATUSES = {"active", "trialing", "past_due"}
SESSION_ID_RE = re.compile(r"^cs_(test|live)_[A-Za-z0-9]+$")


def _deep_link(path: str) -> str:
    return f"{APP_SCHEME}://{path}"


def _web_origin(origin_url: Optional[str]) -> str:
    origin = (origin_url or "").rstrip('/')
    if origin not in ALLOWED_RETURN_ORIGINS:
        raise HTTPException(status_code=400, detail="Return address not allowed")
    return origin


async def activate_pro_from_session(session) -> bool:
    """Turn on Pro for the user a paid Checkout session belongs to. Safe to call more than once."""
    metadata = sget(session, "metadata", {})
    user_id = sget(session, "client_reference_id") or sget(metadata, "user_id")
    if sget(metadata, "product") != "cashflo_pro" or not user_id or not ObjectId.is_valid(user_id):
        return False
    if sget(session, "status") != "complete" or sget(session, "payment_status") not in ("paid", "no_payment_required"):
        return False

    # Only sessions this server created for this user count
    payment = await db.payment_transactions.find_one({"session_id": sget(session, "id"), "user_id": user_id})
    if not payment:
        logger.warning(f"Paid checkout session {sget(session, 'id')} is not in our records; ignored")
        return False

    updates = {"is_pro": True, "pro_plan": sget(metadata, "plan"), "pro_activated_at": datetime.utcnow()}
    customer = sget(session, "customer")
    subscription = sget(session, "subscription")
    if customer:
        updates["stripe_customer_id"] = customer if isinstance(customer, str) else sget(customer, "id")
    if subscription:
        updates["stripe_subscription_id"] = subscription if isinstance(subscription, str) else sget(subscription, "id")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": updates})

    amount_total = sget(session, "amount_total")
    await db.payment_transactions.update_one(
        {"_id": payment["_id"]},
        {"$set": {
            "status": "complete",
            "payment_status": "paid",
            "pro_activated": True,
            "amount": amount_total / 100 if amount_total else payment.get("amount", 0),
            "updated_at": datetime.utcnow(),
        }},
    )
    return True


async def sync_subscription_status(subscription, deleted: bool) -> None:
    """Keep Pro in step with the Stripe subscription (renewed, unpaid, cancelled...)."""
    sub_id = sget(subscription, "id")
    if not sub_id:
        return
    user = await db.users.find_one({"stripe_subscription_id": sub_id})
    if not user or user.get("pro_plan") == "lifetime":
        return

    status_ = sget(subscription, "status", "")
    if deleted or status_ not in ACTIVE_SUBSCRIPTION_STATUSES:
        update = {"$set": {"is_pro": False, "pro_ended_at": datetime.utcnow()}}
        if deleted or status_ == "canceled":
            update["$unset"] = {"stripe_subscription_id": ""}
        await db.users.update_one({"_id": user["_id"]}, update)
        logger.info(f"Pro ended for user {user['_id']} (subscription {status_ or 'deleted'})")
    elif not user.get("is_pro"):
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"is_pro": True}})


@api_router.post("/payments/checkout")
async def create_checkout_session(
    request: Request,
    checkout_data: CheckoutRequest,
    current_user: dict = Depends(get_current_user)
):
    """Start a Stripe Checkout for one of the Pro plans."""
    price_id = STRIPE_PRICES.get(checkout_data.plan)
    if not stripe_ready() or not price_id:
        raise HTTPException(status_code=503, detail="Payments are not configured")
    if current_user.get("is_pro", False):
        raise HTTPException(status_code=400, detail="User already has Pro")

    user_id = str(current_user["_id"])
    if checkout_data.platform == "web":
        origin = _web_origin(checkout_data.origin_url)
        success_url = f"{origin}/pro/success?session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{origin}/pro/upgrade"
    else:
        base = public_base_url(request)
        success_url = f"{base}/api/payments/return?session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{base}/api/payments/return?cancelled=1"

    is_subscription = checkout_data.plan != "lifetime"
    metadata = {"user_id": user_id, "plan": checkout_data.plan, "product": "cashflo_pro"}
    params = {
        "mode": "subscription" if is_subscription else "payment",
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "client_reference_id": user_id,
        "metadata": metadata,
        "locale": "pl",
    }
    if current_user.get("stripe_customer_id"):
        params["customer"] = current_user["stripe_customer_id"]
    else:
        params["customer_email"] = current_user["email"]
        if not is_subscription:
            params["customer_creation"] = "always"
    if is_subscription:
        params["subscription_data"] = {"metadata": metadata}
    else:
        params["payment_intent_data"] = {"metadata": metadata}

    try:
        session = await run_in_threadpool(stripe.checkout.Session.create, **params)
    except Exception as e:
        logger.error(f"Error creating checkout session: {e}")
        raise HTTPException(status_code=502, detail="Could not start payment")

    amount_total = sget(session, "amount_total")
    await db.payment_transactions.insert_one({
        "user_id": user_id,
        "session_id": sget(session, "id"),
        "plan": checkout_data.plan,
        "price_id": price_id,
        "amount": amount_total / 100 if amount_total else 0,
        "currency": sget(session, "currency", "pln"),
        "status": "pending",
        "payment_status": "initiated",
        "metadata": {"user_email": current_user["email"], "product": "cashflo_pro"},
        "created_at": datetime.utcnow(),
    })

    return {"url": sget(session, "url"), "session_id": sget(session, "id")}


@api_router.get("/payments/return", response_class=HTMLResponse)
async def payment_return(
    session_id: Optional[str] = None,
    cancelled: Optional[int] = None,
    portal: Optional[int] = None,
):
    """Page Stripe opens on the phone after paying. It hands the user back to the app."""
    if portal:
        target = _deep_link("more")
        title, text = "Gotowe", "Możesz wrócić do aplikacji CashFlo."
    elif cancelled or not session_id or not SESSION_ID_RE.match(session_id):
        target = _deep_link("pro/upgrade")
        title, text = "Płatność przerwana", "Nic nie zostało pobrane. Możesz wrócić do aplikacji."
    else:
        target = _deep_link(f"pro/success?session_id={session_id}")
        title, text = "Dziękujemy!", "Płatność przyjęta. Wracamy do aplikacji CashFlo."

    href = html.escape(target, quote=True)
    page = f"""<!doctype html>
<html lang="pl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CashFlo</title>
<style>
  body {{ margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family:-apple-system,system-ui,"Segoe UI",sans-serif; background:#F4F6F5; color:#14201B; }}
  main {{ max-width:360px; padding:32px 24px; text-align:center; }}
  h1 {{ font-size:24px; margin:0 0 8px; }}
  p {{ color:#5B6862; line-height:1.5; margin:0 0 24px; }}
  a {{ display:inline-block; background:#0F6B54; color:#fff; text-decoration:none;
       padding:14px 22px; border-radius:12px; font-weight:600; }}
</style></head>
<body><main>
<h1>{html.escape(title)}</h1>
<p>{html.escape(text)}</p>
<a href="{href}">Wróć do aplikacji</a>
</main>
<script>setTimeout(function(){{ window.location.href = "{href}"; }}, 400);</script>
</body></html>"""
    return HTMLResponse(page)


@api_router.get("/payments/status/{session_id}", response_model=PaymentStatusResponse)
async def get_payment_status(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Check a checkout session and activate Pro if it is paid."""
    if not stripe_ready():
        raise HTTPException(status_code=503, detail="Payments are not configured")

    user_id = str(current_user["_id"])
    payment = await db.payment_transactions.find_one({"session_id": session_id, "user_id": user_id})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.get("pro_activated"):
        return PaymentStatusResponse(status="complete", payment_status="paid", is_pro_activated=True)

    try:
        session = await run_in_threadpool(stripe.checkout.Session.retrieve, session_id)
    except Exception as e:
        logger.error(f"Error checking payment status: {e}")
        raise HTTPException(status_code=502, detail="Could not check payment")

    if sget(session, "client_reference_id") != user_id:
        raise HTTPException(status_code=404, detail="Payment not found")

    activated = await activate_pro_from_session(session)
    if not activated:
        await db.payment_transactions.update_one(
            {"_id": payment["_id"]},
            {"$set": {
                "status": sget(session, "status", "open"),
                "payment_status": sget(session, "payment_status", "unpaid"),
                "updated_at": datetime.utcnow(),
            }},
        )

    return PaymentStatusResponse(
        status=sget(session, "status", "open"),
        payment_status=sget(session, "payment_status", "unpaid"),
        is_pro_activated=activated,
    )


class PortalRequest(BaseModel):
    platform: Literal["native", "web"] = "native"
    origin_url: Optional[str] = None


@api_router.post("/payments/portal")
async def create_billing_portal(
    request: Request,
    body: PortalRequest,
    current_user: dict = Depends(get_current_user)
):
    """Stripe's page where the user can change payment method or cancel the subscription."""
    customer_id = current_user.get("stripe_customer_id")
    if not stripe_ready() or not customer_id:
        raise HTTPException(status_code=400, detail="No subscription to manage")

    if body.platform == "web":
        return_url = f"{_web_origin(body.origin_url)}/more"
    else:
        return_url = f"{public_base_url(request)}/api/payments/return?portal=1"

    try:
        portal = await run_in_threadpool(
            stripe.billing_portal.Session.create,
            customer=customer_id,
            return_url=return_url,
            locale="pl",
        )
    except Exception as e:
        logger.error(f"Error opening billing portal: {e}")
        raise HTTPException(status_code=502, detail="Could not open subscription settings")

    return {"url": sget(portal, "url")}


# ============= WAITLIST (Tally form on cashflo.cash) =============

WAITLIST_EMAIL_SUBJECT = "Jesteś na liście Cashflo"
WAITLIST_EMAIL_BODY = """Cześć!

Dziękujemy za zapis na wczesny dostęp do Cashflo i za odpowiedzi w ankiecie.
Bardzo pomogą nam dopasować aplikację i jej cenę.

Co dalej? Napiszemy, gdy aplikacja będzie gotowa do testów albo do pobrania.
Nie wysyłamy spamu.

Masz pomysł albo pytanie? Po prostu odpisz na tego maila.

Jeśli to nie Ty albo chcesz zrezygnować z listy, odpisz „wypisz”, a usuniemy Twój adres.

Zespół Cashflo
https://cashflo.cash
"""

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def tally_signature_valid(raw_body: bytes, signature: Optional[str]) -> bool:
    """Tally signs the JSON payload with HMAC-SHA256 (base64) using the webhook's signing secret."""
    if not signature or not TALLY_SIGNING_SECRET:
        return False
    key = TALLY_SIGNING_SECRET.encode()
    candidates = [raw_body]
    try:
        # Tally computes it over JSON.stringify(payload); compact JSON matches that if the body was re-formatted
        candidates.append(json.dumps(json.loads(raw_body), separators=(",", ":"), ensure_ascii=False).encode())
    except ValueError:
        pass
    for body in candidates:
        expected = base64.b64encode(hmac.new(key, body, hashlib.sha256).digest()).decode()
        if hmac.compare_digest(expected, signature.strip()):
            return True
    return False


@api_router.post("/webhook/tally")
async def tally_webhook(request: Request):
    """New sign-up on the waitlist form: send the person a short thank-you e-mail (once per submission)."""
    if not TALLY_SIGNING_SECRET:
        raise HTTPException(status_code=503, detail="Tally webhook not configured")
    raw = await request.body()
    if not tally_signature_valid(raw, request.headers.get("Tally-Signature")):
        raise HTTPException(status_code=401, detail="Invalid signature")
    try:
        event = json.loads(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    if event.get("eventType") != "FORM_RESPONSE":
        return {"status": "ignored"}

    data = event.get("data") or {}
    response_id = str(data.get("responseId") or data.get("submissionId") or event.get("eventId") or "")
    email = ""
    for field in data.get("fields") or []:
        if field.get("type") == "INPUT_EMAIL" and isinstance(field.get("value"), str):
            email = field["value"].strip()
            break
    if not response_id or not EMAIL_RE.match(email or ""):
        return {"status": "ignored"}

    # Tally retries deliveries: remember which submissions were answered (no e-mail address is stored)
    key = hashlib.sha256(f"tally:{response_id}".encode()).hexdigest()
    already = await db.waitlist_notifications.find_one({"_id": key})
    if already and already.get("sent"):
        return {"status": "already_sent"}
    if not smtp_ready():
        logger.error("Waitlist sign-up received, but SMTP is not configured")
        raise HTTPException(status_code=503, detail="E-mail not configured")
    try:
        await run_in_threadpool(send_email, email, WAITLIST_EMAIL_SUBJECT, WAITLIST_EMAIL_BODY, SMTP_USER or None)
    except Exception as e:
        logger.error(f"Could not send waitlist e-mail: {e}")
        raise HTTPException(status_code=502, detail="Could not send e-mail")  # Tally will retry
    await db.waitlist_notifications.update_one(
        {"_id": key}, {"$set": {"sent": True, "sent_at": datetime.utcnow()}}, upsert=True
    )
    logger.info("Waitlist thank-you e-mail sent")
    return {"status": "sent"}


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Stripe events. Each one must carry a valid signature for STRIPE_WEBHOOK_SECRET."""
    if not stripe_ready() or not STRIPE_WEBHOOK_SECRET:
        logger.error("Stripe webhook called, but STRIPE_API_KEY / STRIPE_WEBHOOK_SECRET is not configured")
        raise HTTPException(status_code=503, detail="Stripe webhook not configured")

    payload = await request.body()
    signature = request.headers.get("Stripe-Signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing Stripe signature")

    try:
        event = stripe.Webhook.construct_event(payload, signature, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        logger.warning(f"Stripe webhook rejected: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook")

    event_type = sget(event, "type", "")
    obj = sget(sget(event, "data", {}), "object", {})

    try:
        if event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            if await activate_pro_from_session(obj):
                logger.info(f"Pro activated via webhook (session {sget(obj, 'id')})")
        elif event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
            await sync_subscription_status(obj, deleted=event_type == "customer.subscription.deleted")
    except Exception as e:
        # Signature was valid, so answer 500 and let Stripe retry the event later
        logger.error(f"Webhook processing error: {e}")
        raise HTTPException(status_code=500, detail="Webhook processing error")

    return {"status": "ok"}


# ============= ADMIN ENDPOINTS =============

async def require_admin(current_user: dict = Depends(get_current_user)):
    """Dependency that ensures the current user is an admin."""
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@api_router.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    """Aggregate platform statistics for admin dashboard."""
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)
    week_ago = today_start - timedelta(days=7)
    month_ago = today_start - timedelta(days=30)
    
    # Total users
    total_users = await db.users.count_documents({})
    pro_users = await db.users.count_documents({"is_pro": True})
    free_users = max(total_users - pro_users, 0)
    
    # New users (registrations)
    new_today = await db.users.count_documents({"created_at": {"$gte": today_start}})
    new_week = await db.users.count_documents({"created_at": {"$gte": week_ago}})
    new_month = await db.users.count_documents({"created_at": {"$gte": month_ago}})
    
    # Active users (by last_login)
    dau = await db.users.count_documents({"last_login": {"$gte": today_start}})
    wau = await db.users.count_documents({"last_login": {"$gte": week_ago}})
    mau = await db.users.count_documents({"last_login": {"$gte": month_ago}})
    
    # Regularity: % of users active in last 7 days (of all registered before week_ago)
    eligible_for_retention = await db.users.count_documents({"created_at": {"$lt": week_ago}})
    retained_week = await db.users.count_documents({
        "created_at": {"$lt": week_ago},
        "last_login": {"$gte": week_ago},
    })
    weekly_retention_pct = (retained_week / eligible_for_retention * 100) if eligible_for_retention > 0 else 0
    
    # Monthly retention
    eligible_monthly = await db.users.count_documents({"created_at": {"$lt": month_ago}})
    retained_monthly = await db.users.count_documents({
        "created_at": {"$lt": month_ago},
        "last_login": {"$gte": month_ago},
    })
    monthly_retention_pct = (retained_monthly / eligible_monthly * 100) if eligible_monthly > 0 else 0
    
    # Revenue from payments
    paid_payments = await db.payment_transactions.find(
        {"payment_status": "paid"},
        {"amount": 1, "created_at": 1}
    ).to_list(10000)
    total_revenue_pln = sum(p.get("amount", 0) for p in paid_payments)
    revenue_month = sum(
        p.get("amount", 0) for p in paid_payments
        if p.get("created_at") and p["created_at"] >= month_ago
    )
    
    # Counts
    total_transactions = await db.transactions.count_documents({})
    total_goals = await db.goals.count_documents({})
    total_budgets = await db.budgets.count_documents({})
    
    # Pro conversion rate
    pro_conversion_pct = (pro_users / total_users * 100) if total_users > 0 else 0
    
    return {
        "users": {
            "total": total_users,
            "pro": pro_users,
            "free": free_users,
            "pro_conversion_pct": round(pro_conversion_pct, 2),
            "new_today": new_today,
            "new_week": new_week,
            "new_month": new_month,
        },
        "activity": {
            "dau": dau,
            "wau": wau,
            "mau": mau,
            "weekly_retention_pct": round(weekly_retention_pct, 2),
            "monthly_retention_pct": round(monthly_retention_pct, 2),
        },
        "revenue": {
            "total_pln": round(total_revenue_pln, 2),
            "month_pln": round(revenue_month, 2),
            "paid_count": len(paid_payments),
        },
        "data": {
            "transactions": total_transactions,
            "goals": total_goals,
            "budgets": total_budgets,
        },
        "generated_at": now,
    }


@api_router.get("/admin/users")
async def admin_list_users(
    admin: dict = Depends(require_admin),
    search: Optional[str] = None,
    limit: int = 200,
    skip: int = 0,
):
    """List all users with stats for admin."""
    query = {}
    if search:
        query = {
            "$or": [
                {"email": {"$regex": search, "$options": "i"}},
                {"name": {"$regex": search, "$options": "i"}},
            ]
        }
    
    users = await db.users.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    out = []
    for u in users:
        uid = str(u["_id"])
        tx_count = await db.transactions.count_documents({"user_id": uid})
        goals_count = await db.goals.count_documents({"user_id": uid})
        out.append({
            "id": uid,
            "email": u["email"],
            "name": u["name"],
            "is_pro": u.get("is_pro", False),
            "is_admin": u.get("is_admin", False),
            "created_at": u.get("created_at"),
            "last_login": u.get("last_login"),
            "login_count": u.get("login_count", 0),
            "pro_activated_at": u.get("pro_activated_at"),
            "transactions_count": tx_count,
            "goals_count": goals_count,
        })
    
    total = await db.users.count_documents(query)
    return {"users": out, "total": total}


class GrantProRequest(BaseModel):
    is_pro: bool = True


@api_router.post("/admin/users/{user_id}/pro")
async def admin_set_pro(
    user_id: str,
    body: GrantProRequest,
    admin: dict = Depends(require_admin),
):
    """Manually grant or revoke Pro status."""
    update_doc = {"is_pro": body.is_pro}
    if body.is_pro:
        update_doc["pro_activated_at"] = datetime.utcnow()
        update_doc["pro_granted_by"] = str(admin["_id"])
    
    result = await db.users.update_one(
        {"_id": to_object_id(user_id, "User not found")},
        {"$set": update_doc}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "ok", "is_pro": body.is_pro}


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(
    user_id: str,
    admin: dict = Depends(require_admin),
):
    """Delete user and all their data (cascade)."""
    if str(admin["_id"]) == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    user = await db.users.find_one({"_id": to_object_id(user_id, "User not found")})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.get("is_admin"):
        raise HTTPException(status_code=400, detail="Cannot delete admin user")

    # Stop future charges before removing the account
    await cancel_stripe_subscription(user)

    # Cascade delete
    await delete_user_data(user_id)
    await db.payment_transactions.delete_many({"user_id": user_id})
    await db.users.delete_one({"_id": to_object_id(user_id, "User not found")})
    
    return {"status": "deleted"}


@api_router.get("/admin/users/{user_id}/detail")
async def admin_user_detail(
    user_id: str,
    admin: dict = Depends(require_admin),
):
    """Detailed view of a single user."""
    user = await db.users.find_one({"_id": to_object_id(user_id, "User not found")})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    tx_count = await db.transactions.count_documents({"user_id": user_id})
    goals_count = await db.goals.count_documents({"user_id": user_id})
    
    # Compute total income/expenses
    txs = await db.transactions.find(
        {"user_id": user_id},
        {"amount": 1, "type": 1}
    ).to_list(10000)
    income = sum(t["amount"] for t in txs if t.get("type") == "income")
    expenses = sum(t["amount"] for t in txs if t.get("type") == "expense")
    
    # Last 30 days logins
    now = datetime.utcnow()
    month_ago = now - timedelta(days=30)
    recent_logins = [
        login_time for login_time in user.get("login_history", [])
        if isinstance(login_time, datetime) and login_time >= month_ago
    ]
    
    payments = await db.payment_transactions.find(
        {"user_id": user_id}
    ).sort("created_at", -1).to_list(50)
    
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user["name"],
        "is_pro": user.get("is_pro", False),
        "is_admin": user.get("is_admin", False),
        "created_at": user.get("created_at"),
        "last_login": user.get("last_login"),
        "login_count": user.get("login_count", 0),
        "logins_last_30d": len(recent_logins),
        "transactions_count": tx_count,
        "goals_count": goals_count,
        "total_income": round(income, 2),
        "total_expenses": round(expenses, 2),
        "balance": round(income - expenses, 2),
        "payments": [
            {
                "session_id": p.get("session_id"),
                "amount": p.get("amount"),
                "currency": p.get("currency"),
                "status": p.get("status"),
                "payment_status": p.get("payment_status"),
                "created_at": p.get("created_at"),
            }
            for p in payments
        ],
    }


@api_router.get("/admin/activity/timeline")
async def admin_activity_timeline(
    admin: dict = Depends(require_admin),
    days: int = 14,
):
    """Daily new users + active users for the last N days."""
    now = datetime.utcnow()
    start = datetime(now.year, now.month, now.day) - timedelta(days=days - 1)
    
    # Fetch all users that may contribute
    users = await db.users.find(
        {},
        {"created_at": 1, "login_history": 1, "last_login": 1}
    ).to_list(10000)
    
    timeline = []
    for i in range(days):
        day_start = start + timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        new_count = sum(
            1 for u in users
            if u.get("created_at") and day_start <= u["created_at"] < day_end
        )
        active_count = 0
        for u in users:
            history = u.get("login_history", [])
            if any(isinstance(login_time, datetime) and day_start <= login_time < day_end for login_time in history):
                active_count += 1
        timeline.append({
            "date": day_start.strftime("%Y-%m-%d"),
            "new_users": new_count,
            "active_users": active_count,
        })
    
    return {"timeline": timeline}


# Include router
app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def create_indexes():
    """Indexes keep lists and summaries fast as people import thousands of transactions."""
    try:
        await db.transactions.create_index([("user_id", 1), ("date", -1)])
        await db.transactions.create_index([("user_id", 1), ("import_id", 1)], sparse=True)
        await db.transactions.create_index([("user_id", 1), ("recurring_id", 1)])
        await db.recurring_payments.create_index([("user_id", 1), ("active", 1), ("next_date", 1)])
        await db.imports.create_index([("user_id", 1), ("created_at", -1)])
        await db.import_sessions.create_index("created_at", expireAfterSeconds=2 * 3600)
        await db.recurring_dismissed.create_index([("user_id", 1), ("key", 1)])
        await db.categories.create_index("user_id")
        await db.goals.create_index("user_id")
    except Exception as e:
        logger.error(f"Could not create database indexes: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
