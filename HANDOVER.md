# Codex session handover

## Goal and product direction

Develop this experiment into a useful, open-source DeFi analysis and education tool. The focus is transparent calculations, reproducible scenarios, and helping people understand swaps and liquidity before committing funds. The brand should support future lending, risk, portfolio, and protocol tools.

The first milestone is complete: a dollar-based LP-versus-holding calculator with inspectable assumptions, comparison charts, shareable scenarios, and CSV exports. The next proposed milestone is read-only real-pool snapshots and validation against a supported protocol. No chain, pool, RPC provider, or new brand has been selected yet.

## Repository and deployment

- GitHub: https://github.com/provatidis/GPTCloudTest
- Public preview: https://provatidis.github.io/GPTCloudTest/
- Current branding: **DeFi Playground**. The repository has not been renamed.
- Original cloud checkout: `/workspace/GPTCloudTest`.
- Original cloud working branch: `work`; changes were pushed to remote `main`.
- Latest functional implementation commit: `a19370602f4cc08ccaecfdcbf1d8cee8c305720a` (`Add shareable liquidity versus holding scenario lab`). This handover is added in a subsequent documentation commit.
- Previous milestones: `181f9df` added persistence; `1994dda` added the initial app and Pages workflow.
- At handover inspection, the working tree was clean and remote `main` matched the functional implementation commit. Check the latest status and remote before editing.
- No pull requests were created. Previous development updates were pushed directly to `main` with the user's authorization. Remember that a push to `main` publishes the website automatically.

GitHub Pages is already enabled with **Source: GitHub Actions**. `.github/workflows/pages.yml` runs unit tests on pushes to `main` and pull requests; deployment runs only for `main`. It uploads only `public/`. The Node server is for development, not production hosting.

Latest verified functional deployment: https://github.com/provatidis/GPTCloudTest/actions/runs/37033235912. It succeeded, and all seven published HTML/JS/CSS files were downloaded with TLS verification and matched the tested commit.

## Run locally

Requires **Node.js 22+**; CI uses Node.js 24. There are no third-party dependencies, install step, required secrets, wallet connections, or blockchain services.

```sh
git clone https://github.com/provatidis/GPTCloudTest.git
cd GPTCloudTest
npm test
npm start
```

If already cloned, inspect local changes and pull the latest `main` rather than cloning again. Open `localhost:3000` in your browser. Serve the app with `npm start`; do not open the HTML directly as a local file, because it uses JavaScript modules.

The server defaults to `127.0.0.1:3000`. `HOST` and `PORT` are supported overrides. Its public root is resolved relative to `server.js`, so the repository can live at a different local directory.

```sh
curl --fail http://127.0.0.1:3000/
```

For optional real-browser smoke tests, install Chromium or supply a Chrome/Chromium executable:

```sh
npm run test:browser
```

On macOS with Google Chrome installed:

```sh
CHROMIUM_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:browser
```

The smoke script starts and stops its own temporary server and browser. It uses Node built-ins and the DevTools protocol, not Playwright. `TEST_BASE_URL` can select a different server/site, including a project subpath. External testing requires working networking and trusted HTTPS certificates.

## Completed features and files

| File | Responsibility |
| --- | --- |
| `public/index.html` | Responsive page, liquidity lab, swap sandbox, accessible forms and tables. |
| `public/styles.css` | Dark green interface, charts, responsive layouts. Much of the existing CSS is compact/minified. |
| `public/amm.js` | Pure constant-product swap, deposit, withdrawal, portfolio, and IL calculations. |
| `public/app.js` | Swap sandbox interactions, activity, reserve chart, and simple IL slider. |
| `public/storage.js` | Versioned and validated localStorage persistence. |
| `public/scenario.js` | Pure `cp50-v1` scenario model, comparisons, link encoding/decoding, CSV generation. |
| `public/scenario-app.js` | Scenario inputs, chart, comparisons, copy-link fallback, CSV downloads. |
| `server.js` | Dependency-free static server with public-directory isolation and HTTP/security headers. |
| `test/amm.test.js` | 11 pool-calculation tests. |
| `test/storage.test.js` | 8 persistence tests. |
| `test/scenario.test.js` | 12 scenario, validation, link, and export tests. |
| `scripts/browser-smoke.js` | Actual desktop/mobile interactions, downloads, sharing, and storage checks. |
| `.github/workflows/pages.yml` | Unit tests and Pages deployment. |
| `README.md` | Detailed usage, equations, reference scenario, and limitations. |

### Swap sandbox

- Starts with a pool of 100 ETH and 200,000 USDC, and a wallet of 10 ETH and 20,000 USDC.
- Simulates swaps in both directions, a 0.3% fee retained in the pool, price impact, and minimum-output/slippage validation.
- Supports proportional LP deposits and withdrawals, activity history, and a reserve-product curve.
- Pool and portfolio dollar values use a fixed $2,000 ETH reference price; the pool's exchange rate changes with swaps.
- A separate simple IL slider remains available as an educational experiment.

### Persistence

- `defi-sandbox-v1` stores pool reserves, wallet balances, the total action count, and the latest 50 activity entries.
- Successful transactions save; reloads restore. Reset sandbox removes this key and restores defaults.
- Validation includes finite/nonnegative numbers, conserved asset totals, LP supply/ownership, version, and bounded activity data.
- Invalid data resets safely. Blocked/full storage shows a notice and leaves the current simulation usable.
- State is browser/origin-specific, with no device synchronization. Tabs have independent in-memory states; the last save wins.
- Activity is rendered with DOM text, not stored HTML.

### Liquidity scenario lab

Inputs: investment, initial ETH price, future ETH price, and optional assumed total fee income in USD. Shows final dollar values/returns, token amounts, net difference, before-fee IL, fee break-even, an interactive chart, presets, and comparison rows.

Model `cp50-v1` is an ideal full-range 50/50 constant-product ETH/USDC position. USDC is fixed at $1, and frictionless arbitrage rebalances to the future market price. For investment V and price ratio r:

```text
holding value  = V × (1 + r) / 2
LP before fees = V × sqrt(r)
LP with fees   = LP before fees + assumed USD fee income
IL before fees = (LP before fees / holding value − 1) × 100%
```

Fees are an explicit cash assumption, not a yield estimate. They do not compound or alter token balances and remain fixed across chart prices/comparison rows. The model excludes gas, incentives, depegging, concentrated liquidity, and trading paths. It has not been validated as a protocol-specific quote engine.

Reference example: $5,000 invested at $2,000/ETH, future price $4,000, assumed fees $100. Holding ends at $7,500; LP ends at $7,071.07 before fees or $7,171.07 with fees. Before-fee IL is −5.72%, and $428.93 total fees would match holding.

Shared links use a versioned URL fragment such as:

```text
#scenario=cp50-v1&investment=5000&start=2000&future=4000&fees=100
```

Links contain only assumptions and model version, not saved wallets/activity. They leave the visitor's swap state untouched. Invalid/unsupported links show a message and default inputs. Ordinary visits use defaults; edits do not rewrite an existing shared URL. Copy a new link for edited assumptions. Reset scenario and Reset sandbox are separate.

CSV exports include comparison inputs, model version, token balances, valuations, net differences, IL, and break-even fees.

## Validation and known limitations

- Last complete unit run: **31 passed, 0 failed/skipped**.
- Desktop/mobile browser checks passed: scenario reference results, presets, comparisons, charts, invalid inputs, clipboard success/fallback, actual CSV downloads, reopened/shared fragment links, sandbox independence, swaps/LP actions, persistence, reset, corrupt data, and unavailable/full storage.
- A hash-only navigation timing issue in the browser test helper was fixed. The test now checks reopening a shared link as a new document and also tests in-page hash changes. No unresolved test failure remains from that work.
- JavaScript floating-point calculations are educational approximations, not production on-chain integer accounting.
- No real funds, transactions, live prices, RPC integrations, accounts, backend, or database exist.
- GitHub Actions passed but emitted warnings about older action versions targeting Node 20 and an upcoming `ubuntu-latest` image change. These are maintenance items, not observed failures.
- Relative asset/home links support project subpaths. A repository rename changes the Pages address; old Pages/scenario URLs do not automatically redirect. Update README URLs, Git remote, affected cloud startup paths, and verify deployment after any rename.

## Naming work in progress

The user wants a distinctive name focused on DeFi, broad enough for future features. **No name is selected or reserved; no rename has happened.**

- Liquidity Lab was initially recommended without an availability check, then rejected as a distinctive brand after finding overlapping projects, including https://github.com/Aviral1303/liquidity-lab.
- DeFi Playground is also used by multiple other projects.
- DeFiLoom, DeFiScope, DeFiPrism, DeFiCompass, and DeFiLantern had public GitHub overlaps. DeFiForma had a close `defiformal` match.
- **Defivane** is the strongest provisional candidate; **DeFiTrellis** is the alternative. Public GitHub searches found no exact-name matches across repository names/descriptions/READMEs or account names. These results are preliminary, not proof of global uniqueness.
- PoolLens had no public repository matches in an earlier search, but the user prefers an explicitly DeFi-focused and scalable name.
- General web usage, domains, handles outside GitHub, and trademarks have **not** been cleared. Do not claim availability or rename based solely on these GitHub searches.

## Cloud/session issues relevant to transfer

This particular cloud session had no dedicated web-search tool, and outbound requests used a restricted allowlist. GitHub API access worked after network configuration was updated. Google and the .com registry requests were blocked at the last attempted checks. Do not generalize this to all Codex cloud sessions or assume the Mac app automatically provides a search tool.

The environment draft contains network domains `api.github.com`, `provatidis.github.io`, `www.google.com`, and `rdap.verisign.com`. The last two were saved for broader naming checks, but their runtime activation was not verified. Draft saving is not proof a network setting is active.

Cloud startup instructions were saved in `start_skill`; they are platform configuration, not repository files. There is no install script because no installation is necessary. A local session should use the README and actual checkout path.

The cloud GitHub integration could push code and read repository/Actions metadata, but repository visibility changes and Pages administration returned `Resource not accessible by integration` (403). The user manually made the repository public and enabled Pages. Do not confuse integration permissions with the user's account permissions or ask for tokens in chat.

Direct HTTPS Chromium testing in this cloud session hit a proxy-CA trust issue. Automatic approval rejected a persistent browser trust-store change because it would broaden trust. No verification was disabled and no workaround bypassed that rejection. Hosted verification used existing TLS-verified downloads and checksum comparisons against the locally browser-tested source. A local session may have normal HTTPS access; inspect its capabilities rather than carrying over cloud assumptions.

## Next steps

1. Clone/pull `main`, inspect any local instructions/changes, run `npm test`, and open the app locally. Reuse the checkout and respect existing user changes.
2. Finish naming research with actual general-web access. Check exact names, spelling variants, domains, and relevant project/account names. Present findings honestly, then get the user's selection before rebranding/renaming. Avoid promising uniqueness.
3. Build the second product milestone: a read-only import from one verified constant-product pool. Select the chain/pool/provider first; preserve chain, contract address, block, timestamp, token addresses, token order, decimals, and fee assumptions so snapshots are reproducible. Validate imported reserves/calculations against the supported contract and reject unsupported pool types. No chain or provider decision is already authorized as a fixed requirement.
4. Keep the theoretical scenario model clearly separated from protocol-specific data and live swap quotes. Fees must remain visibly assumed until a justified model is implemented.
5. Later possibilities: better documented/reusable calculation modules, worked examples, and a separately validated concentrated-liquidity model. These are roadmap ideas, not completed or currently requested implementations.

The user prefers autonomous progress and concrete tested results, with concise updates. Ask only for necessary missing decisions or genuinely required permissions. Do not re-request already given authorization for routine fixes. Changing the repository name/brand still requires a selected name; the naming discussion is unresolved.
