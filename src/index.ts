#!/usr/bin/env node

import ts from "typescript";
import fs from "fs";
import path from "path";

const filePath = process.argv[2];

if (!filePath) {
  console.error("❌ Please provide a file path");
  process.exit(1);
}

const fullPath = path.resolve(process.cwd(), filePath);

if (!fs.existsSync(fullPath)) {
  console.error("❌ File not found:", fullPath);
  process.exit(1);
}

console.log("🔍 Checking for TypeScript errors...\n");

let content = fs.readFileSync(fullPath, "utf-8");

let maxIterations = 10;
let hasFixes = true;
let previousContent = "";

// 🧠 Fix registry (ONLY for line-based fixes)
const lineFixers: Record<number, Function> = {
  2322: fixTypeMismatch,
  2304: fixUndefined,
};

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

  if (has2554) {
    console.log("⚡ Running AST fix for TS2554...");

    const updatedContent = fixMissingArgsAST(fullPath);

    if (updatedContent !== content) {
      content = updatedContent;
      fs.writeFileSync(fullPath, content);
      hasFixes = true;
      usedASTFix = true;
    }
  }

  // 🔥 STEP 2: Line-based fixes (only if AST didn't run)
  if (!usedASTFix) {
    let lines = content.split("\n");

    diagnostics.forEach((diag) => {
      const code = diag.code;
      const file = diag.file;

      if (!file || !lineFixers[code]) return;

      const { line } = file.getLineAndCharacterOfPosition(diag.start || 0);

      console.log(`⚡ Fixing TS${code} at line ${line + 1}`);

      const updatedLine = lineFixers[code](lines[line]);

      if (updatedLine !== lines[line]) {
        lines[line] = updatedLine;
        hasFixes = true;
      }
    });

    if (hasFixes) {
      content = lines.join("\n");
      fs.writeFileSync(fullPath, content);
    }
  }
}

// Final write
fs.writeFileSync(fullPath, content);

if (maxIterations === 0) {
  console.log("⚠️ Stopped due to too many iterations");
} else {
  console.log("✅ File updated successfully");
}

//
// 🔧 FIX FUNCTIONS
//

// 🔥 AST FIX (TS2554)
function fixMissingArgsAST(filePath: string): string {
  const source = fs.readFileSync(filePath, "utf-8");

  const program = ts.createProgram([filePath], {
    noEmit: true,
    strict: true,
  });

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) return source;

  const checker = program.getTypeChecker();

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    return (rootNode) => {
      function visit(node: ts.Node): ts.Node {
        if (ts.isCallExpression(node) && node.arguments.length === 0) {
          const signature = checker.getResolvedSignature(node);

          if (signature) {
            const params = signature.getParameters();

            const args = params.map((param) => {
              const decl = param.valueDeclaration;
              if (!decl) return ts.factory.createIdentifier("undefined");

              const type = checker.getTypeOfSymbolAtLocation(param, decl);
              const typeStr = checker.typeToString(type);

              // 🎯 Smart value generation
              if (typeStr.includes("string")) {
                return ts.factory.createStringLiteral("text");
              }

              if (typeStr.includes("number")) {
                return ts.factory.createNumericLiteral(0);
              }

              if (typeStr.includes("boolean")) {
                return ts.factory.createTrue();
              }

              if (typeStr.includes("[]")) {
                return ts.factory.createArrayLiteralExpression([]);
              }

              // fallback
              return ts.factory.createIdentifier("undefined");
            });

            return ts.factory.updateCallExpression(
              node,
              node.expression,
              node.typeArguments,
              args
            );
          }
        }

        return ts.visitEachChild(node, visit, context);
      }

      return ts.visitNode(rootNode, visit) as ts.SourceFile;
    };
  };

  const result = ts.transform(sourceFile, [transformer]);

  const printer = ts.createPrinter();
  const newContent = printer.printFile(result.transformed[0]);

  result.dispose();

  return newContent;
}

// TS2322
function fixTypeMismatch(line: string): string {
  return line.replace(/"(\d+)"/, "$1");
}

// TS2304
function fixUndefined(line: string): string {
  return "// " + line;
}