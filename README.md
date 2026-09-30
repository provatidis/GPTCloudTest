# DeFi Playground

A browser-based DeFi lab built to explore Codex Cloud development. Trade virtual ETH and USDC, provide liquidity, and learn how a constant-product automated market maker works.

## Online preview with GitHub Pages

The workflow in `.github/workflows/pages.yml` tests the project and publishes only `public/` whenever `main` changes. It also runs tests on pull requests without publishing them. No hosting credentials or backend server are needed.

Enable it once in the repository's **Settings → Pages → Build and deployment → Source → GitHub Actions**. If the first workflow run happened before Pages was enabled, open **Actions → Test and publish DeFi Playground → Run workflow** and select `main`.

After a successful deployment, the preview is available at https://provatidis.github.io/GPTCloudTest/. The URL is not live until Pages is enabled and the deployment finishes. Subsequent pushes to `main` update the same address. Repository settings and the GitHub plan must permit Pages publishing.

## Run

Requires Node.js 22 or newer. No dependencies or installation step are needed.

```sh
cd /workspace/GPTCloudTest
npm start
```

The HTTP server defaults to loopback port 3000. Set `HOST` and `PORT` to change its binding. It serves only the `public/` directory. To verify it from the cloud machine:

```sh
curl --fail http://127.0.0.1:3000/
```

The cloud onboarding interface does not expose a browser preview. To use the interface locally, clone the repository, run `npm start` from its directory, and open your browser at loopback port 3000. No wallet, API key, network connection, or blockchain node is required.

## Test

```sh
npm test
```

Tests cover swap pricing, reserve conservation, fees, stale-quote rejection, balance validation, liquidity accounting, withdrawals, impermanent-loss reference scenarios, storage restoration, reset, invalid data, and storage failures.

For an optional browser smoke test, install Chromium or set `CHROMIUM_BIN` to its executable, then run `npm run test:browser`. It starts temporary servers and checks actual page interactions at desktop and mobile sizes. The cloud container uses Chromium with its browser sandbox disabled for this local test; the app itself needs no browser installation to serve its files.

Set `TEST_BASE_URL` to a deployed site or a local server with a project subpath to test that target instead of starting the Node server. The browser smoke test checks that the home link, scripts, styles, and swaps work at that base URL.

## Experiments

- Compare 1 ETH and 5 ETH swaps to see how trade size changes price impact.
- Reverse the swap direction to trade USDC for ETH.
- Deposit matching ETH and USDC to receive LP tokens, then make a swap and withdraw your pool share.
- Move the impermanent-loss slider to compare liquidity provision with holding the initial assets.
- Reset to restore the initial pool and virtual wallet.

## Model and limitations

The starting pool holds 100 ETH and 200,000 USDC. Your virtual wallet starts with 10 ETH and 20,000 USDC. Exact-input swaps use `output = reserveOut × (input × 0.997) / (reserveIn + input × 0.997)`. The 0.3% input fee stays in the pool, so the reserve product grows with trades. Price impact excludes this fee and compares execution against the fee-adjusted pre-trade spot quote.

Liquidity deposits match the pool ratio; LP tokens represent proportional ownership. Portfolio and pool values use a fixed $2,000 ETH reference price. The pool exchange rate changes with trades. The curve axes rescale with reserves.

The impermanent-loss calculator is a separate hypothetical 50/50 pool, assumes arbitrage after a market-price change, and excludes trading fees. It does not change the active simulation. Slippage tolerance protects the displayed quote, though this single-user simulator has no external trades or transaction delays.

Pool reserves, virtual wallet balances, and the latest 50 activity entries are saved in this browser's `localStorage` after successful transactions. The total action count is retained. Refreshing or reopening the site restores the saved sandbox; Reset sandbox removes it and restores the starting balances. Form inputs and the independent impermanent-loss slider start at their defaults on reload.

Saved data is versioned and validated before use. Invalid or incompatible sessions fall back to the starting sandbox. If browser storage is unavailable or full, the app remains usable and displays a notice that changes may not survive refresh. Storage is specific to this browser and site; it does not sync across devices. Open tabs keep their own in-memory state, and the last successful save wins. Clearing browser data removes the saved session. No credentials or real assets are stored.

Calculations use JavaScript floating-point numbers for learning, not production financial accounting. There are no real funds, live data, smart contracts, persistent accounts, or investment recommendations.

## Project structure

- `public/amm.js`: pure pool and wallet calculations.
- `public/app.js`: interactions and presentation.
- `public/storage.js`: versioned, validated browser persistence.
- `public/index.html`, `public/styles.css`: responsive interface.
- `server.js`: dependency-free static HTTP server.
- `test/amm.test.js`: Node test suite.
