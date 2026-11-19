// Small ABI helpers for the escrow contract and the tUSD8 token.
// No dependencies: function selectors live in config.js, and the only
// types used here are address and uint256, which encode as one 32 byte
// word each. The browser page uses this same file through the server.

import { SELECTORS, TUSD8_DECIMALS } from "./config.js";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(value) {
  return typeof value === "string" && ADDRESS_RE.test(value.trim());
}

function wordFromBigInt(value) {
  const v = BigInt(value);
  if (v < 0n) throw new Error("negative values cannot be encoded");
  return v.toString(16).padStart(64, "0");
}

function wordFromAddress(address) {
  if (!isAddress(address)) throw new Error(`not an address: ${address}`);
  return address.trim().toLowerCase().slice(2).padStart(64, "0");
}

function call(selector, words) {
  return selector + words.join("");
}

// Transaction data builders. Each returns a 0x hex string ready for
// eth_sendTransaction.

export function createInvoiceCalldata(freelancer, amount, deadline) {
  return call(SELECTORS.createInvoice, [
    wordFromAddress(freelancer),
    wordFromBigInt(amount),
    wordFromBigInt(deadline),
  ]);
}

export function markDeliveredCalldata(id) {
  return call(SELECTORS.markDelivered, [wordFromBigInt(id)]);
}

export function approveAndReleaseCalldata(id) {
  return call(SELECTORS.approveAndRelease, [wordFromBigInt(id)]);
}

export function refundAfterTimeoutCalldata(id) {
  return call(SELECTORS.refundAfterTimeout, [wordFromBigInt(id)]);
}

export function openDisputeCalldata(id) {
  return call(SELECTORS.openDispute, [wordFromBigInt(id)]);
}

export function approveCalldata(spender, amount) {
  return call(SELECTORS.approve, [wordFromAddress(spender), wordFromBigInt(amount)]);
}

// Read-only call data builders, for eth_call.

export function getInvoiceCalldata(id) {
  return call(SELECTORS.getInvoice, [wordFromBigInt(id)]);
}

export function balanceOfCalldata(account) {
  return call(SELECTORS.balanceOf, [wordFromAddress(account)]);
}

export function allowanceCalldata(owner, spender) {
  return call(SELECTORS.allowance, [wordFromAddress(owner), wordFromAddress(spender)]);
}

export function nextInvoiceIdCalldata() {
  return SELECTORS.nextInvoiceId;
}

export function invoiceCountCalldata() {
  return SELECTORS.invoiceCount;
}

// Amounts. tUSD8 has 6 decimals, so "12.5" means 12500000 base units.

export function parseUsd8(text) {
  if (typeof text !== "string") throw new Error("amount must be text");
  const clean = text.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(clean)) {
    throw new Error(`bad amount: ${text}`);
  }
  const [whole, frac = ""] = clean.split(".");
  const value = BigInt(whole) * 10n ** BigInt(TUSD8_DECIMALS) +
    BigInt(frac.padEnd(TUSD8_DECIMALS, "0") || "0");
  if (value <= 0n) throw new Error("amount must be above zero");
  return value;
}

export function formatUsd8(value) {
  const v = BigInt(value);
  const base = 10n ** BigInt(TUSD8_DECIMALS);
  const whole = v / base;
  const frac = (v % base).toString().padStart(TUSD8_DECIMALS, "0").replace(/0+$/, "");
  return frac === "" ? whole.toString() : `${whole}.${frac}`;
}

// Decoders for eth_call results.

export function decodeUint(hex) {
  if (typeof hex !== "string" || !hex.startsWith("0x")) {
    throw new Error("expected a 0x hex string");
  }
  return BigInt(hex === "0x" ? "0x0" : hex);
}

// getInvoice returns (address, address, uint256, uint256, uint256,
// uint256, uint8): seven 32 byte words.
export function decodeInvoice(hex) {
  if (typeof hex !== "string" || !hex.startsWith("0x")) {
    throw new Error("expected a 0x hex string");
  }
  const body = hex.slice(2);
  if (body.length < 64 * 7) throw new Error("invoice return data too short");
  const word = (i) => body.slice(i * 64, (i + 1) * 64);
  const addressAt = (i) => "0x" + word(i).slice(24);
  return {
    client: addressAt(0),
    freelancer: addressAt(1),
    amount: BigInt("0x" + word(2)),
    deadline: BigInt("0x" + word(3)),
    deliveredAt: BigInt("0x" + word(4)),
    disputeOpenedAt: BigInt("0x" + word(5)),
    status: Number(BigInt("0x" + word(6))),
  };
}
