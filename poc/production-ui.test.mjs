import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { connectorCatalog } from './connectors.mjs';

test('Ray5 : formulaire TCP/ESP3D sans faux secret, supervision sans commandes ni pourcentage inventé', () => {
  const source=readFileSync(new URL('./live.js',import.meta.url),'utf8');
  const dialog={open:false,innerHTML:'',showModal(){this.open=true;}};
  const sandbox={machineConnectors:connectorCatalog,state:{role:'admin',lang:'fr'},pendingPrintCommands:new Set(),dialog,URL,
    t:fr=>fr,esc:String,badge:()=>'',btn:(action,label)=>`<button data-action="${action}">${label}</button>`};
  runInNewContext(source.slice(source.indexOf('function openMachineForm('),source.indexOf('let discoveryCancel;'))+source.slice(source.indexOf('function liveFabrication('),source.indexOf('const temperatureHistory'))+';this.form=openMachineForm;this.job=liveFabrication;',sandbox);
  sandbox.form('longer-ray5','Ray5');
  assert.match(dialog.innerHTML,/name="host"/);assert.match(dialog.innerHTML,/name="transport"/);assert.match(dialog.innerHTML,/value="8080"/);
  assert.doesNotMatch(dialog.innerHTML,/name="accessCode"|name="apiKey"/);
  sandbox.form('longer-ray5','Ray5',{origin:'http://192.168.1.60:8848',transport:'esp3d',wsPort:8849});
  assert.match(dialog.innerHTML,/value="esp3d" selected/);assert.match(dialog.innerHTML,/value="8848"/);
  const machine={kind:'longer-ray5',status:'ready',progress:0,progressKnown:false,nativeState:'Idle',machinePosition:{x:3,y:4,z:0},spindle:500};
  let html=sandbox.job(machine);
  assert.match(html,/lecture seule/);assert.match(html,/Progression non communiquée/);assert.match(html,/X 3/);assert.match(html,/pas une mesure en watts/);
  assert.doesNotMatch(html,/print-command:|files-focus|<progress|0 %/);
  html=sandbox.job({...machine,status:'printing',progress:35,progressKnown:true,file:'piece.nc'});
  assert.match(html,/35 %/);assert.match(html,/piece.nc/);assert.doesNotMatch(html,/print-command:/);
});

test('fiche machine : contrôles par capacité, observateur et aperçu local sans lancement', () => {
  const source = readFileSync(new URL('./live.js', import.meta.url), 'utf8');
  const fabrication = source.slice(source.indexOf('function liveFabrication('), source.indexOf('const temperatureHistory'));
  const files = source.slice(source.indexOf('const machineFiles ='), source.indexOf('function renderFiles('));
  const sandbox = { machineConnectors: connectorCatalog, state: { role: 'admin', lang: 'fr' }, pendingPrintCommands: new Set(),
    t: (fr) => fr, esc: String, badge: () => '', btn: action => `<button data-action="${action}"></button>` };
  runInNewContext(fabrication + '\n' + files + '\nthis.fabrication=liveFabrication;this.files=filesPanel;', sandbox);
  const machine = { id: 'one', kind: 'elegoo', status: 'paused', progress: 0 };
  let html = sandbox.fabrication(machine);
  assert.match(html, /print-command:stop/); assert.doesNotMatch(html, /print-command:resume/);
  html = sandbox.fabrication({ ...machine, kind: 'bambu' });
  assert.match(html, /print-command:resume/); assert.match(html, /print-command:stop/);
  html = sandbox.fabrication({ ...machine, kind: 'klipper', status: 'ready' });
  assert.match(html, /files-focus/);
  sandbox.state.role = 'viewer';
  html = sandbox.fabrication({ ...machine, kind: 'bambu', status: 'printing' });
  assert.doesNotMatch(html, /print-command:/);
  html = sandbox.files(machine);
  assert.match(html, /data-gcode-local/); assert.doesNotMatch(html, /data-files-upload/);
  html = sandbox.files({ ...machine, kind: 'xtool-m2' });
  assert.match(html, /data-gcode-local/); assert.doesNotMatch(html, /data-files-upload/);
});


test('fichiers : filtrer et paginer conserve la cible exacte des actions', () => {
  const source = readFileSync(new URL('./live.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('const machineFiles ='), source.indexOf('function renderFiles('));
  const sandbox = { machineConnectors: connectorCatalog, state: { role: 'admin', lang: 'fr' },
    t: fr => fr, esc: String, btn: action => `<button data-action="${action}"></button>` };
  runInNewContext(code + '\nthis.filesState=filesState;this.filesPanel=filesPanel;this.filePage=filePage;', sandbox);
  const machine = { id: 'bambu', kind: 'bambu', status: 'ready' };
  const entry = sandbox.filesState(machine.id);
  entry.files = Array.from({ length: 24 }, (_, index) => ({ path: `piece-${24 - index}.gcode`, size: 12, modified: index === 0 ? null : index * 1000 }));
  let html = sandbox.filesPanel(machine);
  assert.equal((html.match(/data-action="files-print:/g) ?? []).length, 5);
  assert.match(html, /files-print:23/);
  assert.equal(sandbox.filePage(entry).rows[0].file.path, entry.files[23].path);
  entry.sort = 'name'; entry.query = 'PIECE-2'; entry.page = 0;
  let page = sandbox.filePage(entry);
  assert.deepEqual(Array.from(page.rows, row => row.file.path), ['piece-2.gcode', 'piece-20.gcode', 'piece-21.gcode', 'piece-22.gcode', 'piece-23.gcode']);
  html = sandbox.filesPanel(machine);
  for (const { file, index } of page.rows) {
    assert.equal(entry.files[index].path, file.path);
    assert.match(html, new RegExp('files-print:' + index + '"'));
    assert.match(html, new RegExp('viewer-open:' + index + '"'));
    assert.match(html, new RegExp('files-transfer:' + index + '"'));
    assert.ok(html.includes('path=' + encodeURIComponent(file.path)), 'téléchargement du chemin exact après tri');
  }
  entry.page = 1;
  page = sandbox.filePage(entry);
  assert.equal(page.rows[0].file.path, 'piece-24.gcode');
  entry.query = 'no-match';
  html = sandbox.filesPanel(machine);
  assert.equal(entry.page, 0); assert.match(html, /Aucun fichier ne correspond/); assert.doesNotMatch(html, /files-print:/);
  entry.query = ''; entry.pageSize = 20; entry.page = 0;
  assert.equal((sandbox.filesPanel(machine).match(/data-action="files-print:/g) ?? []).length, 20);
  entry.page = 1;
  assert.equal(sandbox.filePage(entry).rows.length, 4);
  entry.files = entry.files.slice(0, 2);
  sandbox.filesPanel(machine); assert.equal(entry.page, 0, 'recalage après actualisation');
  entry.sort = 'oldest';
  assert.equal(sandbox.filePage(entry).rows.at(-1).file.modified, null, 'dates inconnues toujours en dernier');
  assert.equal(sandbox.filesState('other').query, '', 'recherche indépendante par machine');
  sandbox.state.role = 'viewer';
  html = sandbox.filesPanel(machine);
  assert.match(html, /download=1/);
  assert.doesNotMatch(html, /files-transfer:/);
  sandbox.state.role = 'admin';
  const cc2 = sandbox.filesState('cc2'); cc2.files = [];
  html = sandbox.filesPanel({ id: 'cc2', kind: 'elegoo', status: 'ready' });
  assert.match(html, /Aucun fichier envoyé via FabCore/);
  assert.doesNotMatch(html, /Aucun fichier G-code sur la machine/);
});


test('transfert multiple : sélection compatible, échec partiel et un seul essai par machine', async () => {
  const source = readFileSync(new URL('./live.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('function fileTransferCandidates('), source.indexOf('function openFileTransfer('));
  const sandbox = { state: { machines: [{ id: 'source', kind: 'bambu' }, { id: 'bambu', kind: 'bambu' }, { id: 'cc2', kind: 'elegoo' }, { id: 'laser', kind: 'xtool-m2' }] }, machineConnectors: connectorCatalog };
  runInNewContext(code + '\nthis.candidates=fileTransferCandidates;this.run=runFileBatch;', sandbox);
  assert.deepEqual(Array.from(sandbox.candidates('source', 'cube.gcode'), m => m.id), ['bambu', 'cc2']);
  assert.deepEqual(Array.from(sandbox.candidates('source', 'cube.3mf'), m => m.id), ['bambu']);
  const attempted = [], changes = [], started = [];
  const results = await sandbox.run(['one', 'two', 'three'], async item => {
    attempted.push(item);
    if (item === 'two') throw new Error('unknown outcome');
    return item + '.gcode';
  }, (result, count, total) => changes.push([result.ok, count, total]), item => started.push(item));
  assert.deepEqual(started, ['one', 'two', 'three']);
  assert.deepEqual(attempted, ['one', 'two', 'three']);
  assert.deepEqual(changes, [[true, 1, 3], [false, 2, 3], [true, 3, 3]]);
  assert.deepEqual(Array.from(results.filter(r => r.ok), r => r.value), ['one.gcode', 'three.gcode']);
});

test('envoi : HTTP 413 HTML du proxy indique la limite, sans nouvel essai automatique', () => {
  const source=readFileSync(new URL('./live.js',import.meta.url),'utf8');
  const entry={error:'',upload:null};let request,sends=0;
  const sandbox={filesState:()=>entry,machine:()=>({kind:'klipper'}),machineConnectors:connectorCatalog,gcodeLimit:512*1024*1024,
    t:fr=>fr,problem:code=>code,renderFiles:()=>{},toast:()=>{},loadFiles:()=>{throw Error('unexpected success');},
    XMLHttpRequest:class{constructor(){request=this;this.upload={};}open(){}setRequestHeader(){}send(){sends++;}}};
  runInNewContext(source.slice(source.indexOf('function uploadFile('),source.indexOf('function fileTransferCandidates('))+';this.upload=uploadFile;',sandbox);
  sandbox.upload('one',{name:'cube.gcode',size:6000000});
  request.status=413;request.responseText='<html>Request Entity Too Large</html>';request.onloadend();
  assert.equal(entry.error,'upload-proxy-limit');assert.equal(sends,1);assert.equal(entry.upload,null);
});
