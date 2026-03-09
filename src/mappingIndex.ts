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
import { resolveSymbolsInFile, SymbolMap } from "./symbolResolver";

function key(configUri: string, component: string, symbolPath: string): string {
  return `${configUri}|${component}|${symbolPath}`;
}

export class MappingIndex {
  private counterpartMap = new Map<string, vscode.Location[]>();
  private fileToConfig = new Map<string, { configUri: vscode.Uri; component: string }>();
  private symbolCache = new Map<string, SymbolMap>();
  private configs: ParsedConfig[] = [];
  private invalidated = true;
  private rebuildPromise: Promise<void> | null = null;

  async rebuild(): Promise<void> {
    this.invalidated = false;
    this.counterpartMap.clear();
    this.fileToConfig.clear();
    this.symbolCache.clear();
    this.configs = [];

    const configUris = await findConfigFiles();
    for (const configUri of configUris) {
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
          this.fileToConfig.set(fileStr, {
            configUri,
            component: componentKey,
          });

          const symbolMap = await resolveSymbolsInFile(fileUri);
          this.symbolCache.set(fileUri.toString(), symbolMap);

          const typeSymbolPath = ref.symbol;
          const typeRange = symbolMap.get(typeSymbolPath);
          if (typeRange) {
            locationsByComponent.set(
              componentKey,
              new vscode.Location(fileUri, typeRange.selectionRange)
            );
          }

          for (const child of children) {
            const fieldName = child[componentKey];
            if (typeof fieldName !== "string") continue;

            const fieldSymbolPath = `${typeSymbolPath}.${fieldName}`;
            const fieldRange = symbolMap.get(fieldSymbolPath);
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
  }

  invalidate(): void {
    this.invalidated = true;
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

  async ensureLoaded(): Promise<void> {
    while (this.invalidated) {
      if (this.rebuildPromise) {
        await this.rebuildPromise;
        this.rebuildPromise = null;
        continue;
      }
      this.rebuildPromise = this.rebuild();
      try {
        await this.rebuildPromise;
      } finally {
        this.rebuildPromise = null;
      }
    }
  }
}
