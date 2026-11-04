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
 const code=factory('WebDAV n2s');
 dom.window.eval(code);
 return new Promise(resolve=>setTimeout(resolve,60)).then(()=>{
  const {document}=dom.window;
  assert.equal(document.querySelector('h1').textContent,'WebDAV n2s');
  assert.equal(document.title,'WebDAV n2s');
  const folder=document.querySelector('.original-folder');
  assert.equal(folder.textContent,'📁 Filmy');
  assert.equal(folder.getAttribute('style'),'color:rgb(1,2,3)');
  assert.equal(document.querySelectorAll('.n2s-brand-text').length,0);
  dom.window.close();
 });
});
