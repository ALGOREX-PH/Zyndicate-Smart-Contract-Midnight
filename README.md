# Zyndicate Smart Contract (Midnight)

Production smart-contract repository for **Zyndicate**, a confidential
work-coordination protocol on the [Midnight Network](https://midnight.network).

> Private by default. Verifiable by design.

A principal commissions sensitive digital work, qualified operators compete
through sealed bids, and every party can verify that the agreement was
followed — without the task, budgets, bids, identities, or results ever
appearing on the public ledger.

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

## Build and test

Prerequisites: Linux/macOS (Windows: WSL2), Node 22+, the
[Compact toolchain](https://docs.midnight.network/compact/) (compiler 0.31.x,
language 0.23), `@midnight-ntwrk/compact-runtime@^0.16.0` (installed via npm).

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
