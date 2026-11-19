// Network and contract settings for the QDay Aevum testnet.
// Values verified against the QDay wiki and the live RPC on 19 Nov 2026.

export const CHAIN_ID = 44005;
export const CHAIN_ID_HEX = "0xABE5";
export const CHAIN_NAME = "QDay Aevum";
export const RPC_URL = "https://rpc-test.qday.info";
export const EXPLORER_URL = "https://explorer-test.qday.info";
export const FAUCET_URL = "https://faucet.qday.info";
export const NATIVE_CURRENCY = { name: "tQDAY", symbol: "tQDAY", decimals: 18 };

// Test stablecoin on Aevum. 6 decimals, like USDC.
export const TUSD8_ADDRESS = "0x456569838f1d43009A91ebA4263147Afd7233483";
export const TUSD8_DECIMALS = 6;
export const TUSD8_SYMBOL = "tUSD8";

// Fill this in after deploying FreelanceEscrow, then restart the server.
// The page also lets you paste an address by hand, so the deploy step
// below is the only edit a fresh checkout needs.
export const ESCROW_ADDRESS = "0x0000000000000000000000000000000000000000";

// First four bytes of keccak256 of each function signature, computed
// with `cast sig` against src/FreelanceEscrow.sol. The page builds its
// transaction data from these, so no web3 library is needed.
export const SELECTORS = {
  createInvoice: "0x02b175ef",
  markDelivered: "0xeb826a5f",
  approveAndRelease: "0xdcb05611",
  refundAfterTimeout: "0x0c4b10d4",
  openDispute: "0x27d00fb0",
  getInvoice: "0x3a23cc0a",
  nextInvoiceId: "0x6ff2a953",
  invoiceCount: "0x1346f0c4",
  approve: "0x095ea7b3",
  balanceOf: "0x70a08231",
  allowance: "0xdd62ed3e",
  decimals: "0x313ce567",
};

export const STATUS_NAMES = ["Created", "Delivered", "Released", "Refunded", "Disputed"];

// Dispute window in the contract, in seconds (3 days).
export const DISPUTE_WINDOW_SECONDS = 3 * 24 * 60 * 60;

export function explorerTxUrl(hash) {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function explorerAddressUrl(address) {
  return `${EXPLORER_URL}/address/${address}`;
}
