'use strict';

/*
 * N2S: temporary authenticated playback grants for external Android players.
 * A grant is strictly limited to one video path, retained only in RAM,
 * and expires automatically. Never put WebDAV passwords into public URLs.
 */
const http = require('node:http');
const crypto = require('node:crypto');

const EXT = /\.(?:mp4|m4v|mkv|avi|mov|webm|wmv|flv|ts|m2ts|mts|3gp|mpeg|mpg|vob|ogv)$/i;
const MIME = Object.freeze({
  mp4: 'video/mp4', m4v: 'video/mp4', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo', mov: 'video/quicktime', webm: 'video/webm',
  wmv: 'video/x-ms-wmv', flv: 'video/x-flv', ts: 'video/mp2t',
  m2ts: 'video/mp2t', mts: 'video/mp2t', '3gp': 'video/3gpp',
  mpg: 'video/mpeg', mpeg: 'video/mpeg', vob: 'video/mpeg', ogv: 'video/ogg'
});
const TTL_MS = 4 * 60 * 60 * 1000;
const MAX_GRANTS = 32;
const MAX_BODY = 4096;

function fail(res, status, message) {
  if (res.headersSent) { res.destroy(); return; }
  const body = JSON.stringify({error: message});
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(body);
}

function isVideoPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') ||
      value.startsWith('//') || value.length > 2048 || /[\r\n\0]/.test(value)) return false;
  let url;
  try { url = new URL(value, 'http://127.0.0.1'); }
  catch (_) { return false; }
  if (url.host !== '127.0.0.1' || !EXT.test(url.pathname)) return false;
  return true;
}
function contentTypeFor(pathname) {
  const ext = pathname.split('.').pop().toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}
function labelFromPath(pathname) {
  const last = pathname.split('/').pop();
  let decoded;
  try { decoded = decodeURIComponent(last); } catch (_) { decoded = last; }
  // Filenames only; no slash, quote, control char in Content-Disposition.
  return decoded.replace(/[\x00-\x1f\x7f"\\\/]/g, '_').slice(0, 100) || 'video.mp4';
}
function peerAuth(req) {
  const authorization = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const cookie = typeof req.headers.cookie === 'string' ? req.headers.cookie : '';
  // WebDAV FS PRO may use HTTP Basic or a browser cookie.
  if (!authorization && !cookie) return null;
  if (authorization.length > 4096 || cookie.length > 4096) return null;
  return {authorization, cookie};
}

module.exports = function createMediaRoutes({host, port, prefix}) {
  const grantPath = prefix + 'media-grant';
  const streamPath = prefix + 'media-stream/';
  const grants = new Map();

  function cleanup() {
    const now = Date.now();
    for (const [token, item] of grants) {
      if (item.expires < now) grants.delete(token);
    }
    while (grants.size >= MAX_GRANTS) grants.delete(grants.keys().next().value);
  }

  function issue(req, res) {
    if (req.method !== 'POST') return fail(res, 405, 'Metoda niedozwolona');
    if (req.headers['x-n2s-playback'] !== '1') return fail(res, 403, 'Brak nagłówka zabezpieczającego');
    const origin = req.headers.origin;
    if (origin) {
      try {
        const originUrl = new URL(origin);
        if ((originUrl.protocol !== 'https:' && originUrl.protocol !== 'http:') ||
            originUrl.host !== req.headers.host) {
          return fail(res, 403, 'Niedozwolone pochodzenie');
        }
      } catch (_) { return fail(res, 403, 'Nieprawidłowe pochodzenie'); }
    }
    const auth = peerAuth(req);
    if (!auth) return fail(res, 401, 'Zaloguj się ponownie do WebDAV w przeglądarce');
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY) return fail(res, 413, 'Żądanie jest za duże');
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch (_) { return fail(res, 400, 'Nieprawidłowe dane'); }
      if (!body || !isVideoPath(body.path)) return fail(res, 400, 'Nieprawidłowy adres wideo');
      const uri = new URL(body.path, 'http://127.0.0.1');
      const file = uri.pathname + uri.search;
      const filename = labelFromPath(uri.pathname);
      const headers = {'Accept-Encoding':'identity', 'Range':'bytes=0-0'};
      if (auth.authorization) headers.Authorization = auth.authorization;
      if (auth.cookie) headers.Cookie = auth.cookie;
      const probe = http.request({hostname:host, port, method:'GET', path:file, headers}, upstream => {
        const status = upstream.statusCode;
        const type = String(upstream.headers['content-type'] || '');
        // A login/HTML page or redirect is never a video stream.
        if ((status !== 200 && status !== 206) || /text\/html|application\/json/i.test(type)) {
          upstream.destroy();
          return fail(res, status === 401 || status === 403 ? 401 : 422,
            status === 401 || status === 403 ? 'Sesja WebDAV wygasła' :
            'Ten adres nie prowadzi bezpośrednio do pliku wideo');
        }
        upstream.destroy();
        cleanup();
        const token = crypto.randomBytes(32).toString('base64url');
        const expires = Date.now() + TTL_MS;
        grants.set(token, {file, filename, auth, expires, mime: contentTypeFor(uri.pathname)});
        const url = streamPath + token + '/' + encodeURIComponent(filename);
        const response = JSON.stringify({url, expires, expiresInSeconds: Math.floor(TTL_MS/1000)});
        res.writeHead(201, {
          'Content-Type':'application/json; charset=utf-8',
          'Content-Length':Buffer.byteLength(response),
          'Cache-Control':'no-store',
          'X-Content-Type-Options':'nosniff',
          'Referrer-Policy':'no-referrer'
        });
        res.end(response);
      });
      probe.setTimeout(10000, () => probe.destroy(new Error('Timeout')));
      probe.on('error', () => {
        if (!res.writableEnded) fail(res, 502, 'Nie udało się połączyć z plikiem WebDAV');
      });
      probe.end();
    });
    req.on('error', () => {
      if (!res.writableEnded) fail(res, 400, 'Przerwano żądanie');
    });
  }

  function stream(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Metoda niedozwolona');
    const match = /^([A-Za-z0-9_-]{43})\/([^/]+)$/.exec(pathname.slice(streamPath.length));
    if (!match) return fail(res, 404, 'Nie znaleziono adresu filmu');
    const item = grants.get(match[1]);
    if (!item || item.expires < Date.now()) {
      grants.delete(match[1]);
      return fail(res, 410, 'Tymczasowy adres filmu wygasł');
    }
    if (match[2] !== encodeURIComponent(item.filename)) return fail(res, 404, 'Nie znaleziono pliku');
    const headers = {'Accept-Encoding':'identity'};
    if (item.auth.authorization) headers.Authorization = item.auth.authorization;
    if (item.auth.cookie) headers.Cookie = item.auth.cookie;
    for (const field of ['range','if-range']) {
      const value = req.headers[field];
      if (typeof value === 'string' && value.length < 256 && !/[\r\n]/.test(value)) headers[field] = value;
    }
    const upstream = http.request({
      hostname:host,port,method:req.method,path:item.file,headers
    }, remote => {
      const status = remote.statusCode;
      if (status === 401 || status === 403) {
        grants.delete(match[1]);
        remote.resume();
        return fail(res, 401, 'Logowanie WebDAV wygasło');
      }
      if (status !== 200 && status !== 206 && status !== 416) {
        remote.resume();
        return fail(res, 502, 'WebDAV nie zwrócił strumienia wideo');
      }
      const out = {};
      for (const name of ['content-length','content-range','accept-ranges','etag','last-modified']) {
        const value = remote.headers[name];
        if (value !== undefined) out[name] = value;
      }
      out['Content-Type'] = item.mime;
      out['Content-Disposition'] = 'inline';
      out['Cache-Control'] = 'no-store';
      out['X-Content-Type-Options'] = 'nosniff';
      out['Referrer-Policy'] = 'no-referrer';
      // Disallow an upstream HTML error page masquerading as a video.
      const type = String(remote.headers['content-type'] || '');
      if (/text\/html|application\/json/i.test(type) && status !== 416) {
        remote.resume();
        return fail(res, 502, 'Odpowiedź WebDAV nie jest plikiem wideo');
      }
      res.writeHead(status, out);
      remote.pipe(res);
    });
    upstream.setTimeout(120000, () => upstream.destroy(new Error('Timeout')));
    upstream.on('error', () => {
      if (!res.headersSent) fail(res, 502, 'Połączenie z filmem zostało przerwane');
      else res.destroy();
    });
    res.on('close', () => {if (!res.writableEnded) upstream.destroy();});
    upstream.end();
  }

  return function mediaRoutes(req, res, pathname) {
    if (pathname === grantPath) { issue(req,res); return true; }
    if (pathname.startsWith(streamPath)) { stream(req,res,pathname); return true; }
    return false;
  };
};