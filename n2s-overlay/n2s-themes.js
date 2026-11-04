/* N2S CLOUD / trzy motywy inspirowane dostarczonymi wzorami.
 * Warstwa wizualna nie przechwytuje operacji WebDAV i nie zapisuje hasel.
 */
(() => {
  'use strict';
  if (window.__n2sThemesInstalled) return;
  window.__n2sThemesInstalled = true;
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
    root.append(toggle,panel);
    document.body.appendChild(root);
    setTheme(chosen);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});
  else build();
})();