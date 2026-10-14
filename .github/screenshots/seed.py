"""Fills a local test server with three months of realistic data for screenshots."""

import json
import random
from datetime import date, datetime, timedelta

import httpx
from pymongo import MongoClient

API = "http://localhost:8000/api"
random.seed(7)
today = date.today()


def month_start(back):
    y, m = today.year, today.month - back
    while m < 1:
        m += 12
        y -= 1
    return date(y, m, 1)


def at(day):
    return datetime(day.year, day.month, day.day, 12).isoformat() + "Z"


def register(name, email):
    r = httpx.post(f"{API}/auth/register", json={"email": email, "password": "haslo123", "name": name})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def add(h, amount, category, description, day, type_="expense"):
    if day > today:
        return
    r = httpx.post(f"{API}/transactions", headers=h, json={
        "amount": round(amount, 2), "type": type_, "category": category, "description": description, "date": at(day),
    })
    r.raise_for_status()


def fill(h, months=3, rich=True):
    for back in range(months - 1, -1, -1):
        start = month_start(back)
        d = lambda n: start + timedelta(days=n - 1)  # noqa: E731
        add(h, 5200, "Wypłata", "Wynagrodzenie", d(1), "income")
        add(h, 1800, "Dom i Rachunki", "Czynsz", d(3))
        add(h, 49, "Rozrywka", "Netflix", d(5))
        add(h, 23.99, "Rozrywka", "Spotify", d(12))
        add(h, random.uniform(150, 210), "Dom i Rachunki", "PGE Obrót", d(20))
        shops = ["Biedronka", "Lidl", "Żabka", "Kaufland"]
        for n in range(9 if back else 5):
            add(h, random.uniform(35, 190) * (1.25 if back == 0 else 1), "Jedzenie i Picie", random.choice(shops), d(2 + n * 3))
        for n in range(2):
            add(h, random.uniform(190, 260), "Transport", "Orlen", d(6 + n * 12))
        if rich:
            for n in range(3):
                add(h, random.uniform(45, 140), "Jedzenie i Picie", random.choice(["Pizzeria Roma", "Sushi Bar", "Kebab"]), d(8 + n * 6))
            add(h, random.uniform(80, 320), "Zakupy", "Allegro", d(14))
            add(h, random.uniform(25, 70), "Zdrowie", "Apteka DOZ", d(17))
            add(h, 120 if back == 0 else 60, "Rozrywka", "Kino Helios", d(10))


pro = register("Dawid", "dawid@example.com")
free = register("Ania", "ania@example.com")
MongoClient("mongodb://localhost:27017")["cashflo_shots"].users.update_one({"email": "dawid@example.com"}, {"$set": {"is_pro": True}})

fill(pro, 3, rich=True)
fill(free, 2, rich=False)

# Recurring payments (Spotify stays as a detected suggestion)
next_rent = month_start(-1) + timedelta(days=2)
for h in (pro, free):
    httpx.post(f"{API}/recurring", headers=h, json={
        "name": "Czynsz", "amount": 1800, "category": "Dom i Rachunki", "next_date": at(next_rent),
    }).raise_for_status()
httpx.post(f"{API}/recurring", headers=pro, json={
    "name": "Netflix", "amount": 49, "category": "Rozrywka", "next_date": at(today + timedelta(days=2)), "is_subscription": True,
}).raise_for_status()
httpx.post(f"{API}/recurring", headers=pro, json={
    "name": "Telefon Play", "amount": 55, "category": "Dom i Rachunki", "next_date": at(today + timedelta(days=5)),
}).raise_for_status()

httpx.post(f"{API}/budget", headers=pro, json={"monthly_limit": 4500, "category_limits": {"Jedzenie i Picie": 900, "Rozrywka": 150}}).raise_for_status()
httpx.post(f"{API}/budget", headers=free, json={"monthly_limit": 4000}).raise_for_status()

prev = month_start(1)
json.dump({
    "pro": pro["Authorization"][7:],
    "free": free["Authorization"][7:],
    "report_year": prev.year,
    "report_month": prev.month,
}, open("tokens.json", "w"))

sample = "#Data operacji;#Opis operacji;#Rachunek;#Kategoria;#Kwota;\n"
rows = [
    (1, "BIEDRONKA WARSZAWA", "Żywność i chemia domowa", "-87,45"),
    (2, "ORLEN STACJA NR 123", "Paliwo", "-231,10"),
    (3, "NETFLIX.COM", "Multimedia", "-49,00"),
    (4, "WYNAGRODZENIE ACME SP Z O O", "Wpływy", "5 200,00"),
    (5, "ROSSMANN 123 WARSZAWA", "Zdrowie i uroda", "-56,98"),
    (6, "PYSZNE.PL", "Jedzenie poza domem", "-64,50"),
    (7, "ALLEGRO.PL", "Zakupy", "-149,99"),
    (8, "SKLEP ZOOLOGICZNY", "Inne", "-42,00"),
]
for days_ago, desc, cat, amount in rows:
    sample += f"{today - timedelta(days=40 + days_ago)};\"{desc}\";\"eKonto\";\"{cat}\";\"{amount} PLN\";\n"
open("sample.csv", "w", encoding="cp1250").write(sample)
print("seeded")
