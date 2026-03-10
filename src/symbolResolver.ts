import * as ts from "typescript";
import * as vscode from "vscode";

export interface SymbolRange {
  range: vscode.Range;
  selectionRange: vscode.Range;
}

export type SymbolMap = Map<string, SymbolRange>;

function collectFromDocumentSymbol(
  symbol: vscode.DocumentSymbol,
  parentPath: string,
  acc: SymbolMap
): void {
  const path = parentPath ? `${parentPath}.${symbol.name}` : symbol.name;
  acc.set(path, {
    range: symbol.range,
    selectionRange: symbol.selectionRange,
  });
  for (const child of symbol.children) {
    collectFromDocumentSymbol(child, path, acc);
  }
}

function collectFromSymbolInformation(
  symbol: vscode.SymbolInformation,
  acc: SymbolMap
): void {
  const path = symbol.containerName
    ? `${symbol.containerName}.${symbol.name}`
    : symbol.name;
  acc.set(path, {
    range: symbol.location.range,
    selectionRange: symbol.location.range,
  });
}

export async function resolveSymbolsInFile(
  uri: vscode.Uri
): Promise<SymbolMap> {
  await vscode.workspace.openTextDocument(uri);
  const symbols = await vscode.commands.executeCommand<
    vscode.DocumentSymbol[] | vscode.SymbolInformation[] | undefined
  >("vscode.executeDocumentSymbolProvider", uri);

  const acc: SymbolMap = new Map();

  if (!symbols) return acc;

  if (symbols.length > 0) {
    const first = symbols[0];
    if ("children" in first) {
      for (const sym of symbols as vscode.DocumentSymbol[]) {
        collectFromDocumentSymbol(sym, "", acc);
      }
    } else {
      for (const sym of symbols as vscode.SymbolInformation[]) {
        collectFromSymbolInformation(sym, acc);
      }
    }
  }

  return acc;
}

/**
 * Parse a TypeScript type fragment and extract child names/ranges.
 * Callers must only invoke when doc.languageId is "typescript" or "javascript".
 * - TypeLiteral: returns Map<propertyName, Range> for each property
 * - UnionType (when discriminant is set): returns Map<literalValue, Range> for each member's discriminant string literal
 */
export function extractChildrenFromType(
  doc: vscode.TextDocument,
  typeRange: vscode.Range,
  discriminant?: string
): Map<string, vscode.Range> {
  const result = new Map<string, vscode.Range>();
  const fragment = doc.getText(typeRange);
  const startOffset = doc.offsetAt(typeRange.start);

  const sf = ts.createSourceFile(
    "fragment.ts",
    fragment,
    ts.ScriptTarget.Latest,
    true
  );

  function toDocRange(node: ts.Node): vscode.Range {
    const start = startOffset + node.getStart(sf);
    const end = startOffset + node.getEnd();
    return new vscode.Range(doc.positionAt(start), doc.positionAt(end));
  }

  let typeNode: ts.TypeNode | undefined;
  for (const stmt of sf.statements) {
    if (ts.isTypeAliasDeclaration(stmt)) {
      typeNode = stmt.type;
      break;
    }
  }
  if (!typeNode) return result;

  if (ts.isTypeLiteralNode(typeNode)) {
    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const name =
          ts.isIdentifier(member.name)
            ? member.name.text
            : member.name.getText(sf);
        result.set(name, toDocRange(member.name));
      }
    }
    return result;
  }

  if (ts.isUnionTypeNode(typeNode) && discriminant) {
    for (const memberType of typeNode.types) {
      if (!ts.isTypeLiteralNode(memberType)) continue;
      let discriminantValue: string | undefined;
      for (const member of memberType.members) {
        if (!ts.isPropertySignature(member) || !member.name) continue;
        const propName =
          ts.isIdentifier(member.name)
            ? member.name.text
            : member.name.getText(sf);
        if (propName === discriminant) {
          if (!member.type || !ts.isLiteralTypeNode(member.type)) continue;
          const literal = member.type.literal;
          if (!ts.isStringLiteral(literal)) continue;
          discriminantValue = literal.text;
          result.set(literal.text, toDocRange(literal));
          break;
        }
      }
      if (discriminantValue) {
        for (const member of memberType.members) {
          if (!ts.isPropertySignature(member) || !member.name) continue;
          const propName =
            ts.isIdentifier(member.name)
              ? member.name.text
              : member.name.getText(sf);
          if (propName !== discriminant) {
            result.set(
              `${discriminantValue}.${propName}`,
              toDocRange(member.name)
            );
          }
        }
      }
    }
    return result;
  }

  return result;
}

export function findSymbolAtPosition(
  symbolMap: SymbolMap,
  position: vscode.Position
): { symbolPath: string; range: SymbolRange } | undefined {
  let best: { symbolPath: string; range: SymbolRange } | undefined;
  for (const [path, range] of symbolMap) {
    if (!range.selectionRange.contains(position)) {
      continue;
    }
    if (
      best === undefined ||
      best.range.selectionRange.contains(range.selectionRange)
    ) {
      best = { symbolPath: path, range };
    }
  }
  return best;
}
