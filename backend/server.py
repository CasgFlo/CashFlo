from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
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

# Stripe Checkout helpers come from Emergent's own package, which is only
# installable on the Emergent platform. Outside it the server still starts and
# the payment endpoints answer 503 until payments are rewritten.
try:
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
    STRIPE_LIB_AVAILABLE = True
except ImportError:
    StripeCheckout = CheckoutSessionResponse = CheckoutStatusResponse = CheckoutSessionRequest = None
    STRIPE_LIB_AVAILABLE = False

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

# Pro subscription price in PLN
PRO_PRICE_PLN = 19.00

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
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    is_pro: bool = False
    is_admin: bool = False
    created_at: datetime
    last_login: Optional[datetime] = None
    login_count: int = 0

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# Transaction Models
class TransactionCreate(BaseModel):
    amount: float
    type: str  # "expense" or "income"
    category: str
    description: Optional[str] = ""
    date: datetime
    is_recurring: bool = False
    recurring_day: Optional[int] = None  # Day of month (1-31) for recurring transactions
    receipt_image: Optional[str] = None  # base64

class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    type: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    date: Optional[datetime] = None
    is_recurring: Optional[bool] = None
    recurring_day: Optional[int] = None
    receipt_image: Optional[str] = None

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
    created_at: datetime


# Category Models
class CategoryCreate(BaseModel):
    name: str
    icon: str
    color: str
    type: Optional[str] = "expense"

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
    name: str
    target_amount: float
    current_amount: float = 0
    deadline: Optional[datetime] = None

class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: Optional[float] = None
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
    monthly_limit: float
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
    total_income: float
    total_expenses: float
    balance: float
    expenses_by_category: dict
    top_categories: List[dict]


# Payment Models
class CheckoutRequest(BaseModel):
    origin_url: str

class PaymentStatusResponse(BaseModel):
    status: str
    payment_status: str
    is_pro_activated: bool = False


# ============= UTILITY FUNCTIONS =============

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
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


def stripe_webhook_url(request: Request) -> str:
    return str(request.base_url).rstrip('/') + "/api/webhook/stripe"


def stripe_ready() -> bool:
    return bool(STRIPE_API_KEY) and STRIPE_LIB_AVAILABLE


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = verify_token(token)
    user_id = payload.get("user_id")
    if not user_id or not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.users.find_one({"_id": to_object_id(user_id, "User not found")})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
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


# ============= AUTH ENDPOINTS =============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    email = normalize_email(user_data.email)

    # Check if user exists
    existing_user = await db.users.find_one({"email": email}, collation=EMAIL_COLLATION)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Hash password
    hashed_password = pwd_context.hash(user_data.password)

    now = datetime.utcnow()

    # Create user
    user_dict = {
        "email": email,
        "password_hash": hashed_password,
        "name": user_data.name,
        "is_pro": False,
        "is_admin": False,
        "created_at": now,
        "last_login": now,
        "login_count": 1,
        "login_history": [now],
    }
    
    result = await db.users.insert_one(user_dict)
    user_id = str(result.inserted_id)
    
    # Create default categories for user
    for cat in DEFAULT_CATEGORIES:
        await db.categories.insert_one({
            "user_id": user_id,
            "name": cat["name"],
            "icon": cat["icon"],
            "color": cat["color"],
            "type": cat.get("type", "expense"),
            "is_default": True
        })
    
    # Create access token
    access_token = create_access_token({"user_id": user_id})
    
    user_response = UserResponse(
        id=user_id,
        email=email,
        name=user_data.name,
        is_pro=False,
        is_admin=False,
        created_at=user_dict["created_at"],
        last_login=now,
        login_count=1,
    )
    
    return TokenResponse(access_token=access_token, user=user_response)


@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    # Find user
    user = await db.users.find_one({"email": normalize_email(user_data.email)}, collation=EMAIL_COLLATION)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Verify password
    if not pwd_context.verify(user_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id = str(user["_id"])
    now = datetime.utcnow()

    is_admin = user.get("is_admin", False)
    update_fields = {
        "last_login": now,
    }
    inc_fields = {"login_count": 1}
    
    # Keep only last 100 logins for retention metrics
    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": update_fields,
            "$inc": inc_fields,
            "$push": {"login_history": {"$each": [now], "$slice": -100}},
        }
    )
    
    # Create access token
    access_token = create_access_token({"user_id": user_id})
    
    user_response = UserResponse(
        id=user_id,
        email=user["email"],
        name=user["name"],
        is_pro=user.get("is_pro", False) or is_admin,
        is_admin=is_admin,
        created_at=user["created_at"],
        last_login=now,
        login_count=user.get("login_count", 0) + 1,
    )
    
    return TokenResponse(access_token=access_token, user=user_response)


@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=str(current_user["_id"]),
        email=current_user["email"],
        name=current_user["name"],
        is_pro=current_user.get("is_pro", False),
        is_admin=current_user.get("is_admin", False),
        created_at=current_user["created_at"],
        last_login=current_user.get("last_login"),
        login_count=current_user.get("login_count", 0),
    )


class DeleteAccountRequest(BaseModel):
    password: str


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

@api_router.post("/transactions", response_model=TransactionResponse)
async def create_transaction(
    transaction: TransactionCreate,
    current_user: dict = Depends(get_current_user)
):
    # For recurring transactions: set the date to the first occurrence (current month at recurring_day)
    tx_date = transaction.date
    if transaction.is_recurring and transaction.recurring_day:
        now = datetime.utcnow()
        try:
            tx_date = datetime(now.year, now.month, transaction.recurring_day)
        except ValueError:
            # day out of range for current month (e.g., Feb 30) - use last valid day
            import calendar
            last_day = calendar.monthrange(now.year, now.month)[1]
            tx_date = datetime(now.year, now.month, min(transaction.recurring_day, last_day))
    
    transaction_dict = {
        "user_id": str(current_user["_id"]),
        "amount": transaction.amount,
        "type": transaction.type,
        "category": transaction.category,
        "description": transaction.description,
        "date": tx_date,
        "is_recurring": transaction.is_recurring,
        "recurring_day": transaction.recurring_day if transaction.is_recurring else None,
        "recurring_parent_id": None,
        "receipt_image": transaction.receipt_image,
        "created_at": datetime.utcnow()
    }
    
    result = await db.transactions.insert_one(transaction_dict)
    transaction_dict["id"] = str(result.inserted_id)
    
    return TransactionResponse(**transaction_dict)


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
    skip: int = 0
):
    user_id = str(current_user["_id"])
    
    # Auto-generate missing recurring transactions
    try:
        await process_recurring_transactions(user_id)
    except Exception as e:
        logger.error(f"Error processing recurring transactions: {e}")
    
    transactions = await db.transactions.find(
        {"user_id": user_id}
    ).sort("date", -1).skip(skip).limit(limit).to_list(limit)
    
    return [
        TransactionResponse(
            id=str(t["_id"]),
            user_id=t["user_id"],
            amount=t["amount"],
            type=t["type"],
            category=t["category"],
            description=t.get("description", ""),
            date=t["date"],
            is_recurring=t.get("is_recurring", False),
            recurring_day=t.get("recurring_day"),
            recurring_parent_id=t.get("recurring_parent_id"),
            receipt_image=t.get("receipt_image"),
            created_at=t["created_at"]
        )
        for t in transactions
    ]


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
    
    return TransactionResponse(
        id=str(transaction["_id"]),
        user_id=transaction["user_id"],
        amount=transaction["amount"],
        type=transaction["type"],
        category=transaction["category"],
        description=transaction.get("description", ""),
        date=transaction["date"],
        is_recurring=transaction.get("is_recurring", False),
        recurring_day=transaction.get("recurring_day"),
        recurring_parent_id=transaction.get("recurring_parent_id"),
        receipt_image=transaction.get("receipt_image"),
        created_at=transaction["created_at"]
    )


@api_router.put("/transactions/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: str,
    transaction_update: TransactionUpdate,
    current_user: dict = Depends(get_current_user)
):
    update_data = {k: v for k, v in transaction_update.dict().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    result = await db.transactions.update_one(
        {"_id": to_object_id(transaction_id, "Transaction not found"), "user_id": str(current_user["_id"])},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    updated_transaction = await db.transactions.find_one({"_id": to_object_id(transaction_id, "Transaction not found")})
    
    return TransactionResponse(
        id=str(updated_transaction["_id"]),
        user_id=updated_transaction["user_id"],
        amount=updated_transaction["amount"],
        type=updated_transaction["type"],
        category=updated_transaction["category"],
        description=updated_transaction.get("description", ""),
        date=updated_transaction["date"],
        is_recurring=updated_transaction.get("is_recurring", False),
        recurring_day=updated_transaction.get("recurring_day"),
        recurring_parent_id=updated_transaction.get("recurring_parent_id"),
        receipt_image=updated_transaction.get("receipt_image"),
        created_at=updated_transaction["created_at"]
    )


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
        balance=total_balance,  # This is now TOTAL balance from all transactions
        expenses_by_category=expenses_by_category,
        top_categories=top_categories
    )


# ============= CATEGORY ENDPOINTS =============

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
        for cat in income_defaults:
            await db.categories.insert_one({
                "user_id": user_id,
                "name": cat["name"],
                "icon": cat["icon"],
                "color": cat["color"],
                "type": cat.get("type", "expense"),
                "is_default": True
            })
    
    categories = await db.categories.find(
        {"user_id": user_id}
    ).to_list(100)
    
    return [
        CategoryResponse(
            id=str(c["_id"]),
            user_id=c["user_id"],
            name=c["name"],
            icon=c["icon"],
            color=c["color"],
            type=c.get("type", "expense"),
            is_default=c.get("is_default", False)
        )
        for c in categories
    ]


@api_router.post("/categories", response_model=CategoryResponse)
async def create_category(
    category: CategoryCreate,
    current_user: dict = Depends(get_current_user)
):
    category_type = category.type if category.type in ("expense", "income") else "expense"
    category_dict = {
        "user_id": str(current_user["_id"]),
        "name": category.name,
        "icon": category.icon,
        "color": category.color,
        "type": category_type,
        "is_default": False
    }
    
    result = await db.categories.insert_one(category_dict)
    category_dict["id"] = str(result.inserted_id)
    
    return CategoryResponse(**category_dict)


# ============= GOAL ENDPOINTS =============

@api_router.post("/goals", response_model=GoalResponse)
async def create_goal(
    goal: GoalCreate,
    current_user: dict = Depends(get_current_user)
):
    # Check if user is Pro or has reached free tier limit
    user_id = str(current_user["_id"])
    is_pro = current_user.get("is_pro", False)
    
    if not is_pro:
        # Count existing goals for free users
        existing_goals_count = await db.goals.count_documents({"user_id": user_id})
        if existing_goals_count >= 1:
            raise HTTPException(
                status_code=403, 
                detail="Free users can create only 1 goal. Upgrade to Pro for unlimited goals."
            )
    
    goal_dict = {
        "user_id": user_id,
        "name": goal.name,
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
    is_pro = current_user.get("is_pro", False)
    count = await db.goals.count_documents({"user_id": user_id})
    
    return {
        "count": count,
        "is_pro": is_pro,
        "can_add_more": is_pro or count < 1,
        "limit": "unlimited" if is_pro else 1
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

@api_router.post("/payments/checkout")
async def create_checkout_session(
    request: Request,
    checkout_data: CheckoutRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create Stripe checkout session for Pro subscription"""
    if not stripe_ready():
        raise HTTPException(status_code=503, detail="Stripe not configured")
    
    user_id = str(current_user["_id"])
    user_email = current_user["email"]
    
    # Check if already Pro
    if current_user.get("is_pro", False):
        raise HTTPException(status_code=400, detail="User already has Pro subscription")
    
    # Build URLs
    origin_url = checkout_data.origin_url.rstrip('/')
    success_url = f"{origin_url}/pro/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}/pro/upgrade"
    
    # Initialize Stripe
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=stripe_webhook_url(request))

    # Create checkout session with PLN currency
    checkout_request = CheckoutSessionRequest(
        amount=PRO_PRICE_PLN,
        currency="pln",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user_id,
            "user_email": user_email,
            "product": "cashflo_pro"
        },
        payment_methods=["card", "blik"]
    )
    
    try:
        session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)
        
        # Store payment transaction in database
        payment_record = {
            "user_id": user_id,
            "session_id": session.session_id,
            "amount": PRO_PRICE_PLN,
            "currency": "pln",
            "status": "pending",
            "payment_status": "initiated",
            "metadata": {
                "user_email": user_email,
                "product": "cashflo_pro"
            },
            "created_at": datetime.utcnow()
        }
        await db.payment_transactions.insert_one(payment_record)
        
        return {
            "url": session.url,
            "session_id": session.session_id
        }
    except Exception as e:
        logger.error(f"Error creating checkout session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Payment error: {str(e)}")


@api_router.get("/payments/status/{session_id}", response_model=PaymentStatusResponse)
async def get_payment_status(
    request: Request,
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Check payment status and activate Pro if paid"""
    if not stripe_ready():
        raise HTTPException(status_code=503, detail="Stripe not configured")
    
    user_id = str(current_user["_id"])
    
    # Get payment record
    payment = await db.payment_transactions.find_one({
        "session_id": session_id,
        "user_id": user_id
    })
    
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    # If already processed successfully, return cached status
    if payment.get("payment_status") == "paid" and current_user.get("is_pro", False):
        return PaymentStatusResponse(
            status="complete",
            payment_status="paid",
            is_pro_activated=True
        )
    
    # Initialize Stripe and check status
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=stripe_webhook_url(request))
    
    try:
        checkout_status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
        
        # Update payment record
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": checkout_status.status,
                "payment_status": checkout_status.payment_status,
                "updated_at": datetime.utcnow()
            }}
        )
        
        is_pro_activated = False
        
        # If payment successful, activate Pro
        if checkout_status.payment_status == "paid":
            # Check if not already processed (prevent double activation)
            existing_activation = await db.payment_transactions.find_one({
                "session_id": session_id,
                "pro_activated": True
            })
            
            if not existing_activation:
                # Activate Pro for user
                await db.users.update_one(
                    {"_id": to_object_id(user_id, "User not found")},
                    {"$set": {"is_pro": True, "pro_activated_at": datetime.utcnow()}}
                )
                
                # Mark payment as processed
                await db.payment_transactions.update_one(
                    {"session_id": session_id},
                    {"$set": {"pro_activated": True}}
                )
                
                is_pro_activated = True
                logger.info(f"Pro activated for user {user_id}")
            else:
                is_pro_activated = True
        
        return PaymentStatusResponse(
            status=checkout_status.status,
            payment_status=checkout_status.payment_status,
            is_pro_activated=is_pro_activated
        )
        
    except Exception as e:
        logger.error(f"Error checking payment status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Payment status error: {str(e)}")


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks.

    Every event must carry a valid Stripe signature. Without a configured
    webhook secret the endpoint refuses all events, so nobody can fake a
    "paid" event to unlock Pro.
    """
    if not stripe_ready() or not STRIPE_WEBHOOK_SECRET:
        logger.error("Stripe webhook called, but STRIPE_API_KEY / STRIPE_WEBHOOK_SECRET is not configured")
        raise HTTPException(status_code=503, detail="Stripe webhook not configured")

    body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing Stripe signature")

    stripe_checkout = StripeCheckout(
        api_key=STRIPE_API_KEY,
        webhook_url=stripe_webhook_url(request),
        webhook_secret=STRIPE_WEBHOOK_SECRET,
    )

    try:
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
    except Exception as e:
        logger.error(f"Stripe webhook rejected: {str(e)}")
        raise HTTPException(status_code=400, detail="Invalid webhook")

    try:
        logger.info(f"Webhook received: {webhook_response.event_type}")

        # Handle checkout.session.completed event
        if webhook_response.event_type == "checkout.session.completed":
            session_id = webhook_response.session_id
            metadata = webhook_response.metadata

            if metadata and metadata.get("product") == "cashflo_pro":
                user_id = metadata.get("user_id")

                # Only activate for a checkout session this server created for this user
                known_payment = await db.payment_transactions.find_one({
                    "session_id": session_id,
                    "user_id": user_id,
                }) if user_id else None
                if user_id and not known_payment:
                    logger.warning(f"Webhook for unknown session {session_id}; ignored")

                if known_payment and ObjectId.is_valid(user_id):
                    # Update payment record
                    await db.payment_transactions.update_one(
                        {"session_id": session_id},
                        {"$set": {
                            "status": "complete",
                            "payment_status": "paid",
                            "updated_at": datetime.utcnow()
                        }}
                    )
                    
                    # Activate Pro
                    existing_activation = await db.payment_transactions.find_one({
                        "session_id": session_id,
                        "pro_activated": True
                    })
                    
                    if not existing_activation:
                        await db.users.update_one(
                            {"_id": ObjectId(user_id)},
                            {"$set": {"is_pro": True, "pro_activated_at": datetime.utcnow()}}
                        )

                        await db.payment_transactions.update_one(
                            {"session_id": session_id},
                            {"$set": {"pro_activated": True}}
                        )

                        logger.info(f"Pro activated via webhook for user {user_id}")

        return {"status": "ok"}

    except Exception as e:
        # Signature was valid, so answer 500 and let Stripe retry the event later
        logger.error(f"Webhook processing error: {str(e)}")
        raise HTTPException(status_code=500, detail="Webhook processing error")


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
