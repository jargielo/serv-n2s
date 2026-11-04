'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

const script = fs.readFileSync(path.resolve(__dirname, '../n2s-video.js'), 'utf8');
const BASE = 'https://jargielo.gh.srv.us';

function makeDom(body) {
  const dom = new JSDOM('<!doctype html><html><head><title>N2S CLOUD</title></head><body>' + body + '</body></html>',
    {url: BASE+'/', runScripts:'outside-only', pretendToBeVisual:true});
  // jsdom does not implement navigation; suppress browser defaults while still
  // allowing N2S capture listeners to be exercised.
  dom.window.document.addEventListener('click', event => {
    if (event.target.closest?.('a[href]')) event.preventDefault();
  });
  dom.window.fetch = async (url, options) => {
    assert.equal(url, '/_n2s_overlay_2026/media-grant');
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers['X-N2S-Playback'], '1');
    const req = JSON.parse(options.body);
    assert.ok(req.path.endsWith('.mkv') || req.path.endsWith('.mp4'));
    const name = req.path.split('/').pop();
    return {ok:true, json:async() => ({
      url:'/_n2s_overlay_2026/media-stream/' + 'a'.repeat(43) + '/' + name,
      expiresInSeconds:14400
    })};
  };
  dom.window.eval(script);
  return dom;
}

test('clicking a video file offers Android chooser, MX Player, Arc Player and VLC without exposing credentials', async () => {
  const dom = makeDom('<a id="film" href="/Filmy/film%20testowy.mkv">film testowy.mkv</a>');
  const {document, MouseEvent} = dom.window;
  const anchor = document.getElementById('film');
  anchor.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, button:0}));
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog, 'video selection dialog exists');
  assert.match(dialog.textContent, /Odtwórz tutaj/);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.match(dialog.textContent, /Wybierz aplikację/);
  assert.match(dialog.textContent, /VLC/);
  const links = [...dialog.querySelectorAll('a[href^="intent:"]')];
  assert.equal(links.length, 5);
  assert.ok(links[0].getAttribute('href').includes('film%20testowy.mkv'));
  assert.ok(links[0].getAttribute('href').includes('/media-stream/'));
  assert.ok(!links[0].getAttribute('href').includes('/Filmy/'));
  assert.match(links[1].getAttribute('href'), /com\.mxtech\.videoplayer\.ad/);
  assert.match(links[2].getAttribute('href'), /com\.mxtech\.videoplayer\.pro/);
  assert.match(links[0].getAttribute('href'), /action=android.intent.action.VIEW/);
  assert.match(links[3].getAttribute('href'), /package=com\.videoplayer\.arcplayer/);
  assert.match(links[4].getAttribute('href'), /package=org\.videolan\.vlc/);
  assert.ok(!links[0].getAttribute('href').includes('@'));
});

test('nonvideo links, SPA hash routes, and URLs with embedded login are not intercepted', () => {
  const dom = makeDom(
    '<a id="txt" href="/dokument.txt">tekst</a>' +
    '<a id="route" href="/#/Filmy/test.mp4">router</a>' +
    '<a id="bad" href="https://user:secret@jargielo.gh.srv.us/movie.mp4">secret</a>'
  );
  const {document, MouseEvent} = dom.window;
  for(const id of ['txt','route','bad']) {
    document.getElementById(id).dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, button:0}));
    assert.equal(document.querySelector('[role="dialog"]'),null, 'no menu for '+id);
  }
});

test('visible HTML video preview gets an external player action', async () => {
  const dom = makeDom('<video id="film" src="/Filmy/wideo.mp4"></video>');
  const vid = dom.window.document.getElementById('film');
  vid.getBoundingClientRect = ()=>({width:600,height:340,top:50,right:650,bottom:390,left:50});
  await new Promise(resolve=>setTimeout(resolve,100));
  const btn = dom.window.document.querySelector('.n2s-video-pick');
  assert.ok(btn, 'video preview has external player control');
  btn.click();
  await new Promise(resolve=>setTimeout(resolve,30));
  const dialog = dom.window.document.querySelector('[role="dialog"]');
  assert.ok(dialog);
  assert.match(dialog.textContent,/wideo.mp4/);
});

test('native WebDAV player menu uses live header palette rather than hard-coded blue', async () => {
  const dom = makeDom(
    '<header style="background-color:rgb(234, 237, 240)">WebDAV n2s</header>' +
    '<a href="/Filmy/video.mp4" id="film">Film</a>'
  );
  const {document,MouseEvent} = dom.window;
  document.getElementById('film').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
  const shade = document.querySelector('.n2s-video-shade');
  assert.ok(shade);
  assert.equal(shade.dataset.n2sPlayerSkin,'native');
  assert.equal(shade.style.getPropertyValue('--player-panel'),'rgb(234, 237, 240)');
  assert.equal(shade.style.getPropertyValue('--player-text'),'rgb(30, 37, 50)');
  assert.equal(document.querySelectorAll('.n2s-video-action').length>0,true);
});

test('independent N2S menu follows active theme without overriding its CSS tokens', async () => {
  const dom = makeDom(
    '<div id="n2s-app"></div>' +
    '<a href="/Filmy/video.mp4" id="film">Film</a>'
  );
  const {document,MouseEvent} = dom.window;
  document.body.style.setProperty('--panel','#050609');
  document.body.style.setProperty('--accent','#44c4ff');
  document.body.setAttribute('data-theme','amoled');
  document.getElementById('film').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
  const shade = document.querySelector('.n2s-video-shade');
  assert.ok(shade);
  assert.equal(shade.dataset.n2sPlayerSkin,'app');
  assert.equal(shade.style.getPropertyValue('--player-panel'),'');
  document.body.dataset.theme='catalyst';
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(shade.dataset.n2sPlayerSkin,'app');
  assert.equal(shade.style.getPropertyValue('--player-accent'),'');
  // The dialog stays in the DOM and uses the inherited current theme variables.
  assert.ok(document.querySelector('.n2s-video-dialog'));
});

test('player CSS uses active application tokens, not fixed buttons', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../n2s-video.css'),'utf8');
  const html = fs.readFileSync(path.resolve(__dirname, '../app.html'),'utf8');
  assert.match(css, /--player-panel:\s*var\(--panel/);
  assert.match(css, /background:\s*var\(--player-button\)\s*!important/);
  assert.match(css, /color:\s*var\(--player-text\)\s*!important/);
  assert.match(html, /_n2s_overlay_2026\/video\.css/);
});

test('WebDAV light appearance without a semantic header produces a light player menu', () => {
  const dom=makeDom('<div class="native-top" style="background-color:rgb(221,228,240)">WebDAV FS PRO</div><a id="film" href="/Filmy/wideo.mp4">Film</a>');
  const {document,MouseEvent}=dom.window;
  document.body.style.backgroundColor='rgb(248,249,251)';
  document.getElementById('film').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
  const menu=document.querySelector('.n2s-video-shade');
  assert.ok(menu);
  assert.equal(menu.dataset.n2sPlayerSkin,'native');
  assert.equal(menu.style.getPropertyValue('--player-panel'),'rgb(248, 249, 251)');
  assert.equal(menu.style.getPropertyValue('--player-text'),'rgb(30, 37, 50)');
});

test('WebDAV dark appearance without a semantic header produces a dark player menu', () => {
  const dom=makeDom('<div class="native-top" style="background-color:rgb(35,43,57)">WebDAV FS PRO</div><a id="film" href="/Filmy/wideo.mp4">Film</a>');
  const {document,MouseEvent}=dom.window;
  document.body.style.backgroundColor='rgb(26,31,43)';
  document.getElementById('film').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
  const menu=document.querySelector('.n2s-video-shade');
  assert.ok(menu);
  assert.equal(menu.dataset.n2sPlayerSkin,'native');
  assert.equal(menu.style.getPropertyValue('--player-panel'),'rgb(26, 31, 43)');
  assert.equal(menu.style.getPropertyValue('--player-text'),'rgb(247, 249, 252)');
});


test('clicking filename inside WebDAV hash-folder row offers external players', async () => {
  const dom=makeDom('<div class="file-row"><div class="filename" id="item">Rafał Rutkowski Sezon 1 Odcinek 1.mp4</div><button id="options">⋮</button></div>');
  dom.window.location.hash='#/Seriale';
  const {document,MouseEvent}=dom.window;
  const item=document.getElementById('item');
  let vendorClick=0;
  item.addEventListener('click',()=>vendorClick++);
  item.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
  assert.equal(vendorClick,0,'native preview prevented until explicit user choice');
  const dialog=document.querySelector('.n2s-video-dialog');
  assert.ok(dialog,'video player menu appears for non-link row filename');
  assert.match(dialog.textContent,/Rafał Rutkowski/);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.match(dialog.textContent,/MX Player/);
  assert.match(dialog.textContent,/Arc Player/);
  const choice=[...dialog.querySelectorAll('a[href^="intent:"]')][0];
  assert.doesNotMatch(choice.href,/\/Seriale\//, 'temporary stream URL must not disclose original folder');
  assert.match(choice.href,/Rafa%C5%82%20Rutkowski/);
  dialog.querySelector('.n2s-video-action').click();
  assert.equal(vendorClick,1,'native preview opens after choosing in-browser playback');
});

test('native WebDAV three dot menu and folder names are not intercepted', () => {
  const dom=makeDom('<div class="file-row"><div id="name">Seriale</div><button id="opts">⋮</button></div>');
  dom.window.location.hash='#/Filmy';
  const {document,MouseEvent}=dom.window;
  document.querySelector('#name').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
  document.querySelector('#opts').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
  assert.equal(document.querySelector('.n2s-video-dialog'),null);
});

test('native SPA player chooser rejects invalid route paths and unrelated nodes', () => {
  const dom=makeDom('<div id="name">film.mp4</div>');
  dom.window.location.hash='#/../private';
  const {document,MouseEvent}=dom.window;
  document.querySelector('#name').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
  assert.equal(document.querySelector('.n2s-video-dialog'),null);
});


test('persistent player button lists video files from current WebDAV folder without native click interception', async () => {
 const dom=makeDom('<main><div>Seriale</div></main>');
 const {window}=dom,doc=window.document;
 window.location.hash='#/Seriale';
 const xml='<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">'+
  '<d:response><d:href>/Seriale/</d:href></d:response>'+
  '<d:response><d:href>/Seriale/odcinek%201.mkv</d:href><d:propstat><d:prop><d:getcontentlength>123</d:getcontentlength></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'+
  '<d:response><d:href>/Seriale/notatki.txt</d:href><d:propstat><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'+
  '</d:multistatus>';
 const originalFetch=window.fetch;
 const requests=[];
 window.fetch=(url,options)=>{
  if(options?.method==='PROPFIND'){
   requests.push({url,options});
   return Promise.resolve({status:207,text:async()=>xml});
  }
  return originalFetch(url,options);
 };
 await new Promise(done=>setTimeout(done,25));
 const button=doc.querySelector('.n2s-player-entry');
 assert.ok(button,'manual player chooser must be visible without any video element');
 button.click();
 await new Promise(done=>setTimeout(done,25));
 assert.equal(requests.length,1);
 assert.equal(requests[0].url,'/Seriale/');
 assert.equal(requests[0].options.credentials,'same-origin');
 const picker=doc.querySelector('.n2s-video-dialog');
 assert.match(picker.textContent,/odcinek 1\.mkv/);
 assert.doesNotMatch(picker.textContent,/notatki\.txt/);
 const rows=[...picker.querySelectorAll('button.n2s-video-action')];
 const choose=rows.find(x=>x.textContent.includes('odcinek 1.mkv'));
 assert.ok(choose);
 choose.click();
 await new Promise(done=>setTimeout(done,25));
 assert.match(doc.querySelector('.n2s-video-dialog').textContent,/MX Player/);
 assert.match(doc.querySelector('.n2s-video-dialog').textContent,/VLC/);
});

test('manual player chooser shows an understandable notice when folder is empty', async () => {
 const dom=makeDom('<main>Pliki</main>');
 const {window}=dom,doc=window.document;
 window.location.hash='#/';
 window.fetch=(url,options)=>{
  if(options?.method==='PROPFIND')return Promise.resolve({status:207,text:async()=>'<d:multistatus xmlns:d="DAV:"><d:response><d:href>/</d:href></d:response></d:multistatus>'});
  throw Error('unexpected request');
 };
 await new Promise(done=>setTimeout(done,25));
 doc.querySelector('.n2s-player-entry').click();
 await new Promise(done=>setTimeout(done,25));
 assert.match(doc.querySelector('.n2s-video-dialog').textContent,/Nie znaleziono filmów/);
});

test('media grant 401 opens masked login and retries with WebDAV authentication', async () => {
  const dom=makeDom('<a id="film" href="/Bajki/test.mp4">Film</a>');
  const {window}=dom, document=window.document;
  const requests=[];
  window.fetch=async (url,options)=>{
    assert.equal(url,'/_n2s_overlay_2026/media-grant');
    requests.push(options);
    if(!options.headers.Authorization) return {status:401,ok:false,json:async()=>({error:'Zaloguj się do WebDAV'})};
    assert.equal(options.headers.Authorization,'Basic '+Buffer.from('test:hasło','utf8').toString('base64'));
    return {status:201,ok:true,json:async()=>({url:'/_n2s_overlay_2026/media-stream/'+('a'.repeat(43))+'/test.mp4'})};
  };
  document.getElementById('film').dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
  await new Promise(resolve=>setTimeout(resolve,25));
  const authForm=document.querySelector('.n2s-auth-form');
  assert.ok(authForm,'masked login shown when WebDAV authentication is not forwarded');
  const pass=authForm.querySelector('input[name=password]');
  assert.equal(pass.type,'password');
  authForm.querySelector('input[name=username]').value='test';
  pass.value='hasło';
  authForm.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(requests.length,2);
  assert.equal(document.querySelector('.n2s-auth-form'),null);
  assert.equal(document.querySelectorAll('.n2s-video-links a[href^="intent:"]').length,5);
  assert.equal(document.body.textContent.includes('hasło'),false);
  assert.equal(document.body.innerHTML.includes('dGVzdDpoYXM'),false);
});
test('independent app bundles video dialog CSS even if standalone video stylesheet is unavailable',()=>{
  const css=fs.readFileSync(path.resolve(__dirname,'../app.css'),'utf8');
  assert.match(css,/\.n2s-video-shade\s*\{/);
  assert.match(css,/\.n2s-video-dialog\s*\{/);
  assert.match(css,/\.n2s-video-action\s*\{/);
  assert.match(css,/\.n2s-auth-shade\s*\{/);
});
