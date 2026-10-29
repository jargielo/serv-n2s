#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

echo '== WebDAV FS PRO + srv.us =='
echo 'Instaluję wymagane narzędzia...'
pkg install -y openssh gh curl

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
KEY="$HOME/.ssh/id_ed25519"

if [ ! -f "$KEY" ]; then
  ssh-keygen -q -t ed25519 -N '' -f "$KEY" -C 'termux-webdav-srvus'
fi
if [ ! -s "$KEY.pub" ]; then
  ssh-keygen -y -f "$KEY" > "$KEY.pub"
fi
chmod 600 "$KEY"
chmod 644 "$KEY.pub"

if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo 'GitHub poprosi o autoryzację. Kod XXXX-XXXX pojawi się tutaj.'
  gh auth login -h github.com -p https -s admin:public_key -w
fi

LOGIN="$(gh api user --jq '.login')"
if [ "$LOGIN" != jargielo ]; then
  echo "BŁĄD: Zalogowano się jako $LOGIN, a wymagane jest konto jargielo."
  exit 1
fi

PUB="$(awk '{print $1 " " $2}' "$KEY.pub")"
if ! gh api user/keys --jq '.[].key' | awk '{print $1 " " $2}' | grep -Fxq "$PUB"; then
  echo 'Dodaję klucz publiczny SSH do GitHub...'
  if ! gh ssh-key add "$KEY.pub" -t 'Termux WebDAV FS PRO srv.us'; then
    echo 'Jeśli GitHub poprosi o zgodę na klucze SSH, zatwierdź ją.'
    gh auth refresh -h github.com -s admin:public_key
    gh ssh-key add "$KEY.pub" -t 'Termux WebDAV FS PRO srv.us'
  fi
fi

if [ -e "$PREFIX/bin/serwer" ] && [ ! -e "$PREFIX/bin/serwer.backup" ]; then
  cp -p "$PREFIX/bin/serwer" "$PREFIX/bin/serwer.backup"
fi

cat > "$PREFIX/bin/serwer" <<'TUNNEL'
#!/data/data/com.termux/files/usr/bin/bash
set -u
HOST='http://127.0.0.1:8080/'

STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X PROPFIND -H 'Depth: 0' "$HOST")"
if [ "$STATUS" = '000' ]; then
  echo 'BŁĄD: Najpierw włącz WebDAV FS PRO na porcie 8080.'
  exit 1
fi
if [ "$STATUS" != '401' ]; then
  echo "UWAGA: Bez loginu zapytanie WebDAV zwróciło HTTP $STATUS."
  echo 'Nie wystawiam serwera publicznie, dopóki nie potwierdzimy ochrony hasłem.'
  exit 1
fi

termux-wake-lock >/dev/null 2>&1 || true
trap 'termux-wake-unlock >/dev/null 2>&1 || true; exit 0' INT TERM
trap 'termux-wake-unlock >/dev/null 2>&1 || true' EXIT

echo 'WebDAV FS PRO: ochrona hasłem potwierdzona (HTTP 401).'
echo 'Publiczny adres: https://jargielo.gh.srv.us/'
echo 'Zatrzymanie tunelu: Ctrl+C'

while true; do
  ssh -T -i "$HOME/.ssh/id_ed25519" \
    -o IdentitiesOnly=yes \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    -o ConnectTimeout=15 \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -R 1:127.0.0.1:8080 jargielo@srv.us
  echo 'Tunel przerwany. Ponawiam za 5 sekund...'
  sleep 5
done
TUNNEL

chmod 700 "$PREFIX/bin/serwer"
echo 'Instalacja zakończona. Uruchamiam tunel...'
exec "$PREFIX/bin/serwer"
