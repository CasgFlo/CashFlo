# CashFlo

Aplikacja mobilna do śledzenia wydatków, budżetu i celów oszczędnościowych.

- `frontend/` – aplikacja na telefon (Expo / React Native, Expo Router)
- `backend/` – serwer API (FastAPI + MongoDB)

## Uruchomienie lokalne

### Serwer

```bash
cd backend
cp .env.example .env        # uzupełnij MONGO_URL, DB_NAME, JWT_SECRET_KEY
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

## Stan płatności

Płatności Pro są do przebudowy. Obecne linki Stripe w aplikacji nie są powiązane z kontami użytkowników,
a pomocnicza biblioteka Stripe z Emergent działa tylko na platformie Emergent.
