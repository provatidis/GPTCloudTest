import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, deposit, swap, withdraw } from '../public/amm.js';
import { STORAGE_KEY, MAX_HISTORY, loadSession, saveSession, clearSession } from '../public/storage.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

const activity = (title = 'Swap complete') => ({ title, details: '1 ETH → 1,974.32 USDC', icon: '→', time: '2026-09-30T12:00:00.000Z' });
const session = () => ({ version: 1, state: initialState(), actions: 0, history: [] });

test('new browser storage starts with the original sandbox', () => {
  const loaded = loadSession(() => memoryStorage());
  assert.equal(loaded.status, 'new');
  assert.deepEqual(loaded.state, initialState());
  assert.deepEqual(loaded.history, []);
});

test('swaps, deposits, and withdrawals round trip through storage', () => {
  const storage = memoryStorage();
  let state = initialState();
  for (const [index, next] of [
    (state) => swap(state, 'eth', 1),
    (state) => deposit(state, 1),
    (state) => withdraw(state, 1),
  ].entries()) {
    state = next(state);
    const history = Array.from({ length: index + 1 }, () => activity());
    assert.equal(saveSession(state, index + 1, history, () => storage), true);
    const loaded = loadSession(() => storage);
    assert.equal(loaded.status, 'restored');
    assert.deepEqual(loaded.state, state);
    assert.deepEqual(loaded.history, history);
    assert.equal(loaded.actions, index + 1);
  }
});

test('reset removes only this app’s saved session', () => {
  const storage = memoryStorage();
  storage.setItem('another-app', 'keep');
  saveSession(swap(initialState(), 'eth', 1), 1, [activity()], () => storage);
  assert.equal(clearSession(() => storage), true);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.getItem('another-app'), 'keep');
  assert.equal(loadSession(() => storage).status, 'new');
});

test('malformed JSON and incompatible versions reset safely', () => {
  for (const raw of ['{broken', 'null', '[]', JSON.stringify({ ...session(), version: 2 })]) {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, raw);
    const loaded = loadSession(() => storage);
    assert.equal(loaded.status, 'invalid');
    assert.deepEqual(loaded.state, initialState());
    assert.equal(storage.getItem(STORAGE_KEY), null);
  }
});

test('invalid reserves, balances, ownership, and asset totals are rejected', () => {
  const invalidStates = [
    {},
    { ...initialState(), pool: { ...initialState().pool, eth: 0 } },
    { ...initialState(), wallet: { ...initialState().wallet, eth: -1 } },
    { ...initialState(), wallet: { ...initialState().wallet, usdc: '20000' } },
    { ...initialState(), wallet: { ...initialState().wallet, lp: 1e10 } },
    { ...initialState(), pool: { ...initialState().pool, supply: 1e308 } },
    { ...initialState(), wallet: { ...initialState().wallet, eth: 20 } },
  ];
  for (const state of invalidStates) {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...session(), state }));
    assert.equal(loadSession(() => storage).status, 'invalid');
  }
  assert.equal(saveSession({ ...initialState(), wallet: { eth: NaN, usdc: 0, lp: 0 } }, 0, [], () => memoryStorage()), false);
});

test('invalid history entries and action counts are rejected', () => {
  for (const change of [
    { actions: -1 }, { actions: 0.5 }, { actions: 1, history: [] },
    { actions: 1, history: [{ ...activity(), time: 'not a date' }] },
    { actions: 1, history: [{ ...activity(), title: '<script>bad</script>' }] },
    { actions: 1, history: [{ ...activity(), details: 'x'.repeat(201) }] },
  ]) {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...session(), ...change }));
    assert.equal(loadSession(() => storage).status, 'invalid');
  }
});

test('activity history stays bounded while retaining the total action count', () => {
  const storage = memoryStorage();
  const history = Array.from({ length: MAX_HISTORY + 5 }, (_, index) => ({ ...activity(), details: `Action ${index}` }));
  assert.equal(saveSession(initialState(), history.length, history, () => storage), true);
  const loaded = loadSession(() => storage);
  assert.equal(loaded.actions, MAX_HISTORY + 5);
  assert.deepEqual(loaded.history, history.slice(0, MAX_HISTORY));
});

test('blocked storage getters, reads, writes, and resets do not throw', () => {
  const blocked = () => { throw new Error('SecurityError'); };
  assert.equal(loadSession(blocked).status, 'unavailable');
  assert.equal(loadSession(() => ({ getItem: blocked })).status, 'unavailable');
  assert.equal(saveSession(initialState(), 0, [], blocked), false);
  assert.equal(saveSession(initialState(), 0, [], () => ({ setItem: blocked })), false);
  assert.equal(clearSession(blocked), false);
  assert.equal(clearSession(() => ({ removeItem: blocked })), false);
});
