import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { parseRay5Status, ray5Target, createRay5Monitor } from './longer-ray5.mjs';
import { connectorDefinition, connectorCatalog, createConnectorRegistry } from './connectors.mjs';
const machine = { id: 'ray5', kind: 'longer-ray5', origin: 'tcp://192.168.1.60:8080', wsPort: 8849 };
const turn = () => new Promise(resolve => setImmediate(resolve));
class Socket extends EventEmitter {
  sent = []; destroyed = false;
  write(value) { this.sent.push(value); }
  destroy() { this.destroyed = true; }
  terminate() { this.destroy(); }
}

test('Ray5 : configuration privée TCP/ESP3D, capacités explicites de pilotage et fichiers', () => {
  const configure = connectorDefinition('longer-ray5').configure;
  assert.equal(configure({host:'192.168.1.60'}).origin,machine.origin);
  const http = configure({host:'192.168.1.60',transport:'esp3d',port:'8848',wsPort:'8849'});
  assert.equal(http.origin,'http://192.168.1.60:8848');
  assert.equal(ray5Target(http).transport,'esp3d');
  for (const bad of [{host:'8.8.8.8'}, {host:'192.168.1.60',port:'0'}, {host:'192.168.1.60',port:'65536'}, {host:'192.168.1.60',transport:'auto'}, {host:'192.168.1.60',wsPort:'x'}]) assert.ok(!configure(bad));
  for (const origin of ['tcp://8.8.8.8:8080','tcp://192.168.1.1','http://user:pass@192.168.1.1:8848','http://192.168.1.1:8848/evil','http://192.168.1.1:8848/?x=1','ws://192.168.1.1:8849']) assert.equal(ray5Target({origin}),null);
  const capabilities = connectorCatalog['longer-ray5'];
  for (const flag of ['terminal','camera','temperatures']) assert.equal(capabilities[flag],false,flag);
  for (const flag of ['commands','controls','files']) assert.equal(capabilities[flag],true,flag);
  assert.equal(capabilities.fileFamily,'laser');
});

test('Ray5 : état, coordonnées et SD réels, aucune progression inférée ni conversion en watts', () => {
  const report = parseRay5Status('<Run|MPos:10.2,-4,0|WPos:0,2,0|FS:800,500|SD:12.5,piece.nc>');
  assert.equal(report.status,'printing'); assert.equal(report.progress,12.5); assert.equal(report.progressKnown,true);
  assert.deepEqual(report.machinePosition,{x:10.2,y:-4,z:0}); assert.equal(report.spindle,500); assert.equal(report.feedRate,800); assert.equal(report.file,'piece.nc');
  assert.equal(report.nozzle,null); assert.equal(report.bed,null);
  const idle = parseRay5Status('<Idle|MPos:0,0,0>');
  assert.equal(idle.progressKnown,false); assert.equal(idle.feedRate,null);
  assert.equal(parseRay5Status('<Hold:0|MPos:1,2,3>').status,'paused');
  assert.equal(parseRay5Status('<Door:1|MPos:1,2,3>').issue,'ray5-door');
  assert.equal(parseRay5Status('<Alarm>').status,'error');
  assert.equal(parseRay5Status('<Jog>').issue,'ray5-busy');
  assert.equal(parseRay5Status('<Run|SD:150,f.nc>').progressKnown,false);
  assert.equal(parseRay5Status('<Idle|MPos:NaN,2,3>').machinePosition,null);
  for (const bad of ['ok','Error','<Unknown|MPos:1,2,3>','<Idle>\nM3','<Idle|'+ 'x'.repeat(2100)+'>']) assert.equal(parseRay5Status(bad),null);
});

test('Ray5 TCP : session partagée, trames fragmentées et uniquement les lectures autorisées', async ctx => {
  let opens=0; const socket=new Socket();
  const monitor=createRay5Monitor({connectTCP:()=>{opens++;queueMicrotask(()=>socket.emit('connect'));return socket;},pollMs:10000});ctx.after(()=>monitor.close());
  const probing=monitor.probe(machine);
  await turn(); assert.deepEqual(socket.sent,['$I\n','?']);
  socket.emit('data',Buffer.from('[VER:1.1h:Ray5]\n<Id'));
  socket.emit('data',Buffer.from('le|MPos:2,3,0|FS:0,0>\r\n'));
  assert.equal((await probing).ok,true);
  for(let i=0;i<4;i++)assert.equal(monitor.read(machine).status,'ready');
  assert.equal(opens,1); assert.equal(monitor.read(machine).firmware,'1.1h:Ray5');
  assert.deepEqual(monitor.read(machine).machinePosition,{x:2,y:3,z:0});
  socket.emit('data',Buffer.from('ALARM:2\n'));
  assert.equal(monitor.read(machine).issue,'ray5-alarm');
  assert.ok(socket.sent.every(text=>text==='?'||text==='$I\n'));
  monitor.forget(machine.id);assert.equal(socket.destroyed,true);
});

test('Ray5 : fermeture/péremption effacent les mesures et reconnexion temporisée', async ctx => {
  let time=10000;const sockets=[];
  const monitor=createRay5Monitor({now:()=>time,connectTCP:()=>{const s=new Socket();sockets.push(s);queueMicrotask(()=>s.emit('connect'));return s;},pollMs:10000,staleMs:1000,retryMs:1000});ctx.after(()=>monitor.close());
  monitor.read(machine);await turn();sockets[0].emit('data',Buffer.from('<Run|MPos:1,2,0|SD:80,file.nc>'));
  assert.equal(monitor.read(machine).progress,80);
  time+=1001;let value=monitor.read(machine);
  assert.equal(value.issue,'ray5-stale');assert.equal(value.machinePosition,null);assert.equal(value.progressKnown,false);
  monitor.read(machine);assert.equal(sockets.length,1);
  time+=1001;monitor.read(machine);await turn();assert.equal(sockets.length,2);
  sockets[0].emit('data',Buffer.from('<Idle|MPos:999,999,0>'));assert.equal(monitor.read(machine).machinePosition,null);
  sockets[1].emit('data',Buffer.from('<Idle|MPos:2,2,0>'));assert.equal(monitor.read(machine).status,'ready');
  sockets[1].emit('close');assert.equal(monitor.read(machine).status,'offline');assert.equal(monitor.read(machine).machinePosition,null);
});

test('Ray5 ESP3D : arduino, CURRENT_ID/PAGEID, HTTP Error sans faux succès, aucun reset', async ctx => {
  const socket=new Socket();const calls=[];let url;
  const monitor=createRay5Monitor({openWS:u=>{url=u;queueMicrotask(()=>socket.emit('open'));return socket;},fetcher:async(u,o)=>{calls.push([u,o]);return new Response('Error');},pollMs:10000,probeMs:2000});ctx.after(()=>monitor.close());
  const http={...machine,origin:'http://192.168.1.60:8848'};
  const probing=monitor.probe(http);await turn();
  assert.equal(url,'ws://192.168.1.60:8849/');assert.equal(calls.length,0);
  socket.emit('message',Buffer.from('CURRENT_ID:0'));await turn();
  const query=new URL(calls[0][0]);assert.equal(query.pathname,'/command');assert.equal(query.searchParams.get('commandText'),'?');assert.equal(query.searchParams.get('PAGEID'),'0');
  assert.equal(calls[0][1].redirect,'error');assert.equal(monitor.read(http).status,'connecting');
  socket.emit('message',Buffer.from('<Hold:0|MPos:1,2,0|FS:0,0>'));
  assert.equal((await probing).ok,true);assert.equal(monitor.read(http).status,'paused');
  assert.equal(socket.sent.length,0);
});

test('Ray5 : sonde refusée/annulée et messages surdimensionnés ne valident jamais une connexion', async ctx => {
  const socket=new Socket();
  const monitor=createRay5Monitor({openWS:()=>socket,fetcher:async()=>new Response('',{status:401}),probeMs:30,pollMs:10000});ctx.after(()=>monitor.close());
  const http={...machine,origin:'http://192.168.1.60:8848'};
  const probing=monitor.probe(http);socket.emit('open');socket.emit('message',Buffer.from('CURRENT_ID:12'));await turn();
  assert.equal((await probing).issue,'ray5-access');assert.equal(monitor.read(http).status,'error');
  const abort=new AbortController();abort.abort();assert.equal((await monitor.probe(http,{signal:abort.signal})).ok,false);
  assert.equal((await monitor.probe({...http,origin:'http://8.8.8.8:8848'})).ok,false);
});

test('Ray5 : fermeture et trame trop grande, client fermé et aucune ouverture publique', async ctx => {
  const socket=new Socket();let opens=0;
  const monitor=createRay5Monitor({connectTCP:()=>{opens++;return socket;},pollMs:10000});ctx.after(()=>monitor.close());
  assert.equal(monitor.read({...machine,origin:'tcp://8.8.8.8:8080'}).issue,'ray5-address');assert.equal(opens,0);
  monitor.read(machine);socket.emit('connect');socket.emit('data',Buffer.alloc(9000,65));
  assert.equal(monitor.read(machine).issue,'ray5-response');assert.equal(socket.destroyed,true);
  monitor.close();assert.equal(monitor.read(machine).status,'error');assert.equal(opens,1);
});

test('registre Ray5 : pilote chargeable et fermé sans toucher au réseau pour une adresse invalide', async () => {
  const registry=createConnectorRegistry({});
  const monitor=await registry.get('longer-ray5');
  assert.equal((await monitor.read({id:'bad',origin:'tcp://8.8.8.8:8080'})).issue,'ray5-address');
  registry.close();
});

test('Ray5 ESP3D : HTTP seul ne confirme pas la connexion et annulation préalable sans réseau', async ctx => {
  const socket=new Socket();let opens=0;
  const monitor=createRay5Monitor({openWS:()=>{opens++;return socket;},fetcher:async()=>new Response('Error'),probeMs:20,pollMs:10000});ctx.after(()=>monitor.close());
  const http={...machine,origin:'http://192.168.1.60:8848'};
  const abort=new AbortController();abort.abort();await monitor.probe(http,{signal:abort.signal});assert.equal(opens,0);
  const probing=monitor.probe(http);socket.emit('open');socket.emit('message',Buffer.from('CURRENT_ID:5'));
  assert.deepEqual(await probing,{ok:false,issue:'ray5-report'});
  assert.equal(monitor.read(http).machinePosition,null);
});
