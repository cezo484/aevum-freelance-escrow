// Encoder tests. The expected calldata strings were produced with
// `cast calldata` against src/FreelanceEscrow.sol, so these tests check
// the hand rolled encoder against an independent implementation.

import test from "node:test";
import assert from "node:assert/strict";
import {
  allowanceCalldata,
  approveAndReleaseCalldata,
  approveCalldata,
  balanceOfCalldata,
  createInvoiceCalldata,
  decodeInvoice,
  decodeUint,
  formatUsd8,
  getInvoiceCalldata,
  invoiceCountCalldata,
  isAddress,
  markDeliveredCalldata,
  nextInvoiceIdCalldata,
  openDisputeCalldata,
  parseUsd8,
  refundAfterTimeoutCalldata,
} from "../src/encode.js";

const FREELANCER = "0x0000000000000000000000000000000000000f1e";
const ESCROW = "0x000000000000000000000000000000000000e5c0";

test("createInvoice calldata matches cast", () => {
  assert.equal(
    createInvoiceCalldata(FREELANCER, 100000000n, 1796000000n),
    "0x02b175ef" +
      "0000000000000000000000000000000000000000000000000000000000000f1e" +
      "0000000000000000000000000000000000000000000000000000000005f5e100" +
      "000000000000000000000000000000000000000000000000000000006b0cc900",
  );
});

test("approve calldata matches cast", () => {
  assert.equal(
    approveCalldata(ESCROW, 100000000n),
    "0x095ea7b3" +
      "000000000000000000000000000000000000000000000000000000000000e5c0" +
      "0000000000000000000000000000000000000000000000000000000005f5e100",
  );
});

test("single id calls match cast", () => {
  const tail = "0000000000000000000000000000000000000000000000000000000000000003";
  assert.equal(markDeliveredCalldata(3n), "0xeb826a5f" + tail);
  assert.equal(approveAndReleaseCalldata(3n), "0xdcb05611" + tail);
  assert.equal(refundAfterTimeoutCalldata(3n), "0x0c4b10d4" + tail);
  assert.equal(openDisputeCalldata(3n), "0x27d00fb0" + tail);
});

test("read calls match cast", () => {
  const zero = "0000000000000000000000000000000000000000000000000000000000000000";
  assert.equal(getInvoiceCalldata(0n), "0x3a23cc0a" + zero);
  assert.equal(nextInvoiceIdCalldata(), "0x6ff2a953");
  assert.equal(invoiceCountCalldata(), "0x1346f0c4");
  assert.equal(
    balanceOfCalldata(FREELANCER),
    "0x70a08231" +
      "0000000000000000000000000000000000000000000000000000000000000f1e",
  );
  assert.equal(
    allowanceCalldata(FREELANCER, ESCROW),
    "0xdd62ed3e" +
      "0000000000000000000000000000000000000000000000000000000000000f1e" +
      "000000000000000000000000000000000000000000000000000000000000e5c0",
  );
});

test("bad inputs throw", () => {
  assert.throws(() => createInvoiceCalldata("not-an-address", 1n, 1n), /not an address/);
  assert.throws(() => markDeliveredCalldata(-1n), /negative/);
});

test("tUSD8 amounts parse and format", () => {
  assert.equal(parseUsd8("250"), 250000000n);
  assert.equal(parseUsd8("12.5"), 12500000n);
  assert.equal(parseUsd8("0.000001"), 1n);
  assert.equal(formatUsd8(250000000n), "250");
  assert.equal(formatUsd8(12500000n), "12.5");
  assert.equal(formatUsd8(1n), "0.000001");
  assert.throws(() => parseUsd8("0"), /above zero/);
  assert.throws(() => parseUsd8("1.1234567"), /bad amount/);
  assert.throws(() => parseUsd8("abc"), /bad amount/);
  assert.throws(() => parseUsd8("-5"), /bad amount/);
});

test("addresses validate", () => {
  assert.equal(isAddress(FREELANCER), true);
  assert.equal(isAddress("0x456569838f1d43009A91ebA4263147Afd7233483"), true);
  assert.equal(isAddress("0x123"), false);
  assert.equal(isAddress("456569838f1d43009A91ebA4263147Afd7233483"), false);
  assert.equal(isAddress(""), false);
  assert.equal(isAddress(null), false);
});

test("uint decoding", () => {
  assert.equal(decodeUint("0x"), 0n);
  assert.equal(decodeUint("0x2a"), 42n);
  assert.equal(decodeUint("0x000000000000000000000000000000000000000000000000000000000000002a"), 42n);
  assert.throws(() => decodeUint("42"), /0x hex/);
});

test("invoice decoding", () => {
  const words = [
    "000000000000000000000000000000000000000000000000000000000000c11e",
    "0000000000000000000000000000000000000000000000000000000000000f1e",
    "000000000000000000000000000000000000000000000000000000000ee6b280",
    "000000000000000000000000000000000000000000000000000000006b0cc900",
    "000000000000000000000000000000000000000000000000000000006b0b4260",
    "0000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000001",
  ];
  const invoice = decodeInvoice("0x" + words.join(""));
  assert.equal(invoice.client, "0x000000000000000000000000000000000000c11e");
  assert.equal(invoice.freelancer, FREELANCER);
  assert.equal(invoice.amount, 250000000n);
  assert.equal(invoice.deadline, 1796000000n);
  assert.equal(invoice.deliveredAt, 1795900000n);
  assert.equal(invoice.disputeOpenedAt, 0n);
  assert.equal(invoice.status, 1);
  assert.throws(() => decodeInvoice("0x1234"), /too short/);
});
