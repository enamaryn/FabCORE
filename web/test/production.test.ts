import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProductionWork } from '../../src/domain/projects.ts';
import { dropInstant, instantFromLocal, localDateTime, productionWarnings, visibleDays, workInterval } from '../src/production.ts';
const work = (id: string, start: string | null, minutes = 60, extra: Partial<ProductionWork> = {}): ProductionWork => ({ id, title: id, projectId: null, client: 'Direct client', scheduledStart: start, estimatedMinutes: minutes,
  machineId: 'machine-a', machineNameSnapshot: 'Printer', quantity: 2, format: '3d', material: '', fileReference: '', kind: 'production', state: 'todo', dueDate: null, notes: '', revision: 1, createdAt: '2026-11-26T12:00:00Z', updatedAt: '2026-11-26T12:00:00Z', createdBy: 'atelier', ...extra });

test('Production : conflits par machine, bornes adjacentes autorisées et travaux inactifs exclus', () => {
  const a = work('a', '2026-11-26T08:00:00Z', 60), b = work('b', '2026-11-26T08:30:00Z', 20);
  const adjacent = work('c', '2026-11-26T09:00:00Z'), other = work('d', '2026-11-26T08:00:00Z', 60, { machineId: 'machine-b' });
  const done = work('done', '2026-11-26T08:00:00Z', 60, { state: 'done' }), cancelled = work('cancel', '2026-11-26T08:00:00Z', 60, { state: 'cancelled' });
  assert.deepEqual([...productionWarnings([a, b, adjacent, other, done, cancelled]).conflicts].sort(), ['a', 'b']);
  assert.equal(workInterval(work('reserve', null)), null);
  assert.equal(workInterval(work('reserve', '2026-11-26T08:00:00Z', 60, { machineId: null })), null);
  assert.equal(workInterval(work('reserve', '2026-11-26T08:00:00Z', 60, { estimatedMinutes: null })), null);
  assert.equal(workInterval(work('bookmark', '2026-11-26T08:00:00Z', 20))!.end - workInterval(work('bookmark', '2026-11-26T08:00:00Z', 20))!.start, 20 * 60000, 'a 20-minute job stays 20 minutes');
  assert.equal(workInterval(a)!.end - workInterval(a)!.start, 3600000, 'duration is total, quantity does not multiply it');
});

test('Production : échéance en fin de journée locale, planifiée et non planifiée', () => {
  const tomorrow = new Date('2026-11-27T00:00:00').toISOString();
  const late = work('late', tomorrow, 60, { dueDate: '2026-11-26' });
  const pending = work('pending', null, 60, { dueDate: '2026-11-26' });
  const past = work('past', new Date('2026-11-25T08:00:00').toISOString(), 60, { dueDate: '2026-11-26' });
  const done = { ...late, id: 'done', state: 'done' as const };
  assert.deepEqual([...productionWarnings([late, pending, done, past], new Date('2026-11-28T12:00:00').getTime()).late].sort(), ['late', 'past', 'pending']);
});

test('Production : conversion heure locale, DST et jours calendaires sans décalage UTC', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Europe/Paris';
  try {
    assert.equal(localDateTime('2026-11-26T13:30:00.000Z'), '2026-11-26T14:30');
    assert.equal(instantFromLocal('2026-11-26T14:30'), '2026-11-26T13:30:00.000Z');
    assert.equal(instantFromLocal('2026-02-31T14:30'), null);
    assert.equal(instantFromLocal('2026-10-25T02:30', '2026-10-25T01:30:00.000Z'), '2026-10-25T01:30:00.000Z', 'editing another field preserves the second repeated hour');
    assert.equal(instantFromLocal('2026-03-29T02:30'), null, 'nonexistent spring-forward wall time is rejected');
    const days = visibleDays('2026-03-29', 1);
    assert.equal(days[1]!.getTime() - days[0]!.getTime(), 23 * 3600000);
    assert.equal(localDateTime(dropInstant(days[0]!, days[1]!, 20 / (23 * 60))), '2026-03-29T00:20', 'five-minute drop precision supports short jobs');
    assert.equal(localDateTime(dropInstant(days[0]!, days[1]!, 0)), '2026-03-29T00:00');
    assert.equal(localDateTime(dropInstant(days[0]!, days[1]!, 1)), '2026-03-29T23:55');
    assert.equal(visibleDays('2026-10-25', 1)[1]!.getTime() - visibleDays('2026-10-25', 1)[0]!.getTime(), 25 * 3600000);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
