import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFabCore } from './server.mjs';
test('HTTP P2S : refus d’autorisation explicite pour commandes et chauffe, sans renvoi',async ctx=>{
 const directory=await mkdtemp(join(tmpdir(),'fabcore-bambu-auth-'));ctx.after(()=>rm(directory,{recursive:true,force:true}));
 const sent=[];const denied=async action=>{sent.push(action);throw new Error('bambu-authorization');};
 const bambu={read:()=>({status:'printing',file:'cube',progress:10,nozzle:20,bed:20}),probe:async()=>({ok:true}),command:(m,a)=>denied(a),send:(m,a)=>denied(a),controlState:()=>({lights:[],fans:[],motion:null,heaters:[{id:'nozzle',current:20,target:0,max:260,writable:true}]}),close(){}};
 const origin='http://fabcore.test';const {server,token}=createFabCore({directory,origin,bambu,activationToken:'test-auth-activation'});ctx.after(()=>new Promise(r=>server.close(r)));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const call=(path,body,cookie)=>new Promise((resolve,reject)=>{const req=request(base+path,{method:body===undefined?'GET':'POST',headers:{Host:'fabcore.test',Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})}},async res=>{const chunks=[];for await(const chunk of res)chunks.push(chunk);resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(chunks).toString())});});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});
 const setup=await call('/api/setup',{username:'atelier',password:'test-auth-password',token});const cookie=setup.headers['set-cookie'][0].split(';')[0];
 const added=await call('/api/machines',{kind:'bambu',name:'P2S',host:'192.168.1.61',serial:'TESTP2S123',accessCode:'12345678'},cookie);assert.equal(added.status,201);const id=added.body.id;
 for(const action of ['pause','stop']){const result=await call('/api/machines/'+id+'/command',{action,confirm:true},cookie);assert.equal(result.status,403);assert.equal(result.body.error,'bambu-authorization');}
 const heat=await call('/api/machines/'+id+'/controls',{action:'heat',id:'nozzle',value:100,confirm:true,duringPrint:true},cookie);assert.equal(heat.status,403);assert.equal(heat.body.error,'bambu-authorization');assert.deepEqual(sent,['pause','stop','gcode_line']);
});
