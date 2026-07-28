import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum MandateState { OPEN_FOR_BIDS = 0,
                           BIDDING_CLOSED = 1,
                           AWARDED = 2,
                           IN_EXECUTION = 3,
                           SUBMITTED = 4,
                           ACCEPTED = 5,
                           SETTLED = 6,
                           DISPUTED = 7,
                           RESOLVED = 8,
                           CANCELLED = 9
}

export enum Verdict { PENDING = 0, ACCEPT = 1, REJECT = 2, REVISE = 3 }

export type Witnesses<PS> = {
  principalSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  operatorSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  operatorCredentialSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  credentialPath(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                               path: { sibling: { field: bigint
                                                                                                },
                                                                                       goes_left: boolean
                                                                                     }[]
                                                                             }];
  evaluatorSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  tribunalSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  issuerSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  bidOpeningPrice(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  bidOpeningRand(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  registerCredential(context: __compactRuntime.CircuitContext<PS>,
                     credentialHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  createMandate(context: __compactRuntime.CircuitContext<PS>,
                mandateCommitment_0: Uint8Array,
                covenantCommitment_0: Uint8Array,
                publicDomain_0: Uint8Array,
                bidDeadline_0: bigint,
                executionDeadline_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  closeBidWindow(context: __compactRuntime.CircuitContext<PS>,
                 mandateId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  cancelMandate(context: __compactRuntime.CircuitContext<PS>,
                mandateId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  submitBid(context: __compactRuntime.CircuitContext<PS>,
            mandateId_0: bigint,
            bidCommitment_0: Uint8Array,
            bidNullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  awardBid(context: __compactRuntime.CircuitContext<PS>,
           mandateId_0: bigint,
           winningBidCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  acceptAward(context: __compactRuntime.CircuitContext<PS>, mandateId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  commitSubmission(context: __compactRuntime.CircuitContext<PS>,
                   mandateId_0: bigint,
                   artifactCommitment_0: Uint8Array,
                   receiptCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  recordEvaluation(context: __compactRuntime.CircuitContext<PS>,
                   mandateId_0: bigint,
                   evaluationCommitment_0: Uint8Array,
                   verdict_0: Verdict): __compactRuntime.CircuitResults<PS, []>;
  settleMandate(context: __compactRuntime.CircuitContext<PS>,
                mandateId_0: bigint,
                settlementNullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  openDispute(context: __compactRuntime.CircuitContext<PS>,
              mandateId_0: bigint,
              disputeCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  resolveDispute(context: __compactRuntime.CircuitContext<PS>,
                 mandateId_0: bigint,
                 rulingCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  issueReceipt(context: __compactRuntime.CircuitContext<PS>,
               mandateId_0: bigint,
               receiptNullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  registerCredential(context: __compactRuntime.CircuitContext<PS>,
                     credentialHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  createMandate(context: __compactRuntime.CircuitContext<PS>,
                mandateCommitment_0: Uint8Array,
                covenantCommitment_0: Uint8Array,
                publicDomain_0: Uint8Array,
                bidDeadline_0: bigint,
                executionDeadline_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  closeBidWindow(context: __compactRuntime.CircuitContext<PS>,
                 mandateId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  cancelMandate(context: __compactRuntime.CircuitContext<PS>,
                mandateId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  submitBid(context: __compactRuntime.CircuitContext<PS>,
            mandateId_0: bigint,
            bidCommitment_0: Uint8Array,
            bidNullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  awardBid(context: __compactRuntime.CircuitContext<PS>,
           mandateId_0: bigint,
           winningBidCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  acceptAward(context: __compactRuntime.CircuitContext<PS>, mandateId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  commitSubmission(context: __compactRuntime.CircuitContext<PS>,
                   mandateId_0: bigint,
                   artifactCommitment_0: Uint8Array,
                   receiptCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  recordEvaluation(context: __compactRuntime.CircuitContext<PS>,
                   mandateId_0: bigint,
                   evaluationCommitment_0: Uint8Array,
                   verdict_0: Verdict): __compactRuntime.CircuitResults<PS, []>;
  settleMandate(context: __compactRuntime.CircuitContext<PS>,
                mandateId_0: bigint,
                settlementNullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  openDispute(context: __compactRuntime.CircuitContext<PS>,
              mandateId_0: bigint,
              disputeCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  resolveDispute(context: __compactRuntime.CircuitContext<PS>,
                 mandateId_0: bigint,
                 rulingCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  issueReceipt(context: __compactRuntime.CircuitContext<PS>,
               mandateId_0: bigint,
               receiptNullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  derivePrincipalKey(sk_0: Uint8Array): Uint8Array;
  deriveOperatorKey(sk_0: Uint8Array): Uint8Array;
  deriveEvaluatorKey(sk_0: Uint8Array): Uint8Array;
  deriveTribunalKey(sk_0: Uint8Array): Uint8Array;
  deriveIssuerKey(sk_0: Uint8Array): Uint8Array;
  deriveCredentialHash(credentialSecret_0: Uint8Array): Uint8Array;
  deriveBidNullifier(mandateId_0: bigint, credentialSecret_0: Uint8Array): Uint8Array;
  deriveSettlementNullifier(mandateId_0: bigint, principalSk_0: Uint8Array): Uint8Array;
  deriveReceiptNullifier(mandateId_0: bigint, operatorSk_0: Uint8Array): Uint8Array;
  deriveBidCommitment(mandateId_0: bigint,
                      price_0: bigint,
                      operatorSk_0: Uint8Array,
                      rand_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  derivePrincipalKey(context: __compactRuntime.CircuitContext<PS>,
                     sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveOperatorKey(context: __compactRuntime.CircuitContext<PS>,
                    sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveEvaluatorKey(context: __compactRuntime.CircuitContext<PS>,
                     sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveTribunalKey(context: __compactRuntime.CircuitContext<PS>,
                    sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveIssuerKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveCredentialHash(context: __compactRuntime.CircuitContext<PS>,
                       credentialSecret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveBidNullifier(context: __compactRuntime.CircuitContext<PS>,
                     mandateId_0: bigint,
                     credentialSecret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveSettlementNullifier(context: __compactRuntime.CircuitContext<PS>,
                            mandateId_0: bigint,
                            principalSk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveReceiptNullifier(context: __compactRuntime.CircuitContext<PS>,
                         mandateId_0: bigint,
                         operatorSk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveBidCommitment(context: __compactRuntime.CircuitContext<PS>,
                      mandateId_0: bigint,
                      price_0: bigint,
                      operatorSk_0: Uint8Array,
                      rand_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  registerCredential(context: __compactRuntime.CircuitContext<PS>,
                     credentialHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  createMandate(context: __compactRuntime.CircuitContext<PS>,
                mandateCommitment_0: Uint8Array,
                covenantCommitment_0: Uint8Array,
                publicDomain_0: Uint8Array,
                bidDeadline_0: bigint,
                executionDeadline_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  closeBidWindow(context: __compactRuntime.CircuitContext<PS>,
                 mandateId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  cancelMandate(context: __compactRuntime.CircuitContext<PS>,
                mandateId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  submitBid(context: __compactRuntime.CircuitContext<PS>,
            mandateId_0: bigint,
            bidCommitment_0: Uint8Array,
            bidNullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  awardBid(context: __compactRuntime.CircuitContext<PS>,
           mandateId_0: bigint,
           winningBidCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  acceptAward(context: __compactRuntime.CircuitContext<PS>, mandateId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  commitSubmission(context: __compactRuntime.CircuitContext<PS>,
                   mandateId_0: bigint,
                   artifactCommitment_0: Uint8Array,
                   receiptCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  recordEvaluation(context: __compactRuntime.CircuitContext<PS>,
                   mandateId_0: bigint,
                   evaluationCommitment_0: Uint8Array,
                   verdict_0: Verdict): __compactRuntime.CircuitResults<PS, []>;
  settleMandate(context: __compactRuntime.CircuitContext<PS>,
                mandateId_0: bigint,
                settlementNullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  openDispute(context: __compactRuntime.CircuitContext<PS>,
              mandateId_0: bigint,
              disputeCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  resolveDispute(context: __compactRuntime.CircuitContext<PS>,
                 mandateId_0: bigint,
                 rulingCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  issueReceipt(context: __compactRuntime.CircuitContext<PS>,
               mandateId_0: bigint,
               receiptNullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly evaluatorAuthority: Uint8Array;
  readonly tribunalAuthority: Uint8Array;
  readonly issuerAuthority: Uint8Array;
  credentialRegistry: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  readonly credentialCount: bigint;
  readonly mandateCount: bigint;
  mandateStates: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): MandateState;
    [Symbol.iterator](): Iterator<[bigint, MandateState]>
  };
  mandateCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Uint8Array;
    [Symbol.iterator](): Iterator<[bigint, Uint8Array]>
  };
  covenantCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Uint8Array;
    [Symbol.iterator](): Iterator<[bigint, Uint8Array]>
  };
  mandateDomains: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Uint8Array;
    [Symbol.iterator](): Iterator<[bigint, Uint8Array]>
  };
  principalKeys: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Uint8Array;
    [Symbol.iterator](): Iterator<[bigint, Uint8Array]>
  };
  bidDeadlines: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): bigint;
    [Symbol.iterator](): Iterator<[bigint, bigint]>
  };
  executionDeadlines: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): bigint;
    [Symbol.iterator](): Iterator<[bigint, bigint]>
  };
  bidRegistry: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  bidCounts: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): bigint;
    [Symbol.iterator](): Iterator<[bigint, bigint]>
  };
  bidNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  winningBids: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Uint8Array;
    [Symbol.iterator](): Iterator<[bigint, Uint8Array]>
  };
  operatorKeys: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Uint8Array;
    [Symbol.iterator](): Iterator<[bigint, Uint8Array]>
  };
  artifactCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Uint8Array;
    [Symbol.iterator](): Iterator<[bigint, Uint8Array]>
  };
  receiptCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Uint8Array;
    [Symbol.iterator](): Iterator<[bigint, Uint8Array]>
  };
  evaluationCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Uint8Array;
    [Symbol.iterator](): Iterator<[bigint, Uint8Array]>
  };
  verdicts: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Verdict;
    [Symbol.iterator](): Iterator<[bigint, Verdict]>
  };
  settlementNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  receiptNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly settledMandates: bigint;
  readonly issuedReceipts: bigint;
  disputeCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Uint8Array;
    [Symbol.iterator](): Iterator<[bigint, Uint8Array]>
  };
  rulingCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Uint8Array;
    [Symbol.iterator](): Iterator<[bigint, Uint8Array]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               initialEvaluatorAuthority_0: Uint8Array,
               initialTribunalAuthority_0: Uint8Array,
               initialIssuerAuthority_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
