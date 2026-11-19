# Freelance Escrow on QDay Aevum

A client locks payment in tUSD8, the freelancer delivers the work, the
client approves, and the payment releases. If the deadline passes with
no delivery, the client gets the funds back. Built for the Aevum
Builder Challenge #1 on DoraHacks, track: Invoice Payments.

## How it works

1. The client creates an invoice: freelancer address, amount in tUSD8,
   deadline. The amount moves from the client into the escrow contract.
   Creating an invoice sends two transactions: an approval for the
   contract to move the client's tUSD8, then the invoice itself.
2. The freelancer delivers the work and marks the invoice delivered.
   Delivery must happen on or before the deadline.
3. The client approves, and the contract pays the freelancer.
4. If the deadline passes with no delivery, the client calls the refund
   and the funds come back.

Disputes: after delivery, the client has 3 days to open a dispute.
While an invoice is disputed, the funds stay locked. The freelancer can
deliver again after rework, the client can still approve, and if the
dispute window passes with no resolution, the client can claim a refund.
There is no third party arbiter; the contract enforces the deadlines and
the client makes the final call.

## Network

QDay Aevum testnet, verified against the QDay wiki and the live RPC.

| Setting | Value |
| --- | --- |
| Chain ID | 44005 (0xABE5) |
| RPC URL | https://rpc-test.qday.info |
| Explorer | https://explorer-test.qday.info |
| Gas token | tQDAY |
| Stablecoin | tUSD8, 0x456569838f1d43009A91ebA4263147Afd7233483, 6 decimals |
| Faucet | https://faucet.qday.info (5 tQDAY per address per 24h) |
| Escrow contract | _set after deploy, see below_ |

## Quick start

Node 18 or newer, and Foundry 1.9.0. No npm packages, no git
submodules, no build step.

    npm test          # Node test suite (encoder, config, server)
    forge test        # contract tests, 19 cases
    npm run demo      # offline walkthrough of the full flow
    npm run serve     # page on http://localhost:3000

## Deploy to the testnet

1. Make a fresh testnet-only key. Never reuse a key that holds real funds.

       cast wallet new

   Save the private key in `.env` (the repo ships `.env.example` as a
   template) and lock the file down:

       chmod 600 .env

2. Fund the new address with gas from the faucet at
   https://faucet.qday.info. One claim gives 5 tQDAY, once per 24 hours.
   Two things to know: the faucet runs a bot check, and the recipient
   must hold a small balance on Ethereum mainnet (about 0.0001 ETH, or
   1 USDT, or 1 USDC) to prove the address is a real wallet. After the
   first claim, later claims can also go through the faucet widget in
   the QDay wiki, which calls the faucet contract directly.

3. Get test tUSD8. The token has no public mint (its mint function is
   restricted to designated minters), so test tUSD8 comes through the
   challenge starter kit in the QDay Discord: https://discord.gg/bYPhjmrSfK

4. Deploy the contract:

       set -a; source .env; set +a
       forge script script/Deploy.s.sol --rpc-url https://rpc-test.qday.info --broadcast

   Write down the deployed address from the output.

5. Verify the source on the explorer so anyone can read it:

       forge verify-contract <address> src/FreelanceEscrow.sol:FreelanceEscrow \
         --chain-id 44005 --rpc-url https://rpc-test.qday.info \
         --verifier blockscout --verifier-url https://explorer-test.qday.info/api

6. Put the deployed address in `src/config.js` (`ESCROW_ADDRESS`), then
   restart the server. The page also accepts a pasted address, so this
   step is only needed to make the default work.

7. Walk the flow in the browser: open http://localhost:3000, connect a
   wallet, add the QDay Aevum network when asked, create an invoice,
   deliver it from the freelancer account, and approve it from the
   client account. Each step links to its transaction on the explorer.

## Files

    src/FreelanceEscrow.sol   The escrow contract
    test/FreelanceEscrow.t.sol  Contract tests, with a mintable tUSD8 stand-in
    script/Deploy.s.sol       Deployment script
    src/config.js             Chain settings, token address, function selectors
    src/encode.js             Hand rolled ABI encoding and decoding
    src/server.js             Static server for the page, no dependencies
    src/cli.js                demo and serve commands
    src/demo.js               Offline walkthrough of the flow
    public/index.html         The page
    public/app.js             Wallet logic, plain EIP-1193 calls
    test/encode.test.js       Encoder tests against cast output
    test/config.test.js       Chain and token settings
    test/server.test.js       Server routes

## How the page talks to the chain

The page uses only `window.ethereum` calls: `eth_requestAccounts`,
`eth_call`, `eth_sendTransaction`, `eth_getTransactionReceipt`, plus the
network switch calls. It loads no web3 library. Transaction data is
built by hand in `src/encode.js` from the four byte function selectors
in `src/config.js` (computed with `cast sig`), and call results are
decoded the same way. The encoder tests check every call against output
from `cast calldata`, so the hand built bytes match a reference
implementation.

## Contract notes

- State changes happen before token transfers in every function, and a
  reentrancy guard covers the functions that move funds.
- Errors are custom errors (`WrongStatus`, `TooEarly`, `NotClient`,
  and the rest), so failed calls revert with a clear reason.
- The contract has no owner and no upgrade path. Once deployed, the
  rules in the code are the rules.
- `DISPUTE_WINDOW` is 3 days, a compile time constant.

## Known limits

- Disputes resolve by the client's choice after the window, not by an
  arbiter. An arbiter role is the natural next step.
- Creating an invoice takes two transactions (approve, then create).
  The tUSD8 token supports permit, so a single signature flow is
  possible later.
- The page lists invoices by reading them one by one from id 0. That is
  fine for a demo; a production list would index events.

## Submission checklist

- Public GitHub repo with this code.
- Deployed contract address on Aevum testnet, verified on the explorer.
- Demo video walking the full flow on testnet.
- Submission on the DoraHacks page before 11 Dec 2026, 11:00 TRT.
- Top 5 projects present live on 15 Dec, 09:00 TRT, 3 to 5 minutes.
