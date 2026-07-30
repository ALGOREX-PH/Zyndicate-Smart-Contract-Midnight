/**
 * Preprod deploy script for the Zyndicate contract.
 *
 * Deploys the compiled `contracts/managed/zyndicate` contract to Midnight's
 * Preprod network using a headless wallet (wallet-sdk `WalletFacade`) built
 * from a local seed, a local proof server, and the Preprod indexer/node.
 *
 * Usage: `npm run deploy:preprod` (see package.json).
 *
 * IMPORTANT — fee funding: a Preprod deploy transaction is paid in DUST.
 * DUST only accrues some time after the wallet's NIGHT UTXOs are registered
 * for dust generation (see ~/wallet-setup/WALLET_INFO.md in the deploy
 * environment for the full story). If the wallet's DUST balance is still
 * zero, `deployContract` below will fail while balancing the transaction —
 * that is expected and is not a bug in this script. Re-run this script once
 * tDUST has accrued.
 */

// The indexer client and wallet sync both require a global WebSocket in
// Node — must run before any indexer/wallet code is imported/used.
import { WebSocket } from "ws";
(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;

import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as Rx from "rxjs";

import * as ledger from "@midnight-ntwrk/ledger-v8";
import { NoOpTransactionHistoryStorage } from "@midnight-ntwrk/wallet-sdk-abstractions";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import {
  createKeystore,
  PublicKey,
  UnshieldedWallet,
  type UnshieldedKeystore,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { setNetworkId, getNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { ttlOneHour } from "@midnight-ntwrk/midnight-js-utils";
import type { UnboundTransaction, MidnightProviders } from "@midnight-ntwrk/midnight-js-types";
import type { FinalizedTransaction } from "@midnight-ntwrk/midnight-js-protocol/ledger";

import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/compact-js";

import * as CompiledZyndicateContract from "../contracts/managed/zyndicate/contract/index.js";
import { witnesses, createPrivateState, type ZyndicatePrivateState } from "../contracts/witnesses.js";
import type { Contract as ZyndicateContract } from "../contracts/managed/zyndicate/contract/index.js";

type ZyndicateCircuits = Exclude<
  keyof ZyndicateContract<ZyndicatePrivateState>["impureCircuits"],
  number | symbol
>;
type ZyndicateProviders = MidnightProviders<ZyndicateCircuits, typeof PRIVATE_STATE_ID, ZyndicatePrivateState>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// ----------------------------------------------------------------------------
// Network configuration (Preprod) — see ~/wallet-setup/WALLET_INFO.md for the
// values already confirmed working for the funded deploy wallet.
// ----------------------------------------------------------------------------
const NETWORK_ID = "preprod";
const INDEXER_HTTP_URL = "https://indexer.preprod.midnight.network/api/v4/graphql";
const INDEXER_WS_URL = "wss://indexer.preprod.midnight.network/api/v4/graphql/ws";
const NODE_RPC_URL = "wss://rpc.preprod.midnight.network";
const PROOF_SERVER_URL = "http://localhost:6300";
const ZK_CONFIG_PATH = path.join(REPO_ROOT, "contracts", "managed", "zyndicate");
const PRIVATE_STATE_DB_PATH = path.join(REPO_ROOT, ".private-state");
const PRIVATE_STATE_ID = "zyndicatePrivateState";

// Wallet seed — built earlier in a separate wallet-setup project (WSL,
// outside this repo); referenced by path only, never printed.
const SEED_FILE = path.join(os.homedir(), "wallet-setup", "seed.txt");

// Deploy-time role authority keys (testnet-only, low-stakes) persisted
// outside the repo alongside the wallet material they're paired with.
const DEPLOY_AUTHORITIES_FILE = path.join(os.homedir(), "wallet-setup", "deploy-authorities.json");

const DEPLOYMENT_OUTPUT_FILE = path.join(REPO_ROOT, "deployments", "preprod.json");

// ----------------------------------------------------------------------------
// Wallet — headless wallet-sdk construction, verified working against these
// exact package versions in ~/wallet-setup/wallet-lib.mjs. Reused verbatim
// here (this repo is a separate project from wallet-setup, so the working
// construction code is inlined rather than imported cross-project).
// ----------------------------------------------------------------------------

interface DeployWallet {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
}

async function buildWallet(seedHex: string): Promise<DeployWallet> {
  setNetworkId(NETWORK_ID); // MUST run before any ledger/wallet WASM use

  const hdResult = HDWallet.fromSeed(Buffer.from(seedHex, "hex"));
  if (hdResult.type !== "seedOk") {
    throw new Error(`bad seed: ${JSON.stringify(hdResult.error)}`);
  }
  const hdWallet = hdResult.hdWallet;

  const derived = hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== "keysDerived") {
    throw new Error(`key derivation failed: ${JSON.stringify(derived)}`);
  }
  const { keys } = derived;

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

  const walletConfig = {
    networkId: getNetworkId(),
    indexerClientConnection: {
      indexerHttpUrl: INDEXER_HTTP_URL,
      indexerWsUrl: INDEXER_WS_URL,
    },
    provingServerUrl: new URL(PROOF_SERVER_URL), // URL object, not string
    relayURL: new URL(NODE_RPC_URL), // URL object, not string
    // Required by this wallet-sdk-facade version's DefaultConfiguration; a
    // one-shot deploy script has no use for local transaction history, so a
    // no-op backend (vs. InMemoryTransactionHistoryStorage) is deliberate.
    txHistoryStorage: new NoOpTransactionHistoryStorage(),
    // Required by the dust wallet's BaseV1Configuration (fee cost model);
    // values follow testkit-js's non-"undeployed" DustWalletOptions default.
    costParameters: { feeBlocksMargin: 5, additionalFeeOverhead: 1_000n },
  };

  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

/**
 * Bridges a headless {@link WalletFacade} into the `walletProvider` /
 * `midnightProvider` seats of {@link MidnightProviders}.
 *
 * Per ~/wallet-setup/WALLET_INFO.md: waits ONLY on
 * `state.unshielded.progress.isStrictlyComplete()` — not the full
 * `wallet.state().pipe(filter(s => s.isSynced))` / `waitForSyncedState()` —
 * since the unshielded sub-wallet's sync is address-scoped and fast
 * (~1-5s), while shielded/dust are unfiltered global-event-stream scans
 * that can take hours on Preprod. Balancing the deploy tx still touches
 * `dust` internally (to source DUST fee inputs); if the wallet's DUST
 * balance is zero, that step is expected to fail with an insufficient
 * funds/DUST error — see the module docstring.
 */
async function createWalletAndMidnightProvider(ctx: DeployWallet) {
  const state = await Rx.firstValueFrom(
    ctx.wallet.state().pipe(Rx.filter((s) => s.unshielded.progress.isStrictlyComplete())),
  );
  return {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx: UnboundTransaction, ttl: Date = ttlOneHour()): Promise<FinalizedTransaction> {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl },
      );
      const signed = await ctx.wallet.signRecipe(recipe, (p) => ctx.unshieldedKeystore.signData(p));
      return ctx.wallet.finalizeRecipe(signed);
    },
    submitTx: (tx: FinalizedTransaction) => ctx.wallet.submitTransaction(tx),
  };
}

// ----------------------------------------------------------------------------
// Providers — the six-slot MidnightProviders, per the midnight-dev dapp
// skill's Node-CLI assembly pattern.
// ----------------------------------------------------------------------------

async function configureProviders(
  walletAndMidnightProvider: Awaited<ReturnType<typeof createWalletAndMidnightProvider>>,
): Promise<ZyndicateProviders> {
  const zkConfigProvider = new NodeZkConfigProvider<ZyndicateCircuits>(ZK_CONFIG_PATH);
  const accountId = walletAndMidnightProvider.getCoinPublicKey();
  // Password policy (midnight-js-level-private-state-provider): >=16 chars,
  // >=3 character classes, no long runs/sequences. base64-of-hex plus a
  // trailing symbol reliably satisfies this for any accountId.
  const storagePassword = `${Buffer.from(accountId, "hex").toString("base64")}!`;

  fs.mkdirSync(PRIVATE_STATE_DB_PATH, { recursive: true });

  return {
    privateStateProvider: levelPrivateStateProvider<typeof PRIVATE_STATE_ID, ZyndicatePrivateState>({
      midnightDbName: PRIVATE_STATE_DB_PATH,
      privateStateStoreName: "zyndicate-private-state",
      accountId,
      privateStoragePasswordProvider: () => storagePassword,
    }),
    // No explicit webSocketImpl: relies on the globalThis.WebSocket polyfill
    // set at the top of this file (avoids a dual-package-type mismatch
    // between "ws"'s `export =` type and its synthesized ESM default).
    publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP_URL, INDEXER_WS_URL),
    zkConfigProvider,
    // v4: zkConfigProvider is the SECOND argument.
    proofProvider: httpClientProofProvider(PROOF_SERVER_URL, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
}

// ----------------------------------------------------------------------------
// Deploy-time role authorities — evaluator/tribunal/issuer secret keys and
// their on-chain hashes, per the constructor pattern proven in
// test/zyndicate.test.ts: three random 32-byte secrets, hashed via
// pureCircuits.deriveEvaluatorKey/deriveTribunalKey/deriveIssuerKey, passed
// as the contract constructor's three Bytes<32> arguments.
//
// Persisted OUTSIDE this repo (~/wallet-setup/deploy-authorities.json,
// alongside the wallet material it's paired with) and reused across runs so
// repeated `npm run deploy:preprod` invocations don't mint fresh authorities
// each time. Whoever runs the evaluator/tribunal/issuer roles for this
// deployment will need the corresponding secret key from that file.
//
// TESTNET-ONLY, LOW-STAKES KEY MATERIAL — Preprod is a public test network
// with no real value at stake; this is not a production key-management
// pattern.
// ----------------------------------------------------------------------------

interface DeployAuthorities {
  network: string;
  evaluatorSecretKeyHex: string;
  tribunalSecretKeyHex: string;
  issuerSecretKeyHex: string;
  generatedAt: string;
}

function loadOrCreateDeployAuthorities(): DeployAuthorities {
  if (fs.existsSync(DEPLOY_AUTHORITIES_FILE)) {
    const existing = JSON.parse(fs.readFileSync(DEPLOY_AUTHORITIES_FILE, "utf8")) as DeployAuthorities;
    console.log(`[deploy-preprod] reusing existing deploy authorities from ${DEPLOY_AUTHORITIES_FILE}`);
    return existing;
  }
  const authorities: DeployAuthorities = {
    network: NETWORK_ID,
    evaluatorSecretKeyHex: randomBytes(32).toString("hex"),
    tribunalSecretKeyHex: randomBytes(32).toString("hex"),
    issuerSecretKeyHex: randomBytes(32).toString("hex"),
    generatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(DEPLOY_AUTHORITIES_FILE), { recursive: true });
  fs.writeFileSync(DEPLOY_AUTHORITIES_FILE, `${JSON.stringify(authorities, null, 2)}\n`, { mode: 0o600 });
  console.log(
    `[deploy-preprod] generated fresh deploy authority keys -> ${DEPLOY_AUTHORITIES_FILE}\n` +
      "  (testnet-only, low-stakes: whoever runs the evaluator/tribunal/issuer\n" +
      "  roles for this deployment will need the matching secret from that file)",
  );
  return authorities;
}

async function main(): Promise<void> {
  console.log(`[deploy-preprod] network=${NETWORK_ID}`);

  const seedHex = fs.readFileSync(SEED_FILE, "utf8").trim();
  const deployWallet = await buildWallet(seedHex);
  console.log("[deploy-preprod] wallet built, waiting for unshielded sync...");
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(deployWallet);
  console.log(
    `[deploy-preprod] unshielded synced. coinPublicKey=${walletAndMidnightProvider.getCoinPublicKey()}`,
  );

  console.log("[deploy-preprod] wiring providers...");
  const providers = await configureProviders(walletAndMidnightProvider);
  console.log("[deploy-preprod] providers wired.");

  const authorities = loadOrCreateDeployAuthorities();
  const evaluatorSecretKey = Uint8Array.from(Buffer.from(authorities.evaluatorSecretKeyHex, "hex"));
  const tribunalSecretKey = Uint8Array.from(Buffer.from(authorities.tribunalSecretKeyHex, "hex"));
  const issuerSecretKey = Uint8Array.from(Buffer.from(authorities.issuerSecretKeyHex, "hex"));

  const evaluatorAuthority = CompiledZyndicateContract.pureCircuits.deriveEvaluatorKey(evaluatorSecretKey);
  const tribunalAuthority = CompiledZyndicateContract.pureCircuits.deriveTribunalKey(tribunalSecretKey);
  const issuerAuthority = CompiledZyndicateContract.pureCircuits.deriveIssuerKey(issuerSecretKey);

  const zyndicateCompiledContract = CompiledContract.make<
    CompiledZyndicateContract.Contract<ZyndicatePrivateState>
  >("Zyndicate", CompiledZyndicateContract.Contract<ZyndicatePrivateState>).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
  );

  // The deployer's own private state; only the three authority secret keys
  // are meaningful at deploy time (the constructor only discloses the
  // hashed authorities). The rest of ZyndicatePrivateState is filled with
  // fresh random values by createPrivateState's defaults — this deployer
  // is not necessarily any particular principal/operator.
  const initialPrivateState = createPrivateState({
    evaluatorSecretKey,
    tribunalSecretKey,
    issuerSecretKey,
  });

  console.log("[deploy-preprod] calling deployContract (proves + balances + submits)...");
  console.log(
    "[deploy-preprod] if the wallet's DUST balance is still zero, this is expected to fail here " +
      "while balancing the transaction — see the module docstring.",
  );

  const deployed = await deployContract(providers, {
    compiledContract: zyndicateCompiledContract,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState,
    args: [evaluatorAuthority, tribunalAuthority, issuerAuthority],
  });

  const contractAddress = deployed.deployTxData.public.contractAddress;
  const deployTxHash = deployed.deployTxData.public.txHash;
  console.log(`[deploy-preprod] DEPLOYED. contractAddress=${contractAddress}`);

  fs.mkdirSync(path.dirname(DEPLOYMENT_OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(
    DEPLOYMENT_OUTPUT_FILE,
    `${JSON.stringify(
      {
        network: NETWORK_ID,
        contractAddress,
        deployTxHash,
        deployedAt: new Date().toISOString(),
        evaluatorAuthorityKeyRef: `${DEPLOY_AUTHORITIES_FILE}#evaluatorSecretKeyHex`,
        tribunalAuthorityKeyRef: `${DEPLOY_AUTHORITIES_FILE}#tribunalSecretKeyHex`,
        issuerAuthorityKeyRef: `${DEPLOY_AUTHORITIES_FILE}#issuerSecretKeyHex`,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`[deploy-preprod] wrote ${DEPLOYMENT_OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("[deploy-preprod] fatal error:", err);
  process.exitCode = 1;
});
