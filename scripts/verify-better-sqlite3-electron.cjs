/**
 * Load better-sqlite3 under Electron's Node ABI (MODULE_VERSION).
 * Usage: cross-env ELECTRON_RUN_AS_NODE=1 electron ./scripts/verify-better-sqlite3-electron.cjs
 */
const Database = require("better-sqlite3");

const db = new Database(":memory:");
const row = db.prepare("SELECT 1 AS ok").get();
db.close();

if (!row || row.ok !== 1) {
  console.error("better-sqlite3 probe failed:", row);
  process.exit(1);
}

console.log("better-sqlite3 loads under Electron ABI");
