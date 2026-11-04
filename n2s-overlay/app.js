(() => {
'use strict';
const root=document.getElementById('n2s-app');
const styles={dark:'Dark',light:'Light'};
const state={theme:'dark',dir:'/',files:[],filter:'',view:'grid',busy:false,zoom:100};
try{
 const storedZoom=Number(localStorage.getItem('n2s.app.zoom'));
 if(Number.isFinite(storedZoom) && storedZoom>=75 && storedZoom<=150 && storedZoom%5===0)state.zoom=storedZoom;
}catch{}
function applyZoom(value){
 const z=Number(value);
 if(!Number.isFinite(z))return;
 state.zoom=Math.max(75,Math.min(150,Math.round(z/5)*5));
 root.style.zoom=String(state.zoom/100);
 const label=document.getElementById('n2s-zoom-value');
 if(label)label.textContent=state.zoom+'%';
 const slider=document.getElementById('n2s-zoom-slider');
 if(slider)slider.value=String(state.zoom);
 try{localStorage.setItem('n2s.app.zoom',String(state.zoom))}catch{}
}
function zoomControls(){
 const group=mk('div','zoom-controls');
 group.setAttribute('role','group');
 group.setAttribute('aria-label','Skalowanie interfejsu');
 const minus=btn('−','zoom-button',()=>applyZoom(state.zoom-5));
 minus.setAttribute('aria-label','Pomniejsz');
 const slider=mk('input','zoom-slider');
 slider.type='range';slider.min='75';slider.max='150';slider.step='5';
 slider.id='n2s-zoom-slider';slider.value=String(state.zoom);
 slider.setAttribute('aria-label','Skala interfejsu w procentach');
 slider.addEventListener('input',()=>applyZoom(slider.value));
 const plus=btn('+','zoom-button',()=>applyZoom(state.zoom+5));
 plus.setAttribute('aria-label','Powiększ');
 const display=btn(state.zoom+'%','zoom-value',()=>applyZoom(100));
 display.id='n2s-zoom-value';display.title='Przywróć 100%';
 display.setAttribute('aria-label','Skala '+state.zoom+' procent. Kliknij, aby przywrócić 100 procent');
 return append(group,minus,slider,plus,display);
}
const VIDEO=/\.(mp4|mkv|avi|webm|mov|m4v|wmv|flv|ts|m2ts|mpeg|mpg|ogv)$/i;
const IMAGE=/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
const AUDIO=/\.(flac|mp3|wav|m4a|aac|opus|ogg)$/i;
const DOC=/\.(pdf|docx?|xlsx?|pptx?|odt|txt|md)$/i;
const icon=e=>e.folder?'📁':VIDEO.test(e.name)?'🎬':IMAGE.test(e.name)?'🖼️':AUDIO.test(e.name)?'🎵':DOC.test(e.name)?'📄':'📦';
const mk=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e};
const btn=(text,cls,handler)=>{const e=mk('button',cls,text);e.type='button';if(handler)e.addEventListener('click',handler);return e};
const append=(node,...children)=>{node.append(...children.filter(Boolean));return node};
const toast=message=>{document.querySelector('.toast')?.remove();const node=mk('div','toast',message);document.body.append(node);setTimeout(()=>node.remove(),4500)};
function saveTheme(value){if(!styles[value])return;state.theme=value;document.body.dataset.theme=value;try{localStorage.setItem('n2s.app.theme',value)}catch{}render()}
try{const t=localStorage.getItem('n2s.app.theme');if(styles[t])state.theme=t}catch{}
function localPath(href){const u=new URL(href,location.origin);if(u.origin!==location.origin && !((u.hostname==='127.0.0.1'||u.hostname==='localhost')&&u.port==='8080'&&u.protocol==='http:'))throw Error('Nieprawidłowa ścieżka pliku');return u.pathname+u.search}
function filePath(name,isFolder=false){if(!name||name==='.'||name==='..'||/[/\\\r\n\0]/.test(name))throw Error('Nieprawidłowa nazwa pliku');return state.dir.replace(/\/?$/,'/')+encodeURIComponent(name)+(isFolder?'/':'')}
const size=n=>n==null?'—':n>=1073741824?(n/1073741824).toFixed(1)+' GB':n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?(n/1024).toFixed(0)+' KB':n+' B';
const date=s=>{const d=new Date(s);return !s||isNaN(d)?'—':d.toLocaleDateString('pl-PL')};
function parseXml(raw,dir){
 const xml=new DOMParser().parseFromString(raw,'application/xml');
 if(xml.getElementsByTagName('parsererror').length)throw Error('Błędna odpowiedź XML');
 const nodes=[...xml.getElementsByTagNameNS('*','response')];
 if(!nodes.length)throw Error('Nie znaleziono odpowiedzi PROPFIND');
 const files=[];
 for(const n of nodes){
  const get=k=>n.getElementsByTagNameNS('*',k)[0];
  const rawHref=get('href')?.textContent?.trim();if(!rawHref)continue;
  let href;try{href=localPath(rawHref)}catch{continue}
  if(decodeURI(new URL(href,location.origin).pathname).replace(/\/$/,'')===decodeURI(new URL(dir,location.origin).pathname).replace(/\/$/,''))continue;
  const valid=[...n.getElementsByTagNameNS('*','propstat')].find(p=>/\b200\b/.test(p.getElementsByTagNameNS('*','status')[0]?.textContent||''))||n;
  const prop=k=>valid.getElementsByTagNameNS('*',k)[0];
  const folder=!!prop('resourcetype')?.getElementsByTagNameNS('*','collection').length||href.endsWith('/');
  const part=new URL(href,location.origin).pathname.replace(/\/$/,'').split('/').pop();
  let name;try{name=decodeURIComponent(part)}catch{name=part}
  const rawSize=prop('getcontentlength')?.textContent;
  const length=rawSize==null?null:Number(rawSize);
  files.push({href,name,folder,size:Number.isFinite(length)?length:null,modified:prop('getlastmodified')?.textContent||''});
 }
 return files.sort((a,b)=>Number(b.folder)-Number(a.folder)||a.name.localeCompare(b.name,'pl',{numeric:true}));
}
async function request(url,method='PROPFIND',extra={}){
 const response=await fetch(url,{method,credentials:'same-origin',headers:{...(method==='PROPFIND'?{Depth:'1','Content-Type':'application/xml'}:{}),...extra.headers},body:extra.body,redirect:'manual'});
 if(response.status===401)throw Error('Brak autoryzacji WebDAV — zaloguj się ponownie.');
 if(!response.ok&&response.status!==207)throw Error('WebDAV: HTTP '+response.status);
 return response;
}
async function browse(path=state.dir){
 if(state.busy)return;
 state.dir=localPath(path).replace(/\/?$/,'/');state.busy=true;render();
 try{const r=await request(state.dir);state.files=parseXml(await r.text(),state.dir)}
 catch(e){state.files=[];toast('Odczyt katalogu: '+e.message)}
 finally{state.busy=false;render()}
}
function trail(){const box=mk('div','crumb');box.append(btn('Mój dysk','',()=>browse('/')));let current='/';for(const seg of state.dir.split('/').filter(Boolean)){current+=seg+'/';const dir=current;append(box,mk('span','muted',' / '),btn(decodeURIComponent(seg),'',()=>browse(dir)))}return box}
function openFile(file){
 if(file.folder){state.filter='';browse(file.href);return}
 if(VIDEO.test(file.name)){
  const a=mk('a');a.href=file.href;a.textContent=file.name;a.style.display='none';document.body.append(a);a.click();setTimeout(()=>a.remove(),250);return;
 }
 window.open(file.href,'_blank','noopener,noreferrer');
}
function popMenu(file){
 document.querySelector('.menu')?.remove();
 const menu=mk('div','menu');
 const actions=[['Otwórz',()=>openFile(file)],['Pobierz',()=>{const a=mk('a');a.href=file.href;a.download=file.name;document.body.append(a);a.click();a.remove()}],['Kopiuj adres',async()=>{try{await navigator.clipboard.writeText(new URL(file.href,location.href).href);toast('Skopiowano adres')}catch{toast('Kopiowanie niedostępne')}}],['Zmień nazwę',()=>rename(file)],['Usuń',()=>remove(file)]];
 for(const [label,fn]of actions)menu.append(btn(label,'',()=>{menu.remove();fn()}));
 document.body.append(menu);setTimeout(()=>{const closer=e=>{if(!menu.contains(e.target)){menu.remove();document.removeEventListener('pointerdown',closer,true)}};document.addEventListener('pointerdown',closer,true)},20);
}
function filtered(){return state.files.filter(x=>x.name.toLocaleLowerCase('pl').includes(state.filter.toLocaleLowerCase('pl')))}
function filesView(){
 const items=filtered();if(state.busy)return mk('div','empty','Wczytywanie folderu…');if(!items.length)return mk('div','empty',state.filter?'Brak wyników wyszukiwania':'Folder jest pusty');
 const box=mk('div',state.view==='list'?'list':'tiles');
 for(const file of items){
  const list=box.className==='list';const row=mk('div',list?'row':'tile');
  const open=btn('',list?'mainbtn':'mainbtn',()=>openFile(file));
  append(open,mk('span','glyph',icon(file)),append(mk('span','label'),mk('span','',file.name)));
  if(!list)open.append(mk('span','meta',file.folder?'Folder':size(file.size)));
  const more=btn('⋮','more',()=>popMenu(file));more.setAttribute('aria-label','Opcje '+file.name);
  if(list)append(row,open,mk('span','size muted',file.folder?'Folder':size(file.size)),mk('span','date muted',date(file.modified)),more);
  else append(row,open,more);
  box.append(row);
 }
 return box;
}
function renderFiles(){const slot=document.getElementById('n2s-files');if(slot)slot.replaceChildren(filesView())}
function header(){
 const h=mk('header');const logo=append(mk('div','brand'),mk('span','','☁ N2S '),mk('b','','CLOUD'));
 const search=mk('input','search');search.placeholder='Szukaj w folderze';search.value=state.filter;search.setAttribute('aria-label','Szukaj w folderze');search.addEventListener('input',()=>{state.filter=search.value;renderFiles()});
 const select=mk('select','layout');select.title='Wybierz motyw';
 for(const [id,label] of Object.entries(styles)){const o=mk('option','',label);o.value=id;o.selected=state.theme===id;select.append(o)}
 select.addEventListener('change',()=>saveTheme(select.value));
 return append(h,logo,search,select,zoomControls());
}
function side(){
 const n=mk('aside');n.append(mk('div','caption','Nawigacja'));
 const actions=[['▣  Pliki i foldery',()=>browse('/')],['↻  Odśwież',()=>browse()],['＋  Nowy folder',newFolder],['⬆  Prześlij',()=>document.getElementById('n2s-upload').click()]];
 for(const [name,fn]of actions)n.append(btn(name,'',fn));
 n.append(mk('div','caption','WebDAV FS PRO • prywatny serwer plików'));
 return n;
}
function bar(){
 const box=mk('div','bar');append(box,trail(),btn('↻','btn',()=>browse()),btn('＋ Folder','btn',newFolder),btn('⬆ Prześlij','btn primary',()=>document.getElementById('n2s-upload').click()));
 const view=btn(state.view==='grid'?'☰ Lista':'▦ Siatka','btn',()=>{state.view=state.view==='grid'?'list':'grid';render()});box.append(view);return box;
}
function stats(){
 const box=mk('div','stats');const folders=state.files.filter(f=>f.folder).length;
 for(const [name,val]of [['Foldery',folders],['Pliki',state.files.length-folders],['Serwer','WebDAV']]){
  const s=mk('div','stat');append(s,mk('small','muted',name),mk('strong','',val));box.append(s)
 }return box;
}
function bottom(){
 const n=mk('div','bottom');
 for(const [name,icon,fn]of [['Pliki','▣',()=>browse('/')],['Odśwież','↻',()=>browse()],['Dodaj','＋',newFolder],['Motyw','◐',()=>{const keys=Object.keys(styles);saveTheme(keys[(keys.indexOf(state.theme)+1)%keys.length]);toast('Motyw: '+styles[state.theme])}]])append(n,append(btn('','',fn),mk('b','',icon),mk('span','',name)));
 return n;
}
function render(){
 document.body.dataset.theme=state.theme;
 const shell=mk('div','shell');const main=mk('main');append(main,mk('h1','','Moje pliki'),mk('p','muted',(state.busy?'Wczytywanie…':state.files.length+' elementów')+' · '+styles[state.theme]),bar());


 main.append(mk('h2','','Pliki i foldery'));
 const slot=mk('div');slot.id='n2s-files';main.append(slot);
 main.append(mk('p','muted','Źródło danych: Twój WebDAV FS PRO. Nie używamy przykładowych katalogów.'));
 shell.append(side(),main);
 const inp=mk('input');inp.id='n2s-upload';inp.type='file';inp.multiple=true;inp.hidden=true;inp.addEventListener('change',()=>upload(inp.files));
 root.replaceChildren(header(),shell,bottom(),inp);applyZoom(state.zoom);renderFiles();
}
function newFolder(){const name=prompt('Nazwa folderu:');if(name===null)return;try{request(filePath(name,true),'MKCOL').then(()=>browse()).catch(e=>toast(e.message))}catch(e){toast(e.message)}}
async function upload(files){if(!files?.length)return;for(const f of files){try{await request(filePath(f.name),'PUT',{headers:{'Content-Type':f.type||'application/octet-stream'},body:f});toast('Przesłano '+f.name)}catch(e){toast('Błąd '+f.name+': '+e.message)}}browse()}
async function rename(file){const name=prompt('Nowa nazwa:',file.name);if(name===null||name===file.name)return;try{const target=filePath(name,file.folder);await request(file.href,'MOVE',{headers:{Destination:new URL(target,location.origin).href,Overwrite:'F'}});browse()}catch(e){toast('Zmiana nazwy: '+e.message)}}
async function remove(file){if(!confirm('Na pewno usunąć '+file.name+'?'))return;try{await request(file.href,'DELETE');browse()}catch(e){toast('Usuwanie: '+e.message)}}
render();browse('/');
})();