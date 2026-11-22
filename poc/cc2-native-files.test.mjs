import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { createElegooMonitor } from './elegoo.mjs';
import { createElegooFiles } from './elegoo-files.mjs';
import { createBambuMonitor } from './bambu.mjs';
const machine={id:'cc2-native',origin:'mqtt://192.168.1.60:1883',serial:'CC2TEST01',accessCode:'test-only'};
test('CC2 : inventaire 1044 sur la session existante, résultat natif conservé et refus sans liste vide fictive',async ctx=>{
 const client=new EventEmitter();client.connected=true;client.end=()=>{};
 const sent=[];let reply,opens=0,refused=false;
 const deliver=(topic,data)=>client.emit('message',topic,Buffer.from(JSON.stringify(data)));
 client.subscribe=(topics,done)=>done(null,topics.map(()=>({qos:0})));
 client.publish=(topic,payload,options)=>{
  const data=JSON.parse(payload);sent.push(data);
  if(topic.endsWith('/api_register'))queueMicrotask(()=>deliver(`elegoo/${machine.serial}/${data.request_id}/register_response`,{error:'ok'}));
  else if(data.method===1002)queueMicrotask(()=>deliver(reply,{id:data.id,result:{machine_status:{status:1}}}));
  else if(data.method===1044){
   assert.deepEqual(options,{qos:0,retain:false});assert.deepEqual(data.params,{storage_media:'local',path:'/'});
   queueMicrotask(()=>{deliver(reply,{id:data.id+1,method:1044,result:{error_code:0,file_list:[]}});deliver(reply,{id:data.id,method:1044,result:{error_code:refused?1003:0,file_list:[{filename:'demo.gcode',size:42}]}});});
  }
 };
 const monitor=createElegooMonitor({fetcher:async()=>Response.json({system_info:{sn:machine.serial}}),connectPrinter:(url,options)=>{opens++;reply=`elegoo/${machine.serial}/${options.clientId}/api_response`;queueMicrotask(()=>client.emit('connect'));return client;}});ctx.after(()=>monitor.close());
 await monitor.read(machine);await setImmediate();
 assert.equal((await monitor.queryFiles(machine)).file_list[0].filename,'demo.gcode');assert.equal(opens,1);
 refused=true;await assert.rejects(()=>monitor.queryFiles(machine),/files-unavailable/);
 assert.ok(sent.filter(v=>v.method>=1020&&v.method<=1028).length===0,'lecture seule');
});
test('CC2 : liste interne autoritaire, chemins confinés, téléchargement natif et lancement d’un fichier jamais envoyé par FabCore',async()=>{
 let current=[{filename:'demo.gcode',size:42,create_time:1706900000,type:'file'},{filename:'../evil.gcode',size:2},{filename:'dir',type:'directory'},{filename:'notes.txt'}];const calls=[],starts=[];
 const files=createElegooFiles(async(m,method,params)=>{starts.push([method,params]);return true;},{queryFiles:async()=>({error_code:0,file_list:current}),fetcher:async(url,options)=>{calls.push([url,options]);return new Response('G1 X1\n');}});
 let list=await files.list(machine);assert.deepEqual(list,[{path:'demo.gcode',size:42,modified:1706900000000}]);
 assert.equal(await files.start(machine,'demo.gcode'),true);assert.equal(starts[0][0],1020);assert.equal(starts[0][1].filename,'demo.gcode');assert.equal(starts[0][1].storage_media,'local');
 assert.equal(await(await files.download(machine,'demo.gcode')).text(),'G1 X1\n');
 const url=calls[0][0];assert.equal(url.hostname,'192.168.1.60');assert.equal(url.pathname,'/download');assert.equal(url.searchParams.get('file_name'),'demo.gcode');assert.equal(url.searchParams.get('X-Token'),'test-only');assert.equal(calls[0][1].redirect,'error');
 await assert.rejects(()=>files.download(machine,'../demo.gcode'),/invalid-file/);
 current=[];assert.deepEqual(await files.list(machine),[]);await assert.rejects(()=>files.start(machine,'demo.gcode'),/missing/);assert.equal(starts.length,1);
 const bad=createElegooFiles(assert.fail,{queryFiles:async()=>({error_code:0}),fetcher:async()=>new Response('<html>error</html>',{headers:{'content-type':'text/html'}})});
 await assert.rejects(()=>bad.list(machine),/files-unavailable/);await assert.rejects(()=>bad.download(machine,'demo.gcode'),/files-unavailable/);
});
test('P2S : refus de vérification distinct, état de fabrication conservé, zéro rejeu et effacement après commande autorisée',async ctx=>{
 const client=new EventEmitter();client.connected=true;client.end=()=>{};client.subscribe=(topic,done)=>done(null,[{qos:0}]);let fail=true;const sent=[];
 client.publish=(topic,raw,options,done)=>{
  const data=JSON.parse(raw).print;if(!data)return;sent.push(data);done?.();
  queueMicrotask(()=>client.emit('message','device/TESTP2S123/report',Buffer.from(JSON.stringify({print:{...data,result:fail?'failed':'success',reason:fail?'mqtt message verify failed':''}}))));
 };
 const monitor=createBambuMonitor(()=>client);ctx.after(()=>monitor.close());
 const m={id:'p2s',origin:'mqtts://192.168.1.61:8883',serial:'TESTP2S123',accessCode:'12345678'};
 monitor.read(m);client.emit('connect');client.emit('message','device/TESTP2S123/report',Buffer.from(JSON.stringify({print:{command:'push_status',gcode_state:'RUNNING'}})));
 await assert.rejects(()=>monitor.command(m,'pause'),/bambu-authorization/);assert.equal(sent.length,1);
 assert.equal(monitor.read(m).status,'printing');assert.equal(monitor.read(m).controlIssue,'bambu-authorization');
 await assert.rejects(()=>monitor.command(m,'stop'),/bambu-authorization/);assert.equal(sent.length,2);
 fail=false;assert.equal(await monitor.command(m,'pause'),true);assert.equal(monitor.read(m).controlIssue,undefined);
});
