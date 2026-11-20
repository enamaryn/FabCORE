import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { manualSpool, supportsManualSpool } from './manual-spool.mjs';
import { createFabCore } from './server.mjs';
import { openStore } from './store.mjs';

test('bobine informative : validation stricte, couleur inconnue et familles FDM', () => {
  assert.deepEqual(manualSpool({material:' PETG ',name:' Exemple ',color:'#abcdef',active:true}), {material:'PETG',name:'Exemple',color:'#ABCDEF'});
  assert.deepEqual(manualSpool({material:'PLA'}), {material:'PLA',name:'',color:null});
  for(const bad of [null,[],{}, {material:''}, {material:'X'.repeat(41)}, {material:'PLA',name:'a\nb'}, {material:'PLA',color:['#abcdef']}, {material:'PLA',color:'red;position:fixed'}]) assert.equal(manualSpool(bad),null);
  assert.equal(supportsManualSpool('klipper'),true);
  assert.equal(supportsManualSpool('xtool-m2'),false);
});

test('bobine HTTP : droits, origine, persistance, édition machine et suppression sans commande', async ctx => {
  const directory=await mkdtemp(join(tmpdir(),'fabcore-spool-'));
  ctx.after(()=>rm(directory,{recursive:true,force:true}));
  const origin='http://fabcore.test';
  let commands=0;
  const app=createFabCore({directory,origin,activationToken:'activation-for-test',readPrinter:async()=>({status:'ready',nozzle:21,bed:20,progress:0,file:''}),sendCommand:async()=>{commands++;return true;}});
  ctx.after(()=>new Promise(resolve=>app.server.close(resolve)));
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const call=(path,body,cookie,requestOrigin=origin)=>new Promise((resolve,reject)=>{
    const payload=body===undefined?null:JSON.stringify(body);
    const r=request({hostname:'127.0.0.1',port:app.server.address().port,path,method:payload?'POST':'GET',headers:{Host:'fabcore.test',Origin:requestOrigin,...(cookie?{Cookie:cookie}:{}),...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{})}},async res=>{
      let text='';for await(const chunk of res)text+=chunk;
      resolve({status:res.statusCode,json:JSON.parse(text),cookie:res.headers['set-cookie']?.[0].split(';')[0]});
    });r.on('error',reject);r.end(payload);
  });
  const admin=(await call('/api/setup',{token:app.token,username:'atelier',password:'long-admin-password'})).cookie;
  assert.ok(admin);
  const id=(await call('/api/machines',{name:'Ender',origin:'http://192.168.1.176:7125'},admin)).json.id;
  const route='/api/machines/'+id+'/spool';
  const spool={material:'PLA',name:'Ma bobine',color:'#00aa99'};
  assert.equal((await call(route,{spool})).status,401);
  assert.equal((await call(route,{spool},admin,'http://evil.test')).status,403);
  await call('/api/observers',{username:'observateur',password:'long-viewer-password'},admin);
  const viewer=(await call('/api/login',{username:'observateur',password:'long-viewer-password'})).cookie;
  assert.equal((await call(route,{spool},viewer)).status,403);
  assert.equal((await call(route,{spool:{material:'PLA',color:'bad'}},admin)).status,400);
  assert.equal((await call(route,{spool},admin)).status,200);
  assert.deepEqual(openStore(directory).state.machines[0].manualSpool,{...spool,color:'#00AA99'});
  const result=await call('/api/machines',undefined,viewer);
  assert.deepEqual(result.json.machines[0].manualSpool,{...spool,color:'#00AA99'});
  assert.equal((await call('/api/machines/edit',{id,name:'Ender renommée',kind:'klipper',origin:'http://192.168.1.176:7125'},admin)).status,200);
  assert.equal(openStore(directory).state.machines[0].manualSpool.name,'Ma bobine');
  assert.equal((await call(route,{spool:null},viewer)).status,403);
  assert.equal((await call(route,{spool:null},admin)).status,200);
  assert.equal(openStore(directory).state.machines[0].manualSpool,null);
  assert.equal(commands,0);
});
