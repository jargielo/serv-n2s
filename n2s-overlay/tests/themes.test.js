'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const script = fs.readFileSync(path.resolve(__dirname, '../n2s-themes.js'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../n2s-themes.css'), 'utf8');
test('all three themes update live and persist without removing any WebDAV files', async () => {
  const dom = new JSDOM('<!doctype html><html lang="pl"><body><main><a href="/Filmy/test.mkv">Film</a><button id="upload">Przeslij</button></main></body></html>', {
    url: 'https://jargielo.gh.srv.us/', runScripts: 'outside-only'
  });
  dom.window.eval(script);
  await new Promise(resolve => setTimeout(resolve, 30));
  const {document,localStorage} = dom.window;
  assert.equal(document.querySelectorAll('.n2s-theme-card').length, 3);
  const launch=document.querySelector('.n2s-app-launch');
  assert.ok(launch, 'standalone app launcher is visible on old UI');
  assert.equal(launch.textContent, 'Nowy interfejs');
  for (const name of ['amoled','catalyst','pro']) {
    document.querySelector('.n2s-theme-card[data-theme="'+name+'"]').click();
    assert.equal(document.documentElement.dataset.n2sTheme,name);
    assert.equal(localStorage.getItem('n2s.ui.theme.v1'),name);
    assert.equal(document.querySelector('.n2s-theme-card[aria-pressed="true"]').dataset.theme,name);
    assert.equal(document.querySelector('#n2s-active-theme').textContent,
      ({amoled:'AMOLED Files',catalyst:'Catalyst Dark',pro:'File Manager Pro'})[name]);
    assert.ok(css.includes('data-n2s-theme="'+name+'"'));
  }
  assert.equal(document.querySelector('#upload').textContent,'Przeslij');
  assert.equal(document.querySelector('main a').getAttribute('href'),'/Filmy/test.mkv');
});
