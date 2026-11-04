'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const UP = 15890, PROXY = 15891;
const app = http.createServer((req,res) => {
  if(req.headers.authorization !== 'Basic dGVzdDp0ZXN0'){
    res.writeHead(401,{'WWW-Authenticate':'Basic realm="WebDAV FS"'});res.end();return;
  }
  if(req.method==='PROPFIND'){
    res.writeHead(207,{'Content-Type':'application/xml'});res.end('<D:multistatus/>');return;
  }
  if(req.method==='PUT'){
    let size=0;req.on('data',b=>size+=b.length);req.on('end',()=>{res.writeHead(201,{'X-Size':String(size)});res.end();});return;
  }
  res.writeHead(200,{'Content-Type':'text/html'});
  res.end('<!doctype html><html><head><title>WebDAV FS PRO</title></head><body><h1>WebDAV FS PRO</h1></body></html>');
});
function request(path_,method='GET',authorized=false,body){
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:PROXY,path:path_,method,headers:authorized?{Authorization:'Basic dGVzdDp0ZXN0'}:{}},res=>{
      let d='';res.on('data',b=>d+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:d}));
    });req.on('error',reject);req.end(body);
  });
}
test('N2S Overlay preserves WebDAV auth and file methods',async t=>{
  await new Promise(done=>app.listen(UP,'127.0.0.1',done));
  const child=spawn(process.execPath,[path.resolve(__dirname,'../n2s-overlay.js')],{
    env:{...process.env,N2S_UPSTREAM_PORT:String(UP),N2S_PROXY_PORT:String(PROXY)},stdio:'ignore'
  });
  t.after(()=>{child.kill();app.close();});
  let ready=false;
  for(let i=0;i<60;i++){
    try{const p=await request('/_n2s_overlay_2026/health');if(p.status===200){ready=true;break;}}
    catch(_){/* proxy starting */}
    await new Promise(done=>setTimeout(done,40));
  }
  assert.equal(ready,true,'proxy should become ready');
  assert.equal((await request('/')).status,401,'unauthenticated GET blocked');
  assert.equal((await request('/','PROPFIND')).status,401,'unauthenticated PROPFIND blocked');
  const html=await request('/','GET',true);
  assert.equal(html.status,200);
  assert.match(html.body,/_n2s_overlay_2026\/brand\.js/);
  assert.match(html.body,/_n2s_overlay_2026\/video\.js/);
  assert.match(html.body,/_n2s_overlay_2026\/video\.css/);
  const js=await request('/_n2s_overlay_2026/brand.js');
  assert.match(js.body,/N2S CLOUD/);
  const playerScript=await request('/_n2s_overlay_2026/video.js');
  assert.equal(playerScript.status,200);
  assert.match(playerScript.body,/Wybierz aplikację/);
  assert.match(playerScript.body,/org\.videolan\.vlc/);
  assert.match(playerScript.body,/intent:/);
  const playerStyle=await request('/_n2s_overlay_2026/video.css');
  assert.equal(playerStyle.status,200);
  assert.match(playerStyle.body,/n2s-video-dialog/);
  const dav=await request('/','PROPFIND',true);
  assert.equal(dav.status,207);
  assert.equal(dav.body,'<D:multistatus/>');
  const put=await request('/test','PUT',true,'Hello');
  assert.equal(put.status,201);
  assert.equal(put.headers['x-size'],'5');
});