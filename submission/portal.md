# RecallDock — Project Explorer application

Application date: 2026/11/17

Project name: RecallDock (10 characters).

Primary tag: Other / 其他. Secondary tags: leave empty.

Logo: [logo-512.png](../public/logo-512.png), original PNG RGBA, 512 × 512 pixels, 11,450 bytes. The form permits PNG/JPEG/WebP, 128–2048 px, up to 2 MB.

## One-sentence introduction

A shared food-recall response ledger: verify FDA records through GenLayer consensus and reconcile quarantined inventory with two-party sign-off.

Characters: 144/180.

## Description

RecallDock helps small food distributors and warehouse partners turn recall notices into accountable inventory responses. A coordinator declares a recall number, affected lot, unit count and independent custodian. GenLayer validators independently retrieve the official FDA food enforcement record and must agree on its identity, affected codes, reason, classification and publication version before inventory enters quarantine. The custodian proposes a partial or full return or destruction; only the coordinator can confirm the exact proposal revision. Rejected proposals remain auditable, replayed confirmations fail, and confirmed quantities must conserve the original count. The frontend signs real Stable Studionet transactions, waits for FINALIZED plus SUCCESS and reads back final state. FDA verification is a source snapshot; lot matching, inventory and physical handling remain signed participant declarations, not a safety certificate.

Characters: 946/1000.

## Demo video

Leave blank (optional). No YouTube/X demonstration video is published.

## Usage steps

### 1. Connect two independent wallets

Open the website. Connect an EIP-6963/EIP-1193 browser wallet and switch to Stable Studionet (61999). Use a different wallet as custodian. For evaluation only, create two explicit testnet session accounts; keep the tab open because their keys are not persisted.

Title: 31 characters. Instructions: 261 characters.

### 2. Create a response

As coordinator, enter a unique lowercase reference, FDA food recall number F-1170-2024, a clearly labelled test lot, quantity 7 and the second wallet address. Submit Create response. Wait for FINALIZED + SUCCESS and the finalized UNVERIFIED readback.

Title: 17 characters. Instructions: 250 characters.

### 3. Verify the FDA source

Open the case card and select Verify with GenLayer. Wait for FINALIZED + SUCCESS. Inspect the FDA record, affected codes, reason, classification and dataset publication date. The case must read QUARANTINED. Test inventory is not a claim about real goods.

Title: 21 characters. Instructions: 254 characters.

### 4. Propose handling as custodian

Switch to the designated custodian wallet. Open the same case, choose RETURN, enter 7 units and a labelled test receipt reference, then propose. Wait for FINALIZED + SUCCESS. The case must read AWAITING_CONFIRMATION; no units have yet been reconciled.

Title: 29 characters. Instructions: 251 characters.

### 5. Confirm as coordinator

Switch back to the coordinator wallet. Review the exact proposal revision and confirm handling. Wait for FINALIZED + SUCCESS. Read back RECONCILED, resolved 7 and remaining 0. For a real case, inspect the actual handling receipt before signing.

Title: 22 characters. Instructions: 244 characters.

### 6. Inspect independent evidence

Open the repository evidence directory and final-verification.json. Check finalized transaction hashes, the matching deployed source hash and both reconciled acceptance records. Existing records can be inspected read-only without any wallet.

Title: 28 characters. Instructions: 241 characters.

## Expected verification result

The response progresses UNVERIFIED -> QUARANTINED -> AWAITING_CONFIRMATION -> RECONCILED. Finalized state shows 7 resolved + 0 remaining = 7 declared units and an accepted RETURN history entry. Source evidence contains FDA recall F-1170-2024. Each successful write must be FINALIZED with execution SUCCESS. Existing evidence also shows unauthorized handling and replayed confirmation finalizing with ERROR without changing inventory.

Characters: 433/500.

## Links

Contract: https://explorer-studio.genlayer.com/address/0x7CcF652AB06E72A58Ba4a68f2c752d621E2a53A1

Website: https://xiaoyu7799.github.io/recalldock-genlayer/

GitHub: https://github.com/xiaoyu7799/recalldock-genlayer

Required proof type: GitHub Repository. URL: https://github.com/xiaoyu7799/recalldock-genlayer

Website availability: Repository published; website requires GitHub Pages activation and live verification.

## Field limits

The supplied form shows 180, 1000 and 500 character limits for introduction, description and expected verification result. It does not show numerical limits for name, step titles/instructions or URLs. No additional limit is assumed. All copyable field values are ASCII, so character counts equal JavaScript UTF-16 length.
