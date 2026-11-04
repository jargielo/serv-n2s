# N2S CLOUD — nakładka WebDAV FS PRO

Przygotowana dla Termuxa i użytkownika GitHub `jargielo`.

### Schemat

Przeglądarka -> HTTPS srv.us -> tunel SSH -> `127.0.0.1:8081` (nakładka Node.js) -> `127.0.0.1:8080` (oryginalny WebDAV FS PRO).

### Instalacja (jedno polecenie)

```bash
curl -fsSL https://raw.githubusercontent.com/jargielo/serv-n2s/main/n2s-overlay/install-overlay.sh -o "$HOME/n2s-installer.sh" && bash "$HOME/n2s-installer.sh"
```

Zanim je wkleisz, **zatrzymaj dotychczasowy tunel** poleceniem Ctrl+C i uruchom WebDAV FS PRO z wymaganym loginem i hasłem na porcie 8080.

### Filmy: własny odtwarzacz (MX Player, MX Player Pro, VLC)

Wcześniej MX Player otrzymywał bezpośredni adres WebDAV, ale nie przejmował danych
uwierzytelnienia z przeglądarki. Powodowało to komunikat "Can't play this link".

Nowa procedura:

1. Na stronie N2S CLOUD wybierz film i opcję `Otwórz w…`.
2. Przeglądarka (po zalogowaniu do WebDAV FS PRO) żąda od nakładki
   tymczasowego linku do **jednego konkretnego pliku**.
3. Proxy weryfikuje uprawnienia na oryginalnym WebDAV FS PRO i wydaje losowy,
   trudny do odgadnięcia link ważny przez maksymalnie **4 godziny**.
4. Link wskazuje na strumień HTTP z obsługą `Range`, więc MX Player/VLC
   mogą odtwarzać i przewijać film bez znajomości hasła.
5. W menu dostępne są: **Odtwórz tutaj**, **Wybierz aplikację**, **MX Player**,
   **MX Player Pro**, **VLC** oraz **Kopiuj adres tymczasowy**.

Ani login, ani hasło nie są umieszczane w URL. Nagłówek uwierzytelnienia
jest przechowywany wyłącznie w pamięci procesu proxy do czasu wygaśnięcia linku,
żeby pobrać wskazany plik z WebDAV. Restart proxy natychmiast unieważnia link.

**WAŻNE O BEZPIECZEŃSTWIE:** każdy, kto pozna tymczasowy URL, będzie mógł
odtworzyć ten *jeden* film do wygaśnięcia linku — to tzw. token dostępu.
Nie udostępniaj tych linków, także w publicznych zrzutach ekranu.
Serwer srv.us może technicznie zobaczyć ścieżkę URL. Stosuj to rozwiązanie
tylko do plików, które możesz w ten sposób udostępnić. Wrażliwych filmów
nie wystawiaj na publiczny tunel.

Strona musi mieć **bezpośredni adres pliku** (np. `/Filmy/video.mkv`).
Jeśli WebDAV FS PRO używa wyłącznie `blob:` albo SPA bez ścieżki pliku,
nakładka pokaże informację, że nie może przekazać materiału zewnętrznie.
Obsługa `intent:` oraz wybierania aplikacji zależy od przeglądarki Androida.
W MX Playerze dla sieciowego wideo możesz także włączyć dekodowanie HW+/SW.

Przed aktualizacją zatrzymaj stary proces `n2s` przez Ctrl+C i ponownie
uruchom instalator:

```bash
curl -fsSL https://raw.githubusercontent.com/jargielo/serv-n2s/main/n2s-overlay/install-overlay.sh -o "$HOME/n2s-installer.sh" && bash "$HOME/n2s-installer.sh"
```

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
- Przygotowane linki wideo nie są publicznym katalogiem, ale są tymczasowymi tokenami dostępu; chronią tylko przed odgadnięciem adresu, nie przed jego wyciekiem.

### Ograniczenia

- To nakładka na **stronę HTML**. Oryginalny adres lokalny `127.0.0.1:8080` pozostaje bez zmian.
- Zmiana nazwy jest wykonywana za pomocą CSS/JS po załadowaniu interfejsu. Aktualizacja aplikacji producenta może wymagać dostosowania nakładki.
- Pomyślny wynik testów na symulowanym serwerze WebDAV nie oznacza jeszcze potwierdzonej zgodności z Twoją wersją aplikacji.
- WebDAV FS PRO musi pozostać uruchomiony. Skrypt nie uruchamia go automatycznie po wyłączeniu Androida.

### Testy wykonane lokalnie

Testy GitHub Actions: składnia Node.js/Bash, poprawność proxy WebDAV i 401 bez logowania, wydawanie tokenu do jednego pliku po uwierzytelnieniu, 206 Range, 200 GET, HEAD, odrzucanie prób bez hasła, niepoprawnego originu i nieprawidłowej ścieżki. Testy DOM dotyczą menu wyboru odtwarzaczy. Nie wykonano jeszcze testu z prawdziwym MX Playerem na Samsungu.
