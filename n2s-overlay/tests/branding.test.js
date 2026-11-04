'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const overlay=fs.readFileSync(path.resolve(__dirname,'../n2s-overlay.js'),'utf8');
test('native WebDAV header renamed without changing folder CSS or icons',()=>{
 const match=overlay.match(/const INJECT = ([^\n]+);/);
 assert.ok(match);
 assert.doesNotMatch(match[1],/themes\.css|themes\.js|style\.css/);
 assert.match(match[1],/JS_PATH/);
 const dom=new JSDOM('<!doctype html><html><head><title>WebDAV FS PRO</title></head><body><header><h1>WebDAV FS PRO</h1></header><section><div class="original-folder" style="color:rgb(1,2,3)">📁 Filmy</div></section></body></html>',{
   url:'https://jargielo.gh.srv.us/',runScripts:'outside-only',pretendToBeVisual:true
 });
 const script=overlay.match(/function scriptForName\(name\) \{([\s\S]*?)\n\}\n\nfunction noCache/);
 assert.ok(script);
 // Evaluate the server-provided script template, without loading the server itself.
 const factory=new Function('name',script[1]);
 const code=factory('n2s Cloude');
 dom.window.eval(code);
 return new Promise(resolve=>setTimeout(resolve,60)).then(()=>{
  const {document}=dom.window;
  assert.equal(document.querySelector('h1').textContent,'n2s Cloude');
  assert.equal(document.title,'n2s Cloude');
  const folder=document.querySelector('.original-folder');
  assert.equal(folder.textContent,'📁 Filmy');
  assert.equal(folder.getAttribute('style'),'color:rgb(1,2,3)');
  assert.equal(document.querySelectorAll('.n2s-brand-text').length,0);
 });
});

test('legacy #/n2s_cloude is repaired on independent route and does not affect normal WebDAV folders',async()=>{
 const extract=overlay.match(/function scriptForName\(name\) \{([\s\S]*?)\n\}\n\nfunction noCache/);
 assert.ok(extract);
 const factory=new Function('name',extract[1]);
 const code=factory('n2s Cloude');
 const dom=new JSDOM('<!doctype html><html><body><h1>WebDAV FS PRO</h1></body></html>',{
  url:'https://jargielo.gh.srv.us/n2s_cloude#/n2s_cloude',
  runScripts:'outside-only',pretendToBeVisual:true
 });
 dom.window.eval(code);
 assert.equal(dom.window.location.pathname,'/n2s_cloude');
 assert.equal(dom.window.location.hash,'');
 const matcher=code.match(/if \(!\/(\^#.*)\/i\.test\(hash\)\)/);
 assert.ok(matcher,'hash-route matcher exists in delivered browser script');
 const re=new RegExp(matcher[1],'i');
 assert.equal(re.test('#/n2s_cloude'),true);
 assert.equal(re.test('#/n2s_cloude/'),true);
 assert.equal(re.test('#/_n2s_overlay_2026/app'),true);
 assert.equal(re.test('#/Filmy'),false);
});
