#!/data/data/com.termux/files/usr/bin/bash
# N2S WebDAV / N2S CLOUD: konfiguracja Termux + GitHub SSH + serwer nakladkowy.
# Oryginalny WebDAV FS PRO musi zostac uruchomiony osobno (port 8080).
set -Eeuo pipefail

REPO='https://raw.githubusercontent.com/jargielo/serv-n2s/main/n2s-overlay'
URL='https://jargielo.gh.srv.us'
BASE="$HOME/.local/share/n2s-overlay"
SSH_KEY="$HOME/.ssh/id_ed25519"
CMD="${1:-install}"

say() { printf '\n[N2S WebDAV] %s\n' "$*"; }
fail() { printf '\n[N2S WebDAV] BŁĄD: %s\n' "$*" >&2; exit 1; }
require_termux() {
  [ -n "${PREFIX:-}" ] && [ -x "$PREFIX/bin/pkg" ] || fail 'Ten skrypt uruchom w Termux na Androidzie.'
}
http_status() {
  local port="$1" method="$2"
  curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' \
    --connect-timeout 2 --max-time 4 -X "$method" \
    -H 'Depth: 0' "http://127.0.0.1:${port}/" 2>/dev/null || true
}
local_health() {
  curl --noproxy '*' -fsS --connect-timeout 2 --max-time 4 \
    "http://127.0.0.1:$1/_n2s_overlay_2026/health" 2>/dev/null || true
}
protected_webdav() {
  [ "$(http_status "$1" GET)" = 401 ] && [ "$(http_status "$1" PROPFIND)" = 401 ]
}
status() {
  say 'Stan usług lokalnych'
  local p found=0 public_code public_body
  for p in 8080 8081; do
    printf 'Port %s: GET=%s, PROPFIND=%s' "$p" "$(http_status "$p" GET)" "$(http_status "$p" PROPFIND)"
    if [ "$(local_health "$p")" = 'N2S OK' ]; then
      printf ' | N2S CLOUD: DZIAŁA'; found=1
    elif protected_webdav "$p"; then
      printf ' | WebDAV: WŁĄCZONY, hasło wymagane'; found=1
    fi
    printf '\n'
  done
  if [ -s "$SSH_KEY" ]; then say 'Klucz SSH: obecny'; else say 'Klucz SSH: brak'; fi
  say 'Sprawdzam publiczną domenę...'
  public_body="$(curl -fsS --connect-timeout 5 --max-time 10 \
    "$URL/_n2s_overlay_2026/health" 2>/dev/null || true)"
  public_code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 \
    "$URL/_n2s_overlay_2026/health" 2>/dev/null || true)"
  if [ "$public_code" = 200 ] && [ "$public_body" = 'N2S OK' ]; then
    say "ONLINE: $URL/n2s_cloude"
  else
    say "Publiczny tunel niepotwierdzony (HTTP ${public_code:-000})."
    if [ "$public_code" = 503 ]; then
      say 'srv.us zgłasza brak aktywnego tunelu (No tunnel available).'
    fi
    [ "$found" = 0 ] && say 'Uruchom WebDAV FS PRO na porcie 8080 z wymaganym loginem i hasłem.'
  fi
}
install_tools() {
  say 'Instaluję pakiety: curl, openssh, GitHub CLI i Node.js.'
  pkg install -y curl openssh gh nodejs coreutils || fail 'Nie udało się zainstalować pakietów Termux.'
}
setup_ssh() {
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"
  if [ ! -s "$SSH_KEY" ]; then
    say 'Tworzę klucz SSH ED25519 (bez hasła, do automatycznego tunelu).'
    ssh-keygen -q -t ed25519 -N '' -f "$SSH_KEY" -C 'n2s-webdav-termux' \
      || fail 'Nie udało się utworzyć klucza SSH.'
  fi
  if [ ! -s "$SSH_KEY.pub" ]; then
    ssh-keygen -y -f "$SSH_KEY" > "$SSH_KEY.pub" \
      || fail 'Nie udało się odtworzyć klucza publicznego.'
  fi
  chmod 600 "$SSH_KEY"
  chmod 644 "$SSH_KEY.pub"
}
setup_github() {
  if ! gh auth status --hostname github.com >/dev/null 2>&1; then
    say 'Zaloguj się na GitHub. Kod autoryzacji pojawi się w Termux.'
    gh auth login --hostname github.com --git-protocol https \
      --web --scopes admin:public_key || fail 'Logowanie do GitHub nie zostało ukończone.'
  fi
  local login pub keys
  login="$(gh api user --jq '.login')" || fail 'Nie mogę odczytać konta GitHub.'
  [ "$login" = jargielo ] || fail "Zalogowano się do GitHub jako '$login', oczekiwano 'jargielo'."
  pub="$(awk '{print $1" "$2}' "$SSH_KEY.pub")"
  keys="$(gh api user/keys --jq '.[].key' 2>/dev/null || true)"
  if ! printf '%s\n' "$keys" | awk '{print $1" "$2}' | grep -Fxq "$pub"; then
    say 'Rejestruję PUBLICZNY klucz SSH w GitHub (klucz prywatny zostaje w telefonie).'
    if ! gh ssh-key add "$SSH_KEY.pub" --title 'N2S WebDAV Termux'; then
      say 'GitHub może wymagać dodatkowego uprawnienia do kluczy SSH.'
      gh auth refresh --hostname github.com --scopes admin:public_key \
        || fail 'Nie przyznano dostępu do kluczy SSH.'
      gh ssh-key add "$SSH_KEY.pub" --title 'N2S WebDAV Termux' \
        || fail 'Nie udało się dodać klucza SSH do GitHub.'
    fi
  else
    say 'Klucz SSH jest już powiązany z GitHub.'
  fi
}
install_overlay() {
  local installer="$HOME/.n2s-webdav-install-overlay.sh"
  say 'Pobieram aktualny instalator nakładki N2S CLOUD z Twojego repozytorium.'
  curl -fLsS --retry 2 --connect-timeout 15 --max-time 60 \
    "$REPO/install-overlay.sh" -o "$installer.tmp" \
    || fail 'Nie mogę pobrać nakładki z GitHub.'
  bash -n "$installer.tmp" || fail 'Błąd składni pobranego instalatora.'
  mv "$installer.tmp" "$installer"
  chmod 700 "$installer"
  if ! protected_webdav 8080 && ! protected_webdav 8081; then
    say 'Zainstaluję nakładkę, ale jej start wymaga serwera WebDAV z hasłem.'
  fi
  exec bash "$installer"
}
case "$CMD" in
  install|update)
    require_termux
    install_tools
    setup_ssh
    setup_github
    install_overlay
    ;;
  start)
    require_termux
    [ -x "$PREFIX/bin/n2s" ] || fail 'Brak instalacji N2S. Uruchom: bash ~/n2s-webdav.sh install'
    exec "$PREFIX/bin/n2s"
    ;;
  status)
    command -v curl >/dev/null 2>&1 || fail 'Brakuje curl.'
    status
    ;;
  diagnose|diagnoza)
    require_termux
    [ -f "$BASE/n2s-diagnoza.sh" ] || fail 'Brak diagnostyki. Uruchom instalację.'
    exec bash "$BASE/n2s-diagnoza.sh"
    ;;
  help|-h|--help)
    cat <<'HELP'
N2S WebDAV — polecenia:
  bash ~/n2s-webdav.sh            Instaluj / aktualizuj i uruchom
  bash ~/n2s-webdav.sh start      Uruchom (bez aktualizacji)
  bash ~/n2s-webdav.sh status     Sprawdź porty i tunel
  bash ~/n2s-webdav.sh diagnose   Sprawdź przyczyny awarii
  bash ~/n2s-webdav.sh update     Pobierz najnowszą wersję i uruchom
Zatrzymaj działający tunel klawiszami Ctrl+C w jego sesji Termux.
HELP
    ;;
  *) fail "Nieznane polecenie: $CMD (użyj: help)" ;;
esac
