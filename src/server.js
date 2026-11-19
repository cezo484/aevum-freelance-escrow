// Tiny static server for the escrow page. No dependencies, no build
// step. Serves the page from public/ and the shared modules from src/
// so the browser runs the same code the tests cover.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const ROUTES = {
  "/": { file: "public/index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "public/app.js", type: "text/javascript; charset=utf-8" },
  "/encode.js": { file: "src/encode.js", type: "text/javascript; charset=utf-8" },
  "/config.js": { file: "src/config.js", type: "text/javascript; charset=utf-8" },
};

export function createAppServer() {
  return createServer(async (req, res) => {
    const route = ROUTES[new URL(req.url, "http://localhost").pathname];
    if (!route) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found\n");
      return;
    }
    try {
      const body = await readFile(path.join(ROOT, route.file));
      res.writeHead(200, { "content-type": route.type });
      res.end(body);
    } catch {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("could not read file\n");
    }
  });
}

export function serve(port = 3000) {
  const server = createAppServer();
  return new Promise((resolve) => {
    server.listen(port, () => {
      const actual = server.address().port;
      console.log(`Escrow page running at http://localhost:${actual}`);
      console.log("Open it in a browser with a wallet, and connect to QDay Aevum.");
      resolve(server);
    });
  });
}
