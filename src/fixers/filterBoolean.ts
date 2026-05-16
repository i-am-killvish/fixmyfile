import ts from "typescript";
import fs from "fs";

export function fixFilterBooleanNarrowing(filePath: string): string {
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