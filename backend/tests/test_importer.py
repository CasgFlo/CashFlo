"""Tests for reading bank statements and spreadsheets (no database needed)."""

import io
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import importer  # noqa: E402
from importer import (  # noqa: E402
    ImportFileError,
    clean_description,
    hashes_for,
    parse_amount,
    parse_date,
    parse_file,
    refine_assumed_types,
    suggest_category,
)

DEFAULT_CATEGORIES = [
    {"name": "Wypłata", "type": "income", "is_default": True},
    {"name": "Premia", "type": "income", "is_default": True},
    {"name": "Inne przychody", "type": "income", "is_default": True},
    {"name": "Jedzenie i Picie", "type": "expense", "is_default": True},
    {"name": "Transport", "type": "expense", "is_default": True},
    {"name": "Dom i Rachunki", "type": "expense", "is_default": True},
    {"name": "Rozrywka", "type": "expense", "is_default": True},
    {"name": "Zakupy", "type": "expense", "is_default": True},
    {"name": "Zdrowie", "type": "expense", "is_default": True},
    {"name": "Edukacja", "type": "expense", "is_default": True},
    {"name": "Inne", "type": "expense", "is_default": True},
]


def cat(description, tx_type="expense", hint="", categories=DEFAULT_CATEGORIES):
    return suggest_category(description, tx_type, hint, categories)


# ---------------------------------------------------------------- values

def test_parse_amount_formats():
    assert parse_amount("-45,99 PLN") == -45.99
    assert parse_amount("1 234,56") == 1234.56
    assert parse_amount("1\xa0234,56 zł") == 1234.56
    assert parse_amount("1.234,56") == 1234.56
    assert parse_amount("1,234.56") == 1234.56
    assert parse_amount("(12.50)") == -12.5
    assert parse_amount("12,50-") == -12.5
    assert parse_amount("−12,00") == -12.0
    assert parse_amount("+3500") == 3500.0
    assert parse_amount(-20.5) == -20.5
    assert parse_amount("abc") is None
    assert parse_amount("") is None
    assert parse_amount("2026-10-01") is None


def test_parse_date_formats():
    assert parse_date("2026-10-01") == date(2026, 10, 1)
    assert parse_date("01.10.2026") == date(2026, 10, 1)
    assert parse_date("01-10-2026") == date(2026, 10, 1)
    assert parse_date("2026-09-28 10:22:33") == date(2026, 9, 28)
    assert parse_date(datetime(2026, 9, 3, 12, 0)) == date(2026, 9, 3)
    assert parse_date("46000") == date(2025, 12, 9)  # Excel serial number
    assert parse_date("Kwota") is None
    assert parse_date("12,50") is None


def test_clean_description():
    assert clean_description(["ZAKUP PRZY UŻYCIU KARTY BIEDRONKA 1234 WARSZAWA"]) == "Biedronka Warszawa"
    pko = ["Płatność kartą", "Tytuł: 000498849 74230786182241037466123",
           "Lokalizacja: Adres: NETFLIX.COM Miasto: Amsterdam Kraj: HOLANDIA"]
    assert clean_description(pko) == "Netflix.com"
    assert "4251" not in clean_description(["ORLEN STACJA NR 123 Nr karty: 4251********1234"])
    assert clean_description(["", "  "]) == ""


# ---------------------------------------------------------------- categories

def test_categories_from_shop_names():
    assert cat("Biedronka Warszawa") == "Jedzenie i Picie"
    assert cat("ORLEN STACJA 123") == "Transport"
    assert cat("NETFLIX.COM") == "Rozrywka"
    assert cat("Canal Plus") == "Rozrywka"
    assert cat("Uber Eats") == "Jedzenie i Picie"
    assert cat("Apteka DOZ") == "Zdrowie"
    assert cat("Allegro") == "Zakupy"
    assert cat("PGE Obrót faktura") == "Dom i Rachunki"
    assert cat("Coś zupełnie innego") == "Inne"
    assert cat("Wynagrodzenie za wrzesień", "income") == "Wypłata"
    assert cat("Zwrot", "income") == "Inne przychody"


def test_category_from_file_and_custom_categories():
    custom = DEFAULT_CATEGORIES + [{"name": "Paliwo", "type": "expense", "is_default": False}]
    assert cat("ORLEN", hint="paliwo", categories=custom) == "Paliwo"
    assert cat("Paliwo Orlen", categories=custom) == "Paliwo"
    assert cat("Lidl", hint="Żywność i chemia domowa") == "Jedzenie i Picie"
    assert cat("x", hint="ROZRYWKA") == "Rozrywka"


# ---------------------------------------------------------------- bank files

MBANK = """mBank S.A. Bankowość Detaliczna;
#Klient;
JAN KOWALSKI;

#Data operacji;#Opis operacji;#Rachunek;#Kategoria;#Kwota;
2026-09-30;"BIEDRONKA WARSZAWA  DATA TRANSAKCJI: 2026-09-28";"eKonto 1111 ... 2222";"Żywność i chemia domowa";"-45,99 PLN";
2026-09-29;"WYNAGRODZENIE ZA WRZESIEŃ  ACME SP Z O O";"eKonto 1111 ... 2222";"Wpływy - inne";"5 200,00 PLN";
2026-09-28;"NETFLIX.COM  DATA TRANSAKCJI: 2026-09-27";"eKonto 1111 ... 2222";"Multimedia, książki i prasa";"-43,00 PLN";
"""

ING = """Lista transakcji;;;;;;;;;;;;;;;;;;;
Dokument nr 123;;;;;;;;;;;;;;;;;;;

Data transakcji;Data księgowania;Dane kontrahenta;Tytuł;Nr rachunku;Nazwa banku;Szczegóły;Nr transakcji;Kwota transakcji (waluta rachunku);Waluta;Kwota blokady/zwolnienie blokady;Waluta;Kwota płatności w walucie;Waluta;Konto;Saldo po transakcji;Waluta;;;
2026-10-02;2026-10-02;"ORLEN STACJA NR 123 KRAKÓW";"Płatność kartą 01.10.2026 Nr karty 4246xx1234";;;" TR.KART";"001";-210,50;PLN;;;;;"Konto Direct";1500,00;PLN;;;
2026-10-01;;"ŻABKA Z1234 K.1";"Płatność kartą";;;;"002";;;-12,99;PLN;;;"Konto Direct";;;;;
2026-09-30;2026-09-30;"ACME SP. Z O.O.";"Wynagrodzenie 09/2026";"11 1020 0000 0000 0000 0000 0000";"PKO BP";"PRZELEW";"003";5200,00;PLN;;;;;"Konto Direct";1710,50;PLN;;;
"""

PKO = '''"Data operacji","Data waluty","Typ transakcji","Kwota","Waluta","Saldo po transakcji","Opis transakcji","","","",""
"2026-10-03","2026-10-03","Płatność kartą","-49.99","PLN","+1200.00","Tytuł: 000498849 74230786182241037466123","Lokalizacja: Adres: www.spotify.com Miasto: Stockholm Kraj: SZWECJA","Data wykonania: 2026-10-02","Oryginalna kwota operacji: 49.99 PLN","Numer karty: 425125******1234"
"2026-10-02","2026-10-02","Przelew na konto","+150.00","PLN","+1249.99","Rachunek nadawcy: 11 1111 1111 1111 1111 1111 1111","Nazwa nadawcy: ANNA NOWAK","Tytuł: ZWROT ZA BILETY","",""
'''

REVOLUT = """Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,2026-09-01 10:22:33,2026-09-02 08:00:00,Lidl,-56.20,0.00,PLN,COMPLETED,943.80
CARD_PAYMENT,Current,2026-09-03 12:00:00,,Zara,-199.00,0.00,PLN,REVERTED,943.80
TOPUP,Current,2026-09-04 09:00:00,2026-09-04 09:00:00,Top-up by *1234,500.00,0.00,PLN,COMPLETED,1443.80
CARD_PAYMENT,Current,2026-09-05 18:00:00,2026-09-06 08:00:00,Amazon,-20.00,0.00,EUR,COMPLETED,30.00
"""

MILLENNIUM = """Numer rachunku/karty,Data transakcji,Data rozliczenia,Rodzaj transakcji,Na konto/Z konta,Odbiorca/Zleceniodawca,Opis,Obciążenia,Uznania,Saldo,Waluta
PL11 1160 2202 0000 0000 0000 0000,2026-09-10,2026-09-10,PŁATNOŚĆ KARTĄ,,,"ROSSMANN 123 GDANSK",-35.47,,1000.00,PLN
PL11 1160 2202 0000 0000 0000 0000,2026-09-11,2026-09-11,PRZELEW PRZYCHODZĄCY,PL22...,JAN KOWALSKI,"Oddaję za pizzę",,40.00,1040.00,PLN
"""

HEADERLESS = """28-09-2026;28-09-2026;BIEDRONKA 4521 GDANSK;-23,45;1200,00
27-09-2026;27-09-2026;MPK KRAKOW BILET;-4,60;1223,45
25-09-2026;25-09-2026;PRZELEW OD ANNY;100,00;1228,05
"""


def parse_text(text, encoding="utf-8"):
    return parse_file(text.encode(encoding), "plik.csv")


def test_mbank():
    parsed = parse_text(MBANK, "cp1250")
    assert parsed.source == "mBank"
    rows = parsed.result.rows
    assert [(r.date, r.amount, r.type) for r in rows] == [
        (date(2026, 9, 30), 45.99, "expense"),
        (date(2026, 9, 29), 5200.0, "income"),
        (date(2026, 9, 28), 43.0, "expense"),
    ]
    assert rows[0].description == "Biedronka Warszawa"
    assert rows[0].category_hint == "Żywność i chemia domowa"
    assert cat(rows[0].description, rows[0].type, rows[0].category_hint) == "Jedzenie i Picie"
    assert cat(rows[1].description, rows[1].type, rows[1].category_hint) == "Wypłata"
    assert cat(rows[2].description, rows[2].type, rows[2].category_hint) == "Rozrywka"


def test_ing_skips_pending_blocks_and_ignores_bank_columns():
    parsed = parse_text(ING)
    assert parsed.source == "ING"
    rows = parsed.result.rows
    assert len(rows) == 2  # the pending card block (empty amount) is skipped
    assert rows[0].amount == 210.5 and rows[0].type == "expense"
    assert "Orlen" in rows[0].description and "PKO" not in rows[0].description
    assert rows[1].type == "income" and rows[1].amount == 5200.0
    assert parsed.result.skipped == 1


def test_pko_details_in_unnamed_columns():
    parsed = parse_text(PKO)
    assert parsed.source == "PKO BP"
    rows = parsed.result.rows
    assert rows[0].description.lower() == "www.spotify.com"
    assert rows[0].amount == 49.99 and rows[0].type == "expense"
    assert rows[1].type == "income" and "Anna Nowak" in rows[1].description


def test_revolut_skips_reverted_and_other_currencies():
    parsed = parse_text(REVOLUT)
    assert parsed.source == "Revolut"
    rows = parsed.result.rows
    assert [(r.description, r.amount, r.type) for r in rows] == [("Lidl", 56.2, "expense"), ("Top-up by", 500.0, "income")]
    assert parsed.result.foreign_currency == 1
    assert parsed.result.skipped == 1


def test_millennium_debit_and_credit_columns():
    parsed = parse_text(MILLENNIUM)
    assert parsed.source == "Millennium"
    rows = parsed.result.rows
    assert (rows[0].amount, rows[0].type) == (35.47, "expense")
    assert (rows[1].amount, rows[1].type) == (40.0, "income")
    assert cat(rows[0].description) == "Zakupy"


def test_file_without_header():
    parsed = parse_text(HEADERLESS)
    assert parsed.header_row is None
    rows = parsed.result.rows
    assert [(r.amount, r.type) for r in rows] == [(23.45, "expense"), (4.6, "expense"), (100.0, "income")]
    assert cat(rows[1].description) == "Transport"


def _xlsx(rows):
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Notatki"
    ws.append(["To jest mój budżet"])
    data = wb.create_sheet("Wydatki")
    for row in rows:
        data.append(row)
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def test_home_budget_spreadsheet():
    content = _xlsx([
        ["Mój budżet domowy 2026"],
        [],
        ["Data", "Kategoria", "Opis", "Kwota"],
        [datetime(2026, 9, 1), "Jedzenie", "zakupy Lidl", 120.5],
        [datetime(2026, 9, 2), "Wypłata", "pensja", 4800],
        ["03.09.2026", "Paliwo", "Orlen", "250,00"],
    ])
    parsed = parse_file(content, "budzet.xlsx")
    assert parsed.source == "Excel"
    result = parsed.result
    assert result.assumed_expenses is True
    refine_assumed_types(result, DEFAULT_CATEGORIES)
    assert [(r.date, r.amount, r.type) for r in result.rows] == [
        (date(2026, 9, 1), 120.5, "expense"),
        (date(2026, 9, 2), 4800.0, "income"),
        (date(2026, 9, 3), 250.0, "expense"),
    ]
    r = result.rows
    assert cat(r[0].description, r[0].type, r[0].category_hint) == "Jedzenie i Picie"
    assert cat(r[1].description, r[1].type, r[1].category_hint) == "Wypłata"
    assert cat(r[2].description, r[2].type, r[2].category_hint) == "Transport"


def test_spreadsheet_with_income_and_expense_columns():
    content = _xlsx([
        ["Dzień", "Na co", "Przychód", "Wydatek"],
        ["2026-09-05", "Czynsz", None, 1800],
        ["2026-09-10", "Pensja", 5000, None],
    ])
    rows = parse_file(content, "domowy.xlsx").result.rows
    assert [(r.amount, r.type) for r in rows] == [(1800.0, "expense"), (5000.0, "income")]
    assert cat(rows[0].description) == "Dom i Rachunki"


def test_manual_mapping():
    parsed = parse_text(HEADERLESS)
    mapping = importer.Mapping.from_dict({"date": 1, "amount": 3, "description": [2]}, columns=5)
    again = parse_file(b"", "x.csv", mapping=mapping, table=parsed.table, header_row=None)
    assert len(again.result.rows) == 3


def test_duplicate_hashes_are_stable_and_unique_per_occurrence():
    rows = parse_text(HEADERLESS).result.rows
    twice = rows + [rows[0]]
    hashes = hashes_for(twice)
    assert len(set(hashes)) == 4
    assert hashes_for(rows) == hashes[:3]


def test_unreadable_files():
    for content, code in [(b"", "empty"), (b"%PDF-1.7 ...", "pdf"), (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"0" * 20, "old_excel")]:
        try:
            parse_file(content, "plik")
        except ImportFileError as e:
            assert e.code == code
        else:
            raise AssertionError(f"expected {code}")


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("ok  ", name)
            except Exception as e:  # noqa: BLE001
                failures += 1
                import traceback

                print("FAIL", name)
                traceback.print_exc()
    sys.exit(1 if failures else 0)
