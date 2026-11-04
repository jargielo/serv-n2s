# N2S CLOUD — nakładka WebDAV FS PRO

Przygotowana dla Termuxa i użytkownika GitHub `jargielo`.

### Schemat

Przeglądarka -> HTTPS srv.us -> tunel SSH -> `127.0.0.1:8081` (nakładka Node.js) -> `127.0.0.1:8080` (oryginalny WebDAV FS PRO).

### Instalacja (jedno polecenie)

```bash
curl -fsSL https://raw.githubusercontent.com/jargielo/serv-n2s/main/n2s-overlay/install-overlay.sh -o "$HOME/n2s-installer.sh" && bash "$HOME/n2s-installer.sh"
```

Zanim je wkleisz, **zatrzymaj dotychczasowy tunel** poleceniem Ctrl+C i uruchom WebDAV FS PRO z wymaganym loginem i hasłem na porcie 8080.

### Codzienna obsługa

- Uruchom nakładkę i tunel: `n2s`.
- Publiczny adres: https://jargielo.gh.srv.us/
- Zmień własny nagłówek: `n2s-nazwa "MOJA CHMURA"`, a następnie odśwież stronę.
- Zatrzymaj połączenie: Ctrl+C.
- Stare polecenie `serwer` nie jest zmieniane. Po jego uruchomieniu nadal zobaczysz oryginalną stronę WebDAV FS PRO.

### Bezpieczeństwo

- Żądania `GET /` i `PROPFIND /` **bez hasła** muszą zwrócić HTTP 401. Inaczej skrypt nie uruchamia tunelu.
- Kontrola hasła co 15 sekund; tunel odnawia się co 60 minut.
- Proxy działa tylko na `127.0.0.1:8081`.
- Nie jest to nowy serwer plików. Logowanie, prawa użytkowników i cała obsługa danych należą do WebDAV FS PRO.
- Skrypt nie loguje haseł ani nie zmienia bazy użytkowników.

### Ograniczenia

- To nakładka na **stronę HTML**. Oryginalny adres lokalny `127.0.0.1:8080` pozostaje bez zmian.
- Zmiana nazwy jest wykonywana za pomocą CSS/JS po załadowaniu interfejsu. Aktualizacja aplikacji producenta może wymagać dostosowania nakładki.
- Pomyślny wynik testów na symulowanym serwerze WebDAV nie oznacza jeszcze potwierdzonej zgodności z Twoją wersją aplikacji.
- WebDAV FS PRO musi pozostać uruchomiony. Skrypt nie uruchamia go automatycznie po wyłączeniu Androida.

### Testy wykonane lokalnie

Weryfikacja składni Node.js/Bash i integracyjne testy dla HTML, loginu Basic, PROPFIND, PUT, POST, PATCH, MOVE, COPY, MKCOL, DELETE, LOCK, UNLOCK, pobierania binarnego, kompresji i przekierowań.
