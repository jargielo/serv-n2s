/* N2S CLOUD – wybór odtwarzacza wideo. Nie przechowuje haseł ani tokenów. */
(() => {
  'use strict';
  if (window.__n2sVideoInstalled) return;
  window.__n2sVideoInstalled = true;

  const EXT = /\.(?:mp4|m4v|mkv|avi|mov|webm|wmv|flv|ts|m2ts|mts|3gp|mpeg|mpg|vob|ogv)(?:$|[?#])/i;
  const MARKER = 'n2s-video-ui';
  let menu = null;
  let trigger = null;
  let currentVideo = null;
  let scheduled = false;
  const allowNativeClick = new WeakSet();

  function absoluteMediaUrl(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const v = raw.trim();
    if (!v || v[0] === '#' || /^(?:blob:|data:|javascript:|intent:)/i.test(v)) return null;
    try {
      const uri = new URL(v, location.href);
      if (!/^https?:$/.test(uri.protocol) || uri.username || uri.password) return null;
      if (uri.origin !== location.origin) {
        const localBackend = (uri.hostname === '127.0.0.1' || uri.hostname === 'localhost') &&
          uri.port === '8080';
        if (!localBackend) return null;
        return location.origin + uri.pathname + uri.search;
      }
      return uri.href.split('#')[0];
    } catch (_) {
      return null;
    }
  }

  function videoLink(anchor) {
    if (!anchor || !anchor.getAttribute) return null;
    const raw = anchor.getAttribute('href') || '';
    if (!raw || raw.startsWith('#')) return null;
    let url;
    try { url = new URL(raw, location.href); } catch (_) { return null; }
    // SPA routes in hash are not direct streaming URLs.
    if (url.hash && EXT.test(url.hash) && !EXT.test(url.pathname)) return null;
    if (!EXT.test(url.pathname)) return null;
    return absoluteMediaUrl(raw);
  }

  function videoSource(video) {
    if (!video) return null;
    const candidates = [video.currentSrc, video.getAttribute('src')];
    for (const s of video.querySelectorAll('source[src]')) candidates.push(s.getAttribute('src'));
    for (const raw of candidates) {
      const result = absoluteMediaUrl(raw);
      if (result) return result;
    }
    // In some previews, the page route itself references the video.
    if (EXT.test(location.pathname)) return absoluteMediaUrl(location.href);
    return null;
  }

  function intentUrl(url, packageName) {
    const uri = new URL(url);
    // An Android implicit VIEW intent lets the OS / compatible browser choose
    // a player. Explicit VLC is offered separately.
    const hostAndPath = '//' + uri.host + uri.pathname + uri.search;
    const base = 'intent:' + hostAndPath +
      '#Intent;scheme=' + uri.protocol.slice(0, -1) +
      ';action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;' +
      'type=video/*;';
    return base + (packageName ? 'package=' + packageName + ';' : '') + 'end';
  }

  async function temporaryMediaUrl(videoUrl) {
    const uri = new URL(videoUrl, location.href);
    if (uri.origin !== location.origin || !/^https?:$/.test(uri.protocol)) {
      throw new Error('Nieprawidłowy adres pliku.');
    }
    const reply = await fetch('/_n2s_overlay_2026/media-grant', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-N2S-Playback': '1'
      },
      body: JSON.stringify({path: uri.pathname + uri.search})
    });
    let data = {};
    try { data = await reply.json(); } catch (_) {}
    if (!reply.ok || !data.url) {
      throw new Error(data.error || 'Nie udało się przygotować odtwarzania. Sprawdź logowanie WebDAV.');
    }
    const grant = new URL(data.url, location.origin);
    if (grant.origin !== location.origin || !grant.pathname.startsWith('/_n2s_overlay_2026/media-stream/')) {
      throw new Error('Serwer zwrócił nieprawidłowy adres.');
    }
    return grant.href;
  }

  function elt(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (typeof text === 'string') e.textContent = text;
    return e;
  }

  function dismiss() {
    if (menu) { menu.remove(); menu = null; }
  }

  function menuRow(label, hint) {
    const b = elt('button', 'n2s-video-action');
    b.type = 'button';
    b.appendChild(elt('span', 'n2s-video-action-label', label));
    if (hint) b.appendChild(elt('small', '', hint));
    return b;
  }

  function linkRow(label, hint, href) {
    const a = elt('a', 'n2s-video-action');
    a.href = href;
    a.rel = 'noopener noreferrer';
    a.appendChild(elt('span', 'n2s-video-action-label', label));
    if (hint) a.appendChild(elt('small', '', hint));
    return a;
  }

  function filename(url) {
    if (!url) return 'Wybrany film';
    try {
      return decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'Wybrany film';
    } catch (_) { return 'Wybrany film'; }
  }


  // Match WebDAV's currently active native palette; never recolor its own UI.
  // Independent N2S uses its CSS variables, so changing layouts also recolors
  // an already open dialog without recreating the menu or playback grants.
  function rgb(value) {
    const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/i.exec((value || '').trim());
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.9)) return null;
    return [Number(m[1]),Number(m[2]),Number(m[3])];
  }
  function asRgb(v) { return 'rgb(' + v.map(x=>Math.max(0,Math.min(255,Math.round(x)))).join(', ') + ')'; }
  function mix(a,b,weight) { return a.map((v,i)=>v*(1-weight)+b[i]*weight); }
  function luminance(c) {
    const linear=c.map(v=>{
      const x=v/255;
      return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);
    });
    return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
  }
  function colorOf(el, property) {
    return el ? rgb(getComputedStyle(el)[property]) : null;
  }
  function nativePalette() {
    const header = [...document.querySelectorAll('header, [role="banner"], [class*="header"], [class*="Header"]')]
      .find(el=>!el.closest('.n2s-video-shade') && colorOf(el,'backgroundColor'));
    const toolbar = [...document.querySelectorAll('nav, [role="toolbar"], [class*="toolbar"], [class*="Toolbar"]')]
      .find(el=>!el.closest('.n2s-video-shade') && colorOf(el,'backgroundColor'));
    const panel = colorOf(header,'backgroundColor') ||
      colorOf(toolbar,'backgroundColor') ||
      colorOf(document.body,'backgroundColor') || [47,57,74];
    const button = [...document.querySelectorAll('main button, [role="main"] button, [role="toolbar"] button, nav button')]
      .find(el=>!el.closest('.n2s-video-shade') && colorOf(el,'backgroundColor'));
    const base = colorOf(button,'backgroundColor') || colorOf(toolbar,'backgroundColor') || mix(panel,luminance(panel)>.35?[0,0,0]:[255,255,255],.10);
    const light = luminance(panel) > .24;
    const fg = light ? [28,34,44] : [247,249,252];
    const muted = light ? [73,81,93] : [196,204,216];
    return {
      panel:asRgb(panel),
      button:asRgb(base),
      hover:asRgb(mix(base,light?[0,0,0]:[255,255,255],.12)),
      border:asRgb(mix(base,light?[0,0,0]:[255,255,255],.20)),
      text:asRgb(fg),
      muted:asRgb(muted),
      accent:asRgb(mix(panel,light?[0,0,0]:[255,255,255],.55)),
      radius:'12px'
    };
  }
  function applyPlayerPalette(shade) {
    if (!shade) return;
    const app = !!document.querySelector('#n2s-app') &&
      !!getComputedStyle(document.body).getPropertyValue('--panel').trim();
    shade.dataset.n2sPlayerSkin = app ? 'app' : 'native';
    if (app) {
      for(const key of ['panel','button','button-hover','border','text','muted','accent','radius']){
        shade.style.removeProperty('--player-'+key);
      }
      return;
    }
    const p=nativePalette();
    for(const key of ['panel','button','hover','border','text','muted','accent','radius']) {
      const name=key==='hover'?'button-hover':key;
      shade.style.setProperty('--player-'+name,p[key]);
    }
  }

  function openMenu(url, playNative) {
    dismiss();
    const shade = elt('div', MARKER + ' n2s-video-shade');
    shade.setAttribute('role', 'presentation');
    const dialog = elt('div', 'n2s-video-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Wybierz odtwarzacz');
    dialog.appendChild(elt('div', 'n2s-video-heading', 'Otwórz film'));
    dialog.appendChild(elt('div', 'n2s-video-filename', filename(url)));

    const browser = menuRow('Odtwórz tutaj', 'Wbudowany odtwarzacz WebDAV / przeglądarki');
    browser.addEventListener('click', () => {
      dismiss();
      if (typeof playNative === 'function') playNative();
    });
    dialog.appendChild(browser);

    if (url) {
      const area = elt('div', 'n2s-video-links');
      area.appendChild(elt('p', 'n2s-video-warning', 'Przygotowuję bezpieczny adres do odtwarzania...'));
      dialog.appendChild(area);

      temporaryMediaUrl(url).then(streamUrl => {
        if (menu !== shade) return;
        area.replaceChildren();
        area.appendChild(linkRow('Wybierz aplikację', 'Wybierz dowolny zgodny odtwarzacz na Androidzie', intentUrl(streamUrl)));
        area.appendChild(linkRow('MX Player', 'Bezpłatna wersja MX Player', intentUrl(streamUrl, 'com.mxtech.videoplayer.ad')));
        area.appendChild(linkRow('MX Player Pro', 'Płatna wersja MX Player', intentUrl(streamUrl, 'com.mxtech.videoplayer.pro')));
        area.appendChild(linkRow('Arc Player', 'Otwórz w Arc Player na Androidzie (wymaga zainstalowanej aplikacji)', intentUrl(streamUrl, 'com.videoplayer.arcplayer')));
        area.appendChild(linkRow('VLC', 'Otwórz w VLC na Androidzie', intentUrl(streamUrl, 'org.videolan.vlc')));
        const copy = menuRow('Kopiuj adres tymczasowy', 'Przydatne w odtwarzaczach sieciowych');
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(streamUrl);
            copy.querySelector('span').textContent = 'Adres skopiowany';
          } catch (_) {
            copy.querySelector('span').textContent = 'Kopiowanie nie powiodło się';
          }
        });
        area.appendChild(copy);
        area.appendChild(elt('p', 'n2s-video-warning',
          'Link pozwala odtwarzać wyłącznie ten film i wygasa po 4 godzinach. Nie udostępniaj go innym. Hasło WebDAV nie jest wpisywane w link.'));
      }).catch(error => {
        if (menu !== shade) return;
        area.replaceChildren();
        area.appendChild(elt('p', 'n2s-video-warning',
          'Nie można przygotować zewnętrznego odtwarzania: ' + (error.message || 'błąd serwera') +
          '. Odtwarzanie na stronie nadal może działać.'));
      });
    } else {
      dialog.appendChild(elt('p', 'n2s-video-warning',
        'Podgląd korzysta z adresu tymczasowego (np. blob:). Zewnętrzne odtwarzanie wymaga bezpośredniego adresu filmu.'));
    }

    const close = menuRow('Anuluj');
    close.addEventListener('click', dismiss);
    dialog.appendChild(close);
    shade.appendChild(dialog);
    applyPlayerPalette(shade);
    shade.addEventListener('click', event => {
      if (event.target === shade) dismiss();
    });
    document.body.appendChild(shade);
    menu = shade;
    close.focus();
  }

  // Also update when the user changes theme while the dialog stays open.
  const paletteObserver = new MutationObserver(() => { if (menu) applyPlayerPalette(menu); });
  if (document.documentElement) paletteObserver.observe(document.documentElement, {attributes:true,attributeFilter:['data-n2s-theme','class','style']});
  if (document.body) paletteObserver.observe(document.body, {attributes:true,attributeFilter:['data-theme','class','style']});
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (menu) applyPlayerPalette(menu); });
  // Some versions of WebDAV FS PRO apply the selected theme directly to
  // the header/toolbar, without changing the html/body attributes.
  for (const nativeSurface of document.querySelectorAll('header, [role="banner"], nav, [role="toolbar"]')) {
    paletteObserver.observe(nativeSurface, {attributes:true,attributeFilter:['class','style','data-theme']});
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') dismiss();
  }, true);

  // Direct media links: ask how to open without breaking standard link behavior.
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.shiftKey ||
        event.metaKey || event.altKey) return;
    if (!(event.target instanceof Element) || event.target.closest('.' + MARKER)) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor || allowNativeClick.has(anchor)) return;
    const url = videoLink(anchor);
    if (!url) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openMenu(url, () => {
      allowNativeClick.add(anchor);
      try { anchor.click(); } finally { allowNativeClick.delete(anchor); }
    });
  }, true);

  function activeVideo() {
    const videos = [...document.querySelectorAll('video')];
    // The visible, largest player is normally the open file preview.
    return videos.filter(v => {
      const r = v.getBoundingClientRect();
      return r.width > 110 && r.height > 70;
    }).sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (rb.width * rb.height) - (ra.width * ra.height);
    })[0] || null;
  }

  function positionTrigger() {
    if (!trigger || !currentVideo) return;
    const r = currentVideo.getBoundingClientRect();
    if (r.width < 110 || r.height < 70 || r.bottom <= 0 || r.top >= innerHeight) {
      trigger.hidden = true;
      return;
    }
    trigger.hidden = false;
    trigger.style.top = Math.max(10, r.top + 10) + 'px';
    trigger.style.right = Math.max(10, innerWidth - r.right + 10) + 'px';
  }

  function refresh() {
    scheduled = false;
    const video = activeVideo();
    if (!video) {
      currentVideo = null;
      if (trigger) trigger.hidden = true;
      return;
    }
    currentVideo = video;
    if (!trigger) {
      trigger = elt('button', 'n2s-video-pick', 'Otwórz w…');
      trigger.type = 'button';
      trigger.setAttribute('aria-label', 'Wybierz odtwarzacz filmu');
      trigger.addEventListener('click', () => {
        const v = currentVideo;
        if (!v) return;
        const url = videoSource(v);
        openMenu(url, () => { v.play().catch(() => {}); });
      });
      document.body.appendChild(trigger);
    }
    positionTrigger();
  }
  function schedule() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(refresh);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, {once: true});
  } else {
    schedule();
  }
  const observer = new MutationObserver(schedule);
  if (document.documentElement) observer.observe(document.documentElement, {subtree: true, childList: true});
  window.addEventListener('resize', schedule, {passive: true});
  document.addEventListener('scroll', positionTrigger, true);
})();