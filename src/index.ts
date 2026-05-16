#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { runFixWorkflow } from "./runner";

const filePath = process.argv[2];

const isDryRun = process.argv.includes("--dry-run");

if (!filePath || filePath === "--help") {
  console.log(`
fixmyfile 🚀

Usage:
  fixmyfile <file>

Example:
  fixmyfile error.ts
`);
  process.exit(1);
}

const fullPath = path.resolve(process.cwd(), filePath);

if (!fs.existsSync(fullPath)) {
  console.error("❌ File not found:", fullPath);
  process.exit(1);
}

console.log("🔍 Checking for TypeScript errors...\n");

if (isDryRun) {
  console.log("🧪 Running in DRY RUN mode (no files will be modified)\n");
}

let content = fs.readFileSync(fullPath, "utf-8");

runFixWorkflow(fullPath, content, isDryRun);

