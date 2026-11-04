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
function request(path_,method='GET',authorized=false,body,accept){
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:PROXY,path:path_,method,headers:{...(authorized?{Authorization:'Basic dGVzdDp0ZXN0'}:{}),...(accept?{Accept:accept}:{})}},res=>{
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
  // A browser navigating the domain root must land at N2S CLOUD.
  // Do not redirect non-browser WebDAV requests, including GET without HTML accept.
  const landing=await request('/','GET',false,null,'text/html,application/xhtml+xml');
  assert.equal(landing.status,302,'browser homepage redirects to standalone file manager');
  assert.equal(landing.headers.location,'/n2s_cloude#');
  assert.equal(landing.headers['cache-control'],'no-store');
  const navigateWithAuth=await request('/','GET',true,null,'text/html');
  assert.equal(navigateWithAuth.status,302);
  assert.equal(navigateWithAuth.headers.location,'/n2s_cloude#');
  const apiRoot=await request('/','GET',true,null,'application/octet-stream');
  assert.equal(apiRoot.status,200,'non-browser root GET is unchanged');
  const rootQuery=await request('/?download=1','GET',true,null,'text/html');
  assert.equal(rootQuery.status,200,'querystring requests are not redirected');

  assert.equal((await request('/')).status,401,'unauthenticated GET blocked');
  assert.equal((await request('/','PROPFIND')).status,401,'unauthenticated PROPFIND blocked');
  const deniedApp=await request('/_n2s_overlay_2026/app');
  assert.equal(deniedApp.status,401,'standalone app must require authentication');
  const aliasNoAuth=await request('/n2s_cloude');
  assert.equal(aliasNoAuth.status,401,'short alias must require WebDAV login');
  const aliasAuth=await request('/n2s_cloude','GET',true);
  assert.equal(aliasAuth.status,200,'short URL opens standalone N2S');
  assert.match(aliasAuth.body,/N2S CLOUD/);
  const aliasSlash=await request('/n2s_cloude/','GET',true);
  assert.equal(aliasSlash.status,200);
  const ownApp=await request('/_n2s_overlay_2026/app','GET',true);
  assert.equal(ownApp.status,200);
  assert.match(ownApp.body,/N2S CLOUD/);
  assert.match(ownApp.body,/app\.js/);
  const ownAppJs=await request('/_n2s_overlay_2026/app.js');
  assert.equal(ownAppJs.status,200);
  assert.match(ownAppJs.body,/PROPFIND/);
  assert.match(ownAppJs.body,/dark:'Dark',light:'Light'/);
  assert.doesNotMatch(ownAppJs.body,/AMOLED Files|Catalyst Dark|File Manager Pro/);
  const ownAppCss=await request('/_n2s_overlay_2026/app.css');
  assert.equal(ownAppCss.status,200);
  assert.match(ownAppCss.body,/data-theme="dark"/);
  assert.match(ownAppCss.body,/data-theme="light"/);
  const html=await request('/','GET',true);
  assert.equal(html.status,200);
  assert.match(html.body,/_n2s_overlay_2026\/brand\.js/);
  assert.doesNotMatch(html.body, /_n2s_overlay_2026\/(?:themes\.(?:css|js)|style\.css)/, 'native WebDAV colors and icons remain intact');
  assert.match(html.body,/_n2s_overlay_2026\/video\.js/);
  assert.match(html.body,/_n2s_overlay_2026\/video\.css/);
  assert.doesNotMatch(html.body, /_n2s_overlay_2026\/themes\.js/);
  assert.doesNotMatch(html.body, /_n2s_overlay_2026\/themes\.css/);
  const js=await request('/_n2s_overlay_2026/brand.js');
  assert.match(js.body,/n2s Cloude/);
  assert.doesNotMatch(js.body,/classList\.add\('n2s-brand-text'\)/);
  const playerScript=await request('/_n2s_overlay_2026/video.js');
  assert.equal(playerScript.status,200);
  assert.match(playerScript.body,/Wybierz aplikację/);
  assert.match(playerScript.body,/org\.videolan\.vlc/);
  assert.match(playerScript.body,/intent:/);
  const playerStyle=await request('/_n2s_overlay_2026/video.css');
  assert.equal(playerStyle.status,200);
  assert.match(playerStyle.body,/n2s-video-dialog/);
  assert.doesNotMatch(html.body, /_n2s_overlay_2026\/themes\.js/);
  assert.doesNotMatch(html.body, /_n2s_overlay_2026\/themes\.css/);
  const appearance=await request('/_n2s_overlay_2026/wyglad');
  assert.equal(appearance.status,302);
  assert.equal(appearance.headers.location,'/n2s_cloude#');
  for (const old of ['themes.js','themes.css','themes/amoled.svg','themes/catalyst.svg','themes/pro.svg']) {
    assert.equal((await request('/_n2s_overlay_2026/'+old)).status,404,'old theme retired: '+old);
  }
  const dav=await request('/','PROPFIND',true);
  assert.equal(dav.status,207);
  assert.equal(dav.body,'<D:multistatus/>');
  const put=await request('/test','PUT',true,'Hello');
  assert.equal(put.status,201);
  assert.equal(put.headers['x-size'],'5');
});