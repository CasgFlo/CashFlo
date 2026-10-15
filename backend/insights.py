"""Recurring payments, subscription detection and the monthly summary.

Plain Python without the database, so it can be tested on its own.
Texts are Polish and written without gendered verb forms ("wydano", not "wydałeś").
"""

from __future__ import annotations

import calendar
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from statistics import median
from typing import Dict, Iterable, List, Optional, Sequence

from importer import SUBSCRIPTION_BRANDS, fold

FREQUENCIES = ("monthly", "weekly", "yearly")

MONTHS_NOMINATIVE = [
    "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
    "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
]
MONTHS_GENITIVE = [
    "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
    "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
]
MONTHS_LOCATIVE = [
    "w styczniu", "w lutym", "w marcu", "w kwietniu", "w maju", "w czerwcu",
    "w lipcu", "w sierpniu", "we wrześniu", "w październiku", "w listopadzie", "w grudniu",
]

NBSP = " "


def pln(amount: float, decimals: bool = False) -> str:
    """1234.5 -> '1 235 zł' (or '1 234,50 zł' with decimals)."""
    value = abs(amount)
    if decimals:
        whole, frac = f"{value:.2f}".split(".")
        text = f"{int(whole):,}".replace(",", NBSP) + "," + frac
    else:
        text = f"{round(value):,}".replace(",", NBSP)
    return ("−" if amount < 0 else "") + text + NBSP + "zł"


# ---------------------------------------------------------------------------
# Dates of recurring payments
# ---------------------------------------------------------------------------

def add_months(day: date, months: int, anchor_day: Optional[int] = None) -> date:
    """Same day of the month `months` later; the 31st becomes the last day of shorter months."""
    total = day.year * 12 + (day.month - 1) + months
    year, month = divmod(total, 12)
    month += 1
    wanted = anchor_day or day.day
    return date(year, month, min(wanted, calendar.monthrange(year, month)[1]))


def next_occurrence(current: date, frequency: str, anchor_day: Optional[int] = None) -> date:
    if frequency == "weekly":
        return current + timedelta(days=7)
    if frequency == "yearly":
        return add_months(current, 12, anchor_day)
    return add_months(current, 1, anchor_day)


def monthly_equivalent(amount: float, frequency: str) -> float:
    if frequency == "weekly":
        return amount * 52 / 12
    if frequency == "yearly":
        return amount / 12
    return amount


def at_noon(day: date) -> datetime:
    """Payments are stored at 12:00 UTC so they fall on the same calendar day in Poland."""
    return datetime(day.year, day.month, day.day, 12, 0, 0)


# ---------------------------------------------------------------------------
# Finding recurring payments in past transactions
# ---------------------------------------------------------------------------

_STOP_WORDS = {
    "com", "www", "pl", "eu", "net", "org", "sp", "zoo", "o", "oo", "s", "a", "sa", "ltd", "inc", "gmbh", "bv",
    "platnosc", "karta", "karty", "zakup", "przelew", "blik", "visa", "mastercard", "pln", "eur", "nr", "ref",
    "transakcja", "oplata", "uzyciu", "przy", "za", "na", "do", "od", "i", "w", "z", "the", "payment", "card",
    "subscription", "subskrypcja", "abonament", "miesieczny", "miesiac", "wrzesien", "pazdziernik", "listopad",
    "grudzien", "styczen", "luty", "marzec", "kwiecien", "maj", "czerwiec", "lipiec", "sierpien",
}


def brand_of(text: str) -> Optional[str]:
    folded = " " + fold(text) + " "
    for key in sorted(SUBSCRIPTION_BRANDS, key=len, reverse=True):
        if key in folded:
            return key
    return None


def merchant_key(description: str) -> str:
    brand = brand_of(description)
    if brand:
        return "brand:" + brand
    words = [w for w in re.split(r"[^a-z]+", fold(description)) if len(w) >= 3 and w not in _STOP_WORDS]
    return " ".join(words[:2])


def display_name(description: str, key: str) -> str:
    if key.startswith("brand:"):
        return SUBSCRIPTION_BRANDS[key[6:]]
    text = re.sub(r"\s+", " ", description).strip()
    return (text[:40].rstrip() or key.title()) if text else key.title()


def detect_recurring(
    transactions: Sequence[dict],
    today: date,
    known_keys: Iterable[str] = (),
    dismissed_keys: Iterable[str] = (),
    limit: int = 10,
) -> List[dict]:
    """Payments that repeat every month (or week, or year) with a similar amount.

    `transactions`: expense dicts with id, date (datetime), amount, category, description.
    """
    known = set(known_keys) | set(dismissed_keys)
    groups: Dict[str, List[dict]] = defaultdict(list)
    for t in transactions:
        if t.get("type", "expense") != "expense":
            continue
        description = (t.get("description") or "").strip()
        if description:
            key = merchant_key(description)
        else:
            # No description: same category and the exact same amount
            key = f"#{fold(t.get('category', ''))}|{t['amount']:.2f}"
        if key and key not in known:
            groups[key].append(t)

    suggestions = []
    for key, items in groups.items():
        items = sorted(items, key=lambda t: t["date"])
        # Two payments on the same day count once
        unique: List[dict] = []
        for t in items:
            if unique and unique[-1]["date"].date() == t["date"].date():
                continue
            unique.append(t)
        if len(unique) < 2:
            continue

        amounts = [t["amount"] for t in unique]
        if max(amounts) > 1.35 * min(amounts) + 2:
            continue
        # Shops people simply visit often need three repeats (or the same amount twice);
        # well-known subscriptions are recognised after two
        if not key.startswith("brand:") and len(unique) < 3 and max(amounts) > 1.05 * min(amounts):
            continue
        gaps = [(b["date"].date() - a["date"].date()).days for a, b in zip(unique, unique[1:])]

        if all(20 <= g <= 45 for g in gaps):
            frequency, period = "monthly", 31
        elif len(unique) >= 3 and all(5 <= g <= 9 for g in gaps):
            frequency, period = "weekly", 7
        elif all(340 <= g <= 390 for g in gaps):
            frequency, period = "yearly", 366
        else:
            continue

        last = unique[-1]
        last_day = last["date"].date()
        if (today - last_day).days > period * 1.6:
            continue  # stopped a while ago

        anchor = last_day.day
        upcoming = next_occurrence(last_day, frequency, anchor)
        guard = 0
        while upcoming < today and guard < 60:
            upcoming = next_occurrence(upcoming, frequency, anchor)
            guard += 1

        brand = key[6:] if key.startswith("brand:") else None
        category = Counter(t.get("category", "Inne") for t in unique).most_common(1)[0][0]
        name = display_name(last.get("description") or category, key) if not key.startswith("#") else category
        amount = round(last["amount"], 2)
        suggestions.append({
            "key": key,
            "name": name,
            "amount": amount,
            "frequency": frequency,
            "category": category,
            "next_date": upcoming.isoformat(),
            "is_subscription": bool(brand) or fold(category) == "rozrywka",
            "occurrences": len(unique),
            "last_date": last_day.isoformat(),
            "monthly_amount": round(monthly_equivalent(amount, frequency), 2),
            "transaction_ids": [str(t["id"]) for t in unique][-24:],
        })

    suggestions.sort(key=lambda s: (-s["is_subscription"], -s["monthly_amount"]))
    return suggestions[:limit]


# ---------------------------------------------------------------------------
# Monthly summary
# ---------------------------------------------------------------------------

# Categories people can't easily cut down on, left out of the savings tip
_ESSENTIAL = ("dom i rachunki", "zdrowie", "edukacja", "czynsz", "kredyt", "rachunki", "oplaty")


def _totals(transactions: Iterable[dict]):
    income = expenses = 0.0
    by_category: Dict[str, float] = defaultdict(float)
    for t in transactions:
        if t["type"] == "income":
            income += t["amount"]
        else:
            expenses += t["amount"]
            by_category[t.get("category") or "Inne"] += t["amount"]
    return income, expenses, by_category


def _pct(new: float, old: float) -> Optional[float]:
    if old <= 0:
        return None
    return (new - old) / old


def build_monthly_report(
    year: int,
    month: int,
    transactions: Sequence[dict],
    previous: Sequence[dict],
    today: date,
    budget: Optional[dict] = None,
    recurring: Sequence[dict] = (),
    is_pro: bool = False,
) -> dict:
    days_in_month = calendar.monthrange(year, month)[1]
    is_current = (today.year, today.month) == (year, month)
    days_elapsed = today.day if is_current else days_in_month
    prev_month = 12 if month == 1 else month - 1
    prev_label = MONTHS_LOCATIVE[prev_month - 1]

    income, expenses, by_category = _totals(transactions)
    prev_income, prev_expenses, prev_by_category = _totals(previous)

    # In the month that is still going, compare with the same days of the previous month
    if is_current:
        comparable_prev = [t for t in previous if t["date"].day <= today.day]
    else:
        comparable_prev = list(previous)
    cmp_income, cmp_expenses, cmp_by_category = _totals(comparable_prev)
    has_prev = cmp_expenses > 0 or cmp_income > 0

    balance = income - expenses
    savings_rate = (balance / income) if income > 0 else None

    categories = []
    for name, amount in sorted(by_category.items(), key=lambda kv: -kv[1]):
        prev_amount = cmp_by_category.get(name, 0.0)
        categories.append({
            "name": name,
            "amount": round(amount, 2),
            "share": round(amount / expenses, 4) if expenses else 0,
            "prev_amount": round(prev_amount, 2),
            "change_pct": _pct(amount, prev_amount),
        })

    expense_rows = [t for t in transactions if t["type"] != "income"]
    biggest = max(expense_rows, key=lambda t: t["amount"], default=None)

    fixed_monthly = sum(
        monthly_equivalent(r["amount"], r.get("frequency", "monthly"))
        for r in recurring if r.get("active", True) and r.get("type", "expense") == "expense"
    )
    subs = [r for r in recurring if r.get("active", True) and r.get("is_subscription") and r.get("type", "expense") == "expense"]
    subs_monthly = sum(monthly_equivalent(r["amount"], r.get("frequency", "monthly")) for r in subs)

    budget_info = None
    limit = (budget or {}).get("monthly_limit") or 0
    if limit > 0:
        left = limit - expenses
        used = expenses / limit
        budget_info = {
            "limit": round(limit, 2),
            "spent": round(expenses, 2),
            "left": round(left, 2),
            "status": "over" if left < 0 else "near" if used >= 0.85 else "ok",
        }

    # ---------------------------------------------------------- insights
    insights: List[dict] = []

    def add(icon: str, text: str, tone: str = "neutral", kind: str = "info"):
        insights.append({"icon": icon, "text": text, "tone": tone, "kind": kind})

    if has_prev and cmp_expenses >= 50 and expenses > 0:
        change = _pct(expenses, cmp_expenses) or 0
        diff = expenses - cmp_expenses
        period = "Do tej pory wydano" if is_current else "Wydano"
        compare = f"niż w tym samym okresie {prev_label}" if is_current else f"niż {prev_label}"
        if change <= -0.05:
            add("trending-down", f"{period} o {round(-change * 100)}% mniej {compare} ({pln(diff)}).", "positive", "compare")
        elif change >= 0.05:
            add("trending-up", f"{period} o {round(change * 100)}% więcej {compare} (+{pln(diff)}).", "negative", "compare")
        else:
            add("swap-horizontal", f"Wydatki są na podobnym poziomie jak {prev_label}.", "neutral", "compare")

    if income > 0:
        if balance >= 0:
            rate = round(balance / income * 100)
            if is_current:
                add("wallet", f"Na razie zostaje {rate}% przychodów ({pln(balance)}).", "positive" if rate >= 10 else "neutral", "savings")
            else:
                add("wallet", f"Zostało {rate}% przychodów ({pln(balance)}).", "positive" if rate >= 10 else "neutral", "savings")
        else:
            add("alert-circle", f"Wydatki przekroczyły przychody o {pln(-balance)}.", "negative", "savings")

    increases = [
        (c["amount"] - c["prev_amount"], c) for c in categories
        if c["prev_amount"] >= 50 and c["amount"] - c["prev_amount"] >= 50 and (c["change_pct"] or 0) >= 0.2
    ]
    if has_prev and increases:
        diff, c = max(increases, key=lambda x: x[0])
        add("arrow-up-circle", f"Na kategorię {c['name']} poszło o {round(c['change_pct'] * 100)}% więcej niż {prev_label} (+{pln(diff)}).", "negative", "compare")

    decreases = [
        (c["prev_amount"] - c["amount"], c) for c in categories
        if c["prev_amount"] - c["amount"] >= 50 and (c["change_pct"] or 0) <= -0.2
    ]
    # Categories with no spending at all this month
    for name, prev_amount in cmp_by_category.items():
        if name not in by_category and prev_amount >= 100 and not is_current:
            decreases.append((prev_amount, {"name": name, "amount": 0, "prev_amount": prev_amount}))
    if has_prev and decreases:
        diff, c = max(decreases, key=lambda x: x[0])
        add("arrow-down-circle", f"Na kategorię {c['name']} wydano o {pln(diff)} mniej niż {prev_label}.", "positive", "compare")

    if budget_info:
        if budget_info["left"] < 0:
            add("warning", f"Budżet przekroczony o {pln(-budget_info['left'])}.", "negative", "budget")
        elif is_current:
            days_left = max(days_in_month - today.day + 1, 1)
            add("calendar", f"Z budżetu zostało {pln(budget_info['left'])}, czyli ok. {pln(budget_info['left'] / days_left)} dziennie do końca miesiąca.", "neutral", "budget")
        else:
            add("checkmark-circle", f"Budżet dotrzymany: zostało {pln(budget_info['left'])}.", "positive", "budget")

    # Yearly cost of everything that repeats: bills and subscriptions together
    if fixed_monthly > 0 and subs_monthly >= fixed_monthly - 0.005:
        add("repeat", f"Subskrypcje kosztują {pln(subs_monthly)} miesięcznie, czyli {pln(subs_monthly * 12)} rocznie.", "neutral", "subscriptions")
    elif fixed_monthly > 0 and subs_monthly > 0:
        add("repeat", f"Stałe płatności i subskrypcje to {pln(fixed_monthly)} miesięcznie, czyli {pln(fixed_monthly * 12)} rocznie "
                      f"(same subskrypcje: {pln(subs_monthly * 12)} rocznie).", "neutral", "subscriptions")
    elif fixed_monthly > 0:
        add("repeat", f"Stałe płatności to {pln(fixed_monthly)} miesięcznie, czyli {pln(fixed_monthly * 12)} rocznie.", "neutral", "subscriptions")

    if categories:
        top = categories[0]
        add("pie-chart", f"Najwięcej poszło na: {top['name']} ({round(top['share'] * 100)}% wydatków).", "neutral", "top")

    # The biggest one-off purchase says more than the rent does
    one_off = [
        t for t in expense_rows
        if not t.get("recurring_id") and not any(e in fold(t.get("category") or "") for e in _ESSENTIAL)
    ]
    biggest_one_off = max(one_off, key=lambda t: t["amount"], default=None)
    if biggest_one_off is not None and len(expense_rows) >= 3:
        what = biggest_one_off.get("description") or biggest_one_off.get("category")
        add("receipt", f"Największy jednorazowy wydatek: {pln(biggest_one_off['amount'])} ({what}).", "neutral", "biggest")

    tip = None
    flexible = [c for c in categories if not any(e in fold(c["name"]) for e in _ESSENTIAL) and c["amount"] >= 100]
    if flexible:
        c = flexible[0]
        monthly_amount = c["amount"] if not is_current else c["amount"] / max(days_elapsed, 1) * days_in_month
        yearly = round(monthly_amount * 0.2 * 12 / 10) * 10
        if yearly >= 100:
            tip = {
                "category": c["name"],
                "yearly_saving": yearly,
                "text": f"Gdyby wydatki na {c['name']} były o 20% niższe, przez rok zostałoby ok. {pln(yearly)}.",
            }

    report = {
        "year": year,
        "month": month,
        "month_name": MONTHS_NOMINATIVE[month - 1],
        "month_genitive": MONTHS_GENITIVE[month - 1],
        "is_current_month": is_current,
        "days_in_month": days_in_month,
        "days_elapsed": days_elapsed,
        "has_data": bool(transactions),
        "income": round(income, 2),
        "expenses": round(expenses, 2),
        "balance": round(balance, 2),
        "savings_rate": savings_rate,
        "previous": {
            "income": round(prev_income, 2),
            "expenses": round(prev_expenses, 2),
            "balance": round(prev_income - prev_expenses, 2),
            "comparable_expenses": round(cmp_expenses, 2),
            "label": prev_label,
        } if has_prev else None,
        "expenses_change_pct": _pct(expenses, cmp_expenses) if has_prev else None,
        "categories": categories,
        "biggest_expense": {
            "amount": round(biggest["amount"], 2),
            "category": biggest.get("category"),
            "description": biggest.get("description") or "",
            "date": biggest["date"].date().isoformat(),
        } if biggest is not None else None,
        "daily_average": round(expenses / max(days_elapsed, 1), 2),
        "transaction_count": len(transactions),
        "fixed_costs_monthly": round(fixed_monthly, 2),
        "subscriptions_monthly": round(subs_monthly, 2),
        "subscriptions_count": len(subs),
        "budget": budget_info,
        "insights": insights,
        "tip": tip,
        "locked": False,
        "locked_count": 0,
    }

    if not is_pro:
        hidden = max(len(insights) - 1, 0) + (1 if tip else 0)
        report["insights"] = insights[:1]
        report["tip"] = None
        report["previous"] = None
        report["expenses_change_pct"] = None
        for c in report["categories"]:
            c["prev_amount"] = None
            c["change_pct"] = None
        report["locked"] = True
        report["locked_count"] = hidden
    return report
