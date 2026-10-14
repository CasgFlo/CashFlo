# CashFlo

Aplikacja mobilna do śledzenia wydatków, budżetu i celów oszczędnościowych.

- `frontend/` – aplikacja na telefon (Expo / React Native, Expo Router)
- `backend/` – serwer API (FastAPI + MongoDB)

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
