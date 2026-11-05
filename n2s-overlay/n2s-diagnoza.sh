#!/data/data/com.termux/files/usr/bin/bash
# N2S CLOUD: diagnose public 503 / no tunnel from the phone and recover safely.
# Does not print passwords or private SSH keys, kill other apps or bypass authentication.
set -u
MODE="${1:-check}"
STATE="$HOME/.local/state/n2s-overlay"
LOG="$STATE/ssh.log"
URL='https://jargielo.gh.srv.us'
KEY="$HOME/.ssh/id_ed25519"
PREF="$HOME/.local/share/n2s-overlay"

http_code() {
  curl --noproxy '*' --silent --max-time 5 --connect-timeout 3 \
    --output /dev/null --write-out '%{http_code}' -X "$2" -H 'Depth: 0' \
    "http://127.0.0.1:$1/" 2>/dev/null || true
}
local_health() {
  curl --noproxy '*' --silent --max-time 3 --connect-timeout 2 \
    "http://127.0.0.1:$1/_n2s_overlay_2026/health" 2>/dev/null || true
}
public_status() {
  curl --silent --show-error --max-time 12 --connect-timeout 5 \
    --output /dev/null --write-out '%{http_code}' \
    "$URL/_n2s_overlay_2026/health" 2>/dev/null || true
}
check_port() {
  local port="$1" get propfind health
  get="$(http_code "$port" GET)"
  propfind="$(http_code "$port" PROPFIND)"
  health="$(local_health "$port")"
  echo "Port $port: WebDAV GET=${get:-000}, PROPFIND=${propfind:-000}, N2S Health=${health:-brak}"
  if [ "$get" = 401 ] && [ "$propfind" = 401 ]; then
    BACKEND="$port"
  fi
  if [ "$health" = 'N2S OK' ]; then
    ACTIVE_OVERLAY="$port"
  fi
}
echo '===== N2S CLOUD: DIAGNOSTYKA ====='
echo '1. Sprawdzam lokalne porty (bez hasla):'
BACKEND=''
ACTIVE_OVERLAY=''
check_port 8080
check_port 8081

echo
echo '2. Sprawdzam klucz SSH i narzedzia:'
if [ -s "$KEY" ]; then
  echo 'Klucz SSH: obecny.'
else
  echo 'BLAD: brak klucza ~/.ssh/id_ed25519.'
fi
for binary in ssh node curl; do
  if command -v "$binary" >/dev/null 2>&1; then
    echo "$binary: OK"
  else
    echo "$binary: BRAK"
  fi
done

echo
echo '3. Sprawdzam dostep do srv.us:'
if timeout 7 bash -c 'exec 3<>/dev/tcp/srv.us/22' 2>/dev/null; then
  echo 'TCP 22: dostepny.'
else
  echo 'TCP 22: niedostepny (problem sieci, DNS lub blokada SSH).'
fi
STATUS="$(public_status)"
echo "Publiczny punkt kontrolny HTTP: ${STATUS:-000}"
case "$STATUS" in
  200) echo 'Serwer publiczny odpowiada. Sprawdz zawartosc strony.';;
  503) echo 'POTWIERDZONE: srv.us nie ma aktywnego tunelu dla tej domeny.';;
  000|'') echo 'Nie mozna polaczyc sie z domena. Sprawdz internet/DNS.';;
  *) echo "Publiczna odpowiedz HTTP: $STATUS.";;
esac

echo
echo '4. Ostatnie komunikaty SSH:'
if [ -s "$LOG" ]; then
  # Avoid dumping verbose SSH metadata or accidental user-added secrets.
  grep -Ei 'permission denied|publickey|forward|refused|error|failed|timeout|no route|unreachable|could not resolve|https://[^[:space:]]+' "$LOG" | tail -n 14 || true
else
  echo 'Brak zapisanego logu SSH. Mozliwe, ze tunel nie zostal uruchomiony.'
fi
echo "Lokalizacja pelnego logu: $LOG"

echo
if [ "$MODE" != '--napraw' ]; then
  echo 'Diagnostyka zakonczona. Aby bezpiecznie sprobowac ponownie:'
  echo 'bash ~/.local/share/n2s-overlay/n2s-diagnoza.sh --napraw'
  exit 0
fi

if [ -n "$ACTIVE_OVERLAY" ]; then
  echo "N2S lokalnie juz dziala na porcie $ACTIVE_OVERLAY."
  echo 'Nie uruchamiam drugiego tunelu, bo srv.us rozdziela ruch pomiedzy polaczeniami.'
  echo 'Zatrzymaj poprzednia sesje n2s przez CTRL+C i uruchom to polecenie ponownie.'
  exit 2
fi
if [ -z "$BACKEND" ]; then
  echo 'BLOKADA: WebDAV nie odpowiada na 8080/8081 kodem 401 dla GET i PROPFIND.'
  echo 'Uruchom WebDAV FS PRO z wymaganym loginem i haslem na jednym z tych portow.'
  exit 3
fi
if [ ! -s "$KEY" ]; then
  echo 'BLOKADA: brak klucza SSH. Nie generuje nowego, aby zachowac domenę GitHub.'
  exit 4
fi
if ! timeout 7 bash -c 'exec 3<>/dev/tcp/srv.us/22' 2>/dev/null; then
  echo 'BLOKADA: telefon nie moze nawiazac polaczenia SSH z srv.us na porcie 22.'
  echo 'Wybierz druga siec (Wi-Fi lub dane komorkowe) i ponow probe.'
  exit 5
fi
echo
echo "5. WebDAV chroniony na porcie $BACKEND; uruchamiam aktualizacje i tunel..."
if ! curl -fsSL --max-time 60 \
  'https://raw.githubusercontent.com/jargielo/serv-n2s/main/n2s-overlay/install-overlay.sh' \
  -o "$HOME/n2s-installer.sh"; then
  echo 'Nie moge pobrac instalatora z GitHub. Sprawdz siec i sprobuj ponownie.'
  exit 6
fi
exec bash "$HOME/n2s-installer.sh"
