import * as vscode from "vscode";

import { MappingIndex } from "./mappingIndex";
import { findSymbolAtPosition } from "./symbolResolver";

const activeLookups = new Set<string>();

function lookupKey(uri: string, line: number, character: number): string {
  return `${uri}|${line}|${character}`;
}

export class XOverReferenceProvider implements vscode.ReferenceProvider {
  constructor(private readonly index: MappingIndex) {}

  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): Promise<vscode.Location[]> {
    const key = lookupKey(
      document.uri.toString(),
      position.line,
      position.character
    );
    if (activeLookups.has(key)) {
      return [];
    }
    activeLookups.add(key);
    try {
      await this.index.ensureLoaded();
      if (token.isCancellationRequested) return [];

      const fileConfig = this.index.getConfigForFile(document.uri);
      if (!fileConfig) return [];

      const symbolMap = this.index.getSymbolMap(document.uri);
      if (!symbolMap) return [];

      const atPos = findSymbolAtPosition(symbolMap, position);
      if (!atPos) return [];

      const counterparts = this.index.getCounterparts(
        fileConfig.configUri,
        fileConfig.component,
        atPos.symbolPath
      );
      if (counterparts.length === 0) return [];

      const allRefs: vscode.Location[] = [];
      const refContext: vscode.ReferenceContext = {
        includeDeclaration: context.includeDeclaration,
      };
      for (const loc of counterparts) {
        if (token.isCancellationRequested) break;
        const refs = await vscode.commands.executeCommand<vscode.Location[]>(
          "vscode.executeReferenceProvider",
          loc.uri,
          loc.range.start,
          refContext
        );
        if (Array.isArray(refs)) {
          allRefs.push(...refs);
        }
      }

      const seen = new Set<string>();
      return allRefs.filter((r) => {
        const k = `${r.uri.toString()}|${r.range.start.line}|${r.range.start.character}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    } finally {
      activeLookups.delete(key);
    }
  }
}
