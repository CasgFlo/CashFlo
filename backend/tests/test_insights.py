"""Tests for recurring payment dates, subscription detection and the monthly summary."""

import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from insights import (  # noqa: E402
    add_months,
    build_monthly_report,
    detect_recurring,
    merchant_key,
    monthly_equivalent,
    next_occurrence,
    pln,
)


def tx(day, amount, description="", category="Inne", type_="expense", id_=None):
    d = datetime(day.year, day.month, day.day, 12)
    return {"id": id_ or f"{day.isoformat()}-{amount}-{description}", "date": d, "amount": amount,
            "description": description, "category": category, "type": type_}


def test_dates():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2026, 2, 28), 1, anchor_day=31) == date(2026, 3, 31)
    assert add_months(date(2026, 12, 15), 1) == date(2027, 1, 15)
    assert next_occurrence(date(2026, 10, 1), "weekly") == date(2026, 10, 8)
    assert next_occurrence(date(2024, 2, 29), "yearly", 29) == date(2025, 2, 28)
    assert round(monthly_equivalent(10, "weekly"), 2) == 43.33
    assert monthly_equivalent(120, "yearly") == 10


def test_pln():
    assert pln(1234.5) == "1 234 zł"
    assert pln(-340) == "−340 zł"
    assert pln(12.5, decimals=True) == "12,50 zł"


def test_merchant_key():
    assert merchant_key("NETFLIX.COM Amsterdam") == "brand:netflix"
    assert merchant_key("Spotify P1234") == "brand:spotify"
    assert merchant_key("PGE Obrót S.A. faktura 123") == "pge obrot"


def test_detect_monthly_subscription_and_bill():
    today = date(2026, 10, 14)
    history = [
        tx(date(2026, 7, 5), 43.0, "NETFLIX.COM", "Rozrywka"),
        tx(date(2026, 8, 5), 43.0, "NETFLIX.COM", "Rozrywka"),
        tx(date(2026, 9, 5), 49.0, "NETFLIX.COM", "Rozrywka"),
        tx(date(2026, 10, 5), 49.0, "NETFLIX.COM", "Rozrywka"),
        tx(date(2026, 7, 20), 175.0, "PGE Obrót faktura", "Dom i Rachunki"),
        tx(date(2026, 8, 20), 182.4, "PGE Obrót faktura", "Dom i Rachunki"),
        # a shop visited twice with different amounts is not a fixed payment
        tx(date(2026, 8, 17), 25.0, "Apteka DOZ", "Zdrowie"),
        tx(date(2026, 9, 17), 61.0, "Apteka DOZ", "Zdrowie"),
        tx(date(2026, 9, 21), 201.1, "PGE Obrót faktura", "Dom i Rachunki"),
        # one-off purchases, never repeated
        tx(date(2026, 9, 2), 300.0, "Allegro", "Zakupy"),
        tx(date(2026, 10, 1), 15.0, "Allegro", "Zakupy"),
        # repeated, but stopped half a year ago
        tx(date(2026, 1, 3), 29.99, "Siłownia Fit", "Zdrowie"),
        tx(date(2026, 2, 3), 29.99, "Siłownia Fit", "Zdrowie"),
    ]
    found = detect_recurring(history, today)
    names = [s["name"] for s in found]
    assert names == ["Netflix", "PGE Obrót faktura"]
    netflix = found[0]
    assert netflix["is_subscription"] and netflix["frequency"] == "monthly"
    assert netflix["amount"] == 49.0 and netflix["next_date"] == "2026-11-05"
    assert netflix["occurrences"] == 4 and len(netflix["transaction_ids"]) == 4
    assert found[1]["is_subscription"] is False and found[1]["next_date"] == "2026-10-21"

    # Already added or dismissed: not suggested again
    again = detect_recurring(history, today, known_keys={"brand:netflix"}, dismissed_keys={"pge obrot"})
    assert again == []


def test_detect_weekly_and_amount_without_description():
    today = date(2026, 10, 14)
    weekly = [tx(date(2026, 9, d), 20.0, "Lekcje angielskiego", "Edukacja") for d in (16, 23, 30)] + [
        tx(date(2026, 10, 7), 20.0, "Lekcje angielskiego", "Edukacja")
    ]
    plain = [tx(date(2026, m, 10), 60.0, "", "Dom i Rachunki") for m in (8, 9, 10)]
    found = {s["name"]: s for s in detect_recurring(weekly + plain, today)}
    assert found["Lekcje angielskiego"]["frequency"] == "weekly"
    assert found["Lekcje angielskiego"]["next_date"] == "2026-10-14"
    assert found["Dom i Rachunki"]["amount"] == 60.0


def _september_and_october():
    september = [
        tx(date(2026, 9, 1), 5000, "Pensja", "Wypłata", "income"),
        tx(date(2026, 9, 3), 1800, "Czynsz", "Dom i Rachunki"),
        tx(date(2026, 9, 6), 400, "Biedronka", "Jedzenie i Picie"),
        tx(date(2026, 9, 20), 400, "Lidl", "Jedzenie i Picie"),
        tx(date(2026, 9, 12), 150, "Kino", "Rozrywka"),
        tx(date(2026, 9, 25), 300, "Allegro", "Zakupy"),
    ]
    october = [
        tx(date(2026, 10, 1), 5000, "Pensja", "Wypłata", "income"),
        tx(date(2026, 10, 3), 1800, "Czynsz", "Dom i Rachunki"),
        tx(date(2026, 10, 6), 500, "Biedronka", "Jedzenie i Picie"),
        tx(date(2026, 10, 21), 550, "Lidl", "Jedzenie i Picie"),
        tx(date(2026, 10, 12), 400, "Koncert", "Rozrywka"),
    ]
    return september, october


def test_monthly_report_for_finished_month_pro():
    september, october = _september_and_october()
    recurring = [{"amount": 49, "frequency": "monthly", "is_subscription": True, "active": True, "type": "expense"}]
    report = build_monthly_report(2026, 10, october, september, today=date(2026, 11, 3),
                                  budget={"monthly_limit": 3000}, recurring=recurring, is_pro=True)
    assert report["income"] == 5000 and report["expenses"] == 3250 and report["balance"] == 1750
    assert report["is_current_month"] is False
    assert report["categories"][0]["name"] == "Dom i Rachunki"
    food = next(c for c in report["categories"] if c["name"] == "Jedzenie i Picie")
    assert food["prev_amount"] == 800 and round(food["change_pct"], 4) == 0.3125
    texts = [i["text"] for i in report["insights"]]
    kinds = [i["kind"] for i in report["insights"]]
    assert kinds[0] == "compare" and "więcej niż we wrześniu" in texts[0]
    assert any("Zostało 35% przychodów" in t for t in texts)
    assert any("Jedzenie i Picie poszło o 31% więcej" in t for t in texts)
    assert any("Zakupy wydano o 300 zł mniej" in t for t in texts)
    assert any("Budżet przekroczony o 250 zł" in t for t in texts)
    assert any("Subskrypcje kosztują 49 zł miesięcznie, czyli 588 zł rocznie" in t for t in texts)
    assert report["tip"]["category"] == "Jedzenie i Picie"
    assert report["tip"]["yearly_saving"] == 2520
    assert report["locked"] is False


def test_yearly_fixed_costs_include_bills_and_subscriptions():
    september, october = _september_and_october()
    recurring = [
        {"amount": 1800, "frequency": "monthly", "is_subscription": False, "active": True, "type": "expense"},
        {"amount": 49, "frequency": "monthly", "is_subscription": True, "active": True, "type": "expense"},
        {"amount": 5000, "frequency": "monthly", "is_subscription": False, "active": True, "type": "income"},
    ]
    report = build_monthly_report(2026, 10, october, september, today=date(2026, 11, 3), recurring=recurring, is_pro=True)
    texts = [i["text"].replace("\u00a0", " ") for i in report["insights"]]
    assert any("Stałe płatności i subskrypcje to 1 849 zł miesięcznie, czyli 22 188 zł rocznie (same subskrypcje: 588 zł rocznie)" in t
               for t in texts), texts
    assert report["fixed_costs_monthly"] == 1849 and report["subscriptions_monthly"] == 49

    only_bills = build_monthly_report(2026, 10, october, september, today=date(2026, 11, 3),
                                      recurring=recurring[:1], is_pro=True)
    texts = [i["text"].replace("\u00a0", " ") for i in only_bills["insights"]]
    assert any("Stałe płatności to 1 800 zł miesięcznie, czyli 21 600 zł rocznie" in t for t in texts), texts


def test_monthly_report_free_shows_a_taste():
    september, october = _september_and_october()
    report = build_monthly_report(2026, 10, october, september, today=date(2026, 11, 3), is_pro=False)
    assert len(report["insights"]) == 1
    assert report["tip"] is None and report["previous"] is None
    assert all(c["change_pct"] is None for c in report["categories"])
    assert report["locked"] is True and report["locked_count"] >= 3
    # Totals are always there
    assert report["expenses"] == 3250


def test_current_month_compares_same_days():
    september, october = _september_and_october()
    # On 14 October only the first two weeks of September are compared
    so_far = [t for t in october if t["date"].day <= 14]
    report = build_monthly_report(2026, 10, so_far, september, today=date(2026, 10, 14),
                                  budget={"monthly_limit": 3000}, is_pro=True)
    assert report["is_current_month"] and report["days_elapsed"] == 14
    assert report["previous"]["comparable_expenses"] == 2350  # 1800 + 400 + 150
    first = report["insights"][0]["text"]
    assert first.startswith("Do tej pory wydano o 15% więcej niż w tym samym okresie we wrześniu")
    assert any("dziennie do końca miesiąca" in i["text"] for i in report["insights"])


def test_empty_month():
    report = build_monthly_report(2026, 10, [], [], today=date(2026, 10, 14), is_pro=True)
    assert report["has_data"] is False and report["insights"] == [] and report["tip"] is None


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("ok  ", name)
            except Exception:  # noqa: BLE001
                failures += 1
                import traceback

                print("FAIL", name)
                traceback.print_exc()
    sys.exit(1 if failures else 0)
