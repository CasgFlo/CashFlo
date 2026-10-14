from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict
from datetime import datetime, timedelta
from passlib.context import CryptContext
import jwt
from bson import ObjectId
from typing import Literal
from fastapi.responses import HTMLResponse
from starlette.concurrency import run_in_threadpool
import calendar
import hashlib
import hmac
import html
import re
import secrets
import smtplib
import ssl
from email.message import EmailMessage
import stripe

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

# Free plan limits
FREE_GOAL_LIMIT = 1
FREE_CUSTOM_CATEGORY_LIMIT = 3

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
    category_limits: Optional[dict] = {}

class BudgetUpdate(BaseModel):
    monthly_limit: Optional[float] = None
    category_limits: Optional[dict] = None

class BudgetResponse(BaseModel):
    id: str
    user_id: str
    monthly_limit: float
    category_limits: dict
    current_month_spending: float


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


def send_email(to: str, subject: str, body: str) -> None:
    """Send a plain-text e-mail through the configured SMTP server (blocking: run it in a thread)."""
    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
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
    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        name=user["name"],
        is_pro=user.get("is_pro", False) or is_admin,
        is_admin=is_admin,
        pro_plan=user.get("pro_plan"),
        can_manage_subscription=bool(user.get("stripe_customer_id") and user.get("stripe_subscription_id")),
        created_at=user["created_at"],
        last_login=user.get("last_login"),
        login_count=user.get("login_count", 0),
    )


def is_pro_user(user: dict) -> bool:
    return bool(user.get("is_pro", False) or user.get("is_admin", False))


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
    await db.transactions.delete_many({"user_id": user_id})
    await db.goals.delete_many({"user_id": user_id})
    await db.budgets.delete_many({"user_id": user_id})
    await db.categories.delete_many({"user_id": user_id})
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
        is_recurring=t.get("is_recurring", False),
        recurring_day=t.get("recurring_day"),
        recurring_parent_id=t.get("recurring_parent_id"),
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

    # For recurring transactions: set the date to the first occurrence (current month at recurring_day)
    tx_date = transaction.date
    if transaction.is_recurring and transaction.recurring_day:
        now = datetime.utcnow()
        last_day = calendar.monthrange(now.year, now.month)[1]
        # Day out of range for this month (e.g. 31 in April) -> last day of the month
        tx_date = datetime(now.year, now.month, min(transaction.recurring_day, last_day))

    transaction_dict = {
        "user_id": str(current_user["_id"]),
        "amount": round(transaction.amount, 2),
        "type": transaction.type,
        "category": transaction.category.strip(),
        "description": (transaction.description or "").strip(),
        "date": tx_date,
        "is_recurring": transaction.is_recurring,
        "recurring_day": transaction.recurring_day if transaction.is_recurring else None,
        "recurring_parent_id": None,
        "receipt_image": transaction.receipt_image,
        "created_at": datetime.utcnow()
    }

    result = await db.transactions.insert_one(transaction_dict)
    return transaction_to_response(transaction_dict)


async def process_recurring_transactions(user_id: str):
    """
    Generate missing occurrences of recurring transactions up to today.
    Each recurring template (transaction with is_recurring=True and recurring_day set)
    spawns child transactions (recurring_parent_id=template.id) every month.
    """
    import calendar
    
    # Find all recurring templates for this user
    templates = await db.transactions.find({
        "user_id": user_id,
        "is_recurring": True,
        "recurring_day": {"$ne": None, "$exists": True},
        "recurring_parent_id": None  # Only templates, not children
    }).to_list(1000)
    
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    new_transactions = []
    
    for template in templates:
        recurring_day = template.get("recurring_day")
        if not recurring_day:
            continue
        
        # Find latest child or use template's own date
        latest_child = await db.transactions.find_one(
            {"recurring_parent_id": str(template["_id"])},
            sort=[("date", -1)]
        )
        
        if latest_child:
            base_date = latest_child["date"]
        else:
            base_date = template["date"]
        
        # Generate next occurrences from base_date forward, until > today
        next_year = base_date.year
        next_month = base_date.month
        
        while True:
            # Advance to next month
            next_month += 1
            if next_month > 12:
                next_month = 1
                next_year += 1
            
            # Clamp day to last valid day of target month
            last_day = calendar.monthrange(next_year, next_month)[1]
            day = min(recurring_day, last_day)
            
            next_date = datetime(next_year, next_month, day)
            if next_date > today:
                break
            
            new_transactions.append({
                "user_id": user_id,
                "amount": template["amount"],
                "type": template["type"],
                "category": template["category"],
                "description": template.get("description", ""),
                "date": next_date,
                "is_recurring": False,
                "recurring_day": None,
                "recurring_parent_id": str(template["_id"]),
                "receipt_image": None,
                "created_at": datetime.utcnow()
            })
    
    if new_transactions:
        await db.transactions.insert_many(new_transactions)


@api_router.get("/transactions", response_model=List[TransactionResponse])
async def get_transactions(
    current_user: dict = Depends(get_current_user),
    limit: int = 100,
    skip: int = 0,
    tx_type: Optional[Literal["expense", "income"]] = Query(default=None, alias="type"),
):
    user_id = str(current_user["_id"])

    # Auto-generate missing recurring transactions
    try:
        await process_recurring_transactions(user_id)
    except Exception as e:
        logger.error(f"Error processing recurring transactions: {e}")

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

@api_router.get("/transactions/stats/monthly", response_model=MonthlyStats)
async def get_monthly_stats(
    current_user: dict = Depends(get_current_user),
    year: Optional[int] = None,
    month: Optional[int] = None
):
    user_id = str(current_user["_id"])
    
    # Auto-generate missing recurring transactions before computing stats
    try:
        await process_recurring_transactions(user_id)
    except Exception as e:
        logger.error(f"Error processing recurring transactions: {e}")
    
    # Default to current month
    if not year or not month:
        now = datetime.utcnow()
        year = now.year
        month = now.month
    
    # Get start and end of month
    start_date = datetime(year, month, 1)
    if month == 12:
        end_date = datetime(year + 1, 1, 1)
    else:
        end_date = datetime(year, month + 1, 1)
    
    # Get all transactions for the month (with projection for optimization)
    monthly_transactions = await db.transactions.find(
        {
            "user_id": user_id,
            "date": {"$gte": start_date, "$lt": end_date}
        },
        {"amount": 1, "type": 1, "category": 1, "date": 1}
    ).to_list(1000)
    
    # Calculate monthly totals
    monthly_income = sum(t["amount"] for t in monthly_transactions if t["type"] == "income")
    monthly_expenses = sum(t["amount"] for t in monthly_transactions if t["type"] == "expense")
    
    # Get ALL transactions for total balance calculation
    all_transactions = await db.transactions.find(
        {"user_id": user_id},
        {"amount": 1, "type": 1}
    ).to_list(10000)
    
    total_income_all = sum(t["amount"] for t in all_transactions if t["type"] == "income")
    total_expenses_all = sum(t["amount"] for t in all_transactions if t["type"] == "expense")
    total_balance = total_income_all - total_expenses_all
    
    # Group by category (monthly)
    expenses_by_category = {}
    for t in monthly_transactions:
        if t["type"] == "expense":
            cat = t["category"]
            expenses_by_category[cat] = expenses_by_category.get(cat, 0) + t["amount"]
    
    # Top categories
    top_categories = [
        {"category": cat, "amount": amount}
        for cat, amount in sorted(expenses_by_category.items(), key=lambda x: x[1], reverse=True)[:5]
    ]
    
    return MonthlyStats(
        total_income=monthly_income,
        total_expenses=monthly_expenses,
        balance=total_balance,  # all-time balance from all transactions
        month_balance=monthly_income - monthly_expenses,
        expenses_by_category=expenses_by_category,
        top_categories=top_categories
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

@api_router.post("/budget", response_model=BudgetResponse)
async def create_or_update_budget(
    budget: BudgetCreate,
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user["_id"])
    
    # Check if budget exists
    existing_budget = await db.budgets.find_one({"user_id": user_id})
    
    budget_dict = {
        "user_id": user_id,
        "monthly_limit": budget.monthly_limit,
        "category_limits": budget.category_limits or {}
    }
    
    if existing_budget:
        await db.budgets.update_one(
            {"user_id": user_id},
            {"$set": budget_dict}
        )
        budget_id = str(existing_budget["_id"])
    else:
        result = await db.budgets.insert_one(budget_dict)
        budget_id = str(result.inserted_id)
    
    # Calculate current month spending
    now = datetime.utcnow()
    start_of_month = datetime(now.year, now.month, 1)
    
    transactions = await db.transactions.find({
        "user_id": user_id,
        "type": "expense",
        "date": {"$gte": start_of_month}
    }).to_list(1000)
    
    current_month_spending = sum(t["amount"] for t in transactions)
    
    return BudgetResponse(
        id=budget_id,
        user_id=user_id,
        monthly_limit=budget.monthly_limit,
        category_limits=budget.category_limits or {},
        current_month_spending=current_month_spending
    )


@api_router.get("/budget", response_model=BudgetResponse)
async def get_budget(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    budget = await db.budgets.find_one({"user_id": user_id})
    
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    # Calculate current month spending
    now = datetime.utcnow()
    start_of_month = datetime(now.year, now.month, 1)
    
    transactions = await db.transactions.find({
        "user_id": user_id,
        "type": "expense",
        "date": {"$gte": start_of_month}
    }).to_list(1000)
    
    current_month_spending = sum(t["amount"] for t in transactions)
    
    return BudgetResponse(
        id=str(budget["_id"]),
        user_id=budget["user_id"],
        monthly_limit=budget["monthly_limit"],
        category_limits=budget.get("category_limits", {}),
        current_month_spending=current_month_spending
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
    await db.transactions.delete_many({"user_id": user_id})
    await db.goals.delete_many({"user_id": user_id})
    await db.budgets.delete_many({"user_id": user_id})
    await db.categories.delete_many({"user_id": user_id})
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
