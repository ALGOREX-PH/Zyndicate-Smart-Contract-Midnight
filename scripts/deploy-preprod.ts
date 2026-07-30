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

async function main(): Promise<void> {
  console.log(`[deploy-preprod] network=${NETWORK_ID}`);
  // TODO: build wallet, wait for unshielded sync
  // TODO: wire providers
  // TODO: generate/load deploy authority keys
  // TODO: build CompiledContract + initial private state
  // TODO: deployContract, print address, write deployments/preprod.json
}

main().catch((err) => {
  console.error("[deploy-preprod] fatal error:", err);
  process.exitCode = 1;
});
