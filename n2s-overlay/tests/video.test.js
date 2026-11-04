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
  assert.equal(shade.style.getPropertyValue('--player-text'),'rgb(28, 34, 44)');
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
