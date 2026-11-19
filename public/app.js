// Browser page for FreelanceEscrow. Talks to the wallet with plain
// EIP-1193 calls only: eth_requestAccounts, eth_call, eth_sendTransaction
// and eth_getTransactionReceipt. Transaction data is built with the
// shared encoder in encode.js, so no web3 library is loaded.

import {
  CHAIN_ID,
  CHAIN_ID_HEX,
  CHAIN_NAME,
  DISPUTE_WINDOW_SECONDS,
  ESCROW_ADDRESS,
  EXPLORER_URL,
  NATIVE_CURRENCY,
  RPC_URL,
  STATUS_NAMES,
  TUSD8_ADDRESS,
} from "./config.js";
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
  openDisputeCalldata,
  parseUsd8,
  refundAfterTimeoutCalldata,
} from "./encode.js";

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

let account = null;
let escrowAddress = ESCROW_ADDRESS;

function setStatus(text) {
  statusEl.textContent = text;
}

function escrowLink(hash) {
  return `${EXPLORER_URL}/tx/${hash}`;
}

async function rpc(method, params = []) {
  return window.ethereum.request({ method, params });
}

async function readCall(to, data) {
  return rpc("eth_call", [{ to, data }, "latest"]);
}

async function waitForReceipt(hash) {
  for (let i = 0; i < 120; i++) {
    const receipt = await rpc("eth_getTransactionReceipt", [hash]);
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no receipt for ${hash} after 120 seconds`);
}

async function sendTx(to, data, label) {
  const hash = await rpc("eth_sendTransaction", [{ from: account, to, data }]);
  setStatus(`${label} sent. Waiting for confirmation...\n${escrowLink(hash)}`);
  const receipt = await waitForReceipt(hash);
  if (receipt.status !== "0x1") throw new Error(`${label} reverted on chain.`);
  return hash;
}

function escrowReady() {
  if (!isAddress(escrowAddress) || escrowAddress === ZERO_ADDRESS) {
    setStatus("Set the escrow contract address first.");
    return false;
  }
  return true;
}

async function refreshBalance() {
  if (!account) return;
  const raw = await readCall(TUSD8_ADDRESS, balanceOfCalldata(account));
  $("balanceLine").textContent =
    `tUSD8 balance: ${formatUsd8(decodeUint(raw))} (account ${account})`;
}

async function refreshInvoices() {
  const list = $("invoiceList");
  if (!escrowReady()) {
    list.innerHTML = '<p class="muted">Set the contract address to list invoices.</p>';
    return;
  }
  setStatus("Reading invoices...");
  const countRaw = await readCall(escrowAddress, invoiceCountCalldata());
  const count = Number(decodeUint(countRaw));
  if (count === 0) {
    list.innerHTML = "<p>No invoices yet.</p>";
    setStatus("Idle.");
    return;
  }
  list.innerHTML = "";
  for (let id = count - 1; id >= 0; id--) {
    const raw = await readCall(escrowAddress, getInvoiceCalldata(id));
    list.appendChild(renderInvoice(id, decodeInvoice(raw)));
  }
  setStatus("Idle.");
}

function actionButtons(id, invoice) {
  const now = Math.floor(Date.now() / 1000);
  const buttons = [];
  const isClient = account && account.toLowerCase() === invoice.client.toLowerCase();
  const isFreelancer = account && account.toLowerCase() === invoice.freelancer.toLowerCase();
  const deadline = Number(invoice.deadline);

  const add = (label, fn) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await fn();
        await refreshInvoices();
        await refreshBalance();
      } catch (err) {
        setStatus(`Failed: ${err.message || err}`);
      }
      btn.disabled = false;
    });
    buttons.push(btn);
  };

  if (invoice.status === 0) { // Created
    if (isFreelancer && now <= deadline) {
      add("Mark delivered", () =>
        sendTx(escrowAddress, markDeliveredCalldata(id), "Delivery"));
    }
    if (isClient && now > deadline) {
      add("Refund after timeout", () =>
        sendTx(escrowAddress, refundAfterTimeoutCalldata(id), "Refund"));
    }
  }
  if (invoice.status === 1) { // Delivered
    if (isClient) {
      add("Approve and release payment", () =>
        sendTx(escrowAddress, approveAndReleaseCalldata(id), "Release"));
      if (now <= Number(invoice.deliveredAt) + DISPUTE_WINDOW_SECONDS) {
        add("Open dispute", () =>
          sendTx(escrowAddress, openDisputeCalldata(id), "Dispute"));
      }
    }
  }
  if (invoice.status === 4) { // Disputed
    if (isFreelancer && now <= deadline) {
      add("Mark delivered again", () =>
        sendTx(escrowAddress, markDeliveredCalldata(id), "Redelivery"));
    }
    if (isClient) {
      add("Approve and release payment", () =>
        sendTx(escrowAddress, approveAndReleaseCalldata(id), "Release"));
      if (now > Number(invoice.disputeOpenedAt) + DISPUTE_WINDOW_SECONDS) {
        add("Refund after dispute window", () =>
          sendTx(escrowAddress, refundAfterTimeoutCalldata(id), "Refund"));
      }
    }
  }
  return buttons;
}

function renderInvoice(id, invoice) {
  const card = document.createElement("div");
  card.className = "card";
  const date = (seconds) => seconds === 0n
    ? "not set"
    : new Date(Number(seconds) * 1000).toLocaleString();
  card.innerHTML = `
    <p><strong>Invoice ${id}</strong> &middot; ${STATUS_NAMES[invoice.status]}</p>
    <p>Amount: ${formatUsd8(invoice.amount)} tUSD8</p>
    <p class="mono">Client: ${invoice.client}</p>
    <p class="mono">Freelancer: ${invoice.freelancer}</p>
    <p>Deadline: ${date(invoice.deadline)}</p>
    <p>Delivered: ${date(invoice.deliveredAt)}</p>
  `;
  for (const btn of actionButtons(id, invoice)) card.appendChild(btn);
  return card;
}

async function createInvoice() {
  if (!escrowReady()) return;
  const freelancer = $("freelancerInput").value.trim();
  if (!isAddress(freelancer)) {
    setStatus("Enter a valid freelancer address.");
    return;
  }
  let amount;
  try {
    amount = parseUsd8($("amountInput").value);
  } catch (err) {
    setStatus(err.message);
    return;
  }
  const deadlineMs = Date.parse($("deadlineInput").value);
  if (Number.isNaN(deadlineMs)) {
    setStatus("Pick a deadline date and time.");
    return;
  }
  const deadline = BigInt(Math.floor(deadlineMs / 1000));
  if (deadline <= BigInt(Math.floor(Date.now() / 1000))) {
    setStatus("The deadline must be in the future.");
    return;
  }
  $("createBtn").disabled = true;
  try {
    const allowedRaw = await readCall(
      TUSD8_ADDRESS, allowanceCalldata(account, escrowAddress));
    if (decodeUint(allowedRaw) < amount) {
      await sendTx(TUSD8_ADDRESS, approveCalldata(escrowAddress, amount), "Approval");
    }
    const hash = await sendTx(
      escrowAddress, createInvoiceCalldata(freelancer, amount, deadline), "Invoice");
    setStatus(`Invoice created.\n${escrowLink(hash)}`);
    await refreshInvoices();
    await refreshBalance();
  } catch (err) {
    setStatus(`Failed: ${err.message || err}`);
  }
  $("createBtn").disabled = false;
}

async function addNetwork() {
  try {
    await rpc("wallet_switchEthereumChain", [{ chainId: CHAIN_ID_HEX }]);
  } catch (err) {
    if (err.code !== 4902) throw err;
    await rpc("wallet_addEthereumChain", [{
      chainId: CHAIN_ID_HEX,
      chainName: CHAIN_NAME,
      rpcUrls: [RPC_URL],
      blockExplorerUrls: [EXPLORER_URL],
      nativeCurrency: NATIVE_CURRENCY,
    }]);
  }
  setStatus("Network added. The wallet should now show QDay Aevum.");
}

async function connect() {
  if (!window.ethereum) {
    setStatus("No wallet found. Install a wallet with an injected provider and reload.");
    return;
  }
  const accounts = await rpc("eth_requestAccounts");
  account = accounts[0];
  $("accountLine").textContent = `Connected: ${account}`;
  $("refreshBtn").disabled = false;
  $("createBtn").disabled = false;
  $("networkBtn").disabled = false;
  const chainId = await rpc("eth_chainId");
  if (Number(chainId) !== CHAIN_ID) {
    setStatus(`Wrong network: the wallet is on chain ${Number(chainId)}, ` +
      `this page needs QDay Aevum (${CHAIN_ID}). Use the network button.`);
  } else {
    setStatus("Connected to QDay Aevum.");
  }
  await refreshBalance();
  await refreshInvoices();
}

$("connectBtn").addEventListener("click", () =>
  connect().catch((err) => setStatus(`Failed: ${err.message || err}`)));
$("networkBtn").addEventListener("click", () =>
  addNetwork().catch((err) => setStatus(`Failed: ${err.message || err}`)));
$("refreshBtn").addEventListener("click", () =>
  refreshInvoices().catch((err) => setStatus(`Failed: ${err.message || err}`)));
$("createBtn").addEventListener("click", () => createInvoice());
$("escrowInput").addEventListener("change", (event) => {
  escrowAddress = event.target.value.trim();
  if (isAddress(escrowAddress)) {
    setStatus("Contract address updated.");
    refreshInvoices().catch((err) => setStatus(`Failed: ${err.message || err}`));
  }
});

if (ESCROW_ADDRESS !== ZERO_ADDRESS) {
  $("escrowInput").value = ESCROW_ADDRESS;
}
if (!window.ethereum) {
  setStatus("No wallet detected. The page needs a browser wallet to send transactions.");
}
