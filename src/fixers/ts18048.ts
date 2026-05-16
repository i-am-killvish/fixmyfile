import ts from "typescript";
import fs from "fs";


export function fixPossiblyUndefinedAccess(filePath: string): string {
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