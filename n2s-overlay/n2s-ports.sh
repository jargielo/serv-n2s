#!/data/data/com.termux/files/usr/bin/bash
# Safe port autodetection for WebDAV FS PRO and N2S CLOUD.
# Source from n2s; does not stop or alter any other application.
# choose_n2s_ports <first-port> <second-port> sets PORT and OVERLAY.

n2s_http_status() {
  local port="$1" method="$2" code
  code="$(curl --noproxy '*' -s -o /dev/null -w '%{http_code}' \
    --connect-timeout 2 --max-time 4 -X "$method" \
    -H 'Depth: 0' "http://127.0.0.1:${port}/" 2>/dev/null || true)"
  printf '%s' "${code:-000}"
}

n2s_existing_overlay() {
  local response
  response="$(curl --noproxy '*' -s --connect-timeout 1 --max-time 2 \
    "http://127.0.0.1:$1/_n2s_overlay_2026/health" 2>/dev/null || true)"
  [ "$response" = 'N2S OK' ]
}

n2s_has_auth() {
  local port="$1" get propfind
  get="$(n2s_http_status "$port" GET)"
  propfind="$(n2s_http_status "$port" PROPFIND)"
  [ "$get" = '401' ] && [ "$propfind" = '401' ]
}

n2s_port_free() {
  # Binding is more reliable on Android than parsing ss/netstat permissions.
  node -e '
const net=require("net");
const server=net.createServer();
server.once("error",()=>process.exit(1));
server.listen(Number(process.argv[1]),"127.0.0.1",()=>server.close(()=>process.exit(0)));
' "$1" >/dev/null 2>&1
}

choose_n2s_ports() {
  local first="${1:-8080}" second="${2:-8081}"
  PORT='' OVERLAY=''
  case "$first:$second" in
    *[!0-9:]* | ':' ) echo 'Nieprawidlowe porty.' >&2; return 1 ;;
  esac
  if n2s_existing_overlay "$first" || n2s_existing_overlay "$second"; then
    echo 'N2S CLOUD jest juz uruchomiony. Zatrzymaj poprzednia sesje n2s (CTRL+C).' >&2
    return 1
  fi
  if n2s_has_auth "$first" && n2s_port_free "$second"; then
    PORT="$first"; OVERLAY="$second"
    return 0
  fi
  if n2s_has_auth "$second" && n2s_port_free "$first"; then
    PORT="$second"; OVERLAY="$first"
    return 0
  fi
  echo 'Nie moge bezpiecznie dobrac portow WebDAV i N2S CLOUD.' >&2
  echo "Port $first: GET=$(n2s_http_status "$first" GET), PROPFIND=$(n2s_http_status "$first" PROPFIND)." >&2
  echo "Port $second: GET=$(n2s_http_status "$second" GET), PROPFIND=$(n2s_http_status "$second" PROPFIND)." >&2
  echo 'WebDAV FS PRO musi dzialac na 8080 albo 8081 i wymagac loginu i hasla (HTTP 401).' >&2
  echo 'Drugi port musi byc wolny. Nie wylaczam zadnego serwera automatycznie.' >&2
  return 1
}
