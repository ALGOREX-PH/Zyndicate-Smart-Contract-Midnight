/**
 * Zyndicate witness implementations (the "private oracle").
 *
 * Everything in this file is Class D (locally private) data: secret keys,
 * credential secrets, and bid openings. None of it ever reaches the chain
 * directly — circuits only publish domain-separated hashes, commitments,
 * and nullifiers derived from these values, each gated by in-circuit
 * asserts against ledger state.
 */
import { randomBytes } from "node:crypto";
import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import {
  pureCircuits,
  type Ledger,
  type Witnesses,
} from "./managed/zyndicate/contract/index.js";

/**
 * Private state carried by a Zyndicate participant. A real dApp would hold
 * only the fields for its own role; the simulator fills every slot so one
 * actor object can play any role in tests.
 */
export interface ZyndicatePrivateState {
  /** Principal role secret (auth for close/cancel/award/settle). */
  principalSecretKey: Uint8Array;
  /** Operator role secret (auth for accept/submit/receipt). */
  operatorSecretKey: Uint8Array;
  /** Issued eligibility credential secret (bid eligibility + nullifier). */
  operatorCredentialSecret: Uint8Array;
  /** Evaluator role secret (auth for recordEvaluation). */
  evaluatorSecretKey: Uint8Array;
  /** Tribunal role secret (auth for resolveDispute). */
  tribunalSecretKey: Uint8Array;
  /** Credential issuer role secret (auth for registerCredential). */
  issuerSecretKey: Uint8Array;
  /** Sealed bid opening: price. Never published — only committed. */
  bidOpeningPrice: bigint;
  /** Sealed bid opening: commitment randomness. Never reused. */
  bidOpeningRand: Uint8Array;
}

/** Fresh, unlinkable private state; override the slots a test controls. */
export const createPrivateState = (
  overrides: Partial<ZyndicatePrivateState> = {},
): ZyndicatePrivateState => ({
  principalSecretKey: randomBytes(32),
  operatorSecretKey: randomBytes(32),
  operatorCredentialSecret: randomBytes(32),
  evaluatorSecretKey: randomBytes(32),
  tribunalSecretKey: randomBytes(32),
  issuerSecretKey: randomBytes(32),
  bidOpeningPrice: 0n,
  bidOpeningRand: randomBytes(32),
  ...overrides,
});

type Ctx = WitnessContext<Ledger, ZyndicatePrivateState>;

/**
 * Witness implementations wired to {@link ZyndicatePrivateState}.
 * The credential Merkle path is computed against the local projection of
 * the public credential registry; the path itself stays inside the proof.
 */
export const witnesses: Witnesses<ZyndicatePrivateState> = {
  principalSecretKey: ({ privateState }: Ctx): [ZyndicatePrivateState, Uint8Array] =>
    [privateState, privateState.principalSecretKey],

  operatorSecretKey: ({ privateState }: Ctx): [ZyndicatePrivateState, Uint8Array] =>
    [privateState, privateState.operatorSecretKey],

  operatorCredentialSecret: ({ privateState }: Ctx): [ZyndicatePrivateState, Uint8Array] =>
    [privateState, privateState.operatorCredentialSecret],

  credentialPath: ({ ledger, privateState }: Ctx) => {
    const leaf = pureCircuits.deriveCredentialHash(
      privateState.operatorCredentialSecret,
    );
    const path = ledger.credentialRegistry.findPathForLeaf(leaf);
    if (path === undefined) {
      // An honest client cannot build an eligibility proof without an
      // issued credential; the circuit rejects any fabricated path anyway.
      throw new Error("operator credential is not present in the registry");
    }
    return [privateState, path];
  },

  evaluatorSecretKey: ({ privateState }: Ctx): [ZyndicatePrivateState, Uint8Array] =>
    [privateState, privateState.evaluatorSecretKey],

  tribunalSecretKey: ({ privateState }: Ctx): [ZyndicatePrivateState, Uint8Array] =>
    [privateState, privateState.tribunalSecretKey],

  issuerSecretKey: ({ privateState }: Ctx): [ZyndicatePrivateState, Uint8Array] =>
    [privateState, privateState.issuerSecretKey],

  bidOpeningPrice: ({ privateState }: Ctx): [ZyndicatePrivateState, bigint] =>
    [privateState, privateState.bidOpeningPrice],

  bidOpeningRand: ({ privateState }: Ctx): [ZyndicatePrivateState, Uint8Array] =>
    [privateState, privateState.bidOpeningRand],
};
