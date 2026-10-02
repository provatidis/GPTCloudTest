// Model cp50-v1: full-range 50/50 constant-product ETH/USDC, ideal arbitrage.
export const MODEL = 'cp50-v1';
export const DEFAULT_SCENARIO = Object.freeze({ investment: 5000, initialPrice: 2000, futurePrice: 4000, fees: 100 });
export const LIMITS = Object.freeze({
  investment: { min: 1, max: 1e9, label: 'Investment' },
  initialPrice: { min: 0.01, max: 1e7, label: 'Starting ETH price' },
  futurePrice: { min: 0.01, max: 1e7, label: 'Future ETH price' },
  fees: { min: 0, max: 1e9, label: 'Assumed fee income' },
});

export function validateScenario(input) {
  const scenario = {};
  for (const [key, { min, max, label }] of Object.entries(LIMITS)) {
    const value = input?.[key];
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${label} must be between $${min.toLocaleString('en-US')} and $${max.toLocaleString('en-US')}.`);
    }
    scenario[key] = value;
  }
  return scenario;
}

export function calculateScenario(input) {
  const scenario = validateScenario(input);
  const { investment, initialPrice, futurePrice, fees } = scenario;
  const ratio = futurePrice / initialPrice;
  const root = Math.sqrt(ratio);
  const held = { eth: investment / (2 * initialPrice), usdc: investment / 2 };
  const pooled = { eth: held.eth / root, usdc: held.usdc * root };
  const holdValue = held.eth * futurePrice + held.usdc;
  const lpBeforeFees = pooled.eth * futurePrice + pooled.usdc;
  const lpValue = lpBeforeFees + fees;
  const difference = lpValue - holdValue;
  return {
    ...scenario, ratio, held, pooled, holdValue, lpBeforeFees, lpValue, difference,
    differencePercent: difference / holdValue * 100,
    impermanentLoss: Math.min(0, (lpBeforeFees / holdValue - 1) * 100),
    breakEvenFees: Math.max(0, holdValue - lpBeforeFees),
    holdReturn: (holdValue / investment - 1) * 100,
    lpReturn: (lpValue / investment - 1) * 100,
  };
}

export function comparisonScenarios(input) {
  const scenario = validateScenario(input);
  const prices = [scenario.initialPrice * 0.5, scenario.initialPrice, scenario.initialPrice * 2, scenario.futurePrice]
    .filter((price) => price >= LIMITS.futurePrice.min && price <= LIMITS.futurePrice.max);
  return [...new Set(prices)].sort((a, b) => a - b)
    .map((futurePrice) => calculateScenario({ ...scenario, futurePrice }));
}

export function scenarioHash(input) {
  const scenario = validateScenario(input);
  const params = new URLSearchParams({
    scenario: MODEL, investment: String(scenario.investment), start: String(scenario.initialPrice),
    future: String(scenario.futurePrice), fees: String(scenario.fees),
  });
  return `#${params}`;
}

export function scenarioFromHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!params.has('scenario')) return null;
  if (params.get('scenario') !== MODEL) throw new Error('This link uses an unsupported scenario model.');
  const keys = { investment: 'investment', initialPrice: 'start', futurePrice: 'future', fees: 'fees' };
  const allowed = new Set(['scenario', ...Object.values(keys)]);
  if ([...params.keys()].some((key) => !allowed.has(key)) || params.getAll('scenario').length !== 1) {
    throw new Error('This scenario link contains unexpected or repeated inputs.');
  }
  const input = {};
  for (const [key, param] of Object.entries(keys)) {
    if (params.getAll(param).length !== 1 || !params.get(param).trim()) throw new Error('This scenario link is missing a required input.');
    input[key] = Number(params.get(param));
  }
  return validateScenario(input);
}

export function scenarioCSV(input) {
  const headers = ['model', 'investment_usd', 'initial_eth_price_usd', 'future_eth_price_usd', 'assumed_position_fees_usd', 'held_eth', 'held_usdc', 'lp_eth', 'lp_usdc', 'hold_value_usd', 'lp_before_fees_usd', 'lp_with_fees_usd', 'lp_minus_hold_usd', 'lp_minus_hold_percent', 'impermanent_loss_percent', 'break_even_fees_usd'];
  const rows = comparisonScenarios(input).map((r) => [MODEL, r.investment, r.initialPrice, r.futurePrice, r.fees, r.held.eth, r.held.usdc, r.pooled.eth, r.pooled.usdc, r.holdValue, r.lpBeforeFees, r.lpValue, r.difference, r.differencePercent, r.impermanentLoss, r.breakEvenFees]);
  return [headers, ...rows].map((row) => row.join(',')).join('\r\n') + '\r\n';
}
