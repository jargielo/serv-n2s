'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const appSource=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8');
const xml='<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">'+
'<d:response><d:href>/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'+
'<d:response><d:href>/Seriale/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'+
'<d:response><d:href>/Filmy/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'+
'<d:response><d:href>/film%20testowy.mkv</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontentlength>2400000</d:getcontentlength><d:getlastmodified>Wed, 04 Nov 2026 12:00:00 GMT</d:getlastmodified></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>';
test('standalone app switches three layouts and lists real WebDAV XML',async()=>{
 const dom=new JSDOM('<!doctype html><html lang="pl"><body><div id="n2s-app"></div></body></html>',{url:'https://jargielo.gh.srv.us/_n2s_overlay_2026/app',runScripts:'outside-only'});
 const {window}=dom;
 const calls=[];
 window.fetch=async (url,opts)=>{calls.push({url,method:opts.method});return {status:207,ok:true,text:async()=>xml};};
 window.prompt=()=>null;
 window.confirm=()=>false;
 window.eval(appSource);
 await new Promise(done=>setTimeout(done,50));
 const doc=window.document;
 assert.equal(calls[0].method,'PROPFIND');
 assert.equal(calls[0].url,'/');
 assert.equal(doc.querySelectorAll('.tile').length,3);
 assert.match(doc.body.textContent,/Seriale/);
 assert.match(doc.body.textContent,/Filmy/);
 assert.match(doc.body.textContent,/film testowy.mkv/);
 assert.doesNotMatch(doc.querySelector('main').textContent,/Faktury/);
 for(const id of ['amoled','pro','catalyst']){
   const select=doc.querySelector('.layout');
   select.value=id;
   select.dispatchEvent(new window.Event('change',{bubbles:true}));
   assert.equal(doc.body.dataset.theme,id);
   assert.equal(doc.querySelector('.layout').value,id);
   assert.match(doc.querySelector('main').textContent,/Seriale/);
 }
 const input=doc.querySelector('input.search');
 input.value='film';
 input.dispatchEvent(new window.Event('input',{bubbles:true}));
 assert.equal(doc.querySelectorAll('.tile').length,2);
 assert.match(doc.querySelector('#n2s-files').textContent,/film testowy/);
 assert.ok(!doc.querySelector('#n2s-files').textContent.includes('Seriale'));
 window.close();
});
