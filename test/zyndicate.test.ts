/**
 * Simulator-based unit tests for the Zyndicate contract.
 *
 * Full happy path (create -> bid x3 -> close -> award -> accept -> submit ->
 * evaluate -> settle -> receipt) plus negative tests: duplicate bid
 * nullifiers, double settlement, wrong-key authorization, dispute freeze,
 * and deadline enforcement.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  MandateState,
  Verdict,
  pureCircuits,
} from "../contracts/managed/zyndicate/contract/index.js";
import {
  createPrivateState,
  type ZyndicatePrivateState,
} from "../contracts/witnesses.js";
import { GENESIS_TIME, ZyndicateSimulator } from "./zyndicate-simulator.js";

const pad32 = (s: string): Uint8Array => {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(s).subarray(0, 32));
  return out;
};

const BID_DEADLINE = BigInt(GENESIS_TIME + 3_600);
const EXECUTION_DEADLINE = BigInt(GENESIS_TIME + 7_200);

// Actors: one principal, three operators, one evaluator, one tribunal
// authority, one credential issuer (MVP cast, PRD 26.3).
let issuer: ZyndicatePrivateState;
let evaluator: ZyndicatePrivateState;
let tribunal: ZyndicatePrivateState;
let principal: ZyndicatePrivateState;
let op1: ZyndicatePrivateState;
let op2: ZyndicatePrivateState;
let op3: ZyndicatePrivateState;
let sim: ZyndicateSimulator;

const bidFor = (op: ZyndicatePrivateState, mandateId: bigint) => ({
  commitment: pureCircuits.deriveBidCommitment(
    mandateId,
    op.bidOpeningPrice,
    op.operatorSecretKey,
    op.bidOpeningRand,
  ),
  nullifier: pureCircuits.deriveBidNullifier(
    mandateId,
    op.operatorCredentialSecret,
  ),
});

const createMandate = (): bigint =>
  sim.createMandate(
    principal,
    randomBytes(32),
    randomBytes(32),
    pad32("security-audit"),
    BID_DEADLINE,
    EXECUTION_DEADLINE,
  );

/** create -> bid x3 -> close -> award(op2) */
const runToAwarded = (): { id: bigint; winner: Uint8Array } => {
  const id = createMandate();
  for (const op of [op1, op2, op3]) {
    const { commitment, nullifier } = bidFor(op, id);
    sim.submitBid(op, id, commitment, nullifier);
  }
  sim.closeBidWindow(principal, id);
  const winner = bidFor(op2, id).commitment;
  sim.awardBid(principal, id, winner);
  return { id, winner };
};

/** runToAwarded -> accept -> submit -> evaluate(ACCEPT) */
const runToAccepted = (): bigint => {
  const { id } = runToAwarded();
  sim.acceptAward(op2, id);
  sim.commitSubmission(op2, id, randomBytes(32), randomBytes(32));
  sim.recordEvaluation(evaluator, id, randomBytes(32), Verdict.ACCEPT);
  return id;
};

beforeEach(() => {
  issuer = createPrivateState();
  evaluator = createPrivateState();
  tribunal = createPrivateState();
  principal = createPrivateState();
  op1 = createPrivateState({ bidOpeningPrice: 1_000n });
  op2 = createPrivateState({ bidOpeningPrice: 900n });
  op3 = createPrivateState({ bidOpeningPrice: 1_200n });

  sim = new ZyndicateSimulator(
    issuer,
    pureCircuits.deriveEvaluatorKey(evaluator.evaluatorSecretKey),
    pureCircuits.deriveTribunalKey(tribunal.tribunalSecretKey),
    pureCircuits.deriveIssuerKey(issuer.issuerSecretKey),
  );
  for (const op of [op1, op2, op3]) {
    sim.registerCredential(
      issuer,
      pureCircuits.deriveCredentialHash(op.operatorCredentialSecret),
    );
  }
});

describe("deployment", () => {
  it("seals the role authorities and registers credentials", () => {
    const state = sim.ledger();
    expect(state.evaluatorAuthority).toEqual(
      pureCircuits.deriveEvaluatorKey(evaluator.evaluatorSecretKey),
    );
    expect(state.tribunalAuthority).toEqual(
      pureCircuits.deriveTribunalKey(tribunal.tribunalSecretKey),
    );
    expect(state.issuerAuthority).toEqual(
      pureCircuits.deriveIssuerKey(issuer.issuerSecretKey),
    );
    expect(state.credentialCount).toBe(3n);
  });

  it("rejects credential registration by a non-issuer", () => {
    expect(() => sim.registerCredential(op1, randomBytes(32))).toThrow(
      /caller is not the credential issuer/,
    );
  });
});

describe("happy path", () => {
  it("runs create -> bid x3 -> close -> award -> accept -> submit -> evaluate -> settle -> receipt", () => {
    const id = createMandate();
    expect(id).toBe(1n);
    expect(sim.ledger().mandateStates.lookup(id)).toBe(MandateState.OPEN_FOR_BIDS);

    for (const op of [op1, op2, op3]) {
      const { commitment, nullifier } = bidFor(op, id);
      sim.submitBid(op, id, commitment, nullifier);
    }
    expect(sim.ledger().bidCounts.lookup(id)).toBe(3n);

    sim.closeBidWindow(principal, id);
    expect(sim.ledger().mandateStates.lookup(id)).toBe(MandateState.BIDDING_CLOSED);

    const winner = bidFor(op2, id).commitment;
    sim.awardBid(principal, id, winner);
    expect(sim.ledger().mandateStates.lookup(id)).toBe(MandateState.AWARDED);
    expect(sim.ledger().winningBids.lookup(id)).toEqual(winner);

    sim.acceptAward(op2, id);
    expect(sim.ledger().mandateStates.lookup(id)).toBe(MandateState.IN_EXECUTION);
    expect(sim.ledger().operatorKeys.lookup(id)).toEqual(
      pureCircuits.deriveOperatorKey(op2.operatorSecretKey),
    );

    sim.commitSubmission(op2, id, randomBytes(32), randomBytes(32));
    expect(sim.ledger().mandateStates.lookup(id)).toBe(MandateState.SUBMITTED);

    sim.recordEvaluation(evaluator, id, randomBytes(32), Verdict.ACCEPT);
    expect(sim.ledger().mandateStates.lookup(id)).toBe(MandateState.ACCEPTED);
    expect(sim.ledger().verdicts.lookup(id)).toBe(Verdict.ACCEPT);

    sim.settleMandate(
      principal,
      id,
      pureCircuits.deriveSettlementNullifier(id, principal.principalSecretKey),
    );
    expect(sim.ledger().mandateStates.lookup(id)).toBe(MandateState.SETTLED);
    expect(sim.ledger().settledMandates).toBe(1n);

    sim.issueReceipt(
      op2,
      id,
      pureCircuits.deriveReceiptNullifier(id, op2.operatorSecretKey),
    );
    expect(sim.ledger().issuedReceipts).toBe(1n);
  });

  it("never exposes raw secrets or bid values on the public ledger", () => {
    const id = runToAccepted();
    const state = sim.ledger();

    // Role keys on-chain are domain-separated hashes, never the raw secrets.
    expect(state.principalKeys.lookup(id)).not.toEqual(principal.principalSecretKey);
    expect(state.operatorKeys.lookup(id)).not.toEqual(op2.operatorSecretKey);

    // The winning bid is a 32-byte commitment; the price (900) and the
    // commitment randomness never appear in public state.
    const winner = state.winningBids.lookup(id);
    expect(winner).toHaveLength(32);
    expect(winner).not.toEqual(op2.bidOpeningRand);
    for (const [, registered] of state.bidRegistry) {
      expect(registered).toBe(id); // map stores commitment -> mandate id only
    }

    // Nullifiers are hashes bound to the mandate, not credential secrets.
    for (const nul of state.bidNullifiers) {
      expect(nul).not.toEqual(op1.operatorCredentialSecret);
      expect(nul).not.toEqual(op2.operatorCredentialSecret);
      expect(nul).not.toEqual(op3.operatorCredentialSecret);
    }
  });
});

describe("sealed bidding", () => {
  it("rejects a duplicate bid nullifier from the same credential", () => {
    const id = createMandate();
    const { commitment, nullifier } = bidFor(op1, id);
    sim.submitBid(op1, id, commitment, nullifier);
    // Fresh commitment (new randomness), same credential => same nullifier.
    const secondAttempt = createPrivateState({
      ...op1,
      bidOpeningRand: randomBytes(32),
    });
    const again = bidFor(secondAttempt, id);
    expect(() => sim.submitBid(secondAttempt, id, again.commitment, again.nullifier))
      .toThrow(/duplicate bid/);
  });

  it("rejects a bid whose nullifier is not derived from the credential", () => {
    const id = createMandate();
    const { commitment } = bidFor(op1, id);
    expect(() => sim.submitBid(op1, id, commitment, randomBytes(32))).toThrow(
      /malformed bid nullifier/,
    );
  });

  it("rejects an operator without a registered credential", () => {
    const id = createMandate();
    const outsider = createPrivateState();
    const { commitment, nullifier } = bidFor(outsider, id);
    expect(() => sim.submitBid(outsider, id, commitment, nullifier)).toThrow(
      /credential is not present in the registry/,
    );
  });

  it("rejects bids after the window closes", () => {
    const id = createMandate();
    sim.closeBidWindow(principal, id);
    const { commitment, nullifier } = bidFor(op1, id);
    expect(() => sim.submitBid(op1, id, commitment, nullifier)).toThrow(
      /bid window is not open/,
    );
  });
});

describe("award", () => {
  it("rejects an award signed with the wrong key", () => {
    const id = createMandate();
    const { commitment, nullifier } = bidFor(op1, id);
    sim.submitBid(op1, id, commitment, nullifier);
    expect(() => sim.closeBidWindow(op1, id)).toThrow(
      /caller is not the mandate principal/,
    );
    sim.closeBidWindow(principal, id);
    expect(() => sim.awardBid(op1, id, commitment)).toThrow(
      /caller is not the mandate principal/,
    );
  });

  it("rejects awarding a bid that was never registered", () => {
    const id = createMandate();
    const { commitment, nullifier } = bidFor(op1, id);
    sim.submitBid(op1, id, commitment, nullifier);
    sim.closeBidWindow(principal, id);
    expect(() => sim.awardBid(principal, id, randomBytes(32))).toThrow(
      /winning bid was never registered/,
    );
  });

  it("prevents a losing operator from accepting the award", () => {
    const { id } = runToAwarded();
    expect(() => sim.acceptAward(op1, id)).toThrow(
      /caller cannot open the winning bid/,
    );
  });
});

describe("submission and evaluation", () => {
  it("rejects a submission after the execution deadline", () => {
    const { id } = runToAwarded();
    sim.acceptAward(op2, id);
    sim.blockTime = Number(EXECUTION_DEADLINE) + 10;
    expect(() => sim.commitSubmission(op2, id, randomBytes(32), randomBytes(32)))
      .toThrow(/execution deadline has passed/);
  });

  it("rejects a submission from a non-awarded operator", () => {
    const { id } = runToAwarded();
    sim.acceptAward(op2, id);
    expect(() => sim.commitSubmission(op1, id, randomBytes(32), randomBytes(32)))
      .toThrow(/caller is not the awarded operator/);
  });

  it("rejects an evaluation from an unauthorized evaluator", () => {
    const { id } = runToAwarded();
    sim.acceptAward(op2, id);
    sim.commitSubmission(op2, id, randomBytes(32), randomBytes(32));
    const impostor = createPrivateState();
    expect(() => sim.recordEvaluation(impostor, id, randomBytes(32), Verdict.ACCEPT))
      .toThrow(/caller is not the authorized evaluator/);
  });

  it("returns the mandate to execution on a REVISE verdict", () => {
    const { id } = runToAwarded();
    sim.acceptAward(op2, id);
    sim.commitSubmission(op2, id, randomBytes(32), randomBytes(32));
    sim.recordEvaluation(evaluator, id, randomBytes(32), Verdict.REVISE);
    expect(sim.ledger().mandateStates.lookup(id)).toBe(MandateState.IN_EXECUTION);
  });
});

describe("settlement", () => {
  it("rejects a second settlement of the same mandate", () => {
    const id = runToAccepted();
    const nullifier = pureCircuits.deriveSettlementNullifier(
      id,
      principal.principalSecretKey,
    );
    sim.settleMandate(principal, id, nullifier);
    expect(() => sim.settleMandate(principal, id, nullifier)).toThrow(
      /mandate is not ready to settle/,
    );
    expect(sim.ledger().settledMandates).toBe(1n);
  });

  it("rejects settlement by anyone but the principal", () => {
    const id = runToAccepted();
    expect(() =>
      sim.settleMandate(op2, id, pureCircuits.deriveSettlementNullifier(id, op2.principalSecretKey)),
    ).toThrow(/caller is not the mandate principal/);
  });
});

describe("disputes", () => {
  it("freezes settlement until the tribunal resolves", () => {
    const id = runToAccepted();
    sim.openDispute(principal, id, randomBytes(32));
    expect(sim.ledger().mandateStates.lookup(id)).toBe(MandateState.DISPUTED);

    const nullifier = pureCircuits.deriveSettlementNullifier(
      id,
      principal.principalSecretKey,
    );
    expect(() => sim.settleMandate(principal, id, nullifier)).toThrow(
      /mandate is not ready to settle/,
    );

    const impostor = createPrivateState();
    expect(() => sim.resolveDispute(impostor, id, randomBytes(32))).toThrow(
      /caller is not the tribunal authority/,
    );

    sim.resolveDispute(tribunal, id, randomBytes(32));
    expect(sim.ledger().mandateStates.lookup(id)).toBe(MandateState.RESOLVED);

    sim.settleMandate(principal, id, nullifier);
    expect(sim.ledger().mandateStates.lookup(id)).toBe(MandateState.SETTLED);
  });

  it("rejects a dispute from a stranger to the mandate", () => {
    const id = runToAccepted();
    const stranger = createPrivateState();
    expect(() => sim.openDispute(stranger, id, randomBytes(32))).toThrow(
      /caller is not a party to the mandate/,
    );
  });
});

describe("receipts", () => {
  it("issues a completion receipt exactly once", () => {
    const id = runToAccepted();
    sim.settleMandate(
      principal,
      id,
      pureCircuits.deriveSettlementNullifier(id, principal.principalSecretKey),
    );
    const nullifier = pureCircuits.deriveReceiptNullifier(id, op2.operatorSecretKey);
    sim.issueReceipt(op2, id, nullifier);
    expect(sim.ledger().issuedReceipts).toBe(1n);
    expect(() => sim.issueReceipt(op2, id, nullifier)).toThrow(
      /receipt already issued/,
    );
  });
});
