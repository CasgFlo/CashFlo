"""End-to-end tests of the API against a real MongoDB (runs in GitHub Actions).

Needs MONGO_URL; skipped when it isn't set. Uses a throwaway database.
"""

import os
import sys
import uuid
from datetime import datetime, timedelta

import pytest

if not os.environ.get("MONGO_URL"):
    pytest.skip("MONGO_URL not set", allow_module_level=True)

os.environ["DB_NAME"] = f"cashflo_test_{uuid.uuid4().hex[:8]}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as c:
        yield c
        c.portal.call(server.client.drop_database, os.environ["DB_NAME"])


def make_user(client, pro=False):
    email = f"test-{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/api/auth/register", json={"email": email, "password": "haslo123", "name": "Test"})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    if pro:
        client.portal.call(server.db.users.update_one, {"email": email}, {"$set": {"is_pro": True}})
    return {"Authorization": f"Bearer {token}"}


def noon(days_ago=0):
    d = datetime.utcnow() - timedelta(days=days_ago)
    return datetime(d.year, d.month, d.day, 12).isoformat() + "Z"


MBANK = (
    "#Data operacji;#Opis operacji;#Rachunek;#Kategoria;#Kwota;\n"
    "{d1};\"BIEDRONKA WARSZAWA\";\"eKonto\";\"Żywność i chemia domowa\";\"-45,99 PLN\";\n"
    "{d2};\"WYNAGRODZENIE ACME\";\"eKonto\";\"Wpływy\";\"5 200,00 PLN\";\n"
    "{d3};\"NETFLIX.COM\";\"eKonto\";\"Multimedia\";\"-43,00 PLN\";\n"
)


def mbank_file():
    today = datetime.utcnow().date()
    text = MBANK.format(d1=today - timedelta(days=1), d2=today - timedelta(days=2), d3=today - timedelta(days=3))
    return {"file": ("historia.csv", text.encode("cp1250"), "text/csv")}


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_repeat_monthly_creates_a_recurring_payment(client):
    h = make_user(client)
    r = client.post("/api/transactions", headers=h, json={
        "amount": 1800, "type": "expense", "category": "Dom i Rachunki", "description": "Czynsz",
        "date": noon(), "is_recurring": True, "recurring_day": datetime.utcnow().day,
    })
    assert r.status_code == 200, r.text
    assert r.json()["recurring_id"] and r.json()["is_recurring"] is True
    data = client.get("/api/recurring", headers=h).json()
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["name"] == "Czynsz" and item["frequency"] == "monthly"
    assert item["next_date"][:10] > noon()[:10]  # next month, not today again
    # Only one transaction so far
    assert len(client.get("/api/transactions", headers=h).json()) == 1


def test_due_payment_is_added_and_free_limit(client):
    h = make_user(client)
    r = client.post("/api/recurring", headers=h, json={
        "name": "Netflix", "amount": 49, "category": "Rozrywka", "next_date": noon(), "is_subscription": True,
    })
    assert r.status_code == 200, r.text
    txs = client.get("/api/transactions", headers=h).json()
    assert [(t["description"], t["amount"], t["is_recurring"]) for t in txs] == [("Netflix", 49, True)]
    # Calling again does not add it twice
    assert len(client.get("/api/transactions", headers=h).json()) == 1

    for name in ("Telefon", "Siłownia"):
        assert client.post("/api/recurring", headers=h, json={
            "name": name, "amount": 60, "category": "Inne", "next_date": noon(-10),
        }).status_code == 200
    r = client.post("/api/recurring", headers=h, json={"name": "Czwarta", "amount": 10, "category": "Inne", "next_date": noon(-5)})
    assert r.status_code == 403
    summary = client.get("/api/recurring", headers=h).json()
    assert summary["can_add"] is False and summary["limit"] == 3
    assert summary["summary"]["subscriptions_monthly"] == 49

    # Missed payments are caught up: a weekly payment started 3 weeks ago adds 4 payments
    pro = make_user(client, pro=True)
    client.post("/api/recurring", headers=pro, json={
        "name": "Lekcje", "amount": 20, "category": "Edukacja", "frequency": "weekly", "next_date": noon(21),
    })
    lessons = [t for t in client.get("/api/transactions", headers=pro).json() if t["description"] == "Lekcje"]
    assert len(lessons) == 4


def test_import_flow_duplicates_limit_and_undo(client):
    h = make_user(client)
    r = client.post("/api/import/preview", headers=h, files=mbank_file())
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["source"] == "mBank"
    assert preview["summary"]["count"] == 3
    cats = {row["description"]: row["category"] for row in preview["rows"]}
    assert cats == {"Biedronka Warszawa": "Jedzenie i Picie", "Wynagrodzenie Acme": "Wypłata", "Netflix.com": "Rozrywka"}
    assert preview["can_commit"] is True

    netflix = next(row for row in preview["rows"] if row["description"] == "Netflix.com")
    r = client.post("/api/import/commit", headers=h, json={
        "session_id": preview["session_id"],
        "changes": {str(netflix["i"]): {"category": "Inne"}},
    })
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 3
    txs = client.get("/api/transactions", headers=h).json()
    assert len(txs) == 3 and all(t["imported"] for t in txs)
    assert next(t for t in txs if t["description"] == "Netflix.com")["category"] == "Inne"

    # Same file again: everything is already there, and the free import is used up
    again = client.post("/api/import/preview", headers=h, files=mbank_file()).json()
    assert again["summary"]["count"] == 0 and again["summary"]["duplicates_exact"] == 3
    assert again["can_commit"] is False
    r = client.post("/api/import/commit", headers=h, json={"session_id": again["session_id"]})
    assert r.status_code == 403

    history = client.get("/api/import/history", headers=h).json()
    assert history["imports_used"] == 1 and history["can_import"] is False
    r = client.delete(f"/api/import/{history['imports'][0]['id']}", headers=h)
    assert r.json()["removed"] == 3
    assert client.get("/api/transactions", headers=h).json() == []
    assert client.get("/api/import/history", headers=h).json()["can_import"] is True


def test_import_possible_duplicate_of_manual_entry_and_bad_files(client):
    h = make_user(client)
    yesterday = (datetime.utcnow() - timedelta(days=1)).date()
    client.post("/api/transactions", headers=h, json={
        "amount": 45.99, "type": "expense", "category": "Jedzenie i Picie", "description": "zakupy",
        "date": f"{yesterday.isoformat()}T10:00:00Z",
    })
    preview = client.post("/api/import/preview", headers=h, files=mbank_file()).json()
    marks = {row["description"]: row["duplicate"] for row in preview["rows"]}
    assert marks["Biedronka Warszawa"] == "possible"

    r = client.post("/api/import/preview", headers=h, files={"file": ("a.pdf", b"%PDF-1.4 xxx", "application/pdf")})
    assert r.status_code == 400 and r.json()["detail"] == "Import error: pdf"


def test_import_remap_columns(client):
    h = make_user(client)
    text = "a;b;c\nx;2026-09-01;12,50\ny;2026-09-02;7,00\n"
    preview = client.post("/api/import/preview", headers=h, files={"file": ("d.csv", text.encode(), "text/csv")}).json()
    r = client.post("/api/import/remap", headers=h, json={
        "session_id": preview["session_id"],
        "mapping": {"date": 1, "amount": 2, "description": [0], "first_row_is_header": True},
    })
    assert r.status_code == 200, r.text
    assert r.json()["summary"]["count"] == 2


def test_suggestions_report_budget_export(client):
    h = make_user(client, pro=True)
    today = datetime.utcnow().date()
    for months_back in (0, 1, 2):
        month = today.month - months_back
        year = today.year
        while month < 1:
            month += 12
            year -= 1
        client.post("/api/transactions", headers=h, json={
            "amount": 43, "type": "expense", "category": "Rozrywka", "description": "NETFLIX.COM",
            "date": f"{year}-{month:02d}-01T12:00:00Z",
        })
    found = client.get("/api/recurring/suggestions", headers=h).json()["suggestions"]
    assert [s["name"] for s in found] == ["Netflix"]
    s = found[0]
    r = client.post("/api/recurring", headers=h, json={
        "name": s["name"], "amount": s["amount"], "category": s["category"], "frequency": s["frequency"],
        "next_date": s["next_date"] + "T12:00:00Z", "is_subscription": True,
        "suggestion_key": s["key"], "link_transaction_ids": s["transaction_ids"],
    })
    assert r.status_code == 200, r.text
    assert client.get("/api/recurring/suggestions", headers=h).json()["suggestions"] == []

    # Budget with a category limit (Pro)
    r = client.post("/api/budget", headers=h, json={"monthly_limit": 3000, "category_limits": {"Rozrywka": 100}})
    assert r.status_code == 200, r.text
    assert r.json()["category_limits"] == {"Rozrywka": 100} and "Rozrywka" in r.json()["category_spending"]

    report = client.get(f"/api/reports/monthly?year={today.year}&month={today.month}", headers=h).json()
    assert report["locked"] is False and report["month"] == today.month
    assert report["subscriptions_monthly"] == 43

    link = client.post("/api/export/link", headers=h).json()["url"]
    path = link[link.index("/api/"):]
    r = client.get(path)
    assert r.status_code == 200 and r.content[:2] == b"PK"
    assert "attachment" in r.headers["content-disposition"]
    assert client.get("/api/export/download?token=not-a-real-token").status_code == 401


def test_free_plan_gates(client):
    h = make_user(client)
    assert client.post("/api/export/link", headers=h).status_code == 403
    r = client.post("/api/budget", headers=h, json={"monthly_limit": 2000, "category_limits": {"Rozrywka": 100}})
    assert r.status_code == 403
    r = client.post("/api/budget", headers=h, json={"monthly_limit": 2000, "category_limits": {}})
    assert r.status_code == 200 and r.json()["category_limits_active"] is False
    for days_ago, amount in ((1, 100), (2, 50)):
        client.post("/api/transactions", headers=h, json={
            "amount": amount, "type": "expense", "category": "Zakupy", "description": "x", "date": noon(days_ago),
        })
    today = datetime.utcnow().date()
    report = client.get(f"/api/reports/monthly?year={today.year}&month={today.month}", headers=h).json()
    assert report["locked"] is True and len(report["insights"]) <= 1


def test_beta_period_gives_everyone_pro(client, monkeypatch):
    h = make_user(client)
    today = datetime.utcnow().date()
    monkeypatch.setattr(server, "BETA_PRO_UNTIL", today)  # the last day still counts
    me = client.get("/api/auth/me", headers=h).json()
    assert me["is_pro"] is True and me["pro_source"] == "beta" and me["beta_pro_until"] == today.isoformat()
    assert client.post("/api/export/link", headers=h).status_code == 200

    monkeypatch.setattr(server, "BETA_PRO_UNTIL", today - timedelta(days=1))
    me = client.get("/api/auth/me", headers=h).json()
    assert me["is_pro"] is False and me["pro_source"] is None and me["beta_pro_until"] is None
    assert client.post("/api/export/link", headers=h).status_code == 403


def test_read_date_setting(monkeypatch):
    monkeypatch.setenv("SOME_DAY", "2026-12-31")
    assert server.read_date_setting("SOME_DAY").isoformat() == "2026-12-31"
    monkeypatch.setenv("SOME_DAY", "31.12.2026")
    assert server.read_date_setting("SOME_DAY") is None
    monkeypatch.delenv("SOME_DAY")
    assert server.read_date_setting("SOME_DAY") is None


def test_deletion_page_on_the_site_can_call_the_api(client):
    r = client.options("/api/auth/delete-account", headers={
        "Origin": "https://cashflo.cash",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] in ("*", "https://cashflo.cash")


def test_stats_and_account_deletion_remove_everything(client):
    h = make_user(client)
    client.post("/api/transactions", headers=h, json={"amount": 5000, "type": "income", "category": "Wypłata", "date": noon()})
    client.post("/api/transactions", headers=h, json={"amount": 120.5, "type": "expense", "category": "Zakupy", "date": noon()})
    stats = client.get("/api/transactions/stats/monthly", headers=h).json()
    assert stats["total_income"] == 5000 and stats["total_expenses"] == 120.5
    assert stats["balance"] == 4879.5 and stats["expenses_by_category"] == {"Zakupy": 120.5}

    client.post("/api/recurring", headers=h, json={"name": "Abonament", "amount": 50, "category": "Inne", "next_date": noon(-3)})
    client.post("/api/import/preview", headers=h, files=mbank_file())
    me = client.get("/api/auth/me", headers=h).json()
    r = client.post("/api/auth/delete-account", headers=h, json={"password": "haslo123"})
    assert r.status_code == 200
    for name in server.USER_DATA_COLLECTIONS:
        assert client.portal.call(server.db[name].count_documents, {"user_id": me["id"]}) == 0


def test_tally_waitlist_webhook_sends_one_thank_you(client, monkeypatch):
    import base64
    import hashlib
    import hmac
    import json

    sent = []
    monkeypatch.setattr(server, "TALLY_SIGNING_SECRET", "tally-test-secret")
    monkeypatch.setattr(server, "smtp_ready", lambda: True)
    monkeypatch.setattr(server, "send_email", lambda to, subject, body, reply_to=None: sent.append((to, subject)))

    payload = {
        "eventId": "evt-1",
        "eventType": "FORM_RESPONSE",
        "createdAt": "2026-10-15T00:00:00.000Z",
        "data": {
            "responseId": f"resp-{uuid.uuid4().hex[:6]}",
            "formId": "PdMV1d",
            "fields": [
                {"key": "question_1", "label": "Twój adres e-mail", "type": "INPUT_EMAIL", "value": "tester@example.com"},
                {"key": "question_2", "label": "Zgoda", "type": "CHECKBOXES", "value": ["ok"]},
            ],
        },
    }
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    signature = base64.b64encode(hmac.new(b"tally-test-secret", body, hashlib.sha256).digest()).decode()
    headers = {"Tally-Signature": signature, "Content-Type": "application/json"}

    assert client.post("/api/webhook/tally", content=body, headers={"Tally-Signature": "wrong"}).status_code == 401
    r = client.post("/api/webhook/tally", content=body, headers=headers)
    assert r.status_code == 200 and r.json()["status"] == "sent"
    assert sent == [("tester@example.com", "Jesteś na liście Cashflo")]
    # Tally retried the same delivery: no second e-mail
    r = client.post("/api/webhook/tally", content=body, headers=headers)
    assert r.json()["status"] == "already_sent" and len(sent) == 1
