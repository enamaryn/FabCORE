import test from 'node:test';
import assert from 'node:assert/strict';
import { filePage, safeFilePath, uploadProblem, viewerHref, downloadHref } from '../src/files.ts';
import { parseRoute } from '../src/route.ts';
import type { MachineData } from '../src/types.ts';
const machine: MachineData = { id: 'one', name: 'A', kind: 'bambu', model: 'P2S', status: 'ready', cameraOpen: false, capabilities: { files: true, projects: true } };
const files = Array.from({ length: 24 }, (_, index) => ({ path: `dossier/piece${index + 1}.gcode`, size: index, modified: index < 2 ? null : index * 1000 }));
test('Fichiers : recherche chemin, tri naturel stable, dates inconnues en dernier et pages bornées', () => {
  assert.equal(filePage(files, '', 'newest', 0, 5, 'fr').rows[0]?.path, 'dossier/piece24.gcode');
  assert.equal(filePage(files, '', 'oldest', 0, 5, 'fr').rows[0]?.path, 'dossier/piece3.gcode');
  assert.deepEqual(filePage(files, '', 'name', 0, 5, 'fr').rows.map(f => f.path), files.slice(0, 5).map(f => f.path));
  const last = filePage(files, '', 'name', 99, 20, 'fr'); assert.equal(last.page, 1); assert.equal(last.rows.length, 4);
  const found = filePage(files, ' DOSSIER/PIECE24 ', 'name', 99, 5, 'fr'); assert.equal(found.rows[0], files[23]); assert.equal(found.page, 0);
  assert.equal(filePage(files, 'absent', 'name', 99, 5, 'fr').count, 0); assert.equal(files[0]?.path, 'dossier/piece1.gcode', 'input not reordered');
});
test('Fichiers : chemins sûrs, formats par machine, tailles et liens exacts après filtrage', () => {
  for (const bad of ['../secret.gcode', 'a/../b.gcode', '/a.gcode', 'a\\b.gcode', 'a//b.gcode', 'é.gcode', 'x.png', 'a\ng.gcode']) assert.equal(safeFilePath(bad), false, bad);
  for (const path of ['a.gcode.3mf', 'usb/<part>& #.gcode', 'a/b.nc']) assert.equal(safeFilePath(path), true, path);
  assert.equal(uploadProblem(machine, { name: 'part.3mf', size: 3 }), null);
  assert.equal(uploadProblem({ ...machine, capabilities: { files: true } }, { name: 'part.3mf', size: 3 }), 'invalid-name');
  assert.equal(uploadProblem(machine, { name: 'dir/part.gcode', size: 3 }), 'invalid-name');
  assert.equal(uploadProblem(machine, { name: 'part.gcode', size: 0 }), 'file-too-large');
  assert.equal(uploadProblem({ ...machine, kind: 'longer-ray5' }, { name: 'part.nc', size: 16 * 1024 * 1024 + 1 }), 'file-too-large');
  assert.equal(uploadProblem({ ...machine, kind: 'longer-ray5' }, { name: '<part>.nc', size: 1 }), 'invalid-name');
  const path = files[23]!.path;
  // Visualiseur React : le lien du fichier exact repasse par parseRoute (chemin validé).
  const id = '11111111-1111-4111-8111-111111111111';
  assert.deepEqual(parseRoute(viewerHref(id, path)), { kind: 'viewer', id, source: { kind: 'machine', path, follow: false } });
  assert.deepEqual(parseRoute(viewerHref(id, path, true)), { kind: 'viewer', id, source: { kind: 'machine', path, follow: true } });
  const download = new URL(downloadHref('one', 'usb/<part>& #.gcode'), 'http://fabcore.test'); assert.equal(download.searchParams.get('download'), '1'); assert.equal(download.searchParams.get('path'), 'usb/<part>& #.gcode');
  assert.deepEqual(parseRoute('#machine/11111111-1111-4111-8111-111111111111/files'), { kind: 'machine', id: '11111111-1111-4111-8111-111111111111', tab: 'files' });
});
