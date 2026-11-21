import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupSidebarSection } from '../scripts/sidebar-cleanup.mjs';

const key = 'codex:thread:local:worker-a';
const section = (sectionId, itemKeys) => ({ sectionId, itemKeys, name: 'Same product' });

function simulate(snapshots) {
  const waits = [], deletions = [];
  return {
    waits, deletions,
    tools: {
      list: async () => {
        assert.ok(snapshots.length, 'unexpected extra query');
        return { sections: snapshots.shift() };
      },
      remove: async sectionId => {
        deletions.push(sectionId);
        return { sectionId, deleted: true };
      },
      wait: async ms => { waits.push(ms); }
    }
  };
}

test('rechecks stale archived members and verifies removal by ID with a same-name section present', async () => {
  const other = section('b', ['codex:thread:local:worker-b']);
  const stale = section('a', [key]);
  const empty = section('a', []);
  const sim = simulate([[stale, other], [stale, other], [empty, other], [empty, other], [other]]);
  const result = await cleanupSidebarSection('a', [key], sim.tools);
  assert.equal(result.status, 'deleted');
  assert.deepEqual(sim.deletions, ['a']);
  assert.deepEqual(sim.waits, [2000, 5000, 2000]);
  assert.deepEqual(result.checks.at(-1), { phase: 'after_delete', members: null });
});

test('preserves a section with a foreign member even if all its workers were archived', async () => {
  const sim = simulate([[section('a', [key, 'codex:thread:local:user-chat'])]]);
  const result = await cleanupSidebarSection('a', [key], sim.tools);
  assert.equal(result.status, 'retained');
  assert.deepEqual(sim.deletions, []);
  assert.deepEqual(sim.waits, []);
});

test('records a bounded wait and can resume from an empty section without repeating a delete', async () => {
  const stale = section('a', [key]);
  const initial = simulate([[stale], [stale], [stale], [stale]]);
  const pending = await cleanupSidebarSection('a', [key], initial.tools);
  assert.equal(pending.reason, 'archived_members_still_visible');
  assert.deepEqual(initial.waits, [2000, 5000, 10000]);
  assert.deepEqual(initial.deletions, []);

  const retry = simulate([[section('a', [])], [], []]);
  assert.equal((await cleanupSidebarSection(pending.sectionId, [key], retry.tools)).status, 'deleted');
  assert.equal((await cleanupSidebarSection(pending.sectionId, [key], retry.tools)).status, 'absent');
  assert.deepEqual(retry.deletions, ['a']);
});

test('separates a successful delete receipt from unverified removal', async () => {
  const empty = section('a', []);
  const sim = simulate([[empty], [empty], [empty], [empty], [empty]]);
  const result = await cleanupSidebarSection('a', [], sim.tools);
  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'deletion_not_visible');
  assert.deepEqual(sim.deletions, ['a']);
});

test('retains sections when the sidebar response is incomplete', async () => {
  const sim = simulate([]);
  sim.tools.list = async () => ({ sections: [], unavailableHosts: ['local'] });
  const result = await cleanupSidebarSection('a', [], sim.tools);
  assert.equal(result.status, 'pending');
  assert.deepEqual(sim.deletions, []);
});
