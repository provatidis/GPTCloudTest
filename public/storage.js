import { initialState } from './amm.js';

// Preserve existing saved sessions across branding and repository-path changes.
export const STORAGE_KEY = 'defi-sandbox-v1';
export const MAX_HISTORY = 50;
const getBrowserStorage = () => globalThis.localStorage;
const initial = initialState();
const near = (actual, expected) => Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-9;
const nonnegative = (value) => Number.isFinite(value) && value >= 0;

function validState(state) {
  const pool = state?.pool;
  const wallet = state?.wallet;
  if (!pool || !wallet) return false;
  if (![pool.eth, pool.usdc, pool.supply].every((value) => Number.isFinite(value) && value > 0)) return false;
  if (![wallet.eth, wallet.usdc, wallet.lp].every(nonnegative) || wallet.lp >= pool.supply) return false;
  // This sandbox has no outside funds: trades and liquidity moves conserve both assets.
  return near(pool.eth + wallet.eth, initial.pool.eth + initial.wallet.eth)
    && near(pool.usdc + wallet.usdc, initial.pool.usdc + initial.wallet.usdc)
    && near(pool.supply - wallet.lp, initial.pool.supply);
}

function validSession(session) {
  if (!session || session.version !== 1 || !validState(session.state)) return false;
  if (!Number.isSafeInteger(session.actions) || session.actions < 0) return false;
  if (!Array.isArray(session.history) || session.history.length !== Math.min(session.actions, MAX_HISTORY)) return false;
  return session.history.every((item) => item
    && ['Swap complete', 'Liquidity added', 'Liquidity withdrawn'].includes(item.title)
    && typeof item.details === 'string' && item.details.length <= 200
    && ['→', '+', '↓'].includes(item.icon)
    && typeof item.time === 'string' && item.time.length <= 40 && Number.isFinite(Date.parse(item.time)));
}

function emptySession(status) {
  return { state: initialState(), actions: 0, history: [], status };
}

export function loadSession(getStorage = getBrowserStorage) {
  try {
    const storage = getStorage();
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return emptySession('new');
    let session;
    try { session = JSON.parse(raw); } catch { /* Treat malformed data as an invalid session. */ }
    if (!validSession(session)) {
      storage.removeItem(STORAGE_KEY);
      return emptySession('invalid');
    }
    return { state: session.state, actions: session.actions, history: session.history, status: 'restored' };
  } catch {
    return emptySession('unavailable');
  }
}

export function saveSession(state, actions, history, getStorage = getBrowserStorage) {
  try {
    const session = { version: 1, state, actions, history: history.slice(0, MAX_HISTORY) };
    if (!validSession(session)) return false;
    getStorage().setItem(STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    // Browser privacy settings or a full storage quota must not stop virtual trades.
    return false;
  }
}

export function clearSession(getStorage = getBrowserStorage) {
  try {
    getStorage().removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
