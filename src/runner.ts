
import ts from "typescript";
import fs from "fs";
import { fixPossiblyUndefinedAccess } from "./fixers/ts18048";
import { fixFilterBooleanNarrowing } from "./fixers/filterBoolean";
import { fixMissingArgsAST } from "./fixers/ts2554";
import { lineFixers } from "./registry";

let maxIterations = 10;
let hasFixes = true;
let previousContent = "";

let totalFixes = 0;
let totalSkipped = 0;

export function runFixWorkflow( fullPath: string,
  content: string,
  isDryRun: boolean) {
while (hasFixes && maxIterations > 0) {
  hasFixes = false;
  maxIterations--;

  if (content === previousContent) {
    console.log("⚠️ No further progress possible");
    break;
  }

  previousContent = content;

  const program = ts.createProgram([fullPath], {
    noEmit: true,
    strict: true,
  });

  const diagnostics = ts.getPreEmitDiagnostics(program);

  if (diagnostics.length === 0) {
    console.log("✅ All errors fixed!");
    break;
  }

  console.log(`❌ Found ${diagnostics.length} errors\n`);

  let usedASTFix = false;

  // 🔥 STEP 1: Run AST fix ONCE per iteration if TS2554 exists
  const has2554 = diagnostics.some((d) => d.code === 2554);

  const has18048 = diagnostics.some((d) => d.code === 18048);

  const updatedFilterContent = fixFilterBooleanNarrowing(fullPath);

  if (updatedFilterContent !== content) {
    console.log("⚡ Fixing .filter(Boolean) narrowing...");

    content = updatedFilterContent;
    if (!isDryRun) {
      fs.writeFileSync(fullPath, content);
    }

    hasFixes = true;
    usedASTFix = true;
    totalFixes++;
  }

  if (has2554) {
    console.log(
      isDryRun
        ? "🧪 Would apply AST transformation for TS2554"
        : "✓ Applied AST transformation for TS2554"
    );

    const updatedContent = fixMissingArgsAST(fullPath);

    if (updatedContent !== content) {
      content = updatedContent;
      if (!isDryRun) {
        fs.writeFileSync(fullPath, content);
      }
      hasFixes = true;
      usedASTFix = true;
      totalFixes++;
    }
  }

  if (has18048) {
  console.log(
    isDryRun
      ? "🧪 Would apply optional chaining fix for TS18048"
      : "✓ Applied optional chaining fix for TS18048"
  );

  const updatedContent = fixPossiblyUndefinedAccess(fullPath);

  if (updatedContent !== content) {
    content = updatedContent;

    if (!isDryRun) {
      fs.writeFileSync(fullPath, content);
    }

    hasFixes = true;
    usedASTFix = true;
    totalFixes++;
  }
  }

  // 🔥 STEP 2: Line-based fixes (only if AST didn't run)
  if (!usedASTFix) {
    let lines = content.split("\n");

    diagnostics.forEach((diag) => {
      const code = diag.code;
      const file = diag.file;

      if (!file) return;

      if (!lineFixers[code]) {
        console.log(`⚠ No safe fix available for TS${code}`);
        totalSkipped++;
        return;
      }

      const { line } = file.getLineAndCharacterOfPosition(diag.start || 0);

      console.log(
        `${isDryRun ? "🧪 Would fix" : "✓ Fixed"} TS${code} at line ${line + 1}`
      );

      if (isDryRun) {
        totalFixes++;
      }

      const updatedLine = lineFixers[code](lines[line]);

      if (updatedLine !== lines[line]) {
        lines[line] = updatedLine;
        hasFixes = true;
        totalFixes++;
      }
    });

    if (hasFixes) {
      content = lines.join("\n");
      if (!isDryRun) {
      fs.writeFileSync(fullPath, content);
    }
    }
  }

  
}

// Final write
if (!isDryRun) {
      fs.writeFileSync(fullPath, content);
    }

console.log("\n📊 Summary");
console.log(`✓ Fixes applied: ${totalFixes}`);
console.log(`⚠ Skipped diagnostics: ${totalSkipped}`);


if (maxIterations === 0) {
  console.log("⚠️ Stopped due to too many iterations");
} else {
  console.log(
    isDryRun
      ? "🧪 Dry run complete (no changes written)"
      : "✅ File updated successfully"
  );
}

return content;

}