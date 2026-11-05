# N2S CLOUD — niezależny interfejs WWW (Dark / Light)

Nowa aplikacja WWW działa **obok** oryginalnej strony WebDAV FS PRO.

Adres publiczny (przy aktywnym tunelu `n2s`):

**https://jargielo.gh.srv.us/n2s_cloude**

Adres lokalny zależy od wykrytego portu: `http://127.0.0.1:8081/n2s_cloude` przy WebDAV 8080 lub `http://127.0.0.1:8080/n2s_cloude` przy WebDAV 8081.

Oryginalny WebDAV FS PRO może działać na porcie `8080` albo `8081`. N2S CLOUD automatycznie wykorzysta drugi, wolny port; publiczna domena przekierowuje do `/n2s_cloude`. Klienci WebDAV korzystający z publicznej domeny nadal używają metod WebDAV przez nakładkę.

## Dwa minimalistyczne motywy

1. **Dark** — ciemne grafitowe tło, jasne teksty i monochromatyczne ikony.
2. **Light** — jasne tło, ciemne teksty i monochromatyczne ikony.

Oba warianty korzystają z tego samego układu, listy i siatki plików.
Wybór znajduje się na górnym pasku albo przy przycisku **Motyw** na dolnej belce.
Wybór zostaje zapisany lokalnie. Stare motywy AMOLED Files,
Catalyst Dark i File Manager Pro zostały usunięte. Poprzednio zapamiętany
motyw jest zastępowany motywem Dark.

## Skalowanie

Na pasku aplikacji dostępne są przyciski `−` / `+`, suwak i procentowe wskazanie skali.
Zakres: **75–150%**, zmiana co 5%. Kliknięcie `100%` (lub aktualnej wartości) przywraca domyślny rozmiar.
Ustawienia są zapisywane w tej przeglądarce osobno od motywu.

## Działające funkcje

- Odczyt katalogów z WebDAV FS PRO przez `PROPFIND Depth: 1`.
- Wchodzenie do folderów, wyszukiwanie w bieżącym folderze.
- Widok siatki lub listy, sortowanie folderów przed plikami.
- Tworzenie folderów (`MKCOL`), przesyłanie plików (`PUT`).
- Zmiana nazw (`MOVE`), usuwanie plików i folderów (`DELETE`).
- Pobieranie plików; otwieranie zdjęć; przekazanie filmów do istniejącego
  modułu wyboru odtwarzacza (MX Player, VLC i inne).

Są to funkcje klienta WebDAV, a nie nowy serwer przechowujący dane.
Przy zmianach na dysku autorytetem pozostaje WebDAV FS PRO.
Jeżeli użytkownik ma ograniczone prawa na serwerze, operacje zapisu
mogą kończyć się błędem odmowy dostępu.

## Instalacja/aktualizacja

W Termuxie najpierw zatrzymaj poprzedni proces `n2s` przez `CTRL+C`.
Pozostaw WebDAV FS PRO na obecnym porcie **8080** (lub opcjonalnie **8081**). Uruchom serwer z wymaganym loginem i hasłem, a następnie skrypt `n2s`: wykryje on port WebDAV i wybierze drugi wolny port na nakładkę. Wymagane jest `HTTP 401` dla niezalogowanego GET i PROPFIND. Jeżeli oba porty są zajęte albo serwer nie wymaga hasła, skrypt bezpiecznie odmówi uruchomienia, nie zmieniając ustawień aplikacji.

```bash
curl -fsSL https://raw.githubusercontent.com/jargielo/serv-n2s/main/n2s-overlay/install-overlay.sh -o "$HOME/n2s-installer.sh" && bash "$HOME/n2s-installer.sh"
```

Po uruchomieniu wybierz adres `/n2s_cloude`.
Pojawienie się okna logowania jest prawidłowe; używa danych WebDAV FS PRO.

## Bezpieczeństwo i zgodność

Wejście do aplikacji jest chronione oryginalnym uwierzytelnianiem WebDAV.
Serwer proxy nie przechowuje listy kont, plików ani haseł aplikacji.
Wszystkie żądania pozostają w obrębie tego samego hosta.
Szczegóły działania odtwarzaczy opisano w README nakładki.

Zalecenie: zanim wykonasz operacje usunięcia lub zmiany nazwy na
ważnych plikach, przetestuj je na testowym katalogu.
Nie sprawdzono jeszcze wszystkich wariantów zachowania WebDAV FS PRO
na konkretnym telefonie.

## Testy

GitHub Actions sprawdza: składnię Node/Bash, uwierzytelnienie pod `/app`,
zachowanie proxy WebDAV, obsługę filmu i Range, przełączanie Dark/Light,
a także parser `PROPFIND` i wyszukiwarkę na XML o strukturze WebDAV.
Są to testy automatyczne; nie oznaczają testu wizualnego na prawdziwym
Samsungu S24 Ultra.
