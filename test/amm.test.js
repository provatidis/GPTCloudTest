import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, quoteSwap, swap, quoteDeposit, deposit, withdraw, impermanentLoss, portfolioValue } from '../public/amm.js';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);

test('ETH swap uses the constant-product formula and keeps its fee in reserves', () => {
  const state = initialState();
  const quote = quoteSwap(state.pool, 'eth', 1);
  close(quote.output, 1974.3160687941227);
  close(quote.fee, 0.003);
  const next = swap(state, 'eth', 1);
  close(next.pool.eth, 101);
  close(next.wallet.eth, 9);
  close(next.wallet.usdc, 20000 + quote.output);
  assert.ok(next.pool.eth * next.pool.usdc > state.pool.eth * state.pool.usdc);
  assert.equal(state.pool.eth, 100, 'Original state is unchanged');
});

test('USDC swap conserves the combined wallet and pool balances', () => {
  const state = initialState();
  const next = swap(state, 'usdc', 2000);
  close(next.wallet.eth + next.pool.eth, 110);
  close(next.wallet.usdc + next.pool.usdc, 220000);
  close(next.wallet.eth - state.wallet.eth, 0.9871580343970613);
});

test('larger trades have greater price impact', () => {
  const { pool } = initialState();
  assert.ok(quoteSwap(pool, 'eth', 5).priceImpact > quoteSwap(pool, 'eth', 1).priceImpact);
});

test('slippage rejects a stale quote without changing state', () => {
  const original = initialState();
  const minimum = quoteSwap(original.pool, 'eth', 1).output * 0.99;
  const changed = swap(original, 'eth', 5);
  const snapshot = structuredClone(changed);
  assert.throws(() => swap(changed, 'eth', 1, minimum), /slippage/);
  assert.deepEqual(changed, snapshot);
});

test('invalid and unaffordable swaps are rejected', () => {
  const state = initialState();
  for (const amount of [0, -1, NaN, Infinity]) assert.throws(() => swap(state, 'eth', amount), /positive/);
  assert.throws(() => swap(state, 'eth', 11), /funds/);
  assert.throws(() => swap(state, 'btc', 1), /ETH or USDC/);
  assert.throws(() => swap(state, 'eth', 1, NaN), /minimum/);
});

test('liquidity deposit preserves the reserve ratio and issues proportional LP tokens', () => {
  const original = initialState();
  const quote = quoteDeposit(original.pool, 1);
  close(quote.usdc, 2000);
  const next = deposit(original, 1);
  close(next.pool.usdc / next.pool.eth, 2000);
  close(next.wallet.lp / next.pool.supply, 1 / 101);
  close(portfolioValue(next), 40000);
});

test('deposit and complete withdrawal round trip restores the original balances', () => {
  const original = initialState();
  const next = withdraw(deposit(original, 2), 1);
  for (const key of ['eth', 'usdc', 'supply']) close(next.pool[key], original.pool[key]);
  for (const key of ['eth', 'usdc', 'lp']) close(next.wallet[key], original.wallet[key]);
});

test('partial withdrawal redeems only the requested fraction', () => {
  const before = deposit(initialState(), 2);
  const next = withdraw(before, 0.5);
  close(next.wallet.lp, before.wallet.lp / 2);
  close(next.wallet.eth - before.wallet.eth, 1);
  close(next.wallet.usdc - before.wallet.usdc, 2000);
});

test('LP tokens redeem a proportional share of post-trade reserves including fees', () => {
  const liquidity = deposit(initialState(), 2);
  const traded = swap(liquidity, 'eth', 1);
  const share = traded.wallet.lp / traded.pool.supply;
  const next = withdraw(traded, 1);
  close(next.wallet.eth - traded.wallet.eth, traded.pool.eth * share);
  close(next.wallet.usdc - traded.wallet.usdc, traded.pool.usdc * share);
  close(next.wallet.lp, 0);
});

test('invalid liquidity actions are rejected', () => {
  const state = initialState();
  assert.throws(() => deposit(state, 11), /funds/);
  assert.throws(() => deposit({ ...state, wallet: { ...state.wallet, usdc: 1 } }, 1), /funds/);
  assert.throws(() => deposit(state, -1), /positive/);
  assert.throws(() => withdraw(state, 1), /Add liquidity/);
  assert.throws(() => withdraw(deposit(state, 1), 1.1), /Add liquidity/);
  assert.throws(() => withdraw(deposit(state, 1), 0), /positive/);
});

test('impermanent loss matches reference scenarios and reciprocal symmetry', () => {
  close(impermanentLoss(1), 0);
  close(impermanentLoss(2), -5.719095841793664);
  close(impermanentLoss(4), -20);
  close(impermanentLoss(0.25), impermanentLoss(4));
  assert.throws(() => impermanentLoss(0), /positive/);
});
