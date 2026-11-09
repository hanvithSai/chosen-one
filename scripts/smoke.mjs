#!/usr/bin/env node
// Boots the compiled server with plain Node (as production does) and exercises key routes.
// Catches runtime module-resolution and startup problems that unit tests run under Vite cannot.
import { spawn } from "node:child_process";

const PORT = 3999;
const TOKEN = "smoke-test-token";
const base = `http://127.0.0.1:${PORT}`;

const server = spawn(process.execPath, ["dist/server/index.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    PUBLIC_BASE_URL: base,
    PGLITE_DATA_DIR: "memory://",
    DATABASE_URL: "",
    STORE_API_TOKEN: TOKEN,
    LOG_LEVEL: "warn",
  },
  stdio: ["ignore", "inherit", "inherit"],
});

const fail = (message) => {
  console.error(`Smoke test failed: ${message}`);
  server.kill();
  process.exit(1);
};

async function waitForHealth() {
  for (let i = 0; i < 60; i += 1) {
    if (server.exitCode !== null) fail(`server exited with code ${server.exitCode}`);
    try {
      const res = await fetch(`${base}/healthz`);
      if (res.ok) return res.json();
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail("server did not become healthy within 30s");
}

const health = await waitForHealth();
if (health?.db?.ok !== true) fail(`unhealthy: ${JSON.stringify(health)}`);

const res = await fetch(`${base}/merchant-cart`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    items: [{ item_id: "MB-MUG-MONSOON", quantity: 1 }],
    shipping_address: { postal_code: "78701", admin_area_1: "TX", country_code: "US" },
  }),
});
const cart = await res.json();
if (res.status !== 201 || cart.status !== "READY")
  fail(`cart create: ${res.status} ${JSON.stringify(cart)}`);

server.kill();
console.log(
  `Smoke test passed (db=${health.db.driver}, cart=${cart.id}, total=${cart.totals.total.value}).`,
);
