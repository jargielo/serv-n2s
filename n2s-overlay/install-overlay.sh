#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
REPO='https://raw.githubusercontent.com/jargielo/serv-n2s/main/n2s-overlay'
TARGET="$HOME/.local/share/n2s-overlay"
mkdir -p "$TARGET" "$HOME/.config/n2s-overlay"

printf '\n[N2S CLOUD] Instalowanie narzędzi Termux...\n'
pkg install -y nodejs openssh curl coreutils

for FILE in n2s-overlay.js n2s-media.js n2s-video.js n2s-video.css app.html app.js app.css n2s n2s-nazwa; do
  printf 'Pobieram %s...\n' "$FILE"
  curl -fLsS --connect-timeout 15 --max-time 60 "$REPO/$FILE" -o "$TARGET/$FILE.new"
done
node --check --input-type=commonjs < "$TARGET/n2s-overlay.js.new"
node --check --input-type=commonjs < "$TARGET/n2s-media.js.new"
node --check < "$TARGET/n2s-video.js.new"
node --check < "$TARGET/app.js.new"
bash -n "$TARGET/n2s.new"
bash -n "$TARGET/n2s-nazwa.new"
for FILE in n2s-overlay.js n2s-media.js n2s-video.js n2s-video.css app.html app.js app.css n2s n2s-nazwa; do
  mv "$TARGET/$FILE.new" "$TARGET/$FILE"
done
# Remove legacy themes from existing Termux installations after new files validate.
rm -f "$TARGET/n2s-themes.js" "$TARGET/n2s-themes.css"
rm -f "$TARGET/themes/amoled.svg" "$TARGET/themes/catalyst.svg" "$TARGET/themes/pro.svg"
rmdir "$TARGET/themes" 2>/dev/null || true
chmod 700 "$TARGET/n2s-overlay.js" "$TARGET/n2s" "$TARGET/n2s-nazwa"
chmod 600 "$TARGET/n2s-media.js" "$TARGET/n2s-video.js" "$TARGET/n2s-video.css"
ln -sf "$TARGET/n2s" "$PREFIX/bin/n2s"
ln -sf "$TARGET/n2s-nazwa" "$PREFIX/bin/n2s-nazwa"
if [ ! -s "$HOME/.config/n2s-overlay/name.txt" ]; then
  printf '%s\n' 'N2S CLOUD' > "$HOME/.config/n2s-overlay/name.txt"
  chmod 600 "$HOME/.config/n2s-overlay/name.txt"
fi

printf '\nZainstalowano nakładkę. WebDAV FS PRO musi być uruchomiony na porcie 8080.\n'
printf 'Stary tunel "serwer" należy wcześniej zatrzymać przez CTRL+C.\n'
printf 'Po restarcie nakladki opcja Wybierz odtwarzacz pojawi sie przy filmach.\n'
printf 'Nowy interfejs: https://jargielo.gh.srv.us/n2s_cloude\n'
printf 'Uruchamianie: n2s\n'
printf 'Zmiana nazwy: n2s-nazwa "MOJA CHMURA"\n\n'
exec "$PREFIX/bin/n2s"
