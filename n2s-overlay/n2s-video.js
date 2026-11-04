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
      dialog.appendChild(linkRow('Wybierz aplikację', 'Wybór odtwarzacza Android — jeśli obsługuje go przeglądarka', intentUrl(url)));
      dialog.appendChild(linkRow('VLC', 'Uruchom VLC na Androidzie, jeśli jest zainstalowany', intentUrl(url, 'org.videolan.vlc')));
      const copy = menuRow('Kopiuj adres filmu', 'Wklej adres np. w odtwarzaczu sieciowym');
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(url);
          copy.querySelector('span').textContent = 'Adres skopiowany';
        } catch (_) {
          copy.querySelector('span').textContent = 'Nie można skopiować — użyj adresu strony';
        }
      });
      dialog.appendChild(copy);
      dialog.appendChild(elt('p', 'n2s-video-warning',
        'Plik pozostaje zabezpieczony loginem i hasłem WebDAV. Odtwarzacz zewnętrzny może poprosić o ponowne logowanie albo nie obsługiwać takiego połączenia.'));
    } else {
      dialog.appendChild(elt('p', 'n2s-video-warning',
        'Odtwarzacz wbudowany korzysta z tymczasowego adresu (np. blob:). Nie można bezpiecznie przekazać go do innej aplikacji. Możesz skopiować bezpośredni adres pliku z WebDAV i otworzyć go w odtwarzaczu.'));
    }

    const close = menuRow('Anuluj');
    close.addEventListener('click', dismiss);
    dialog.appendChild(close);
    shade.appendChild(dialog);
    shade.addEventListener('click', event => {
      if (event.target === shade) dismiss();
    });
    document.body.appendChild(shade);
    menu = shade;
    close.focus();
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