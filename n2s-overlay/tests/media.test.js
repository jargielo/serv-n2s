'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const {spawn} = require('node:child_process');

const UP = 15892, PROXY = 15893;
const NAME = '/Filmy/film%20testowy.mkv';
const AUTH = 'Basic dGVzdDp0ZXN0';
const VIDEO = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');

const upstream = http.createServer((req, res) => {
  if (req.headers.authorization !== AUTH) {
    res.writeHead(401, {'WWW-Authenticate':'Basic realm="WebDAV FS PRO"'});
    res.end(); return;
  }
  if (req.url !== NAME) {
    res.writeHead(404); res.end(); return;
  }
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!m) { res.writeHead(416); res.end(); return; }
    const start = Number(m[1]), end = m[2] ? Number(m[2]) : VIDEO.length - 1;
    if (start >= VIDEO.length || end < start) {res.writeHead(416);res.end();return;}
    const slice = VIDEO.subarray(start, Math.min(end+1, VIDEO.length));
    res.writeHead(206, {'Content-Type':'video/x-matroska','Content-Length':slice.length,
      'Content-Range': 'bytes ' + start + '-' + (start + slice.length - 1) + '/' + VIDEO.length,
      'Accept-Ranges':'bytes'});
    res.end(req.method === 'HEAD' ? undefined : slice);
  } else {
    res.writeHead(200, {'Content-Type':'video/x-matroska','Content-Length':VIDEO.length,'Accept-Ranges':'bytes'});
    res.end(req.method === 'HEAD' ? undefined : VIDEO);
  }
});

function request(path_, method='GET', headers={}, body) {
  return new Promise((resolve,reject) => {
    const r = http.request({hostname:'127.0.0.1',port:PROXY,path:path_,method,headers}, res => {
      const chunks=[];
      res.on('data', c=>chunks.push(c));
      res.on('end', ()=> {
        const raw=Buffer.concat(chunks);
        let json;
        try {json=JSON.parse(raw.toString('utf8'));} catch (_) {}
        resolve({status:res.statusCode,headers:res.headers,raw,json});
      });
    });
    r.on('error',reject);
    r.end(body);
  });
}

test('temporary video stream supports MX Player without putting WebDAV credentials in URL', async t => {
  await new Promise(done=>upstream.listen(UP,'127.0.0.1',done));
  const child = spawn(process.execPath,[path.resolve(__dirname,'../n2s-overlay.js')], {
    env:{...process.env,N2S_UPSTREAM_PORT:String(UP),N2S_PROXY_PORT:String(PROXY)},stdio:'ignore'
  });
  t.after(()=>{child.kill();upstream.close();});
  let ready=false;
  for(let i=0;i<60;i++){
    try{const p=await request('/_n2s_overlay_2026/health');if(p.status===200){ready=true;break;}}
    catch(_){}
    await new Promise(done=>setTimeout(done,50));
  }
  assert.ok(ready,'overlay ready');
  const GRANT='/ _n2s_overlay_2026/media-grant'.replace(' ','');
  const payload=JSON.stringify({path:NAME});
  const headers={'Content-Type':'application/json','X-N2S-Playback':'1',Origin:'http://127.0.0.1:'+PROXY};
  const missingAuth=await request(GRANT,'POST',headers,payload);
  assert.equal(missingAuth.status,401);
  const invalidOrigin=await request(GRANT,'POST',{...headers,Origin:'https://attacker.example',Authorization:AUTH},payload);
  assert.equal(invalidOrigin.status,403);
  const invalidFile=await request(GRANT,'POST',{...headers,Authorization:AUTH},JSON.stringify({path:'/private/passwords.txt'}));
  assert.equal(invalidFile.status,400);
  const badCredentials=await request(GRANT,'POST',{...headers,Authorization:'Basic d3Jvbmc6d3Jvbmc='},payload);
  assert.equal(badCredentials.status,401);

  const grant=await request(GRANT,'POST',{...headers,Authorization:AUTH},payload);
  assert.equal(grant.status,201,'authenticated request creates a video URL');
  const url=grant.json.url;
  assert.match(url,/^\/_n2s_overlay_2026\/media-stream\/[A-Za-z0-9_-]{43}\/film%20testowy\.mkv$/);
  assert.ok(!url.includes('test') || url.endsWith('film%20testowy.mkv'));
  assert.ok(!url.includes('dGVzdDp0ZXN0'));
  assert.equal(grant.json.expiresInSeconds, 14400);

  const full=await request(url);
  assert.equal(full.status,200);
  assert.deepEqual(full.raw,VIDEO);
  assert.match(full.headers['content-type'],/video\/x-matroska/);
  assert.equal(full.headers['accept-ranges'],'bytes');
  const ranged=await request(url,'GET',{Range:'bytes=5-10'});
  assert.equal(ranged.status,206);
  assert.equal(ranged.raw.toString('utf8'),'56789a');
  assert.equal(ranged.headers['content-range'],'bytes 5-10/36');
  const head=await request(url,'HEAD');
  assert.equal(head.status,200);
  assert.equal(Number(head.headers['content-length']),VIDEO.length);
  const badName=await request(url.replace('film%20testowy.mkv','wrong.mkv'));
  assert.equal(badName.status,404);
  const random=await request(url.replace(/media-stream\/[A-Za-z0-9_-]{43}/,'media-stream/'+('A'.repeat(43))));
  assert.equal(random.status,410);
  const notAllowMutate=await request(url,'DELETE');
  assert.equal(notAllowMutate.status,405);
});