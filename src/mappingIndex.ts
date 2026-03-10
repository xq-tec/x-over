import * as vscode from "vscode";

import {
  findConfigFiles,
  getChildren,
  getComponentRefs,
  parseConfig,
  ParsedConfig,
} from "./configLoader";
import {
  getNestedConfigDirs,
  isFileUnderConfigDir,
  isFileUnderNestedConfig,
} from "./configScope";
import {
  extractChildrenFromType,
  resolveSymbolsInFile,
  SymbolMap,
} from "./symbolResolver";

function key(configUri: string, component: string, symbolPath: string): string {
  return `${configUri}|${component}|${symbolPath}`;
}

export class MappingIndex implements vscode.Disposable {
  private counterpartMap = new Map<string, vscode.Location[]>();
  private fileToConfig = new Map<string, { configUri: vscode.Uri; component: string }>();
  private symbolCache = new Map<string, SymbolMap>();
  private relevantFiles = new Set<string>();
  private configs: ParsedConfig[] = [];
  private invalidated = true;
  private rebuildPromise: Promise<void> | null = null;
  private retryDisposable: vscode.Disposable | null = null;

  private throwIfCancelled(token?: vscode.CancellationToken): void {
    if (token?.isCancellationRequested) {
      this.invalidate();
      throw new Error("cancelled");
    }
  }

  async rebuild(token?: vscode.CancellationToken): Promise<void> {
    this.throwIfCancelled(token);
    this.invalidated = false;
    let hadEmptySymbols = false;
    this.counterpartMap.clear();
    this.fileToConfig.clear();
    this.symbolCache.clear();
    this.relevantFiles.clear();
    this.configs = [];

    const configUris = await findConfigFiles();
    this.throwIfCancelled(token);
    for (const configUri of configUris) {
      this.throwIfCancelled(token);
      let content: string;
      try {
        const doc = await vscode.workspace.openTextDocument(configUri);
        content = doc.getText();
      } catch {
        continue;
      }

      const parsed = parseConfig(configUri, content);
      if (!parsed) continue;

      this.configs.push(parsed);
      this.relevantFiles.add(configUri.toString());
      const configDir = vscode.Uri.joinPath(configUri, "..");
      const configUriStr = configUri.toString();
      const nestedConfigDirs = getNestedConfigDirs(
        configDir,
        configUris,
        configUri
      );

      for (const entry of parsed.config.mappings) {
        const componentRefs = getComponentRefs(entry);
        if (componentRefs.size === 0) continue;

        const children = getChildren(entry);
        const locationsByComponent = new Map<string, vscode.Location>();

        for (const [componentKey, ref] of componentRefs) {
          const fileUri = vscode.Uri.joinPath(configDir, ref.file);

          if (!isFileUnderConfigDir(fileUri, configDir)) {
            // TODO show warning
            continue;
          }
          if (isFileUnderNestedConfig(fileUri, nestedConfigDirs)) {
            // TODO show warning
            continue;
          }

          const fileStr = fileUri.toString();
          this.relevantFiles.add(fileStr);
          this.fileToConfig.set(fileStr, {
            configUri,
            component: componentKey,
          });

          let symbolMap = this.symbolCache.get(fileStr);
          if (symbolMap === undefined) {
            this.throwIfCancelled(token);
            symbolMap = await resolveSymbolsInFile(fileUri);
            if (symbolMap.size === 0) hadEmptySymbols = true;
            this.symbolCache.set(fileStr, symbolMap);
          }

          const typeSymbolPath = ref.symbol;
          const typeRange = symbolMap.get(typeSymbolPath);
          if (typeRange) {
            locationsByComponent.set(
              componentKey,
              new vscode.Location(fileUri, typeRange.selectionRange)
            );
          }

          let extracted: Map<string, vscode.Range> | undefined;
          let doc: vscode.TextDocument | undefined;

          for (const child of children) {
            const fieldName = child[componentKey];
            if (typeof fieldName !== "string") continue;

            const fieldSymbolPath = `${typeSymbolPath}.${fieldName}`;
            let fieldRange = symbolMap.get(fieldSymbolPath);

            if (!fieldRange && typeRange) {
              if (!doc) {
                doc = await vscode.workspace.openTextDocument(fileUri);
              }
              const useParserFallback =
                doc.languageId === "typescript" ||
                doc.languageId === "javascript";
              if (useParserFallback) {
                if (!extracted) {
                  extracted = extractChildrenFromType(
                    doc,
                    typeRange.range,
                    ref.discriminant
                  );
                }
                const propRange = extracted.get(fieldName);
                if (propRange) {
                  fieldRange = {
                    range: propRange,
                    selectionRange: propRange,
                  };
                  symbolMap.set(fieldSymbolPath, fieldRange);
                }
              }
            }

            if (fieldRange) {
              const childKey = `${componentKey}:${fieldSymbolPath}`;
              locationsByComponent.set(
                childKey,
                new vscode.Location(fileUri, fieldRange.selectionRange)
              );
            }
          }
        }

        const groups: { component: string; symbolPath: string; location: vscode.Location }[][] = [];

        const typeGroup: { component: string; symbolPath: string; location: vscode.Location }[] = [];
        for (const [componentKey, ref] of componentRefs) {
          const typeSymbolPath = ref.symbol;
          const loc = locationsByComponent.get(componentKey);
          if (loc) {
            typeGroup.push({ component: componentKey, symbolPath: typeSymbolPath, location: loc });
          }
        }
        if (typeGroup.length > 0) groups.push(typeGroup);

        for (const child of children) {
          const childGroup: { component: string; symbolPath: string; location: vscode.Location }[] = [];
          for (const [componentKey, ref] of componentRefs) {
            const fieldName = child[componentKey];
            if (typeof fieldName !== "string") continue;
            const typeSymbolPath = ref.symbol;
            const fieldSymbolPath = `${typeSymbolPath}.${fieldName}`;
            const childKey = `${componentKey}:${fieldSymbolPath}`;
            const childLoc = locationsByComponent.get(childKey);
            if (childLoc) {
              childGroup.push({
                component: componentKey,
                symbolPath: fieldSymbolPath,
                location: childLoc,
              });
            }
          }
          if (childGroup.length > 0) groups.push(childGroup);
        }

        for (const group of groups) {
          for (const tuple of group) {
            const counterparts = group
              .filter((t) => t.component !== tuple.component || t.symbolPath !== tuple.symbolPath)
              .map((t) => t.location);
            if (counterparts.length > 0) {
              const k = key(configUriStr, tuple.component, tuple.symbolPath);
              this.counterpartMap.set(k, counterparts);
            }
          }
        }
      }
    }

    const incomplete =
      hadEmptySymbols &&
      this.counterpartMap.size === 0 &&
      this.fileToConfig.size >= 2;
    if (incomplete) {
      this.invalidate();
      this.retryDisposable?.dispose();
      this.retryDisposable = vscode.languages.onDidChangeDiagnostics(() => {
        this.retryDisposable?.dispose();
        this.retryDisposable = null;
        this.invalidate();
      });
    }
  }

  invalidate(): void {
    this.invalidated = true;
  }

  invalidateIfRelevant(uri: vscode.Uri): void {
    if (this.relevantFiles.has(uri.toString())) {
      this.invalidate();
    }
  }

  getConfigForFile(fileUri: vscode.Uri): {
    configUri: vscode.Uri;
    component: string;
  } | undefined {
    return this.fileToConfig.get(fileUri.toString());
  }

  getSymbolMap(uri: vscode.Uri): SymbolMap | undefined {
    return this.symbolCache.get(uri.toString());
  }

  getCounterparts(
    configUri: vscode.Uri,
    component: string,
    symbolPath: string
  ): vscode.Location[] {
    const k = key(configUri.toString(), component, symbolPath);
    return this.counterpartMap.get(k) ?? [];
  }

  dispose(): void {
    this.retryDisposable?.dispose();
    this.retryDisposable = null;
  }

  async ensureLoaded(token?: vscode.CancellationToken): Promise<void> {
    while (this.invalidated) {
      if (this.rebuildPromise) {
        const waitPromise = this.rebuildPromise;
        if (token) {
          await Promise.race([
            waitPromise,
            new Promise<never>((_, reject) => {
              if (token.isCancellationRequested) reject(new Error("cancelled"));
              token.onCancellationRequested(() =>
                reject(new Error("cancelled"))
              );
            }),
          ]);
        } else {
          await waitPromise;
        }
        this.rebuildPromise = null;
        continue;
      }
      this.rebuildPromise = this.rebuild(token);
      try {
        await this.rebuildPromise;
      } finally {
        this.rebuildPromise = null;
      }
    }
  }
}
