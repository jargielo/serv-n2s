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
test('removes stale WebDAV hash route from independent N2S browser URL',async()=>{
 const dom=new JSDOM('<!doctype html><html><body><div id="n2s-app"></div></body></html>',{
   url:'https://jargielo.gh.srv.us/n2s_cloude#/',runScripts:'outside-only'
 });
 const {window}=dom;
 window.fetch=async()=>({status:207,ok:true,text:async()=>xml});
 window.eval(appSource);
 await new Promise(resolve=>setTimeout(resolve,40));
 assert.equal(window.location.pathname,'/n2s_cloude');
 assert.equal(window.location.hash,'');
 assert.ok(window.document.querySelector('.layout'));
 window.close();
});
test('N2S CLOUD offers saved video player preference and direct selection from film rows',async()=>{
 const dom=new JSDOM('<!doctype html><html><body><div id="n2s-app"></div></body></html>',{
  url:'https://jargielo.gh.srv.us/n2s_cloude',runScripts:'outside-only'
 });
 const {window}=dom;
 const opened=[];
 window.fetch=async()=>({status:207,ok:true,text:async()=>xml});
 window.n2sOpenPlayer=(url,options)=>{opened.push({url,preferred:options.preferred});return true};
 window.eval(appSource);
 await new Promise(resolve=>setTimeout(resolve,50));
 const doc=window.document;
 const select=doc.querySelector('#n2s-default-player');
 assert.ok(select);
 assert.deepEqual([...select.options].map(o=>o.value),['ask','system','vlc','mx','mxpro','arc']);
 select.value='vlc';
 select.dispatchEvent(new window.Event('change',{bubbles:true}));
 assert.equal(window.localStorage.getItem('n2s.app.player'),'vlc');
 const video=[...doc.querySelectorAll('.mainbtn')].find(x=>x.textContent.includes('film testowy.mkv'));
 assert.ok(video);
 video.click();
 assert.equal(opened.length,1);
 assert.equal(opened[0].preferred,'vlc');
 assert.match(opened[0].url,/film%20testowy.mkv$/);
 assert.equal(doc.querySelector('.n2s-video-dialog'),null,'player API owns the dialog');
 window.close();
});
test('standalone app switches only Dark and Light and lists real WebDAV XML',async()=>{
 const dom=new JSDOM('<!doctype html><html lang="pl"><body><div id="n2s-app"></div></body></html>',{url:'https://jargielo.gh.srv.us/_n2s_overlay_2026/app',runScripts:'outside-only'});
 const {window}=dom;
 const calls=[];
 window.fetch=async (url,opts)=>{calls.push({url,method:opts.method});return {status:207,ok:true,text:async()=>xml};};
 window.prompt=()=>null;
 window.confirm=()=>false;
 window.eval(appSource);
 await new Promise(done=>setTimeout(done,50));
 const doc=window.document;
 const zoom=doc.querySelector('#n2s-zoom-slider');
 assert.ok(zoom,'slider for page scaling');
 assert.equal(zoom.value,'100');
 zoom.value='125';
 zoom.dispatchEvent(new window.Event('input',{bubbles:true}));
 assert.equal(doc.querySelector('#n2s-zoom-value').textContent,'125%');
 assert.equal(doc.querySelector('#n2s-app').style.zoom,'1.25');
 assert.equal(window.localStorage.getItem('n2s.app.zoom'),'125');
 doc.querySelector('#n2s-zoom-value').click();
 assert.equal(doc.querySelector('#n2s-app').style.zoom,'1');
 assert.equal(doc.querySelector('#n2s-zoom-value').textContent,'100%');
 assert.equal(calls[0].method,'PROPFIND');
 assert.equal(calls[0].url,'/');
 assert.equal(doc.querySelectorAll('.tile').length,3);
 assert.match(doc.body.textContent,/Seriale/);
 assert.match(doc.body.textContent,/Filmy/);
 assert.match(doc.body.textContent,/film testowy.mkv/);
 assert.doesNotMatch(doc.querySelector('main').textContent,/Faktury/);
 assert.deepEqual([...doc.querySelectorAll('.layout option')].map(x=>x.value),['dark','light']);
 for(const id of ['dark','light']){
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
 const css=fs.readFileSync(path.resolve(__dirname,'../app.css'),'utf8');
 assert.match(css,/body\[data-theme="dark"\]/);
 assert.match(css,/body\[data-theme="light"\]/);
 assert.doesNotMatch(css,/body\[data-theme=(?:amoled|pro|catalyst)\]/);
 window.close();
});
