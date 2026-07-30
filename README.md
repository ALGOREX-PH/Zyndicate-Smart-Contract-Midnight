# Zyndicate Smart Contract (Midnight)

Production smart-contract repository for **Zyndicate**, a confidential
work-coordination protocol on the [Midnight Network](https://midnight.network).

> Private by default. Verifiable by design.

A principal commissions sensitive digital work, qualified operators compete
through sealed bids, and every party can verify that the agreement was
followed — without the task, budgets, bids, identities, or results ever
appearing on the public ledger.

## Initial product idea

Sensitive digital work — a security audit of an unreleased codebase, a
confidential fraud-detection pass over a bank's transaction data, a red-team
evaluation of a model nobody has announced yet — cannot be procured on a
transparent marketplace without leaking the fact that the work is happening
at all: the assignment, the budget, who bid, who won, and what they found. At
the same time, a client who hides everything gives providers and evaluators
nothing to verify, and a market nobody can audit is not a market a serious
organization will trust. Zyndicate is a confidential coordination network on
Midnight where a principal can commission this kind of work as a **sealed
mandate**, qualified operators compete through **sealed bids** proven
eligible without revealing their history, an evaluator attests to the result
without the deliverable ever touching the public ledger, and settlement
happens exactly once — provably — without anyone outside the transaction
learning the task, the price, or the outcome. The public chain records only
that the rules were followed; everything else stays where it belongs.

## Architecture

Per the MVP strategy (PRD 16.3), the protocol is **one primary Compact
contract** — `contracts/zyndicate.compact` — with clearly separated internal
sections. Contract-to-contract calls cross Midnight's public boundary, so a
single contract keeps the private workflow inside one proof domain.

```
contracts/
  zyndicate.compact        the contract (language 0.23, compiler 0.31.x)
  witnesses.ts             typed witness implementations + private-state type
  managed/zyndicate/       compiled artifacts (JS API committed; zk keys not)
test/
  zyndicate-simulator.ts   in-process simulator over the compiled JS API
  zyndicate.test.ts        vitest suite (happy path + negative tests)
```

Internal sections of the contract:

| Section | Responsibility |
|---------|----------------|
| Identity | Sealed role authorities (evaluator, tribunal, issuer), credential registry (`HistoricMerkleTree`) |
| Mandate | Creation, bid-window lifecycle, cancellation |
| Bid | Sealed bid commitments, in-circuit eligibility, credential-bound nullifiers |
| Award | Principal selection, operator acceptance by opening the winning commitment |
| Submission | Deadline-checked artifact + execution-receipt commitments |
| Evaluation | Evaluator-authorized verdicts (ACCEPT / REJECT / REVISE) |
| Vault / Settlement | Single settlement enforced by a nullifier set; dispute freeze |
| Reputation | Duplicate-proof completion receipts |
| Dispute | Party-initiated freeze, tribunal-authorized ruling |

## Mandate state machine

```
OPEN_FOR_BIDS -> BIDDING_CLOSED -> AWARDED -> IN_EXECUTION -> SUBMITTED
     |                |                            ^              |
     v                v                            | REJECT/REVISE|
 CANCELLED        CANCELLED                        +--------------+
                                                              ACCEPT
                                                                v
                          DISPUTED <---------------  ACCEPTED / SUBMITTED
                              |                                 |
                              v                                 v
                          RESOLVED  ---------------------->  SETTLED
```

Every transition is asserted in-circuit; calls arriving out of order fail
their state precondition.

## Circuit surface

| Circuit | Caller | Purpose |
|---------|--------|---------|
| `registerCredential(credentialHash)` | Issuer | Add an operator credential hash to the eligibility registry |
| `createMandate(mandateCommitment, covenantCommitment, publicDomain, bidDeadline, executionDeadline)` | Principal | Register a mandate, record hashed principal key, open the bid window |
| `closeBidWindow(mandateId)` | Principal | OPEN_FOR_BIDS -> BIDDING_CLOSED |
| `cancelMandate(mandateId)` | Principal | Cancel before award |
| `submitBid(mandateId, bidCommitment, bidNullifier)` | Eligible operator | Register a sealed bid; eligibility proven in-circuit via Merkle membership; nullifier prevents duplicate bids |
| `awardBid(mandateId, winningBidCommitment)` | Principal | Select a registered bid; BIDDING_CLOSED -> AWARDED |
| `acceptAward(mandateId)` | Winning operator | Prove knowledge of the bid opening; AWARDED -> IN_EXECUTION |
| `commitSubmission(mandateId, artifactCommitment, receiptCommitment)` | Operator | Deadline-checked; IN_EXECUTION -> SUBMITTED |
| `recordEvaluation(mandateId, evaluationCommitment, verdict)` | Evaluator | SUBMITTED -> ACCEPTED (or back to IN_EXECUTION) |
| `settleMandate(mandateId, settlementNullifier)` | Principal | Single settlement via nullifier set; ACCEPTED/RESOLVED -> SETTLED |
| `openDispute(mandateId, disputeCommitment)` | Either party | Freezes settlement; SUBMITTED/ACCEPTED -> DISPUTED |
| `resolveDispute(mandateId, rulingCommitment)` | Tribunal | DISPUTED -> RESOLVED |
| `issueReceipt(mandateId, receiptNullifier)` | Operator | Duplicate-proof completion receipt |

Pure derivation circuits (also used client-side through the generated API):
`derivePrincipalKey`, `deriveOperatorKey`, `deriveEvaluatorKey`,
`deriveTribunalKey`, `deriveIssuerKey`, `deriveCredentialHash`,
`deriveBidNullifier`, `deriveSettlementNullifier`, `deriveReceiptNullifier`,
`deriveBidCommitment` — each with a unique `pad(32, "zyndicate:...")`
domain separator.

## Public state vs private witness

Compact has two kinds of contract-level declarations, and confusing them is
the easiest way to leak something that was supposed to stay confidential.

**`export ledger`** declares on-chain state — replicated by every node,
readable by anyone through the indexer, permanent. This contract's ledger
holds only enums, counters, deadlines, hashes, and commitments, e.g.:

```
export ledger mandateStates: Map<Field, MandateState>;   // which state each mandate is in — fine to be public
export ledger bidRegistry: Map<Bytes<32>, Field>;         // commitments only, never a price or a method
export ledger bidNullifiers: Set<Bytes<32>>;               // proves "a bid was spent" without saying whose
```

**`witness`** declares a function the *caller's own machine* answers at proof
time — never sent to the network, never seen by anyone else, not even
recorded in the transaction. It supplies the private inputs a circuit reasons
about locally before deciding what (if anything) is safe to disclose:

```
witness operatorCredentialSecret(): Bytes<32>;
witness credentialPath(): MerkleTreePath<10, Bytes<32>>;
```

`submitBid` shows the two working together. The operator's witnesses supply
a credential secret and its Merkle path; the circuit checks that path proves
membership in the public `credentialRegistry` **without the circuit, the
chain, or the principal ever learning which credential it was** — only that
a valid, not-yet-used one exists:

```
const credential = operatorCredentialSecret();      // private: read from this machine only
const path = credentialPath();                      // private: this machine's proof of membership
assert(path.leaf == deriveCredentialHash(credential), "...");
assert(credentialRegistry.checkRoot(disclose(merkleTreePathRoot<10, Bytes<32>>(path))), "...");
```

A witness result is never trusted on its word — every witness value above is
immediately constrained by an `assert` against real ledger state, because a
local function can return anything. And a value only crosses from private to
public through an explicit `disclose(...)` call at the exact line it happens,
so the boundary between "known only to me" and "known to everyone" is always
a single, greppable keyword rather than an implicit default. `SECURITY.md`
audits every `disclose()` call in this contract by name.

## Privacy model mapping

Visibility classes from PRD 13.1. Everything on the ledger is Class A by
definition — the design constraint is that only safe values ever land there.

| Ledger field | Contents | PRD class of the underlying data |
|--------------|----------|----------------------------------|
| `evaluatorAuthority`, `tribunalAuthority`, `issuerAuthority` | Domain-separated hashes of role secrets | A (hash) over D secrets |
| `credentialRegistry` (Merkle root) | Credential hash tree | A root; which credential bids stays D |
| `mandateStates`, `mandateCount`, `bidCounts` | State enums / counters | A |
| `mandateCommitments`, `covenantCommitments` | Commitments to the private mandate / covenant packages | A commitment over B/E content |
| `mandateDomains` | Public category (e.g. `security-audit`) | A by choice (PRD 11.3 discovery) |
| `principalKeys`, `operatorKeys` | Hashed role keys, per mandate | A (hash) over D secrets |
| `bidDeadlines`, `executionDeadlines` | Deadlines | A |
| `bidRegistry`, `winningBids` | Bid commitments only — never price, method, or identity | A commitment over D openings |
| `bidNullifiers`, `settlementNullifiers`, `receiptNullifiers` | One-shot-right nullifiers | A; underlying credential/secret stays D |
| `artifactCommitments`, `receiptCommitments` | Commitments to encrypted off-chain deliverables | A commitment over B content |
| `evaluationCommitments`, `verdicts` | Evaluation commitment + coarse verdict | A; notes stay C/E |
| `disputeCommitments`, `rulingCommitments` | Commitments to evidence capsule / ruling | A commitment over E content |
| `settledMandates`, `issuedReceipts` | Aggregate counters | A |

Not on-chain, ever: budgets, bid prices, identities, deliverables, evaluation
notes, credential secrets, commitment randomness. See `SECURITY.md` for the
disclosure audit.

## Toolchain setup

Prerequisites: Linux/macOS (Windows: WSL2). This repo was built and compiled
entirely without root access — every install below runs in user space.

```bash
# Compact compiler + CLI (installs to ~/.compact/bin)
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
export PATH="$HOME/.compact/bin:$PATH"
compact update
compact compile --version   # expect toolchain 0.31.x, language 0.23

# Node 22 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
\. "$HOME/.nvm/nvm.sh" && nvm install 22
```

A local proof server (port 6300, fixed) is required only to generate real
zk proofs for a deployment — it is not needed to compile or run the
simulator test suite. The official distribution is a Docker image; this
environment has no Docker anywhere, so the proof server here was built from
source instead (`midnightntwrk/midnight-ledger`, `proof-server/` crate) with
the Rust toolchain already on `PATH` (`rustc`/`cargo`) — see the deployment
section below for the exact build.

## Build and test

```bash
npm install

# fast compile: type-check + JS API, no zk keys
npm run compile:fast

# full compile: zkir + prover/verifier keys per circuit
npm run compile

# simulator unit tests (vitest, no proofs, no network)
npm test
```

The test suite covers the full happy path (create -> bid x3 -> close ->
award -> accept -> submit -> evaluate -> settle -> receipt) and negative
paths: duplicate bid nullifiers, malformed nullifiers, unregistered
credentials, wrong-key authorization for every role, late submissions,
double settlement, dispute freeze/resolution, and duplicate receipts.

## Status

MVP contract per PRD 26: request-for-proposal mandates with one evaluator,
one tribunal authority, and one credential issuer configured at deployment.
Escrowed token settlement (Zyndicate Vault with real shielded assets),
milestone payments, credential revocation, and multi-evaluator panels are
deliberately deferred (PRD 18.1, 26.4).
