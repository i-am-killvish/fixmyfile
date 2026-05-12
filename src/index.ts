#!/usr/bin/env node

import ts from "typescript";
import fs from "fs";
import path from "path";

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

let maxIterations = 10;
let hasFixes = true;
let previousContent = "";

let totalFixes = 0;
let totalSkipped = 0;

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

function fixFilterBooleanNarrowing(filePath: string): string {
  const source = fs.readFileSync(filePath, "utf-8");

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    return (rootNode) => {
      function visit(node: ts.Node): ts.Node {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "filter" &&
          node.arguments.length === 1 &&
          ts.isIdentifier(node.arguments[0]) &&
          node.arguments[0].text === "Boolean"
        ) {
          const paramName = ts.factory.createIdentifier("x");

          const predicate = ts.factory.createArrowFunction(
            undefined,
            undefined,
            [
              ts.factory.createParameterDeclaration(
                undefined,
                undefined,
                paramName
              ),
            ],
            ts.factory.createTypePredicateNode(
              undefined,
              "x",
              ts.factory.createTypeReferenceNode("NonNullable", [
                ts.factory.createTypeQueryNode(paramName),
              ])
            ),
            ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            ts.factory.createCallExpression(
              ts.factory.createIdentifier("Boolean"),
              undefined,
              [paramName]
            )
          );

          return ts.factory.updateCallExpression(
            node,
            node.expression,
            node.typeArguments,
            [predicate]
          );
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

function fixPossiblyUndefinedAccess(filePath: string): string {
  const source = fs.readFileSync(filePath, "utf-8");

  const program = ts.createProgram([filePath], {
    noEmit: true,
    strict: true,
  });

  const sourceFile = program.getSourceFile(filePath);

  if (!sourceFile) return source;

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.code === 18048);

  const positions = new Set<number>();

  diagnostics.forEach((d) => {
    if (typeof d.start === "number") {
      positions.add(d.start);
    }
  });

  const transformer: ts.TransformerFactory<ts.SourceFile> =
    (context) => {
      return (rootNode) => {
        function visit(node: ts.Node): ts.Node {
          // Property access: user.name
          if (ts.isPropertyAccessExpression(node)) {
            const start = node.getStart();

            if (positions.has(start)) {
              // skip already optional
              if (node.questionDotToken) {
                return node;
              }

              // skip assignments
              if (
                ts.isBinaryExpression(node.parent) &&
                node.parent.left === node
              ) {
                return node;
              }

              // skip non-null assertions
              if (ts.isNonNullExpression(node.expression)) {
                return node;
              }

              return ts.factory.createPropertyAccessChain(
                node.expression,
                ts.factory.createToken(
                  ts.SyntaxKind.QuestionDotToken
                ),
                node.name
              );
            }
          }

          // Element access: user["name"]
          if (ts.isElementAccessExpression(node)) {
            const start = node.getStart();

            if (positions.has(start)) {
              if (node.questionDotToken) {
                return node;
              }

              if (
                ts.isBinaryExpression(node.parent) &&
                node.parent.left === node
              ) {
                return node;
              }

              if (ts.isNonNullExpression(node.expression)) {
                return node;
              }

              return ts.factory.createElementAccessChain(
                node.expression,
                ts.factory.createToken(
                  ts.SyntaxKind.QuestionDotToken
                ),
                node.argumentExpression
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