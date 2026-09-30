// Optional real-browser smoke test, using Chromium's DevTools protocol and Node built-ins.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'defi-browser-'));
const children = [];
let socket;
let sequence = 0;
const pending = new Map();
const errors = [];

function start(command, args, options, pattern) {
  const child = spawn(command, args, options);
  children.push(child);
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Startup timed out: ${command}\n${output}`)), 15000);
    const read = (chunk) => {
      output += chunk;
      const match = output.match(pattern);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`${command} exited ${code}\n${output}`)); });
  });
}

function call(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`DevTools timed out: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed');
  return result.result.value;
}

const text = (id) => evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`);
const click = (id) => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
const fill = (id, value) => evaluate(`(() => { const el = document.getElementById(${JSON.stringify(id)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);

async function reload() {
  const loaded = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.removeEventListener('message', listener); reject(new Error('Reload timed out')); }, 15000);
    const listener = ({ data }) => {
      if (JSON.parse(data).method !== 'Page.loadEventFired') return;
      clearTimeout(timer);
      socket.removeEventListener('message', listener);
      resolve();
    };
    socket.addEventListener('message', listener);
  });
  await call('Page.reload');
  await loaded;
}

try {
  let base = process.env.TEST_BASE_URL;
  if (!base) {
    const port = await start(process.execPath, ['server.js'], { cwd: project, env: { ...process.env, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] }, /listening on port (\d+)/);
    base = `http://127.0.0.1:${port}/`;
    assert.equal((await fetch(base + 'missing')).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '%2e%2e%2fpackage.json')).status, 403);
    console.log('PASS: missing resources, methods, and directory isolation');
  }
  if (!base.endsWith('/')) base += '/';
  for (const path of ['', 'app.js', 'amm.js', 'storage.js', 'styles.css']) assert.equal((await fetch(base + path)).status, 200);
  console.log('PASS: HTTP assets');

  const devtools = await start(process.env.CHROMIUM_BIN || 'chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] }, /DevTools listening on (ws:\/\/[^\s]+)/);
  const endpoint = new URL(devtools);
  const pageResponse = await fetch(`http://${endpoint.host}/json/new?about:blank`, { method: 'PUT' });
  assert.equal(pageResponse.status, 200, 'Chromium created a test page');
  const page = await pageResponse.json();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await once(socket, 'open');
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    const task = pending.get(message.id);
    if (task) {
      clearTimeout(task.timer);
      pending.delete(message.id);
      if (message.error) task.reject(new Error(message.error.message));
      else task.resolve(message.result);
    }
  });
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: base });
  await evaluate(`new Promise((resolve, reject) => { const deadline = Date.now() + 10000; const check = () => { if (document.getElementById('swap-output')?.textContent === '1,974.32') resolve(true); else if (Date.now() > deadline) reject(new Error('App did not initialize')); else setTimeout(check, 50); }; check(); })`);
  assert.equal(await text('portfolio'), '$40,000.00');
  assert.equal(await evaluate("document.querySelector('.brand').href"), base, 'Home link stays inside the project path');
  await click('swap-button');
  assert.equal(await text('eth-reserve'), '101.0000');
  assert.equal(await text('activity-count'), '1 action');
  assert.ok((await text('activity')).includes('Swap complete'));
  const swappedPortfolio = await text('portfolio');
  await reload();
  assert.equal(await text('eth-reserve'), '101.0000');
  assert.equal(await text('portfolio'), swappedPortfolio);
  assert.equal(await text('activity-count'), '1 action');
  assert.ok((await text('activity')).includes('Swap complete'));
  await click('reverse');
  assert.equal(await text('output-token'), 'ETH');
  await click('swap-button');
  assert.equal(await text('activity-count'), '2 actions');
  await fill('swap-amount', '999999');
  assert.equal(await evaluate("document.getElementById('swap-button').disabled"), true);
  assert.match(await text('swap-error'), /funds/);
  await fill('swap-amount', '-1');
  assert.match(await text('swap-error'), /positive/);
  console.log('PASS: swap, reversed swap, activity log, and input validation');

  await click('reset');
  await click('lp-tab');
  assert.equal(await evaluate("document.getElementById('lp-panel').hidden"), false);
  await click('deposit-button');
  assert.equal(await text('share'), '0.99%');
  assert.equal(await text('eth-reserve'), '101.0000');
  const lpBalance = await text('lp-balance');
  await reload();
  assert.equal(await text('share'), '0.99%');
  assert.equal(await text('lp-balance'), lpBalance);
  await click('lp-tab');
  await click('withdraw');
  assert.equal(await text('share'), '0.00%');
  assert.equal(await text('portfolio'), '$40,000.00');
  assert.equal(await text('eth-reserve'), '100.0000');
  assert.equal(await evaluate("document.getElementById('withdraw').disabled"), true);
  await reload();
  assert.equal(await text('share'), '0.00%');
  assert.equal(await text('portfolio'), '$40,000.00');
  assert.equal(await text('activity-count'), '2 actions');
  console.log('PASS: liquidity deposit and withdrawal through the interface');

  await fill('price-ratio', '1');
  assert.equal(await text('loss'), '0.00%');
  await fill('price-ratio', '4');
  assert.equal(await text('loss'), '−20.00%');
  await click('reset');
  assert.equal(await text('loss'), '−5.72%');
  assert.equal(await text('activity-count'), '0 actions');
  assert.equal(await text('portfolio'), '$40,000.00');
  assert.equal(await evaluate("localStorage.getItem('defi-sandbox-v1')"), null);
  await reload();
  assert.equal(await text('activity-count'), '0 actions');
  assert.equal(await text('portfolio'), '$40,000.00');
  console.log('PASS: balances, LP ownership, and activity survive reload; reset stays cleared');

  await evaluate("localStorage.setItem('defi-sandbox-v1', '{broken')");
  await reload();
  assert.equal(await text('portfolio'), '$40,000.00');
  assert.match(await text('storage-status'), /invalid/);
  assert.equal(await evaluate("localStorage.getItem('defi-sandbox-v1')"), null);
  const blockedStorageScript = await call('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });" });
  await reload();
  assert.match(await text('storage-status'), /unavailable/);
  await click('swap-button');
  assert.equal(await text('eth-reserve'), '101.0000');
  assert.equal(await text('activity-count'), '1 action');
  await click('reset');
  assert.equal(await text('portfolio'), '$40,000.00');
  await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: blockedStorageScript.identifier });
  await reload();
  const quotaScript = await call('Page.addScriptToEvaluateOnNewDocument', { source: "Storage.prototype.setItem = function () { throw new DOMException('Storage full', 'QuotaExceededError'); };" });
  await reload();
  await click('swap-button');
  assert.equal(await text('eth-reserve'), '101.0000');
  assert.match(await text('storage-status'), /unavailable/);
  await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: quotaScript.identifier });
  await reload();
  assert.equal(await text('portfolio'), '$40,000.00');
  console.log('PASS: damaged data, blocked storage, and full storage do not break the app');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  console.log('PASS: impermanent-loss scenarios, reset, and desktop layout');

  if (process.env.SCREENSHOT_PATH) {
    const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(process.env.SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  await click('swap-button');
  assert.equal(await text('activity-count'), '1 action');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log('PASS: mobile layout and interaction; no uncaught browser errors');
} finally {
  socket?.close();
  for (const task of pending.values()) clearTimeout(task.timer);
  for (const child of children.reverse()) {
    if (child.exitCode === null) {
      const stopped = once(child, 'exit');
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 3000);
      await stopped;
      clearTimeout(force);
    }
  }
  await rm(profile, { recursive: true, force: true });
}
