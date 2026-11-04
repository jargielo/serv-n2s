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
  const allowNativeRowClick = new WeakSet();

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


  // WebDAV FS PRO is a hash-based SPA and displays files as clickable rows,
  // not necessarily as <a href="file.mp4"> links. Build a direct URL using the
  // visible filename and the current folder hash route.
  function currentFolderPath() {
    const hash=location.hash || '';
    if (!hash.startsWith('#/')) return null;
    let route=hash.slice(1).split('?')[0].split('#')[0];
    if (!route.startsWith('/') || route.startsWith('//')) return null;
    const parts=route.split('/').filter(Boolean);
    const encoded=[];
    for(const part of parts){
      let name;
      try{name=decodeURIComponent(part);}catch{return null;}
      if(!name || name==='.' || name==='..' || /[\\\0\r\n]/.test(name))return null;
      encoded.push(encodeURIComponent(name));
    }
    return '/'+encoded.join('/')+(encoded.length?'/':'');
  }
  function filenameFromText(value) {
    if (!value || typeof value!=='string') return null;
    const text=value.trim();
    if(text.length<5 || text.length>260 || /[\\/\0\r\n]/.test(text))return null;
    if(!EXT.test(text))return null;
    return text;
  }
  function inferVideoFromRow(target) {
    if (!(target instanceof Element))return null;
    // Tapping a three-dot menu or an action button must keep working.
    if (target.closest('button,[role="button"],[aria-haspopup],input,select,textarea') &&
        !target.closest('a[href]'))return null;
    const folder=currentFolderPath();
    if(folder===null)return null;
    const candidates=[target,...(function*(e){for(let i=0;i<4&&e;i++,e=e.parentElement)yield e;})(target.parentElement)];
    for(const node of candidates){
      // Select a leaf/label before the parent card. This avoids mixing
      // filenames with sizes, dates, and action captions.
      const strings=[
        node.getAttribute('title'),node.getAttribute('aria-label'),
        node.dataset?.filename, node.dataset?.name,
        node.children.length===0?node.textContent:null
      ];
      for(const value of strings){
        const name=filenameFromText(value);
        if(!name)continue;
        return {url:location.origin+folder+encodeURIComponent(name),name};
      }
    }
    return null;
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

  function requestWebDavLogin() {
    // Browser native prompt is available even when app CSS is not.
    // Credentials are never written to URL, localStorage or console.
    const username=window.prompt('Odtwarzacz zewnętrzny — login WebDAV:');
    if(username===null)return null;
    if(!username.trim() || username.length>200)throw new Error('Nieprawidłowy login WebDAV.');
    const password=window.prompt('Hasło WebDAV (używane tylko do tego połączenia):');
    if(password===null)return null;
    if(password.length>512)throw new Error('Hasło jest za długie.');
    const bytes=new TextEncoder().encode(username+':'+password);
    let binary='';
    for(const b of bytes)binary+=String.fromCharCode(b);
    return 'Basic '+btoa(binary);
  }
  async function temporaryMediaUrl(videoUrl) {
    const uri = new URL(videoUrl, location.href);
    if (uri.origin !== location.origin || !/^https?:$/.test(uri.protocol)) {
      throw new Error('Nieprawidłowy adres pliku.');
    }
    // The WebDAV SPA may use JavaScript-managed login that a fetch to this
    // separate endpoint does not inherit. Retry explicit Basic only after 401.
    async function issue(authHeader) {
      const headers={
        'Content-Type':'application/json',
        'X-N2S-Playback':'1'
      };
      if(authHeader)headers.Authorization=authHeader;
      const reply=await fetch('/_n2s_overlay_2026/media-grant',{
        method:'POST',credentials:'same-origin',headers,
        body:JSON.stringify({path:uri.pathname+uri.search})
      });
      let data={};
      try{data=await reply.json()}catch(_){}
      return {reply,data};
    }
    let {reply,data}=await issue();
    if(reply.status===401) {
      const header=requestWebDavLogin();
      if(!header)throw new Error('Anulowano logowanie do odtwarzacza zewnętrznego.');
      ({reply,data}=await issue(header));
    }
    if(!reply.ok || !data.url){
      throw new Error(data.error || 'Nie udało się przygotować odtwarzania (HTTP '+reply.status+').');
    }
    const grant=new URL(data.url,location.origin);
    if(grant.origin!==location.origin || !grant.pathname.startsWith('/_n2s_overlay_2026/media-stream/')){
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
  // WebDAV FS PRO can render its toolbar/header as anonymous <div> nodes.
  // Detect the *visible* palette first, rather than assuming header/nav tags.
  // elementFromPoint samples the native page before we append our dialog.
  function surfaceAt(x, y) {
    if (typeof document.elementFromPoint !== 'function') return null;
    const w = window.innerWidth || document.documentElement.clientWidth || 400;
    const h = window.innerHeight || document.documentElement.clientHeight || 800;
    let node = document.elementFromPoint(
      Math.min(Math.max(1, Math.round(x*w)), Math.max(1,w-1)),
      Math.min(Math.max(1, Math.round(y*h)), Math.max(1,h-1))
    );
    while (node && node !== document.body && node !== document.documentElement) {
      if (!(node instanceof Element) || node.closest('.n2s-video-shade,.n2s-video-pick')) {
        node=node.parentElement;
        continue;
      }
      const candidate=colorOf(node,'backgroundColor');
      if (candidate) return candidate;
      node=node.parentElement;
    }
    return null;
  }
  function nativePalette() {
    const root = document.body;
    // Center of the original header and of a file card.
    const headerSample=surfaceAt(.47,.11);
    const fileSample=surfaceAt(.47,.44);
    const fallbackHeader = [...document.querySelectorAll('header, [role="banner"], [class*="header"], [class*="Header"]')]
      .filter(el=>!el.closest('.n2s-video-shade'))
      .map(el=>colorOf(el,'backgroundColor')).find(Boolean);
    const fallbackToolbar = [...document.querySelectorAll('nav, [role="toolbar"], [class*="toolbar"], [class*="Toolbar"]')]
      .filter(el=>!el.closest('.n2s-video-shade'))
      .map(el=>colorOf(el,'backgroundColor')).find(Boolean);
    const bodyColor=colorOf(root,'backgroundColor');
    const htmlColor=colorOf(document.documentElement,'backgroundColor');

    // A visible light card or page must override the legacy blue fallback.
    // WebDAV FS PRO frequently uses unlabelled divs for its main toolbar.
    let panel=headerSample || fallbackHeader || fileSample ||
      bodyColor || htmlColor || fallbackToolbar || [47,57,74];
    const lightPage=[fileSample,bodyColor,htmlColor].some(c=>c && luminance(c)>.58);
    const darkPage=[fileSample,bodyColor,htmlColor].some(c=>c && luminance(c)<.12);
    if (lightPage && luminance(panel)<.24 && fileSample && luminance(fileSample)>.58) {
      panel=fileSample;
    } else if (darkPage && !lightPage && luminance(panel)>.58 && fileSample && luminance(fileSample)<.12) {
      panel=fileSample;
    }
    const light=luminance(panel)>.35;
    // Native buttons may be lighter or darker than the header. Avoid
    // selecting an action button from a totally different dialog.
    const candidates=[...document.querySelectorAll('main button, [role="main"] button, [role="toolbar"] button, nav button')];
    const button=candidates.find(el=>!el.closest('.n2s-video-shade') && colorOf(el,'backgroundColor'));
    let base=colorOf(button,'backgroundColor') ||
      (light ? mix(panel,[255,255,255],.42) : mix(panel,[255,255,255],.12));
    // Ensure foreground readability even if the sampled button is inverted.
    if ((luminance(base)>.35)!==light) {
      base=light?mix(panel,[255,255,255],.42):mix(panel,[255,255,255],.12);
    }
    const fg=light?[30,37,50]:[247,249,252];
    const muted=light?[79,89,104]:[196,204,216];
    return {
      panel:asRgb(panel),
      button:asRgb(base),
      hover:asRgb(mix(base,light?[0,0,0]:[255,255,255],.10)),
      border:asRgb(mix(base,light?[40,54,73]:[255,255,255],.22)),
      text:asRgb(fg),
      muted:asRgb(muted),
      accent:asRgb(light?[57,82,119]:[142,184,236]),
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
  let paletteTimer=0;
  function refreshPaletteSoon() {
    if (!menu || paletteTimer) return;
    paletteTimer=setTimeout(() => {
      paletteTimer=0;
      if (menu) applyPlayerPalette(menu);
    },80);
  }
  const paletteObserver = new MutationObserver(refreshPaletteSoon);
  if (document.documentElement) paletteObserver.observe(document.documentElement, {attributes:true,attributeFilter:['data-n2s-theme','class','style']});
  if (document.body) paletteObserver.observe(document.body, {attributes:true,attributeFilter:['data-theme','class','style']});
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (menu) applyPlayerPalette(menu); });
  // Some versions of WebDAV FS PRO apply the selected theme directly to
  // the header/toolbar, without changing the html/body attributes.
  for (const nativeSurface of document.querySelectorAll('header, [role="banner"], nav, [role="toolbar"]')) {
    paletteObserver.observe(nativeSurface, {attributes:true,attributeFilter:['class','style','data-theme']});
  }

  // React when the built-in WebDAV appearance menu applies its theme asynchronously.
  document.addEventListener('click', event => {
    if (menu || (event.target instanceof Element && !event.target.closest('.n2s-video-ui'))) {
      setTimeout(refreshPaletteSoon,150);
      setTimeout(refreshPaletteSoon,450);
    }
  },false);


  // Guaranteed entry point, independent of WebDAV FS PRO's SPA click handlers.
  // The user can choose a video in the current WebDAV folder by PROPFIND and
  // then open our existing player menu. No passwords or file lists are stored.
  let manualButton=null;
  function itemPath(raw) {
    if (!raw) return null;
    try {
      const u=new URL(raw,location.origin);
      if(u.origin!==location.origin &&
         !((u.hostname==='localhost'||u.hostname==='127.0.0.1')&&u.port==='8080'))return null;
      return u.pathname;
    } catch (_) { return null; }
  }
  async function listCurrentVideos() {
    const dir=currentFolderPath();
    if (!dir) throw new Error('Najpierw otwórz folder z filmami.');
    const reply=await fetch(dir,{
      method:'PROPFIND',
      credentials:'same-origin',
      headers:{Depth:'1','Content-Type':'application/xml'}
    });
    if(reply.status===401||reply.status===403)
      throw new Error('Zaloguj się ponownie do WebDAV.');
    if(reply.status!==207)
      throw new Error('Nie można pobrać filmów z folderu (HTTP '+reply.status+').');
    const xml=new DOMParser().parseFromString(await reply.text(),'application/xml');
    if(xml.querySelector('parsererror'))throw new Error('Nieprawidłowa lista plików WebDAV.');
    const items=[];
    for(const row of xml.getElementsByTagNameNS('*','response')){
      const href=row.getElementsByTagNameNS('*','href')[0]?.textContent?.trim();
      const pathname=itemPath(href);
      if(!pathname||!pathname.startsWith(dir)||pathname===dir||pathname.endsWith('/'))continue;
      const relative=pathname.slice(dir.length);
      if(!relative||relative.includes('/'))continue; // no nested folders or path traversal
      const prop=row.getElementsByTagNameNS('*','propstat')[0];
      if(prop&&!/\b200\b/.test(prop.getElementsByTagNameNS('*','status')[0]?.textContent||''))continue;
      const isCollection=[...row.getElementsByTagNameNS('*','collection')].length>0;
      if(isCollection)continue;
      let name;
      try{name=decodeURIComponent(relative)}catch{continue}
      if(!filenameFromText(name))continue;
      items.push({name,url:location.origin+pathname});
    }
    return items.sort((a,b)=>a.name.localeCompare(b.name,'pl',{numeric:true}));
  }
  async function chooseFromFolder() {
    dismiss();
    const shade=elt('div',MARKER+' n2s-video-shade');
    const dialog=elt('div','n2s-video-dialog');
    dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-label','Wybierz film i odtwarzacz');
    dialog.appendChild(elt('div','n2s-video-heading','Wybierz film'));
    const info=elt('p','n2s-video-warning','Pobieram filmy z bieżącego folderu WebDAV…');
    dialog.appendChild(info);
    const close=menuRow('Zamknij');
    close.addEventListener('click',dismiss);
    dialog.appendChild(close);
    shade.appendChild(dialog);
    applyPlayerPalette(shade);
    shade.addEventListener('click',event=>{if(event.target===shade)dismiss()});
    document.body.appendChild(shade);
    menu=shade;
    close.focus();
    try {
      const items=await listCurrentVideos();
      if(menu!==shade)return;
      if(!items.length){
        info.textContent='Nie znaleziono filmów w tym folderze. Otwórz folder Filmy lub Seriale i spróbuj ponownie.';
        return;
      }
      info.textContent='Wybierz plik, a następnie odtwarzacz:';
      const list=elt('div','n2s-video-links');
      for(const item of items){
        const row=menuRow(item.name,'Wybierz aplikację do odtwarzania');
        row.addEventListener('click',()=>openMenu(item.url,()=>{
          location.assign(item.url);
        }));
        list.appendChild(row);
      }
      dialog.insertBefore(list,close);
    } catch(error) {
      if(menu===shade)info.textContent=error.message||'Nie można odczytać listy filmów.';
    }
  }
  function attachManualPlayerButton() {
    if(document.querySelector('#n2s-app') || manualButton || !document.body)return;
    manualButton=elt('button','n2s-player-entry','▶ Odtwarzacz');
    manualButton.type='button';
    manualButton.setAttribute('aria-label','Wybierz film i własny odtwarzacz');
    manualButton.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      const video=activeVideo();
      const src=video?videoSource(video):null;
      if(src)openMenu(src,()=>video.play().catch(()=>{}));
      else chooseFromFolder();
    });
    document.body.appendChild(manualButton);
  }
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',attachManualPlayerButton,{once:true});
  else attachManualPlayerButton();

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') dismiss();
  }, true);

  // Direct media links: ask how to open without breaking standard link behavior.
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.shiftKey ||
        event.metaKey || event.altKey) return;
    if (!(event.target instanceof Element) || event.target.closest('.' + MARKER) || allowNativeRowClick.has(event.target)) return;
    const anchor = event.target.closest('a[href]');
    const url = anchor ? videoLink(anchor) : null;
    if (url && !allowNativeClick.has(anchor)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openMenu(url, () => {
        allowNativeClick.add(anchor);
        try { anchor.click(); } finally { allowNativeClick.delete(anchor); }
      });
      return;
    }
    // Handle clickable native SPA file rows with a visible filename but no
    // direct link. This is the common WebDAV FS PRO folder layout.
    if (anchor) return;
    const inferred=inferVideoFromRow(event.target);
    if (!inferred) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openMenu(inferred.url, () => {
      // Open the vendor's native preview without recapturing the click.
      allowNativeRowClick.add(event.target);
      try { event.target.click(); }
      finally { allowNativeRowClick.delete(event.target); }
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