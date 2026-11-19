// Command line entry point.
//
//   node src/cli.js demo            Walk through the escrow flow offline
//   node src/cli.js serve           Start the page on http://localhost:3000
//   node src/cli.js serve --port N  Start the page on another port

import { runDemo } from "./demo.js";
import { serve } from "./server.js";

const [command, ...rest] = process.argv.slice(2);

if (command === "demo") {
  console.log(runDemo());
} else if (command === "serve") {
  let port = 3000;
  const flag = rest.indexOf("--port");
  if (flag !== -1 && rest[flag + 1]) {
    port = Number(rest[flag + 1]);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      console.error("port must be a number between 1 and 65535");
      process.exit(1);
    }
  }
  await serve(port);
} else {
  console.log("Usage: node src/cli.js <demo|serve> [--port N]");
  process.exit(command === undefined ? 0 : 1);
}
