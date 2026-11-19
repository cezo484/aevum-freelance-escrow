// Offline walkthrough of the escrow flow. Prints each step with the
// exact transaction data the page would send, then decodes a sample
// getInvoice reply. Touches no network and no wallet.

import {
  approveCalldata,
  approveAndReleaseCalldata,
  createInvoiceCalldata,
  decodeInvoice,
  formatUsd8,
  markDeliveredCalldata,
  parseUsd8,
} from "./encode.js";
import {
  CHAIN_ID,
  DISPUTE_WINDOW_SECONDS,
  ESCROW_ADDRESS,
  EXPLORER_URL,
  RPC_URL,
  STATUS_NAMES,
  TUSD8_ADDRESS,
} from "./config.js";

const CLIENT = "0x000000000000000000000000000000000000c11e";
const FREELANCER = "0x0000000000000000000000000000000000000f1e";
const ESCROW = ESCROW_ADDRESS === "0x0000000000000000000000000000000000000000"
  ? "0x000000000000000000000000000000000000e5c0"
  : ESCROW_ADDRESS;

export function runDemo() {
  const amount = parseUsd8("250");
  const deadline = 1796000000; // fixed example, 2026-11-30
  const out = [];

  out.push("Freelance escrow on QDay Aevum");
  out.push(`Chain ${CHAIN_ID}, RPC ${RPC_URL}`);
  out.push(`Explorer ${EXPLORER_URL}`);
  out.push(`tUSD8 ${TUSD8_ADDRESS}`);
  out.push(`Escrow contract ${ESCROW}`);
  out.push("");
  out.push(`Client ${CLIENT} hires freelancer ${FREELANCER}`);
  out.push(`for ${formatUsd8(amount)} tUSD8, deadline ${new Date(deadline * 1000).toISOString()}.`);
  out.push("");
  out.push("Step 1. The client approves the escrow contract to move 250 tUSD8.");
  out.push(`  to: ${TUSD8_ADDRESS}`);
  out.push(`  data: ${approveCalldata(ESCROW, amount)}`);
  out.push("");
  out.push("Step 2. The client creates the invoice. The 250 tUSD8 moves into escrow.");
  out.push(`  to: ${ESCROW}`);
  out.push(`  data: ${createInvoiceCalldata(FREELANCER, amount, deadline)}`);
  out.push("");
  out.push("Step 3. The freelancer delivers the work.");
  out.push(`  data: ${markDeliveredCalldata(0)}`);
  out.push("");
  out.push("Step 4. The client approves. The 250 tUSD8 goes to the freelancer.");
  out.push(`  data: ${approveAndReleaseCalldata(0)}`);
  out.push("");
  out.push("If the freelancer never delivers, the client calls refundAfterTimeout");
  out.push("once the deadline passes, and the funds come back.");
  out.push(`If the work is wrong, the client has ${DISPUTE_WINDOW_SECONDS / 86400} days`);
  out.push("after delivery to open a dispute. While disputed, the funds stay");
  out.push("locked: the freelancer can deliver again, the client can still");
  out.push("approve, and after the window passes the client can claim a refund.");
  out.push("");

  // A sample getInvoice reply for invoice 0, as the page would decode it.
  const words = [
    CLIENT.slice(2).padStart(64, "0"),
    FREELANCER.slice(2).padStart(64, "0"),
    amount.toString(16).padStart(64, "0"),
    BigInt(deadline).toString(16).padStart(64, "0"),
    BigInt(1795900000).toString(16).padStart(64, "0"),
    "0".repeat(64),
    "1".padStart(64, "0"),
  ];
  const invoice = decodeInvoice("0x" + words.join(""));
  out.push("Sample invoice 0, decoded from an eth_call reply:");
  out.push(`  client: ${invoice.client}`);
  out.push(`  freelancer: ${invoice.freelancer}`);
  out.push(`  amount: ${formatUsd8(invoice.amount)} tUSD8`);
  out.push(`  deadline: ${new Date(Number(invoice.deadline) * 1000).toISOString()}`);
  out.push(`  delivered: ${new Date(Number(invoice.deliveredAt) * 1000).toISOString()}`);
  out.push(`  status: ${STATUS_NAMES[invoice.status]}`);
  return out.join("\n");
}
