import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRay5Monitor } from './longer-ray5.mjs';
import { validateControl } from './manual-controls.mjs';
import { detectRay5 } from './discovery.mjs';
import { createRay5Files, ray5Path } from './longer-ray5-files.mjs';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const machine={id:'test-ray5',kind:'longer-ray5',origin:'tcp://192.168.1.60:8080',wsPort:8849};
const turn=()=>new Promise(r=>setImmediate(r));
class Socket extends EventEmitter {
  sent=[]; destroyed=false;
  write(value){this.sent.push(value);this.reply?.(value);}
  destroy(){this.destroyed=true;}
}
async function fixture(ctx){
 const socket=new Socket();
 const monitor=createRay5Monitor({connectTCP:()=>socket,pollMs:10000});
 ctx.after(()=>monitor.close());
 monitor.read(machine);socket.emit('connect');socket.emit('data',Buffer.from('ok\n<Idle|MPos:0,0,0|FS:0,0>\n'));
 socket.reply=value=>{if(typeof value==='string'&&value.endsWith('\n'))queueMicrotask(()=>socket.emit('data',Buffer.from(value==='$$\n'?'$22=0\n$30=1000\n$31=0\n$32=1\nok\n':'ok\n')));};
 return {socket,monitor};
}
test('Ray5 contrôles : paramètres lus, XY borné, M5 préalable et aucun axe Z',async ctx=>{
 const {socket,monitor}=await fixture(ctx);
 const controls=await monitor.control.read(machine);
 assert.deepEqual(controls.motion.axes,['X','Y']);assert.equal(controls.motion.home,false);assert.equal(controls.laser.max,1000);
 assert.equal(validateControl({action:'move',axis:'Z',distance:1,confirm:true},controls),null);
 assert.equal(validateControl({action:'home',confirm:true},controls),null);
 assert.equal(validateControl({action:'move',axis:'X',distance:99,confirm:true},controls),null);
 assert.equal((await monitor.control.execute(machine,{action:'move',axis:'X',distance:-1})).outcome,'accepted');
 assert.deepEqual(socket.sent.slice(-2),['M5\n','$J=G91 G21 X-1 F600\n']);
 socket.emit('data',Buffer.from('<Run|FS:600,100>'));
 const count=socket.sent.length;
 await assert.rejects(()=>monitor.control.execute(machine,{action:'zero'}),/command-rejected/);assert.equal(socket.sent.length,count);
});
test('Ray5 : impulsion bornée en un bloc, quatre ACK, refus et aucune écriture de configuration',async ctx=>{
 const {socket,monitor}=await fixture(ctx);const controls=await monitor.control.read(machine);
 for(const value of [0,6,100])assert.equal(validateControl({action:'laser-pulse',value,duration:100,confirm:true,operatorPresent:true},controls),null);
 assert.equal(validateControl({action:'laser-pulse',value:1,duration:100,confirm:true},controls),null);
 socket.reply=value=>{if(typeof value==='string'&&value.endsWith('\n'))queueMicrotask(()=>socket.emit('data',Buffer.from('ok\n'.repeat(value.trim().split('\n').length))));};
 const result=await monitor.control.execute(machine,{action:'laser-pulse',value:2,duration:250,operatorPresent:true});
 assert.equal(result.outcome,'accepted');assert.equal(socket.sent.at(-1),'M5\nG1 M3 S20\nG4 P0.25\nM5\n');
 assert.equal(socket.sent.some(v=>typeof v==='string'&&/^\$\d+=/.test(v)),false);
 socket.reply=()=>queueMicrotask(()=>socket.emit('data',Buffer.from('error:9\n')));
 const count=socket.sent.length;
 await assert.rejects(()=>monitor.control.execute(machine,{action:'move',axis:'X',distance:1}),/command-rejected/);
 assert.equal(socket.sent.length,count+1,'M5 refusé : pas de mouvement ensuite');
});
test('Ray5 : pause/stop exigent un rapport frais, arrêt Alarm ne déverrouille jamais',async ctx=>{
 const {socket,monitor}=await fixture(ctx);
 socket.emit('data',Buffer.from('<Run|FS:600,100>'));
 socket.reply=value=>{if(Buffer.isBuffer(value))queueMicrotask(()=>socket.emit('data',Buffer.from(value[0]===33?'<Hold:0|FS:0,0>':value[0]===126?'<Run|FS:600,100>':'<Alarm|FS:0,0>')));else if(value==='$I\n')queueMicrotask(()=>socket.emit('data',Buffer.from('ok\n')));};
 assert.equal(await monitor.command(machine,'pause'),true);
 assert.equal(await monitor.command(machine,'resume'),true);
 assert.equal(await monitor.command(machine,'stop'),true);
 assert.equal(monitor.read(machine).nativeState,'Alarm');assert.equal(socket.sent.some(v=>v==='$X\n'),false);
 socket.emit('close');const count=socket.sent.length;
 await assert.rejects(()=>monitor.command(machine,'resume'),/command-unconfirmed/);assert.equal(socket.sent.length,count);
});
test('Ray5 : perte de connexion pendant un ordre reste inconnue sans rejeu',async ctx=>{
 const {socket,monitor}=await fixture(ctx);await monitor.control.read(machine);
 socket.reply=()=>queueMicrotask(()=>socket.emit('close'));
 await assert.rejects(()=>monitor.control.execute(machine,{action:'laser-off'}),/command-unconfirmed/);
 assert.equal(socket.sent.filter(v=>v==='M5\n').length,1);
});
test('Ray5 découverte : statut requis, ports bornés, session enregistrée réutilisée et annulation',async()=>{
 const attempted=[];let closed=0;
 const makeMonitor=()=>({probe:async m=>{attempted.push(m.origin);return {ok:m.origin.startsWith('tcp:')};},close:()=>closed++});
 const signal=new AbortController().signal;
 const found=await detectRay5('192.168.1.60',signal,{makeMonitor});
 assert.equal(found[0].origin,machine.origin);assert.equal(found[0].candidate,true);assert.equal(found[0].serial,undefined);assert.equal(closed,1);
 assert.deepEqual(await detectRay5('8.8.8.8',signal,{makeMonitor:assert.fail}),[]);
 const known=await detectRay5('192.168.1.60',signal,{known:[machine],read:async()=>({nativeState:'Idle'}),makeMonitor:assert.fail});assert.equal(known.length,1);
 assert.deepEqual(await detectRay5('192.168.1.60',signal,{known:[machine],read:async()=>({status:'offline'}),makeMonitor:assert.fail}),[]);
 const controller=new AbortController();controller.abort();assert.deepEqual(await detectRay5('192.168.1.60',controller.signal,{makeMonitor:assert.fail}),[]);
 attempted.length=0;
 const none=await detectRay5('192.168.1.60',signal,{makeMonitor:()=>({probe:async m=>{attempted.push(m.origin);return {ok:false};},close(){}})});
 assert.deepEqual(none,[]);assert.deepEqual(attempted,[machine.origin,'http://192.168.1.60:8848']);
});
test('Ray5 SD : inventaire /upload, lecture SD native, upload exact sans lancement et refus de collision',async()=>{
 let stored=null;const calls=[],content=Buffer.from(';laser\nG0 X0 Y0\nM5\n');
 const fetcher=async(url,options)=>{
  const u=new URL(url);calls.push([u.pathname,u.searchParams.get('plain'),options.method??'GET']);assert.equal(options.redirect,'error');
  if(u.pathname==='/upload'){
   if(options.method==='POST'){const file=options.body.get('file');assert.equal(options.body.get(file.name+'S'),String(content.length));stored={name:file.name,data:Buffer.from(await file.arrayBuffer())};}
   return Response.json({status:'Ok',files:[{name:'a.gc',size:'1 KB'},{name:'bad.bin',size:'1 KB'},...(stored?[{name:stored.name,size:'1 KB'}]:[])]});
  }
  return new Response(u.pathname.startsWith('/SD/')?stored?.data??content:'ok');
 };
 const files=createRay5Files({read:async()=>({nativeState:'Idle'}),fetcher});
 assert.equal((await files.list(machine))[0].path,'a.gc');assert.equal((await files.list(machine)).length,1);
 assert.equal(await(await files.download(machine,'a.gc')).text(),content.toString());
 assert.equal(await files.upload(machine,'new.nc',Readable.from([content]),content.length),'new.nc');
 assert.ok(stored.data.equals(content));assert.equal(calls.some(([,cmd])=>cmd?.startsWith('[ESP220]')),false);
 await assert.rejects(()=>files.upload(machine,'new.nc',Readable.from([content]),content.length),/file-exists/);
 assert.equal(await files.start(machine,'new.nc'),true);assert.ok(calls.at(-1)[1].startsWith('[ESP220]'));
 for(const path of ['../a.gc','/a.gc','a.gc\nM3','a[ESP220].gc','evil.lbrn','a\\b.gc'])assert.equal(ray5Path(path),null);
 const html=createRay5Files({read:()=>({nativeState:'Idle'}),fetcher:async()=>new Response('<html>oops</html>')});
 await assert.rejects(()=>html.download(machine,'a.gc'),/files-unavailable/);
 const busy=createRay5Files({read:()=>({nativeState:'Run'}),fetcher:assert.fail});await assert.rejects(()=>busy.list(machine),/files-unavailable/);
});
test('Ray5 interface : XY sans Z, impulsion bornée, observateur sans actions et transferts laser isolés',()=>{
 const source=readFileSync(new URL('./live.js',import.meta.url),'utf8');
 const sandbox={state:{role:'admin',lang:'fr',machines:[{id:'laser',kind:'longer-ray5'},{id:'fdm',kind:'klipper'},{id:'laser2',kind:'longer-ray5'}]},manualState:()=>({data:{laser:{writable:true,nativeState:'Idle',mode:true,max:1000},motion:{home:false}}}),t:fr=>fr,esc:String,btn:(action,label)=>`<button data-action="${action}">${label}</button>`,unavailableContent:m=>m,unavailablePanel:(t,m)=>m,machineConnectors:{'longer-ray5':{files:true,fileFamily:'laser'},klipper:{files:true,fileFamily:'fdm'}}};
 runInNewContext(source.slice(source.indexOf('function ray5ControlsPanel('),source.indexOf('function manualControlsPanel('))+source.slice(source.indexOf('function fileTransferCandidates('),source.indexOf('// Sequential copies'))+';this.panel=ray5ControlsPanel;this.candidates=fileTransferCandidates;',sandbox);
 const motion=sandbox.panel({id:'laser'},'motion');assert.match(motion,/manual-jog:X/);assert.doesNotMatch(motion,/manual-jog:Z|ray5-control:home/);
 assert.match(sandbox.panel({id:'laser'},'quick'),/data-ray5-pulse/);
 sandbox.state.role='viewer';assert.doesNotMatch(sandbox.panel({id:'laser'},'quick'),/ray5-control:|data-ray5-pulse/);
 assert.deepEqual(Array.from(sandbox.candidates('laser','a.gc'),m=>m.id),['laser2']);
});
