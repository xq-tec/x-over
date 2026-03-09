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
