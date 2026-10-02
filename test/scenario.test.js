import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL, DEFAULT_SCENARIO, LIMITS, calculateScenario, comparisonScenarios, scenarioHash, scenarioFromHash, scenarioCSV } from '../public/scenario.js';

const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);

test('$5,000 at a doubled ETH price matches the reference scenario', () => {
  const result = calculateScenario(DEFAULT_SCENARIO);
  close(result.holdValue, 7500);
  close(result.lpBeforeFees, 7071.067811865476);
  close(result.lpValue, 7171.067811865476);
  close(result.difference, -328.932188134524);
  close(result.impermanentLoss, -5.719095841793664);
  close(result.breakEvenFees, 428.932188134524);
  close(result.held.eth, 1.25);
  close(result.held.usdc, 2500);
  close(result.pooled.eth, 0.8838834764831843);
  close(result.pooled.usdc, 3535.533905932738);
});

test('unchanged prices preserve the position and separate fees from its assets', () => {
  const result = calculateScenario({ ...DEFAULT_SCENARIO, futurePrice: 2000, fees: 100 });
  close(result.lpBeforeFees, 5000);
  close(result.holdValue, 5000);
  close(result.lpValue, 5100);
  close(result.difference, 100);
  close(result.impermanentLoss, 0);
  close(result.breakEvenFees, 0);
  assert.deepEqual(result.pooled, result.held);
});

test('quadrupled prices produce a 20% shortfall before fees', () => {
  const result = calculateScenario({ ...DEFAULT_SCENARIO, futurePrice: 8000, fees: 0 });
  close(result.lpValue, 10000);
  close(result.holdValue, 12500);
  close(result.impermanentLoss, -20);
  close(result.pooled.eth, 0.625);
  close(result.pooled.usdc, 5000);
});

test('falling prices preserve the constant product and rebalance to market price', () => {
  const result = calculateScenario({ ...DEFAULT_SCENARIO, futurePrice: 1000, fees: 0 });
  close(result.holdValue, 3750);
  close(result.lpValue, 3535.533905932738);
  close(result.pooled.eth * result.pooled.usdc, result.held.eth * result.held.usdc);
  close(result.pooled.usdc / result.pooled.eth, 1000);
  assert.ok(result.pooled.eth > result.held.eth);
  assert.ok(result.pooled.usdc < result.held.usdc);
});

test('break-even fees exactly offset the gap and never alter token amounts', () => {
  const without = calculateScenario({ ...DEFAULT_SCENARIO, fees: 0 });
  const withFees = calculateScenario({ ...DEFAULT_SCENARIO, fees: without.breakEvenFees });
  close(withFees.lpValue, withFees.holdValue);
  close(withFees.differencePercent, 0);
  assert.deepEqual(withFees.pooled, without.pooled);
  close(withFees.impermanentLoss, without.impermanentLoss);
});

test('both strategies scale with the investment when absolute fees are zero', () => {
  const first = calculateScenario({ ...DEFAULT_SCENARIO, fees: 0 });
  const second = calculateScenario({ ...DEFAULT_SCENARIO, investment: 10000, fees: 0 });
  close(second.holdValue, first.holdValue * 2);
  close(second.lpValue, first.lpValue * 2);
  close(second.impermanentLoss, first.impermanentLoss);
});

test('invalid, missing, nonnumeric, and out-of-range assumptions are rejected', () => {
  assert.throws(() => calculateScenario(null), /Investment/);
  for (const [key, limits] of Object.entries(LIMITS)) {
    for (const value of [NaN, Infinity, '5000', undefined, limits.min - 0.01, limits.max + 1]) {
      assert.throws(() => calculateScenario({ ...DEFAULT_SCENARIO, [key]: value }), /must be between/);
    }
  }
});

test('allowed boundary scenarios have finite values and usable comparison rows', () => {
  for (const initialPrice of [LIMITS.initialPrice.min, LIMITS.initialPrice.max]) {
    for (const futurePrice of [LIMITS.futurePrice.min, LIMITS.futurePrice.max]) {
      const input = { ...DEFAULT_SCENARIO, initialPrice, futurePrice, investment: LIMITS.investment.max, fees: LIMITS.fees.max };
      const result = calculateScenario(input);
      for (const key of ['lpValue', 'holdValue', 'difference', 'impermanentLoss', 'breakEvenFees']) assert.ok(Number.isFinite(result[key]));
      assert.ok(comparisonScenarios(input).some((row) => row.futurePrice === futurePrice));
    }
  }
});

test('comparisons are ordered, deduplicated, and keep the same investment and fees', () => {
  const rows = comparisonScenarios(DEFAULT_SCENARIO);
  assert.deepEqual(rows.map((row) => row.futurePrice), [1000, 2000, 4000]);
  assert.ok(rows.every((row) => row.investment === 5000 && row.fees === 100));
  assert.deepEqual(comparisonScenarios({ ...DEFAULT_SCENARIO, futurePrice: 3000 }).map((row) => row.futurePrice), [1000, 2000, 3000, 4000]);
});

test('scenario links round trip decimal inputs and include only versioned assumptions', () => {
  const input = { investment: 1234.56, initialPrice: 1976.54, futurePrice: 2345.67, fees: 0 };
  const hash = scenarioHash({ ...input, wallet: 'do not share', activity: ['private session'] });
  assert.deepEqual(scenarioFromHash(hash), input);
  assert.ok(hash.includes(MODEL));
  assert.ok(!hash.includes('wallet'));
  assert.ok(!hash.includes('activity'));
  assert.equal(scenarioFromHash('#lp-lab'), null);
});

test('unsupported, duplicate, missing, and malformed shared inputs are rejected', () => {
  const valid = scenarioHash(DEFAULT_SCENARIO);
  for (const hash of [
    valid.replace(MODEL, 'cp50-v99'), valid + '&investment=1', valid + '&scenario=' + MODEL,
    valid + '&wallet=123', valid.replace('investment=5000', 'investment='),
    valid.replace('investment=5000', 'investment=NaN'), valid.replace('&fees=100', ''),
  ]) assert.throws(() => scenarioFromHash(hash));
});

test('CSV exports expose the assumptions, version, and reproducible comparison values', () => {
  const csv = scenarioCSV(DEFAULT_SCENARIO);
  const [header, ...rows] = csv.trim().split('\r\n').map((row) => row.split(','));
  assert.equal(rows.length, 3);
  const selected = Object.fromEntries(header.map((key, i) => [key, rows[2][i]]));
  assert.equal(selected.model, MODEL);
  assert.equal(Number(selected.future_eth_price_usd), 4000);
  assert.equal(Number(selected.assumed_position_fees_usd), 100);
  close(Number(selected.hold_value_usd), 7500);
  close(Number(selected.lp_with_fees_usd), 7171.067811865476);
  close(Number(selected.break_even_fees_usd), 428.932188134524);
});
