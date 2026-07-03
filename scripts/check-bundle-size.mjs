#!/usr/bin/env node
// Bundle budget gate — fails CI on chunks exceeding per-chunk or global limits.
// Budgets reflect intentional large chunks; update here when a chunk is optimised.
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const GLOBAL_BUDGET_KB = 500;
const DIST = 'dist/assets';

// Named chunk overrides (prefix match). Chunks not listed get the global cap.
const NAMED_BUDGETS = {
  'pdf.worker':      600,
  'parserWorker':    600,
  'vendor-firebase': 600,
  'vendor-charts':   500,
  'index':           500,
};

let files;
try {
  files = readdirSync(DIST).filter(f => f.endsWith('.js'));
} catch {
  console.error(`Bundle budget: dist/assets not found — run "npm run build" first.`);
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const sizeKB = Math.round(statSync(join(DIST, file)).size / 1024);
  const key = Object.keys(NAMED_BUDGETS).find(k => file.startsWith(k));
  const budget = key ? NAMED_BUDGETS[key] : GLOBAL_BUDGET_KB;

  if (sizeKB > budget) {
    console.error(`BUDGET EXCEEDED: ${file} — ${sizeKB} KB (budget: ${budget} KB)`);
    failed = true;
  } else {
    console.log(`OK: ${file} — ${sizeKB} KB / ${budget} KB`);
  }
}

if (failed) process.exit(1);
console.log('Bundle budget check passed.');
