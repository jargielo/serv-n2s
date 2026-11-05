'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const net=require('node:net');
const path=require('node:path');
const {spawn}=require('node:child_process');
const shell=path.resolve(__dirname,'../n2s-ports.sh');

async function listen(handler) {
 const server=http.createServer(handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {server,port:server.address().port};
}
async function freePort() {
 const sock=net.createServer();
 await new Promise(resolve=>sock.listen(0,'127.0.0.1',resolve));
 const port=sock.address().port;
 await new Promise(resolve=>sock.close(resolve));
 return port;
}
function probe(first,second) {
 return new Promise((resolve,reject)=>{
  const script='. "$1"; choose_n2s_ports "$2" "$3" || exit $?; printf "SELECTED=%s:%s\\n" "$PORT" "$OVERLAY"';
  const child=spawn('bash',['-c',script,'test',shell,String(first),String(second)]);
  let stdout='',stderr='';
  child.stdout.on('data',x=>stdout+=x);
  child.stderr.on('data',x=>stderr+=x);
  child.on('error',reject);
  child.on('exit',code=>resolve({code,stdout,stderr}));
 });
}
const guarded=(req,res)=>{res.writeHead(401,{'WWW-Authenticate':'Basic realm="WebDAV"'});res.end()};
test('WebDAV running on 8080 chooses free 8081 for N2S without stopping backend',async()=>{
 const {server,port}=await listen(guarded);
 try{
  const spare=await freePort();
  const r=await probe(port,spare);
  assert.equal(r.code,0,r.stderr);
  assert.match(r.stdout,new RegExp('SELECTED='+port+':'+spare));
  assert.equal(server.listening,true);
 }finally{await new Promise(done=>server.close(done))}
});
test('WebDAV running on second port chooses first port for N2S',async()=>{
 const {server,port}=await listen(guarded);
 try{
  const spare=await freePort();
  const r=await probe(spare,port);
  assert.equal(r.code,0,r.stderr);
  assert.match(r.stdout,new RegExp('SELECTED='+port+':'+spare));
 }finally{await new Promise(done=>server.close(done))}
});
test('insecure WebDAV is rejected rather than exposed publicly',async()=>{
 const {server,port}=await listen((req,res)=>{res.writeHead(200);res.end('PUBLIC FILES')});
 try{
  const spare=await freePort();
  const r=await probe(port,spare);
  assert.notEqual(r.code,0);
  assert.match(r.stderr,/Nie moge bezpiecznie/);
 }finally{await new Promise(done=>server.close(done))}
});
test('two occupied ports are rejected without terminating either server',async()=>{
 const a=await listen(guarded);
 const b=await listen(guarded);
 try {
  const r=await probe(a.port,b.port);
  assert.notEqual(r.code,0);
  assert.equal(a.server.listening,true);
  assert.equal(b.server.listening,true);
 }finally{
  await new Promise(done=>a.server.close(done));
  await new Promise(done=>b.server.close(done));
 }
});
test('existing N2S overlay on candidate port prevents duplicate tunnel launch',async()=>{
 const a=await listen((req,res)=>{res.writeHead(200);res.end('N2S OK')});
 try{
  const spare=await freePort();
  const r=await probe(a.port,spare);
  assert.notEqual(r.code,0);
  assert.match(r.stderr,/juz uruchomiony/);
 }finally{await new Promise(done=>a.server.close(done))}
});
