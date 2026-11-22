import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createFabCore } from './server.mjs';
test('HTTP Ray5 : observateur, origine, impulsion, états, arrêt Alarm et transfert FDM interdit',async ctx=>{
 const directory=await mkdtemp(join(tmpdir(),'fabcore-ray5-http-'));ctx.after(()=>rm(directory,{recursive:true,force:true}));
 let native='Idle';const sent=[];
 const ray5={read:()=>({nativeState:native,status:native==='Run'?'printing':native==='Alarm'?'error':'ready',spindle:0,feedRate:0,progress:0,progressKnown:false,nozzle:null,bed:null,file:'',checkedAt:new Date().toISOString()}),probe:async()=>({ok:true}),
  control:{read:async()=>({lights:[],heaters:[],fans:[],motion:{homed:null,axes:['X','Y'],home:false},laser:{writable:true,mode:true,max:1000,nativeState:native}}),execute:async(m,cmd)=>{sent.push(cmd);return {outcome:'accepted'};}},
  command:async(m,action)=>{sent.push({action});if(action==='stop')native='Alarm';return true;},files:{list:async()=>[{path:'a.gc',size:3,modified:null}],download:async()=>new Response('M5\n')},close(){}};
 const origin='http://fabcore.test';const {server,token}=createFabCore({directory,origin,ray5,activationToken:'test-ray5-http-token'});
 ctx.after(()=>new Promise(r=>server.close(r)));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const call=(path,body,cookie,site=origin)=>new Promise((resolve,reject)=>{
  const req=request(base+path,{method:body===undefined?'GET':'POST',headers:{Host:'fabcore.test',Origin:site,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})}},async res=>{const chunks=[];for await(const c of res)chunks.push(c);resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(chunks).toString())});});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
 });
 const setup=await call('/api/setup',{username:'atelier',password:'test-ray5-password',token});const admin=setup.headers['set-cookie'][0].split(';')[0];
 const added=await call('/api/machines',{kind:'longer-ray5',name:'Ray5',host:'192.168.1.60'},admin);assert.equal(added.status,201);const id=added.body.id;
 await call('/api/observers',{username:'viewer',password:'test-viewer-password'},admin);
 const viewer=(await call('/api/login',{username:'viewer',password:'test-viewer-password'})).headers['set-cookie'][0].split(';')[0];
 assert.equal((await call('/api/machines/'+id+'/print',{path:'a.gc',confirm:true},admin)).body.error,'laser-confirm');
 const path='/api/machines/'+id+'/controls',pulse={action:'laser-pulse',value:2,duration:100,operatorPresent:true,confirm:true};
 assert.equal((await call(path)).status,401);assert.equal((await call(path,undefined,viewer)).status,200);
 assert.equal((await call(path,pulse,viewer)).status,403);assert.equal((await call(path,pulse,admin,'http://evil.test')).status,403);assert.equal(sent.length,0);
 assert.equal((await call(path,{...pulse,operatorPresent:false},admin)).status,400);await delay(510);
 assert.equal((await call(path,pulse,admin)).status,200);assert.equal(sent.length,1);await delay(510);
 native='Run';assert.equal((await call(path,{action:'move',axis:'X',distance:1,confirm:true},admin)).status,409);await delay(510);
 assert.equal((await call('/api/machines/'+id+'/command',{action:'stop',confirm:true},admin)).status,200);assert.equal(native,'Alarm');
 assert.equal((await call(path,{action:'unlock',confirm:true},admin)).status,200);assert.equal(sent.at(-1).action,'unlock');
 const klipper=(await call('/api/machines',{name:'FDM',origin:'http://192.168.1.61:7125'},admin)).body.id;
 assert.equal((await call('/api/machines/'+id+'/transfer',{path:'a.gc',destination:klipper,name:'a.gcode',confirm:true},admin)).status,400);
 assert.equal(sent.some(cmd=>cmd.action==='home'),false);
});
