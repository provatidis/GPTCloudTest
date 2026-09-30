export const FEE = 0.003;
export const MARKET_PRICE = 2000;

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`);
}

function validPool(pool) {
  positive(pool.eth, 'ETH reserve');
  positive(pool.usdc, 'USDC reserve');
  positive(pool.supply, 'LP supply');
}

export function initialState() {
  return { pool: { eth: 100, usdc: 200000, supply: Math.sqrt(100 * 200000) }, wallet: { eth: 10, usdc: 20000, lp: 0 } };
}

export function quoteSwap(pool, token, amount) {
  validPool(pool);
  if (!['eth', 'usdc'].includes(token)) throw new Error('Choose ETH or USDC.');
  positive(amount, 'Swap amount');
  const reserveIn = pool[token];
  const reserveOut = pool[token === 'eth' ? 'usdc' : 'eth'];
  const effectiveInput = amount * (1 - FEE);
  const output = reserveOut * (effectiveInput / (reserveIn + effectiveInput));
  const spotOutput = effectiveInput * reserveOut / reserveIn;
  return { output, fee: amount * FEE, priceImpact: (1 - output / spotOutput) * 100 };
}

// Return a new state: failed transactions never alter balances or reserves.
export function swap(state, token, amount, minimumOutput = 0) {
  const quote = quoteSwap(state.pool, token, amount);
  if (!Number.isFinite(minimumOutput) || minimumOutput < 0) throw new Error('Invalid minimum output.');
  if (amount > state.wallet[token]) throw new Error('Not enough virtual funds.');
  if (quote.output < minimumOutput) throw new Error('Price moved beyond your slippage tolerance.');
  const other = token === 'eth' ? 'usdc' : 'eth';
  return {
    pool: { ...state.pool, [token]: state.pool[token] + amount, [other]: state.pool[other] - quote.output },
    wallet: { ...state.wallet, [token]: state.wallet[token] - amount, [other]: state.wallet[other] + quote.output },
  };
}

export function quoteDeposit(pool, eth) {
  validPool(pool);
  positive(eth, 'ETH deposit');
  return { eth, usdc: eth * pool.usdc / pool.eth, lp: eth * pool.supply / pool.eth };
}

export function deposit(state, eth) {
  const quote = quoteDeposit(state.pool, eth);
  if (quote.eth > state.wallet.eth || quote.usdc > state.wallet.usdc) throw new Error('Not enough virtual funds for both tokens.');
  return {
    pool: { eth: state.pool.eth + eth, usdc: state.pool.usdc + quote.usdc, supply: state.pool.supply + quote.lp },
    wallet: { eth: state.wallet.eth - eth, usdc: state.wallet.usdc - quote.usdc, lp: state.wallet.lp + quote.lp },
  };
}

export function withdraw(state, fraction) {
  validPool(state.pool);
  positive(fraction, 'Withdrawal fraction');
  if (fraction > 1 || state.wallet.lp <= 0) throw new Error('Add liquidity before withdrawing.');
  const lp = state.wallet.lp * fraction;
  const share = lp / state.pool.supply;
  const eth = state.pool.eth * share;
  const usdc = state.pool.usdc * share;
  return {
    pool: { eth: state.pool.eth - eth, usdc: state.pool.usdc - usdc, supply: state.pool.supply - lp },
    wallet: { eth: state.wallet.eth + eth, usdc: state.wallet.usdc + usdc, lp: state.wallet.lp - lp },
  };
}

export function impermanentLoss(priceRatio) {
  positive(priceRatio, 'Price ratio');
  // Relative return compared with holding both assets; ignores fees.
  return (2 * Math.sqrt(priceRatio) / (1 + priceRatio) - 1) * 100;
}

export function portfolioValue(state) {
  const share = state.wallet.lp / state.pool.supply;
  return (state.wallet.eth + state.pool.eth * share) * MARKET_PRICE + state.wallet.usdc + state.pool.usdc * share;
}
