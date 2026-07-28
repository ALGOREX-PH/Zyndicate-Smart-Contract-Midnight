/**
 * In-process simulator for the Zyndicate contract.
 *
 * Wraps the compiled JS API (contracts/managed/zyndicate) and
 * @midnight-ntwrk/compact-runtime so tests can drive circuits against a
 * single shared public state with multiple actors, each supplying its own
 * private state (secret keys, credential secrets, bid openings).
 *
 * No network, no proofs: circuit logic and asserts execute in-process.
 */
import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
  type CircuitContext,
  type CircuitResults,
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  ledger as ledgerView,
  type Ledger,
  Verdict,
} from "../contracts/managed/zyndicate/contract/index.js";
import {
  witnesses,
  type ZyndicatePrivateState,
} from "../contracts/witnesses.js";

const COIN_PUBLIC_KEY = { bytes: new Uint8Array(32) };

/** Fixed simulated block time (seconds since epoch); tests may advance it. */
export const GENESIS_TIME = 1_700_000_000;

type PS = ZyndicatePrivateState;

export class ZyndicateSimulator {
  private readonly contract = new Contract<PS>(witnesses);
  private readonly address = sampleContractAddress();
  /** Current public (charged) contract state — the simulated chain. */
  private state: unknown;
  /** Block time (seconds since epoch) applied to every call. */
  public blockTime: number = GENESIS_TIME;

  constructor(
    deployer: PS,
    evaluatorAuthority: Uint8Array,
    tribunalAuthority: Uint8Array,
    issuerAuthority: Uint8Array,
  ) {
    const { currentContractState } = this.contract.initialState(
      createConstructorContext(deployer, COIN_PUBLIC_KEY),
      evaluatorAuthority,
      tribunalAuthority,
      issuerAuthority,
    );
    this.state = currentContractState.data;
  }

  /** Typed view over the current public ledger state. */
  ledger(): Ledger {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ledgerView(this.state as any);
  }

  /** Run one circuit as `actor`, committing public state on success. */
  private call<R>(
    actor: PS,
    run: (ctx: CircuitContext<PS>) => CircuitResults<PS, R>,
  ): R {
    const ctx = createCircuitContext<PS>(
      this.address,
      COIN_PUBLIC_KEY,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.state as any,
      actor,
      undefined,
      undefined,
      this.blockTime,
    );
    const results = run(ctx);
    // A failed assert throws above; state advances only on success.
    this.state = results.context.currentQueryContext.state;
    return results.result;
  }

  // --- Identity -----------------------------------------------------------

  registerCredential(actor: PS, credentialHash: Uint8Array): void {
    this.call(actor, (ctx) =>
      this.contract.impureCircuits.registerCredential(ctx, credentialHash),
    );
  }

  // --- Mandate ------------------------------------------------------------

  createMandate(
    actor: PS,
    mandateCommitment: Uint8Array,
    covenantCommitment: Uint8Array,
    publicDomain: Uint8Array,
    bidDeadline: bigint,
    executionDeadline: bigint,
  ): bigint {
    return this.call(actor, (ctx) =>
      this.contract.impureCircuits.createMandate(
        ctx,
        mandateCommitment,
        covenantCommitment,
        publicDomain,
        bidDeadline,
        executionDeadline,
      ),
    );
  }

  closeBidWindow(actor: PS, mandateId: bigint): void {
    this.call(actor, (ctx) =>
      this.contract.impureCircuits.closeBidWindow(ctx, mandateId),
    );
  }

  cancelMandate(actor: PS, mandateId: bigint): void {
    this.call(actor, (ctx) =>
      this.contract.impureCircuits.cancelMandate(ctx, mandateId),
    );
  }

  // --- Bid ----------------------------------------------------------------

  submitBid(
    actor: PS,
    mandateId: bigint,
    bidCommitment: Uint8Array,
    bidNullifier: Uint8Array,
  ): void {
    this.call(actor, (ctx) =>
      this.contract.impureCircuits.submitBid(
        ctx,
        mandateId,
        bidCommitment,
        bidNullifier,
      ),
    );
  }

  // --- Award --------------------------------------------------------------

  awardBid(actor: PS, mandateId: bigint, winningBidCommitment: Uint8Array): void {
    this.call(actor, (ctx) =>
      this.contract.impureCircuits.awardBid(ctx, mandateId, winningBidCommitment),
    );
  }

  acceptAward(actor: PS, mandateId: bigint): void {
    this.call(actor, (ctx) =>
      this.contract.impureCircuits.acceptAward(ctx, mandateId),
    );
  }

  // --- Submission ---------------------------------------------------------

  commitSubmission(
    actor: PS,
    mandateId: bigint,
    artifactCommitment: Uint8Array,
    receiptCommitment: Uint8Array,
  ): void {
    this.call(actor, (ctx) =>
      this.contract.impureCircuits.commitSubmission(
        ctx,
        mandateId,
        artifactCommitment,
        receiptCommitment,
      ),
    );
  }

  // --- Evaluation ---------------------------------------------------------

  recordEvaluation(
    actor: PS,
    mandateId: bigint,
    evaluationCommitment: Uint8Array,
    verdict: Verdict,
  ): void {
    this.call(actor, (ctx) =>
      this.contract.impureCircuits.recordEvaluation(
        ctx,
        mandateId,
        evaluationCommitment,
        verdict,
      ),
    );
  }

  // --- Settlement ---------------------------------------------------------

  settleMandate(actor: PS, mandateId: bigint, settlementNullifier: Uint8Array): void {
    this.call(actor, (ctx) =>
      this.contract.impureCircuits.settleMandate(ctx, mandateId, settlementNullifier),
    );
  }

  // --- Dispute ------------------------------------------------------------

  openDispute(actor: PS, mandateId: bigint, disputeCommitment: Uint8Array): void {
    this.call(actor, (ctx) =>
      this.contract.impureCircuits.openDispute(ctx, mandateId, disputeCommitment),
    );
  }

  resolveDispute(actor: PS, mandateId: bigint, rulingCommitment: Uint8Array): void {
    this.call(actor, (ctx) =>
      this.contract.impureCircuits.resolveDispute(ctx, mandateId, rulingCommitment),
    );
  }

  // --- Receipts -----------------------------------------------------------

  issueReceipt(actor: PS, mandateId: bigint, receiptNullifier: Uint8Array): void {
    this.call(actor, (ctx) =>
      this.contract.impureCircuits.issueReceipt(ctx, mandateId, receiptNullifier),
    );
  }
}
