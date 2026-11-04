/* N2S CLOUD / trzy motywy inspirowane dostarczonymi wzorami.
 * Warstwa wizualna nie przechwytuje operacji WebDAV i nie zapisuje hasel.
 */
(() => {
  'use strict';
  if (window.__n2sThemesInstalled) return;
  window.__n2sThemesInstalled = true;
  // Rescue links mistakenly routed inside WebDAV FS PRO's hash-based router.
  // Browsers never send the # fragment to the server, so the native SPA shows 404.
  const APP_PATH='/n2s_cloude';
  function repairOldHashRoute() {
    const frag=window.location.hash || '';
    if (/^#\/?(?:_n2s_overlay_2026\/app|n2s_cloude)\/?(?:[?#]|$)/i.test(frag)) {
      window.location.replace(window.location.origin+APP_PATH);
      return true;
    }
    return false;
  }
  if (repairOldHashRoute()) return;
  window.addEventListener('hashchange',repairOldHashRoute);
  const KEY = 'n2s.ui.theme.v1';
  const THEMES = [
    {id:'amoled', title:'AMOLED Files', note:'Czerń, duże wiersze i niebieskie ikony. Telefon.'},
    {id:'catalyst', title:'Catalyst Dark', note:'Antracyt, pomarańczowe akcenty i lekki połysk.'},
    {id:'pro', title:'File Manager Pro', note:'Kontrastowy ciemny panel, zwarta lista i drzewo plików.'}
  ];
  const P = '/_n2s_overlay_2026/';
  let chosen = 'catalyst';
  try {
    const stored = localStorage.getItem(KEY);
    if (THEMES.some(t => t.id === stored)) chosen = stored;
  } catch (_) {}
  document.documentElement.dataset.n2sTheme = chosen;

  const make = (tag, klass, text) => {
    const node = document.createElement(tag);
    if (klass) node.className = klass;
    if (typeof text === 'string') node.textContent = text;
    return node;
  };
  const setTheme = id => {
    if (!THEMES.some(t => t.id === id)) return;
    chosen = id;
    document.documentElement.dataset.n2sTheme = id;
    const badge = document.querySelector('#n2s-active-theme');
    if (badge) badge.textContent = THEMES.find(t => t.id === id).title;
    try { localStorage.setItem(KEY, id); } catch (_) {}
    document.querySelectorAll('.n2s-theme-card').forEach(card => {
      const selected = card.dataset.theme === id;
      card.setAttribute('aria-pressed', String(selected));
      card.classList.toggle('is-selected', selected);
    });
    const selectedName = document.querySelector('.n2s-theme-current');
    if (selectedName) selectedName.textContent = THEMES.find(t=>t.id===id).title;
  };

  function build() {
    if (!document.body || document.querySelector('#n2s-theme-root')) return;
    const root = make('div', 'n2s-theme-root');
    root.id = 'n2s-theme-root';
    const activeBadge = make('div', 'n2s-active-theme');
    activeBadge.id = 'n2s-active-theme';
    activeBadge.textContent = THEMES.find(t=>t.id===chosen).title;
    activeBadge.setAttribute('aria-live','polite');
    const toggle = make('button','n2s-theme-toggle','Motyw');
    toggle.type='button';
    toggle.setAttribute('aria-label','Wybierz wygląd N2S CLOUD');
    toggle.setAttribute('aria-controls','n2s-theme-panel');
    toggle.setAttribute('aria-expanded','false');
    const panel=make('section','n2s-theme-panel');
    panel.id='n2s-theme-panel';
    panel.hidden=true;
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label','Wybierz motyw N2S CLOUD');
    panel.appendChild(make('div','n2s-theme-title','Motywy N2S CLOUD'));
    const sub=make('p','n2s-theme-subtitle','Zmiana wyglądu bez zmieniania plików, logowania ani WebDAV.');
    panel.appendChild(sub);
    const current=make('p','n2s-theme-status');
    current.append('Aktywny: ');
    const currentName=make('strong','n2s-theme-current',THEMES.find(t=>t.id===chosen).title);
    current.appendChild(currentName);
    panel.appendChild(current);
    const grid=make('div','n2s-theme-grid');
    THEMES.forEach(t=>{
      const card=make('button','n2s-theme-card');
      card.type='button';
      card.dataset.theme=t.id;
      const pic=make('img','n2s-theme-preview');
      pic.alt='Podgląd: '+t.title;
      pic.src=P+'themes/'+t.id+'.svg';
      pic.loading='lazy';
      card.appendChild(pic);
      card.appendChild(make('span','n2s-theme-name',t.title));
      card.appendChild(make('small','n2s-theme-desc',t.note));
      card.addEventListener('click',()=>setTheme(t.id));
      grid.appendChild(card);
    });
    panel.appendChild(grid);
    const actions=make('div','n2s-theme-actions');
    const close=make('button','n2s-theme-close','Zamknij');
    close.type='button';
    close.addEventListener('click',()=>open(false));
    actions.appendChild(close);
    panel.appendChild(actions);
    const open=(flag)=>{
      const show=typeof flag==='boolean'?flag:panel.hidden;
      panel.hidden=!show;
      toggle.setAttribute('aria-expanded', String(show));
      if(show) close.focus();
      else toggle.focus();
    };
    toggle.addEventListener('click',()=>open());
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&!panel.hidden) open(false);
    });
    // Direct, native-location navigation. Never let the WebDAV SPA router
    // reinterpret the new interface as /#/a-folder.
    if (location.pathname !== APP_PATH && location.pathname !== APP_PATH+'/') {
      const launch=make('button','n2s-app-launch','Nowy interfejs');
      launch.type='button';
      launch.title='Otwórz nowy N2S CLOUD z trzema układami';
      launch.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        window.location.assign(window.location.origin+APP_PATH);
      });
      root.appendChild(launch);
    }
    root.append(activeBadge,toggle,panel);
    document.body.appendChild(root);
    setTheme(chosen);
    if (location.pathname === '/_n2s_overlay_2026/wyglad') open(true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});
  else build();
})();