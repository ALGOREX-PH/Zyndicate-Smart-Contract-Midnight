# Zyndicate Contract — Security & Disclosure Audit

Scope: `contracts/zyndicate.compact` (Compact language 0.23, compiler
0.31.x). Methodology follows the Midnight smart-contract security guide:
every `disclose()` justified, every witness constrained in-circuit, nullifier
policy documented, and the standard vulnerability classes reviewed.

## Disclosure audit

`disclose()` is a compiler acknowledgment, not a protection. Every site in
the contract is listed below with the reason the disclosed value is safe to
be public. Convention: exported-circuit parameters are private proof inputs
until disclosed, so every parameter that is *meant* to be public is disclosed
once at the top of its circuit.

### Category 1 — public-by-design parameters

These values are computed client-side *for publication*: mandate ids, hiding
commitments (salted with fresh randomness, so they reveal nothing), one-shot
nullifiers (domain-separated hashes of high-entropy secrets), deadlines, the
public domain tag, and the verdict enum. Disclosing them is the purpose of
the call.

| Circuit | Disclosed values |
|---------|------------------|
| `registerCredential` | `credentialHash` (issuer publishes the credential hash) |
| `createMandate` | `mandateCommitment`, `covenantCommitment`, `publicDomain`, `bidDeadline`, `executionDeadline` |
| `closeBidWindow`, `cancelMandate`, `acceptAward` | `mandateId` |
| `submitBid` | `mandateId`, `bidCommitment`, `bidNullifier` |
| `awardBid` | `mandateId`, `winningBidCommitment` |
| `commitSubmission` | `mandateId`, `artifactCommitment`, `receiptCommitment` |
| `recordEvaluation` | `mandateId`, `evaluationCommitment`, `verdict` |
| `settleMandate` | `mandateId`, `settlementNullifier` |
| `openDispute` | `mandateId`, `disputeCommitment` |
| `resolveDispute` | `mandateId`, `rulingCommitment` |
| `issueReceipt` | `mandateId`, `receiptNullifier` |

### Category 2 — witness-derived hashes (the only witness data ever disclosed)

| Site | Value | Why it is safe |
|------|-------|----------------|
| `createMandate` | `disclose(derivePrincipalKey(principalSecretKey()))` | Preimage-resistant `persistentHash` with the `zyndicate:principal:` separator over a 32-byte high-entropy secret. Serves as the mandate's on-chain principal role key; reveals no identity. |
| `acceptAward` | `disclose(deriveOperatorKey(operatorSecretKey()))` | Same construction with the `zyndicate:operator:` separator. Published only after award acceptance, when the operator deliberately takes on the on-chain role. |
| `submitBid` | `disclose(merkleTreePathRoot<10, Bytes<32>>(path))` | The recomputed root passed to `credentialRegistry.checkRoot`. It equals a (historic) public root of the credential tree, so it reveals only "an issued credential exists" — never which leaf. The path and leaf stay inside the proof. |
| constructor | `disclose(initial…Authority)` x3 | Deploy-time configuration: hashed role keys for evaluator, tribunal, issuer. Public by design (sealed ledger fields). |

Raw witness values (`principalSecretKey`, `operatorSecretKey`,
`operatorCredentialSecret`, `credentialPath`, `evaluatorSecretKey`,
`tribunalSecretKey`, `issuerSecretKey`, `bidOpeningPrice`,
`bidOpeningRand`) are **never** disclosed and never reach a ledger
operation.

## Nullifier policy (PRD 13.5)

A nullifier proves a private right was consumed without revealing the
underlying secret. Each right has its own domain separator; all inputs are
32-byte high-entropy secrets, so the hashes are neither guessable nor
mutually linkable.

| Right | Derivation | Enforced in |
|-------|-----------|-------------|
| One bid per credential per mandate | `H("zyndicate:bid:nul:", mandateId, credentialSecret)` | `submitBid`: assert equality with the honest derivation, assert not in `bidNullifiers`, then insert |
| One settlement per mandate | `H("zyndicate:settle:nul:", mandateId, principalSk)` | `settleMandate`: same assert-then-insert pattern; the SETTLED state is a second, independent guard |
| One completion receipt per mandate | `H("zyndicate:receipt:nul:", mandateId, operatorSk)` | `issueReceipt`: same assert-then-insert pattern |

Properties:

- **Bound to the mandate.** `mandateId` inside the hash prevents cross-mandate
  replay and makes the same credential's nullifiers unlinkable across
  mandates.
- **Honest derivation enforced.** The circuit recomputes the nullifier from
  the witness secret and asserts equality with the submitted parameter — a
  caller cannot substitute an unrelated value to dodge the set check.
- **Insert follows the non-membership assert** in the same circuit, so the
  consume is atomic within the transaction.

Domain separators in use (all distinct):
`zyndicate:principal:`, `zyndicate:operator:`, `zyndicate:evaluator:`,
`zyndicate:tribunal:`, `zyndicate:issuer:`, `zyndicate:cred:`,
`zyndicate:bid:nul:`, `zyndicate:settle:nul:`, `zyndicate:receipt:nul:`,
plus the bid commitment (`persistentCommit` over
`[mandateId, price, operatorKey]` with fresh 32-byte randomness).

## Witness constraint inventory (vulnerability class 1)

| Witness | In-circuit constraint |
|---------|----------------------|
| `principalSecretKey` | Hash must equal `principalKeys[mandateId]` (`requirePrincipal`) |
| `operatorSecretKey` | Hash must equal `operatorKeys[mandateId]` (`requireOperator`), or reconstruct the winning bid commitment (`acceptAward`) |
| `operatorCredentialSecret` | Its hash must equal the presented Merkle leaf, whose path must check against the registry root (`submitBid`) |
| `credentialPath` | `path.leaf == deriveCredentialHash(secret)` and `checkRoot(merkleTreePathRoot(path))` |
| `evaluatorSecretKey` | Hash must equal sealed `evaluatorAuthority` |
| `tribunalSecretKey` | Hash must equal sealed `tribunalAuthority` |
| `issuerSecretKey` | Hash must equal sealed `issuerAuthority` |
| `bidOpeningPrice`, `bidOpeningRand` | Must reconstruct the exact winning bid commitment (`acceptAward`) |

No witness result is trusted without one of the above asserts. Hostile
witness implementations are exercised in `test/zyndicate.test.ts`.

## Checklist review (per the Midnight security guide)

- **`ownPublicKey()` authentication:** not used anywhere. All caller
  authentication uses the stored-hash secret-key pattern.
- **State-machine guards (class 6):** every impure circuit asserts
  `requireMandate` plus its exact state precondition before any write;
  assert messages contain no private data.
- **Initialization (class 7):** all role authorities are set in the
  constructor into `sealed` ledger fields — no exported init circuit, no
  takeover path.
- **Opaque data (class 4):** no `Opaque<>` ledger fields; deliverables are
  commitments to encrypted off-chain artifacts.
- **Commitment randomness (class 5):** bid randomness is generated fresh per
  bid client-side (`witnesses.ts`); randomness is never reused across
  commitments and never leaves private state.
- **Tokens (class 8):** the MVP contains no mint/send/receive circuits.
  Escrowed settlement assets (Zyndicate Vault) are deferred; settlement here
  records the workflow fact, not a coin transfer.
- **Block time:** only coarse threshold checks (`blockTimeLt`) against
  bid/execution deadlines with wide windows; no precise-ordering or
  randomness assumptions (~6 s block granularity).
- **Upgrade posture (class 9):** decided at deploy time. The default
  maintenance authority (empty committee, threshold 1) makes the contract
  permanently immutable; configure a CMA committee at deployment if verifier
  key rotation is required. This repository does not choose for you.

## Threat notes (PRD 23)

- **Malicious principal:** cannot alter the covenant after creation (the
  commitment is immutable), cannot settle twice, cannot award an
  unregistered bid, and cannot evaluate its own mandate (evaluator authority
  is sealed and separate).
- **Malicious operator:** cannot bid without an issued credential, cannot
  bid twice with one credential, cannot accept an award it cannot open,
  cannot submit after the deadline, and cannot mint duplicate receipts.
- **Malicious evaluator/tribunal impostor:** rejected by sealed-authority
  hash checks.
- **Public chain observer:** sees state enums, counters, commitments,
  hashed role keys, and nullifiers only. Bids are hiding commitments;
  eligibility proofs reveal neither the credential nor the operator;
  nullifiers are unlinkable across mandates.

## Known limitations (MVP, documented deferrals)

- **Credential revocation** is not implemented (a revocation set would
  require disclosing the credential hash at bid time, which reintroduces
  linkability; a proper design needs a non-membership proof and is deferred).
- **Single evaluator / tribunal / issuer** authorities per deployment
  (PRD 26.3); panels, staking, and appeals are later-phase work.
- **No value escrow yet:** settlement records the workflow transition; real
  shielded-asset vault flows (PRD 18) land in a later phase.
- **Timing correlation** (PRD 23.5) is out of scope at the contract layer;
  batching/timing obfuscation belongs to the client.
- **Operator key reuse across mandates:** an operator that accepts multiple
  awards with the same secret key publishes the same role-key hash for each,
  which links those *awarded* mandates. Clients should rotate operator keys
  per mandate; the contract does not prevent reuse.

## Client-side requirements

- Run the proof server locally (or self-hosted over an encrypted channel);
  never point a proof provider at a third-party prover — proving consumes
  raw witness data.
- Keep the private-state store encrypted; never log witness values or
  secret keys.
- Connect wallet viewing keys only to trusted or self-hosted indexers.
