import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { connectorCatalog } from './connectors.mjs';

const source = readFileSync(new URL('./live.js', import.meta.url), 'utf8');
const sandbox = { machineConnectors: connectorCatalog, t: fr => fr, esc: value => String(value).replaceAll('"', '&quot;').replaceAll('<', '&lt;') };
runInNewContext(source.slice(source.indexOf('function fleetFilamentDots('), source.indexOf('function liveFilaments(')) + '\nthis.dots=fleetFilamentDots;', sandbox);
const dots = sandbox.dots;

test('cartes : quatre pastilles numérotées, contraste, vide et emplacement actif', () => {
  const html = dots({ kind: 'bambu', filaments: [{ id: 0, slots: [
    { id: 0, occupied: true, color: '#FFFFFF', material: 'PETG', active: true },
    { id: 1, occupied: true, color: '#000000', material: 'PLA' },
    { id: 2, occupied: false, color: '#FF0000' },
    { id: 3, occupied: true, color: '#FFF144', name: '<test>' }
  ] }] });
  assert.equal((html.match(/class="fleet-filament-dot"/g) || []).length, 4);
  for (const n of [1, 2, 3, 4]) assert.match(html, new RegExp('>' + n + '</span>'));
  assert.match(html, /--spool:#FFFFFF;--ink:#111111/);
  assert.match(html, /--spool:#000000;--ink:#FFFFFF/);
  assert.match(html, /data-active="true"/);
  assert.match(html, /Emplacement 3 · Vide/);
  assert.doesNotMatch(html, /--spool:#FF0000/);
  assert.match(html, /&lt;test>/);
});

test('cartes : bobine simple inconnue sans numéro, équipement inconnu distinct, pas de filament sur laser', () => {
  const single = dots({ kind: 'elegoo', filaments: [] });
  assert.equal((single.match(/class="fleet-filament-dot"/g) || []).length, 1);
  assert.match(single, /Couleur inconnue/);
  assert.doesNotMatch(single, />[1-4]<\/span>/);
  assert.match(dots({ kind: 'bambu' }), /Équipement non communiqué/);
  assert.equal(dots({ kind: 'xtool-m2' }), '');
});

test('cartes : plusieurs modules, dernier état hors ligne et couleurs non valides neutralisées', () => {
  const html = dots({ kind: 'elegoo', status: 'offline', filaments: [0, 1].map(id => ({ id, slots: [{ id: 0, occupied: true, color: 'red;position:fixed' }] })) });
  assert.match(html, />2 CANVAS<\/small>/); assert.match(html, /CANVAS 1/);
  assert.match(html, /Dernières données, hors ligne/);
  assert.doesNotMatch(html, /position:fixed/);
  assert.equal((html.match(/class="fleet-filament-dot"/g) || []).length, 1, 'un seul module affiché');
});

test('plusieurs modules : pastilles du module actif seulement et compteur visible', () => {
  const html = dots({ kind: 'bambu', filaments: [
    { id: 0, slots: [{ id: 0, occupied: true, color: '#FF0000' }] },
    { id: 1, slots: [{ id: 0, occupied: true, color: '#0000FF', active: true }] }
  ] });
  assert.match(html, />2 AMS<\/small>/);
  assert.match(html, /--spool:#0000FF/);
  assert.doesNotMatch(html, /--spool:#FF0000/);
  const single = dots({ kind: 'bambu', filaments: [{ id: 0, slots: [] }] });
  assert.doesNotMatch(single, /<small>/, 'pas de libellé pour un seul module');
});

test('bobine manuelle : une pastille sans numéro, provenance, priorité aux modules réels', () => {
  const manualSpool={material:'PETG',name:'Marque',color:'#123456'};
  const html=dots({kind:'klipper',manualSpool});
  assert.match(html,/--spool:#123456/); assert.match(html,/Saisie manuelle/);
  assert.doesNotMatch(html,/>[1-4]<\/span>/);
  const real=dots({kind:'bambu',manualSpool,filaments:[{id:0,slots:[{id:0,color:'#FF0000',occupied:true}]}]});
  assert.match(real,/--spool:#FF0000/);assert.doesNotMatch(real,/#123456|Saisie manuelle/);
  assert.match(dots({kind:'klipper',manualSpool:{material:'PLA',color:null}}),/Couleur inconnue/);
});
