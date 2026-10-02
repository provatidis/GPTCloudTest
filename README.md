# DeFi Playground

A browser-based DeFi lab for reproducible liquidity scenarios and virtual pool experiments. Compare holding with a 50/50 ETH/USDC position, share your assumptions, export results, and explore swaps without connecting a wallet.

## Liquidity scenario lab

Enter an initial investment, starting ETH price, future ETH price, and an optional total dollar amount of fee income earned by the position. Results include:

- Final dollar values and returns for holding versus providing liquidity.
- The ETH and USDC owned by each strategy at the future price.
- Impermanent loss before fees, the net difference after assumed fees, and fees needed to match holding.
- A price-range chart and comparison rows with the same investment and assumed fees.

The default example invests $5,000 at $2,000/ETH, then values the position at $4,000/ETH with $100 in assumed fees. Holding ends at $7,500; liquidity holds 0.883883 ETH and 3,535.53 USDC, worth $7,071.07 before fees or $7,171.07 including the assumed cash income. $428.93 in total fees would match holding.

**Copy scenario link** creates a URL fragment containing only the four assumptions and model version (`cp50-v1`). Opening it restores the same scenario without changing the visitor's saved swap balances or activity. Clipboard failures show a selectable link for manual copying. Invalid or unsupported links show a message and use the default scenario. Editing a shared scenario does not change the original URL; copy a new link to share the edited assumptions. Ordinary visits use the default scenario.

**Export CSV** downloads the comparison rows with the inputs, model version, token balances, dollar outcomes, before-fee impermanent loss, and break-even fee income. **Reset scenario** restores the calculator's defaults; **Reset sandbox** separately clears the virtual swap session.

### Model cp50-v1

The calculator models a full-range constant-product position with equal initial dollar allocations and USDC fixed at $1. Ideal, frictionless arbitrage rebalances the pool to the supplied future ETH market price, preserving the position's token product before fees. It describes endpoint balances, not a transaction path or a specific deployed protocol.

For investment V, starting ETH price P0, and ratio r = P1/P0:

```text
initial ETH     = V / (2 × P0)
initial USDC    = V / 2
final LP ETH    = initial ETH / sqrt(r)
final LP USDC   = initial USDC × sqrt(r)
holding value   = V × (1 + r) / 2
LP before fees  = V × sqrt(r)
LP with fees    = LP before fees + assumed fee income
IL before fees  = (LP before fees / holding value − 1) × 100%
break-even fees = holding value − LP before fees
```

Fee income is an explicit assumption added as separate USD cash at the end; it does not compound or change the token amounts. It is held fixed across comparison rows and chart prices. The calculator does not estimate fees from volume, volatility, pool share, or a time horizon. Gas costs, incentives, depegging, and concentrated liquidity are excluded. These are hypothetical outcomes, not forecasts. Reference tests cover unchanged, falling, doubled, and quadrupled prices, asset-product preservation, fee break-even, input bounds, versioned links, and CSV output. Real pool imports and protocol-specific validation are future work.

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

Tests cover swap pricing, reserve conservation, fees, stale-quote rejection, balance validation, liquidity accounting, withdrawals, storage restoration and failures, plus the scenario model, versioned links, and CSV exports.

For an optional browser smoke test, install Chromium or set `CHROMIUM_BIN` to its executable, then run `npm run test:browser`. It starts temporary servers and checks actual page interactions at desktop and mobile sizes, including calculator results, copied links, CSV downloads, shared-link restoration, and persistence. The cloud container uses Chromium with its browser sandbox disabled for this local test; the app itself needs no browser installation to serve its files.

Set `TEST_BASE_URL` to a deployed site or a local server with a project subpath to test that target instead of starting the Node server. The browser smoke test checks that the home link, scripts, styles, and swaps work at that base URL.

## Experiments

- Compare 1 ETH and 5 ETH swaps to see how trade size changes price impact.
- Change future prices and assumed fees in the liquidity scenario lab, then share a scenario link or export its comparison.
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
- `public/scenario.js`: documented cp50-v1 model, link encoding, and CSV output.
- `public/scenario-app.js`: scenario controls, chart, comparisons, and sharing.
- `public/index.html`, `public/styles.css`: responsive interface.
- `server.js`: dependency-free static HTTP server.
- `test/`: Node calculation, storage, and scenario suites.
