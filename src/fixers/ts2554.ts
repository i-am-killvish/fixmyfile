import ts from "typescript";
import fs from "fs";

export function fixMissingArgsAST(filePath: string): string {
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
        if (ts.isCallExpression(node) ) {
          const signature = checker.getResolvedSignature(node);

          if (signature) {
            const params = signature.getParameters();
            const requiredParams = params.filter((param) => {
            const decl = param.valueDeclaration;

            return (
              decl &&
              ts.isParameter(decl) &&
              !decl.questionToken &&
              !decl.initializer
            );
          });
                  
          const existingArgs = [...node.arguments];

          const missingCount = requiredParams.length - existingArgs.length;

          if (missingCount <= 0) {
            return ts.visitEachChild(node, visit, context);
          }

          const missingArgs = Array.from(
            { length: missingCount },
            () => ts.factory.createAsExpression(
              ts.factory.createIdentifier("undefined"),
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
            )
          );

          const args = [...existingArgs, ...missingArgs];
           
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