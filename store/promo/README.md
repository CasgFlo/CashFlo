# Filmik „Wczesny dostęp” (9:16, 21,5 s)

- `cashflo-wczesny-dostep.mp4` – gotowy film 1080 × 1920, 30 kl./s, bez muzyki (dodaj ją w Instagramie/Facebooku)
- `video.html` – animacja sterowana czasem (`render(t)`); teksty i czasy scen są w tym pliku
- `render.py` – renderuje film (Playwright + ffmpeg): `python3 render.py`
- `preview.py` – klatki podglądu: `python3 preview.py 1.6 3.6 20`
- `img/` – zrzuty aplikacji z przykładowymi danymi (z workflow Screenshots, `store.mjs`)

Czcionki: Inter i Inter Display (muszą być zainstalowane w systemie).

## Wersja z lektorem

- `video-glos.html` – te same sceny, przesunięte pod nagranie głosu (import od 5,0 s, wezwanie do zapisu od 16,5 s), 22,7 s
- `render_voice.py` – `python3 render_voice.py video-glos.html <plik z głosem> wynik.mp4`; głos jest wyrównany do -14 LUFS (głośność Reels), 48 kHz stereo, H.264
