# CashFlo

Aplikacja mobilna do śledzenia wydatków, budżetu i celów oszczędnościowych.

- `frontend/` – aplikacja na telefon (Expo / React Native, Expo Router)
- `backend/` – serwer API (FastAPI + MongoDB)
- `site/` – strona cashflo.cash z formularzem zapisów (Tally) i `cashflo.cash/ankieta`; osobna usługa `www`
  na Railway (Caddy w Dockerze), domena przez Cloudflare (CNAME z proxy, SSL/TLS „Full”)

## Uruchomienie lokalne

### Serwer

```bash
cd backend
cp .env.example .env        # uzupełnij co najmniej MONGO_URL, DB_NAME, JWT_SECRET_KEY
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

### Aplikacja

```bash
cd frontend
cp .env.example .env        # EXPO_PUBLIC_BACKEND_URL=http://<adres-twojego-komputera>:8000
npm install
npx expo start
```

## Funkcje i plan darmowy / Pro

| Funkcja | Darmowy | Pro |
| --- | --- | --- |
| Import historii z banku (CSV) i arkuszy Excel (.xlsx) | 1 import (podgląd zawsze) | bez limitu |
| Stałe płatności i wykrywanie subskrypcji | 3 aktywne | bez limitu |
| Podsumowanie miesiąca | sumy, kategorie, 1 wniosek | porównania, wszystkie wnioski, porada |
| Limity budżetu dla kategorii | – | tak |
| Eksport do Excela | – | tak |
| Cele / własne kategorie | 1 / 3 | bez limitu |

Limity są sprawdzane na serwerze (`FREE_*` w `backend/server.py`).

- **Import** (`backend/importer.py`): rozpoznaje kolumny po nagłówkach (mBank, ING, PKO BP, Pekao, Millennium,
  Revolut i własne arkusze), a bez nagłówków po zawartości. Kategorie dobiera z nazw sklepów, duplikaty
  pomija. Plik jest trzymany w bazie maks. 2 godziny (`import_sessions`, indeks TTL). Import można cofnąć.
- **Stałe płatności** (`recurring_payments`): należne płatności dodają się jako transakcje przy każdym
  pobraniu danych przez aplikację (bez zadań w tle). Wykrywanie subskrypcji: `backend/insights.py`.
- **Podsumowanie miesiąca**: `GET /api/reports/monthly?year=&month=`, teksty w `backend/insights.py`.
- **Eksport**: `POST /api/export/link` daje link ważny 10 minut, telefon pobiera plik w przeglądarce.

## Testy i automatyczne sprawdzanie

```bash
cd backend
pip install -r requirements-dev.txt
MONGO_URL=mongodb://localhost:27017 JWT_SECRET_KEY=test python -m pytest tests
```

Testy API (`tests/test_api.py`) potrzebują MongoDB i bez `MONGO_URL` są pomijane.

Na GitHubie przy każdym pushu (`.github/workflows/ci.yml`): testy serwera z prawdziwą bazą,
kontrola typów aplikacji i zbudowanie paczki na Androida. Gdy zmienia się `package.json`, bot sam
odświeża `yarn.lock`. Workflow `screenshots.yml` (gałąź `pro-features`) robi zrzuty ekranów wersji
web z przykładowymi danymi i zapisuje je na gałęzi `ci-screenshots`.

## Konto administratora

Uprawnienia admina są zapisane tylko w bazie danych. Zarejestruj się w aplikacji, potem:

```bash
cd backend
python scripts/make_admin.py twoj@email.pl
```

## Płatności Pro (Stripe)

Aplikacja tworzy sesję Stripe Checkout powiązaną z kontem użytkownika. Pro włącza się po
sprawdzeniu płatności przez aplikację albo po podpisanym webhooku (cokolwiek przyjdzie pierwsze).

1. W `backend/.env` ustaw `STRIPE_API_KEY`, `PUBLIC_API_URL` i trzy ceny `STRIPE_PRICE_*`
   (wartości dla konta CashFlo są w `.env.example`).
2. W Stripe: Developers → Webhooks → dodaj endpoint `<PUBLIC_API_URL>/api/webhook/stripe` ze zdarzeniami
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `customer.subscription.updated`, `customer.subscription.deleted`. Sekret podpisu wpisz jako `STRIPE_WEBHOOK_SECRET`.
3. W Stripe: Settings → Billing → Customer portal → zapisz ustawienia portalu (pozwól anulować subskrypcję).
   Z tego portalu korzysta przycisk „Zarządzaj subskrypcją”.
4. Wersja przeglądarkowa aplikacji: wpisz jej adres w `ALLOWED_RETURN_ORIGINS`.

Uwaga: przed publikacją w App Store sprzedaż Pro na iPhonie trzeba dostosować do zasad Apple
(zakupy w aplikacji albo zgłoszony u Apple link do płatności zewnętrznej w UE).

## Reset hasła

Kody do zmiany hasła są wysyłane e-mailem przez SMTP (`SMTP_*` w `backend/.env`).
Dla Gmaila: włącz weryfikację dwuetapową i utwórz „hasło do aplikacji” w ustawieniach konta Google.
Bez tej konfiguracji przycisk „Nie pamiętasz hasła?” pokaże komunikat, że reset jest chwilowo niedostępny.
