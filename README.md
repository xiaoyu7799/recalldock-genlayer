# RecallDock

A shared food-recall response ledger: verify an official FDA recall through GenLayer consensus, quarantine declared inventory, and reconcile returns or destruction with two distinct wallet signatures.

Small distributors and their warehouse partners often have a recall notice but no mutually accountable record of what happened to the affected inventory. RecallDock prevents one participant from closing a response alone. Every accepted disposition conserves the declared quantity; rejected proposals remain visible.

Website target: https://xiaoyu7799.github.io/recalldock-genlayer/ (requires Pages activation).

Project Explorer field copy and character counts: [submission/portal.md](submission/portal.md).

## Network and source

- **Stable Studionet only:** chain `61999` (`0xf22f`), RPC `https://studio.genlayer.com/api`.
- **Contract:** [0x7CcF652AB06E72A58Ba4a68f2c752d621E2a53A1](https://explorer-studio.genlayer.com/address/0x7CcF652AB06E72A58Ba4a68f2c752d621E2a53A1).
- **Deployment transaction:** `0x2fcb716974b42fa0e7df3493697a7b83ba693ed97f31d3749b1e91beeffc6419` — FINALIZED + SUCCESS.
- **Source:** [`contracts/recalldock.py`](contracts/recalldock.py), pinned GenVM dependency; [`deployment.json`](deployment.json).
- **FDA:** public [food enforcement API](https://open.fda.gov/apis/food/enforcement/), no API key. Follow [FDA terms](https://open.fda.gov/terms/) and [source license](https://open.fda.gov/license/).

## Workflow

1. Connect a wallet and switch/add Stable Studionet. You become the coordinator.
2. Enter a unique reference, FDA food recall number (`F-####-####`), declared affected lot, unit quantity and a **different** custodian wallet. Choose one consistent inventory unit per case. All inputs are public.
3. Create the response. After FINALIZED + SUCCESS, open its card and select **Verify with GenLayer**.
4. Leader and validators independently retrieve the exact FDA record. Agreement locks the case into quarantine, including historical Completed/Terminated recalls. These statuses never establish product safety.
5. The named custodian connects, opens the case and proposes RETURN or DESTROY with a quantity and handling receipt reference.
6. The coordinator checks the real-world receipt, then confirms or rejects the exact proposal revision. Only confirmation reduces remaining quantity. Both return and destruction can be partial.
7. The response becomes RECONCILED only when all declared units have confirmed handling. Exportable evidence is available directly through the contract's JSON views and explorer.

A case can be cancelled only before source verification. Confirmations cannot be replayed. An external-source failure or validator disagreement leaves the case UNVERIFIED and retryable; no false clearance is issued.

## What consensus proves

`verify_recall` uses `gl.vm.run_nondet_unsafe(fetch, validate)` with `leaderOnly: false`. Each validator makes its own HTTPS request to a **fixed FDA host**, not a caller-controlled URL. It independently verifies the requested recall identity, food product type, classification and recognized status. The full normalized evidence object must exactly match the leader: recall number, event ID, firm, product description, affected codes, reason, status, class, initiation/report dates, source URL and dataset publication date. Disagreement rejects the write before quarantine is persisted.

This is a source-authenticity gate with business consequences: unverified records cannot enter disposition, verified cases cannot be cancelled, custodians cannot approve their own handling, and a coordinator cannot invent a handling proposal. The contract enforces `resolved + remaining = quantity` after every mutation. No LLM is required for this objective source check. No mock consensus is used on chain.

The snapshot does **not** independently establish that a declared lot matches the affected codes, that the starting inventory count is correct, or that physical handling happened. Those facts remain the participants' signed declarations. Read the displayed affected codes and actual recall instructions. This is not a safety certificate, regulatory reporting system, FDA approval, medical advice or a substitute for contacting the recalling firm. FDA warns that API results can be incomplete or unvalidated. There is no “safe to sell” action.

## State machine and API

`UNVERIFIED → QUARANTINED → AWAITING_CONFIRMATION → QUARANTINED / RECONCILED`

`UNVERIFIED → CANCELLED`

| Method | Access | Arguments |
|---|---|---|
| `open_case` | Any coordinator | reference, recall number, lot, quantity, custodian |
| `verify_recall` | Anyone | case ID |
| `propose_disposition` | Designated custodian | case ID, RETURN/DESTROY, quantity, evidence reference |
| `confirm_disposition` | Coordinator | case ID, exact revision, accept boolean |
| `cancel_case` | Coordinator, unverified only | case ID |
| `get_case` | Public view | case ID |
| `list_cases` | Public view | offset, limit (1–20) |

Case ID is `lowercase-coordinator-address:reference`. References are immutable and unique per coordinator. Per-case quantities are integers 1–1,000,000,000. Lifetime limits: 64 cases/coordinator, 2,000 total cases, and 100 disposition history entries/case. A pending proposal blocks another proposal. Rejection preserves the quantity and adds an immutable history entry. No money, escrow or tokens are handled.

## Wallets

- EIP-6963 announcements populate a selector with the actual announced provider, name and supplied icon. Legacy EIP-1193 providers are a fallback, including separate entries in `ethereum.providers`.
- Selection, signing and network operations use that provider. No external wallet is silently replaced with `window.ethereum` or a local signer.
- Accounts, network changes and disconnect invalidate the selected connection. Account and chain are checked immediately before signing.
- A separate, explicitly named **testnet session account** can sign real zero-value transactions. It is generated and held only in browser memory, cannot send value, and is lost on refresh. It is not MetaMask, OKX or another external wallet. Use lasting external accounts for real ongoing records.
- MetaMask, OKX Wallet, Rabby, Coinbase Wallet, Bitget Wallet, Trust Wallet and TokenPocket are **standard compatibility targets, not verified brand-specific results**. Wallets may reject the custom chain, zero gas price or transaction envelope. Errors are shown, never converted into a fake success.
- WalletConnect QR is **not integrated**: no WalletConnect project ID is configured. Mobile users can try an EIP-1193 wallet's in-app browser; physical mobile-wallet operation was not tested.
- Local disconnect does not revoke wallet-side site permissions. Revoke those in wallet settings if desired.

The frontend encodes GenLayer calls with `genlayer-js` 1.1.8 and signs the Studionet consensus contract's `addTransaction` envelope through EIP-1193. It persists only the last transaction hash/context for recovery, never private keys. It waits for both FINALIZED and leader execution SUCCESS, then independently reads `latest-final` state. ACCEPTED is always provisional. An unknown broadcast result is never automatically resent.

## Develop and verify

Node.js 22+ (tested 24), Python 3.12+ and npm:

```sh
npm ci
npm test
npm run build
python3 -m http.server 4173 --directory docs
```

`npm test` runs 12 mocked-host contract tests and 7 wallet/protocol tests. These prove local guards and interface behavior, **not network consensus**. `npm run build` creates the static `docs/` site. SDK version is pinned to 1.1.8; viem and esbuild versions are locked.

```sh
# Read-only revalidation: never broadcasts
node scripts/verify.mjs
# Fresh deployment and real two-party acceptance flow (not needed for existing deployment)
npm run live
```

In a Node 24 environment requiring inherited HTTPS proxy settings, prefix network scripts with `NODE_USE_ENV_PROXY=1`. Keep the platform CA configuration. `live.mjs` refuses to run if an evidence journal already exists, preventing accidental duplicate deployment. It uses fresh temporary testnet accounts, zero transaction value and full consensus. It never logs or saves their keys.

The read-only verifier can preserve its earlier record: `VERIFICATION_OUTPUT=evidence/final-verification.json node scripts/verify.mjs`. The latest revalidation is in [evidence/final-verification.json](evidence/final-verification.json).

`node scripts/frontend-review.cjs` inspects live finalized records and tracks an existing successful transaction without broadcasting. It also checks session connect/disconnect and responsive layout. It requires the same optional Playwright/Chromium environment and `APP_URL` / `RPC_TEST_RELAY` settings as the acceptance runner.

## Optional browser acceptance runner

The included `scripts/browser-acceptance.cjs` uses Playwright (tested 1.62.1) and Chromium. Provide Playwright in your test environment; it is not shipped in the production bundle. Start the static server, then run `node scripts/browser-acceptance.cjs` from the repository root. It broadcasts four real zero-value transactions using two explicitly generated session accounts and journals every returned hash. It refuses to overwrite existing browser evidence. `APP_URL` and `CHROMIUM_PATH` select the test site/browser. For this cloud environment only, `RPC_TEST_RELAY=1 NODE_USE_ENV_PROXY=1` enables the CA-verified real RPC relay described below. It does not mock responses. Do not rerun a completed acceptance flow merely to regenerate screenshots.

## Real acceptance evidence

- [`evidence/live.json`](evidence/live.json): full transaction records, consensus receipts and sequential finalized state readbacks. 100 declared acceptance units: 40 RETURN + 60 DESTROY.
- [`evidence/browser.json`](evidence/browser.json): browser UI flow with two explicit session accounts; 7 declared acceptance units returned and confirmed.
- [`evidence/independent-verification.json`](evidence/independent-verification.json): separate read-only check of finality, execution, deployed source bytes and both reconciled cases.
- Screenshots: [`desktop`](evidence/desktop.png), [`mobile`](evidence/mobile.png), [`reconciled detail`](evidence/browser-reconciled.png).

The stock and handling receipt references in acceptance cases are synthetic test declarations. The FDA record retrieval, signatures, contract writes, consensus and final-state readbacks are real. No physical goods were handled during testing.

The two negative chain transactions intentionally finalize with ERROR: unauthorized disposition and replayed confirmation. All successful business steps finalize with SUCCESS. The browser test uses a CA-verified real RPC relay in the test runner because headless Chromium does not trust the environment proxy CA; the public application itself calls the RPC directly. No RPC results are mocked. This establishes real frontend signing and contract interaction through the relay, not direct browser-to-RPC transport or a branded wallet test. See [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).

## License

MIT. FDA content remains subject to its source terms. RecallDock's logo is an original project mark, not the GenLayer or FDA logo.
