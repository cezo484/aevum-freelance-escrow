import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAIN_ID,
  CHAIN_ID_HEX,
  DISPUTE_WINDOW_SECONDS,
  EXPLORER_URL,
  RPC_URL,
  SELECTORS,
  STATUS_NAMES,
  TUSD8_ADDRESS,
  TUSD8_DECIMALS,
  explorerTxUrl,
} from "../src/config.js";
import { isAddress } from "../src/encode.js";

test("chain settings match QDay Aevum", () => {
  assert.equal(CHAIN_ID, 44005);
  assert.equal(CHAIN_ID_HEX, "0xABE5");
  assert.equal(RPC_URL, "https://rpc-test.qday.info");
  assert.equal(EXPLORER_URL, "https://explorer-test.qday.info");
});

test("tUSD8 settings", () => {
  assert.equal(isAddress(TUSD8_ADDRESS), true);
  assert.equal(TUSD8_ADDRESS, "0x456569838f1d43009A91ebA4263147Afd7233483");
  assert.equal(TUSD8_DECIMALS, 6);
});

test("selectors are four byte values", () => {
  for (const [name, selector] of Object.entries(SELECTORS)) {
    assert.match(selector, /^0x[0-9a-f]{8}$/, name);
  }
  assert.equal(Object.keys(SELECTORS).length, 12);
});

test("status names cover the contract enum", () => {
  assert.deepEqual(STATUS_NAMES, ["Created", "Delivered", "Released", "Refunded", "Disputed"]);
  assert.equal(DISPUTE_WINDOW_SECONDS, 3 * 24 * 60 * 60);
});

test("explorer links", () => {
  assert.equal(
    explorerTxUrl("0xabc"),
    "https://explorer-test.qday.info/tx/0xabc",
  );
});
