#!/usr/bin/env node
'use strict';
/**
 * N2S Overlay 1.0: local-only reverse proxy for WebDAV FS PRO.
 * Passes WebDAV methods and file uploads/downloads to the original app.
 * Only augments successful HTML documents with branding CSS/JS.
 * No dependencies other than Node.js.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const net = require('node:net');
const createMediaRoutes = require('./n2s-media');

const HOST = '127.0.0.1';
const UPSTREAM_PORT = Number(process.env.N2S_UPSTREAM_PORT || 8080);
const PROXY_PORT = Number(process.env.N2S_PROXY_PORT || 8081);
const NAME_FILE = process.env.N2S_NAME_FILE || path.join(process.env.HOME || '.', '.config', 'n2s-overlay', 'name.txt');
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const ASSET_PREFIX = '/_n2s_overlay_2026/';
const CSS_PATH = ASSET_PREFIX + 'style.css';
const JS_PATH = ASSET_PREFIX + 'brand.js';
const VIDEO_JS_PATH = ASSET_PREFIX + 'video.js';
const VIDEO_CSS_PATH = ASSET_PREFIX + 'video.css';
const INJECT = `<link rel="stylesheet" href="${VIDEO_CSS_PATH}"><script defer src="${JS_PATH}"></script><script defer src="${VIDEO_JS_PATH}"></script>`;
const mediaRoutes = createMediaRoutes({host: HOST, port: UPSTREAM_PORT, prefix: ASSET_PREFIX});
const HOP_HEADERS = ['connection', 'keep-alive', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade'];

if (![UPSTREAM_PORT, PROXY_PORT].every(p => Number.isInteger(p) && p > 0 && p < 65536) || UPSTREAM_PORT === PROXY_PORT) {
  console.error('Invalid proxy or upstream port.');
  process.exit(1);
}

function getName() {
  try {
    const name = fs.readFileSync(NAME_FILE, 'utf8').trim();
    return name.slice(0, 50) || 'N2S CLOUD';
  } catch (_) {
    return 'N2S CLOUD';
  }
}

const STYLE = `
/* N2S Cloud - only brand element gets visual changes; native controls remain untouched. */
.n2s-brand-text {
  font-weight: 750 !important;
  letter-spacing: 0.025em !important;
  color: #f8fafc !important;
  text-wrap: balance;
}
.n2s-brand-text::before {
  content: 'N2S';
  display: inline-block;
  vertical-align: middle;
  font-family: system-ui, sans-serif;
  font-size: 0.48em;
  font-weight: 750;
  line-height: 1.1;
  letter-spacing: 0.04em;
  margin: -0.1em 0.7em 0 0;
  padding: 0.48em 0.56em;
  border: 1px solid rgba(255,255,255,0.30);
  border-radius: 0.55em;
  background: linear-gradient(145deg, #111827, #475569);
  color: #fff;
}
@media (prefers-reduced-motion: reduce) {
  .n2s-brand-text { transition: none !important; }
}
`;

function scriptForName(name) {
  // Rename only the visible product heading and browser title.
  // No injected theme CSS, icon override, or layout mutation.
  return `(()=>{
'use strict';
const BRAND=${JSON.stringify(name)};
const N2S_ROUTE='/n2s_cloude';
function repairMisroutedN2S() {
  // WebDAV FS PRO's hash router treats #/n2s_cloude as a folder.
  // Fragment paths are never sent to the server; repair in the browser.
  const hash=window.location.hash||'';
  if (!/^#\\/(?:n2s_cloude|_n2s_overlay_2026\\/app)\\/?(?:[?#]|$)/i.test(hash)) return false;
  if (window.location.pathname === N2S_ROUTE) {
    window.history.replaceState(window.history.state, '', N2S_ROUTE);
    return true;
  }
  window.location.replace(window.location.origin+N2S_ROUTE);
  return true;
}
if (repairMisroutedN2S()) return;
window.addEventListener('hashchange',repairMisroutedN2S);
const TITLES=new Set(['webdav fs pro','webdav fs','webdav fs ui','n2s cloud','webdav n2s']);
let scheduled=false;
function updateBrand(){
  scheduled=false;
  if (/^(?:webdav fs(?: pro| ui)?|n2s cloud|webdav n2s)$/i.test((document.title||'').trim())) {
    document.title=BRAND;
  }
  if (!document.body) return;
  const nodes=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let node, count=0;
  while ((node=nodes.nextNode())) {
    const current=(node.nodeValue||'').trim();
    if (!TITLES.has(current.toLowerCase())) continue;
    const parent=node.parentElement;
    if (!parent || parent.closest('script,style,textarea,input,button,[contenteditable="true"],.n2s-video-shade')) continue;
    node.nodeValue=node.nodeValue.replace(current,BRAND);
    if (++count>=3) break;
  }
}
function schedule(){
  if(!scheduled){scheduled=true;requestAnimationFrame(updateBrand);}
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',schedule,{once:true});
else schedule();
const obs=new MutationObserver(schedule);
if(document.documentElement)obs.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
})();`;
}

function noCache(res, type, body, headOnly = false) {
  res.writeHead(200, {'Content-Type': type, 'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
  res.end(headOnly ? undefined : body);
}

function copyResponseHeaders(h) {
  const out = {...h};
  for (const x of HOP_HEADERS) delete out[x];
  return out;
}

function maybeInject(buf, encoding) {
  let decoded = buf;
  try {
    if (encoding === 'gzip') decoded = zlib.gunzipSync(buf, {maxOutputLength: MAX_HTML_BYTES});
    else if (encoding === 'deflate') decoded = zlib.inflateSync(buf, {maxOutputLength: MAX_HTML_BYTES});
    else if (encoding === 'br') decoded = zlib.brotliDecompressSync(buf, {maxOutputLength: MAX_HTML_BYTES});
    else if (encoding && encoding !== 'identity') return null;
  } catch (_) { return null; }
  if (decoded.length > MAX_HTML_BYTES) return null;
  const original = decoded.toString('utf8');
  // Inject only into full HTML pages, never XML/WebDAV responses.
  if (!/<(?:html|head|body)(?:[\s>])/i.test(original)) return null;
  let updated;
  if (/<\/head\s*>/i.test(original)) updated = original.replace(/<\/head\s*>/i, INJECT+'\n</head>');
  else if (/<\/body\s*>/i.test(original)) updated = original.replace(/<\/body\s*>/i, INJECT+'\n</body>');
  else updated = INJECT+'\n'+original;
  return Buffer.from(updated, 'utf8');
}

function requestHandler(req, res) {
  let reqPath;
  try { reqPath = new URL(req.url, 'http://localhost').pathname; }
  catch (_) { res.writeHead(400); res.end(); return; }
  // Browser navigation to the domain root opens the N2S CLOUD UI.
  // Keep WebDAV clients, files, APIs, and other request methods unchanged.
  if (req.method === 'GET' && req.url === '/' &&
      /text\/html/i.test(String(req.headers.accept || ''))) {
    res.writeHead(302, {
      'Location': '/n2s_cloude#', // explicit empty fragment: prevent /#/ inheritance
      'Cache-Control': 'no-store',
      'Vary': 'Accept',
      'Content-Length': '0'
    });
    res.end();
    return;
  }
  if (mediaRoutes(req, res, reqPath)) return;
  // Standalone N2S file manager, separate from the original WebDAV interface.
  // The HTML entry is authorized by the original WebDAV server. No fake login.
  if ((req.method === 'GET' || req.method === 'HEAD') &&
      (reqPath === ASSET_PREFIX + 'app' || reqPath === ASSET_PREFIX + 'app/' || reqPath === '/n2s_cloude' || reqPath === '/n2s_cloude/')) {
    const probeHeaders = {};
    if (req.headers.authorization) probeHeaders.authorization = req.headers.authorization;
    if (req.headers.cookie) probeHeaders.cookie = req.headers.cookie;
    const probe = http.request({
      hostname: HOST,port:UPSTREAM_PORT,method:'PROPFIND',path:'/',
      headers:{...probeHeaders,Depth:'0',Host:'127.0.0.1:'+UPSTREAM_PORT}
    }, upstream => {
      const code=upstream.statusCode;
      upstream.resume();
      if (code === 401 || code === 403) {
        res.writeHead(code, {
          'WWW-Authenticate': upstream.headers['www-authenticate'] || 'Basic realm="WebDAV FS PRO"',
          'Cache-Control':'no-store'
        });res.end();return;
      }
      if (code !== 207) {
        res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
        res.end('WebDAV FS PRO nie udostepnia katalogu PROPFIND.');return;
      }
      try {
        const html=fs.readFileSync(path.join(__dirname,'app.html'),'utf8');
        noCache(res,'text/html; charset=utf-8',html,req.method==='HEAD');
      } catch (_) {
        res.writeHead(503);res.end('Brak plikow aplikacji'); 
      }
    });
    probe.setTimeout(7000,()=>probe.destroy(new Error('WebDAV timeout')));
    probe.on('error',()=>{
      if (!res.headersSent) {res.writeHead(502);res.end('Serwer WebDAV niedostepny');}
    });
    probe.end();
    return;
  }
  if ((req.method === 'GET' || req.method === 'HEAD') &&
      (reqPath === ASSET_PREFIX + 'app.css' || reqPath === ASSET_PREFIX + 'app.js')) {
    const js=reqPath.endsWith('.js');
    try {
      const content=fs.readFileSync(path.join(__dirname,js?'app.js':'app.css'),'utf8');
      return noCache(res,js?'application/javascript; charset=utf-8':'text/css; charset=utf-8',content,req.method==='HEAD');
    } catch (_) {res.writeHead(503);res.end('Brak zasobow aplikacji');return;}
  }

  // Retired legacy 3-theme gallery. Both active themes are in /n2s_cloude.
  if ((req.method === 'GET' || req.method === 'HEAD') && reqPath === ASSET_PREFIX + 'wyglad') {
    res.writeHead(302, {'Location':'/n2s_cloude','Cache-Control':'no-store'});
    res.end();return;
  }
  if (reqPath === ASSET_PREFIX + 'health') {
    return noCache(res, 'text/plain; charset=utf-8', 'N2S OK', req.method === 'HEAD');
  }
  if ((req.method === 'GET' || req.method === 'HEAD') && reqPath === CSS_PATH) {
    return noCache(res, 'text/css; charset=utf-8', STYLE, req.method === 'HEAD');
  }
  if ((req.method === 'GET' || req.method === 'HEAD') && reqPath === JS_PATH) {
    return noCache(res, 'application/javascript; charset=utf-8', scriptForName('n2s Cloude'), req.method === 'HEAD');
  }
  if ((req.method === 'GET' || req.method === 'HEAD') && (reqPath === VIDEO_JS_PATH || reqPath === VIDEO_CSS_PATH)) {
    const isJs = reqPath === VIDEO_JS_PATH;
    const assetName = isJs ? 'n2s-video.js' : 'n2s-video.css';
    const file = path.join(__dirname, assetName);
    try {
      return noCache(res, isJs ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8',
        fs.readFileSync(file, 'utf8'), req.method === 'HEAD');
    } catch (_) {
      res.writeHead(503, {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'});
      res.end('Brak komponentu: ' + assetName);
      return;
    }
  }
  if (reqPath.startsWith(ASSET_PREFIX)) {
    res.writeHead(404, {'Cache-Control':'no-store'}); res.end(); return;
  }

  const headers = {...req.headers};
  for (const x of HOP_HEADERS) delete headers[x];
  // Force uncompressed HTML for injection, but preserve compression of binary assets/downloads.
  if (req.method === 'GET' && /text\/html/i.test(String(headers.accept || ''))) headers['accept-encoding'] = 'identity';
  // Preserve end-user host in forwarding metadata; the original app remains the only auth authority.
  // Keep the original Host just as direct srv.us forwarding does.
  headers['x-forwarded-host'] = req.headers.host || '';
  headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || 'https';

  const upstream = http.request({hostname: HOST, port: UPSTREAM_PORT, method: req.method, path: req.url, headers}, up => {
    const upHeaders = copyResponseHeaders(up.headers);
    // Redirects pointing to the private port must lead back through the public proxy.
    if (typeof upHeaders.location === 'string') {
      const localRedirect = new RegExp('^http://(?:127\\.0\\.0\\.1|localhost):' + UPSTREAM_PORT + '(?=/|$)', 'i');
      upHeaders.location = upHeaders.location.replace(localRedirect, `https://${req.headers.host || 'jargielo.gh.srv.us'}`);
    }
    const isHtml = req.method === 'GET' && up.statusCode === 200 && /text\/html/i.test(String(up.headers['content-type'] || ''));
    if (!isHtml) {
      res.writeHead(up.statusCode, upHeaders);
      up.pipe(res);
      return;
    }
    let total = 0;
    let chunks = [];
    let fallback = false;
    up.on('data', chunk => {
      if (fallback) { res.write(chunk); return; }
      total += chunk.length;
      chunks.push(chunk);
      if (total > MAX_HTML_BYTES) {
        fallback = true;
        res.writeHead(up.statusCode, upHeaders);
        for (const part of chunks) res.write(part);
        chunks = null;
      }
    });
    up.on('end', () => {
      if (fallback) { res.end(); return; }
      const original = Buffer.concat(chunks);
      const injected = maybeInject(original, String(up.headers['content-encoding'] || '').toLowerCase());
      if (!injected) {
        res.writeHead(up.statusCode, upHeaders);
        res.end(original);
        return;
      }
      for (const k of ['content-encoding','content-length','etag','content-md5','last-modified','content-range']) delete upHeaders[k];
      upHeaders['cache-control'] = 'no-store';
      upHeaders['content-length'] = String(injected.length);
      res.writeHead(up.statusCode, upHeaders);
      res.end(injected);
    });
    up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  });
  upstream.setTimeout(10 * 60 * 1000, () => upstream.destroy(new Error('Upstream timeout')));
  upstream.on('error', e => {
    if (!res.headersSent) { res.writeHead(502, {'Content-Type':'text/plain; charset=utf-8'}); res.end('WebDAV FS PRO jest niedostępny.'); }
    else res.destroy(e);
  });
  req.pipe(upstream);
  res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
}

const server = http.createServer(requestHandler);
// Forward optional WebSocket upgrades unchanged to preserve native UI capabilities.
server.on('upgrade', (req, socket, head) => {
  const remote = net.connect(UPSTREAM_PORT, HOST);
  remote.on('connect', () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    remote.write(lines.join('\r\n') + '\r\n\r\n');
    if (head.length) remote.write(head);
    socket.pipe(remote).pipe(socket);
  });
  remote.on('error', () => socket.destroy());
  socket.on('error', () => remote.destroy());
});

server.listen(PROXY_PORT, HOST, () => {
  console.log(`N2S Overlay ready: http://${HOST}:${PROXY_PORT} -> http://${HOST}:${UPSTREAM_PORT}`);
  console.log(`Brand: ${getName()}`);
});
server.on('error', err => { console.error('N2S Overlay:', err.message); process.exit(1); });
