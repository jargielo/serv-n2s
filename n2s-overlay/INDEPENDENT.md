# N2S CLOUD — niezależny interfejs WWW (3 układy)

Nowa aplikacja WWW działa **obok** oryginalnej strony WebDAV FS PRO.

Adres publiczny (przy aktywnym tunelu `n2s`):

**https://jargielo.gh.srv.us/n2s_cloude**

Adres lokalny: `http://127.0.0.1:8081/n2s_cloude`.

Oryginalny WebDAV FS PRO jest nadal dostępny pod `http://127.0.0.1:8080/`
oraz pod `https://jargielo.gh.srv.us/`. Ta wersja nie zmienia domyślnego
adresu strony, aby nie ryzykować uszkodzenia klientów WebDAV.

## Trzy układy

1. **AMOLED Files** — mobilny, czarny interfejs z dużą listą plików.
2. **Catalyst Dark** — grafitowy dashboard, karty i statystyki bieżącego katalogu.
3. **File Manager Pro** — zwarty, administracyjny widok z listą plików i bocznym menu.

Przełącznik znajduje się **na górnym pasku**, po prawej stronie wyszukiwarki.
Na telefonach dostępny jest też przycisk **Motyw** na dolnej belce.
Wybór zapisuje się lokalnie w przeglądarce.

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
Uruchom WebDAV FS PRO (port 8080, z wymaganym loginem i hasłem).

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
zachowanie proxy WebDAV, obsługę filmu i Range, przełączanie motywów,
a także parser `PROPFIND` i wyszukiwarkę na XML o strukturze WebDAV.
Są to testy automatyczne; nie oznaczają testu wizualnego na prawdziwym
Samsungu S24 Ultra.
