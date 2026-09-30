import { initialState, quoteSwap, swap, quoteDeposit, deposit, withdraw, impermanentLoss, portfolioValue, MARKET_PRICE } from './amm.js';
import { loadSession, saveSession, clearSession, MAX_HISTORY } from './storage.js';

const $ = (id) => document.getElementById(id);
const fmt = (value, digits = 2) => value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const usd = (value) => `$${fmt(value)}`;
const tokenFmt = (value, token) => `${fmt(value, token === 'eth' ? 6 : 2)} ${token.toUpperCase()}`;
const saved = loadSession();
let state = saved.state;
let actions = saved.actions;
let history = saved.history;
let displayedQuote = null;
const emptyActivity = $('activity').firstElementChild.cloneNode(true);

function storageNotice(status) {
  $('storage-status').textContent = status === 'unavailable'
    ? 'Browser storage is unavailable. Changes may not survive refresh; Reset may not clear a previous saved session.'
    : status === 'invalid'
      ? 'The saved sandbox was invalid and has been reset. New actions will be saved in this browser.'
      : 'Your sandbox is saved in this browser. Reset clears the saved session.';
}

function persist() {
  storageNotice(saveSession(state, actions, history) ? 'saved' : 'unavailable');
}

function renderCurve() {
  const { eth, usdc } = state.pool;
  const xMin = eth * 0.4;
  const xMax = eth * 2.4;
  const yMax = usdc * 2.6;
  const points = Array.from({ length: 90 }, (_, i) => {
    const x = xMin + (xMax - xMin) * i / 89;
    return `${i ? 'L' : 'M'}${48 + (x - xMin) / (xMax - xMin) * 487},${190 - (eth * usdc / x) / yMax * 165}`;
  });
  $('curve-path').setAttribute('d', points.join(' '));
  $('curve-dot').setAttribute('cx', 48 + (eth - xMin) / (xMax - xMin) * 487);
  $('curve-dot').setAttribute('cy', 190 - usdc / yMax * 165);
  $('curve-caption').textContent = `k = ${fmt(eth * usdc, 0)}`;
  $('curve-title').textContent = `Constant-product curve. Current reserves: ${tokenFmt(eth, 'eth')} and ${tokenFmt(usdc, 'usdc')}. Axes rescale with the pool.`;
}

function renderSwap() {
  const token = $('input-token').value;
  const other = token === 'eth' ? 'usdc' : 'eth';
  const amount = Number($('swap-amount').value);
  $('input-balance').textContent = `Balance: ${fmt(state.wallet[token], token === 'eth' ? 4 : 2)}`;
  $('output-balance').textContent = `Balance: ${fmt(state.wallet[other], other === 'eth' ? 4 : 2)}`;
  $('output-token').textContent = other.toUpperCase();
  displayedQuote = null;
  try {
    const quote = quoteSwap(state.pool, token, amount);
    const minimum = quote.output * (1 - Number($('slippage').value));
    displayedQuote = { token, amount, minimum };
    $('swap-output').textContent = fmt(quote.output, other === 'eth' ? 6 : 2);
    $('fee').textContent = tokenFmt(quote.fee, token);
    $('impact').textContent = `${fmt(quote.priceImpact)}%`;
    $('minimum').textContent = tokenFmt(minimum, other);
    $('swap-button').disabled = amount > state.wallet[token];
    $('swap-error').textContent = amount > state.wallet[token] ? 'Not enough virtual funds.' : quote.priceImpact > 5 ? 'Large trade: price impact exceeds 5%.' : '';
  } catch (error) {
    for (const id of ['swap-output', 'fee', 'impact', 'minimum']) $(id).textContent = '—';
    $('swap-button').disabled = true;
    $('swap-error').textContent = error.message;
  }
}

function renderDeposit() {
  $('lp-balance').textContent = fmt(state.wallet.lp, 6);
  $('withdraw').disabled = state.wallet.lp <= 0;
  try {
    const quote = quoteDeposit(state.pool, Number($('deposit-amount').value));
    $('deposit-usdc').textContent = tokenFmt(quote.usdc, 'usdc');
    $('deposit-lp').textContent = fmt(quote.lp, 6);
    const insufficient = quote.eth > state.wallet.eth || quote.usdc > state.wallet.usdc;
    $('deposit-button').disabled = insufficient;
    $('lp-error').textContent = insufficient ? 'Not enough virtual funds for both tokens.' : '';
  } catch (error) {
    $('deposit-usdc').textContent = '—';
    $('deposit-lp').textContent = '—';
    $('deposit-button').disabled = true;
    $('lp-error').textContent = error.message;
  }
}

function render() {
  $('portfolio').textContent = usd(portfolioValue(state));
  $('price').textContent = usd(state.pool.usdc / state.pool.eth);
  $('liquidity').textContent = usd(state.pool.eth * MARKET_PRICE + state.pool.usdc);
  $('share').textContent = `${fmt(state.wallet.lp / state.pool.supply * 100)}%`;
  $('eth-reserve').textContent = fmt(state.pool.eth, 4);
  $('usdc-reserve').textContent = fmt(state.pool.usdc);
  renderSwap();
  renderDeposit();
  renderCurve();
}

function renderActivity() {
  $('activity-count').textContent = `${actions} ${actions === 1 ? 'action' : 'actions'}`;
  $('activity').replaceChildren();
  if (!history.length) $('activity').append(emptyActivity.cloneNode(true));
  for (const item of history) $('activity').append(activityItem(item));
}

function activityItem({ title, details, icon, time: timestamp }) {
  const li = document.createElement('li');
  const symbol = document.createElement('span');
  symbol.className = 'activity-icon';
  symbol.textContent = icon;
  const text = document.createElement('div');
  text.className = 'activity-text';
  const heading = document.createElement('p');
  heading.textContent = title;
  const description = document.createElement('span');
  description.className = 'muted';
  description.textContent = details;
  text.append(heading, description);
  const time = document.createElement('time');
  time.className = 'activity-time';
  time.dateTime = timestamp;
  time.textContent = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  li.append(symbol, text, time);
  return li;
}

function logAction(title, details, icon) {
  actions += 1;
  history.unshift({ title, details, icon, time: new Date().toISOString() });
  history = history.slice(0, MAX_HISTORY);
  renderActivity();
  persist();
}

$('swap-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!displayedQuote) return;
  try {
    const { token, amount, minimum } = displayedQuote;
    const other = token === 'eth' ? 'usdc' : 'eth';
    const next = swap(state, token, amount, minimum);
    const received = next.wallet[other] - state.wallet[other];
    state = next;
    logAction('Swap complete', `${tokenFmt(amount, token)} → ${tokenFmt(received, other)}`, '→');
    render();
  } catch (error) { $('swap-error').textContent = error.message; }
});
for (const id of ['swap-amount', 'input-token', 'slippage']) $(id).addEventListener('input', renderSwap);
$('reverse').addEventListener('click', () => {
  $('input-token').value = $('input-token').value === 'eth' ? 'usdc' : 'eth';
  $('swap-amount').value = $('input-token').value === 'eth' ? '1' : '2000';
  renderSwap();
});
$('deposit-amount').addEventListener('input', renderDeposit);
$('deposit-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const amount = Number($('deposit-amount').value);
    const quote = quoteDeposit(state.pool, amount);
    state = deposit(state, amount);
    logAction('Liquidity added', `${tokenFmt(amount, 'eth')} + ${tokenFmt(quote.usdc, 'usdc')}`, '+');
    render();
  } catch (error) { $('lp-error').textContent = error.message; }
});
$('withdraw').addEventListener('click', () => {
  try {
    const next = withdraw(state, 1);
    const details = `${tokenFmt(next.wallet.eth - state.wallet.eth, 'eth')} + ${tokenFmt(next.wallet.usdc - state.wallet.usdc, 'usdc')}`;
    state = next;
    logAction('Liquidity withdrawn', details, '↓');
    render();
  } catch (error) { $('lp-error').textContent = error.message; }
});
function selectTab(selected) {
  for (const id of ['swap', 'lp']) {
    $(id + '-tab').classList.toggle('active', id === selected);
    $(id + '-tab').setAttribute('aria-selected', String(id === selected));
    $(id + '-tab').tabIndex = id === selected ? 0 : -1;
    $(id + '-panel').hidden = id !== selected;
  }
}
for (const id of ['swap', 'lp']) {
  $(id + '-tab').addEventListener('click', () => selectTab(id));
  $(id + '-tab').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'swap' : event.key === 'End' ? 'lp' : id === 'swap' ? 'lp' : 'swap';
    selectTab(next);
    $(next + '-tab').focus();
  });
}
$('reset').addEventListener('click', () => {
  state = initialState();
  actions = 0;
  history = [];
  renderActivity();
  storageNotice(clearSession() ? 'new' : 'unavailable');
  $('swap-amount').value = '1';
  $('input-token').value = 'eth';
  $('deposit-amount').value = '1';
  $('slippage').value = '0.01';
  $('price-ratio').value = '2';
  selectTab('swap');
  renderLoss();
  render();
});
function renderLoss() {
  const ratio = Number($('price-ratio').value);
  const change = (ratio - 1) * 100;
  $('price-change').textContent = `${change >= 0 ? '+' : '−'}${fmt(Math.abs(change), 0)}%`;
  const loss = impermanentLoss(ratio);
  $('loss').textContent = `${loss < 0 ? '−' : ''}${fmt(Math.abs(loss))}%`;
}
$('price-ratio').addEventListener('input', renderLoss);
renderLoss();
render();
renderActivity();
storageNotice(saved.status);
