import * as vscode from "vscode";

export interface ComponentRef {
  file: string;
  symbol: string;
}

export interface ChildMapping {
  [componentKey: string]: string;
}

export interface MappingEntry {
  [key: string]: ComponentRef | ChildMapping[] | string | undefined;
}

export interface CrossReferenceConfig {
  mappings: MappingEntry[];
}

export function getComponentRefs(entry: MappingEntry): Map<string, ComponentRef> {
  const refs = new Map<string, ComponentRef>();
  for (const [key, value] of Object.entries(entry)) {
    if (key === "children" || !isComponentKey(key)) continue;
    if (isComponentRef(value)) {
      refs.set(key, value);
    }
  }
  return refs;
}

export function getChildren(entry: MappingEntry): ChildMapping[] {
  const children = entry.children;
  if (!Array.isArray(children)) return [];
  return children.filter(
    (c): c is ChildMapping =>
      typeof c === "object" && c !== null && !Array.isArray(c)
  );
}

export interface ParsedConfig {
  configUri: vscode.Uri;
  config: CrossReferenceConfig;
}

function isComponentRef(value: unknown): value is ComponentRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "file" in value &&
    "symbol" in value &&
    typeof (value as ComponentRef).file === "string" &&
    typeof (value as ComponentRef).symbol === "string"
  );
}

function isComponentKey(key: string): boolean {
  return key.startsWith("@");
}

export async function findConfigFiles(): Promise<vscode.Uri[]> {
  const files = await vscode.workspace.findFiles("**/cross-reference.json");
  return files;
}

export function parseConfig(
  configUri: vscode.Uri,
  content: string
): ParsedConfig | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }

  if (typeof raw !== "object" || raw === null || !("mappings" in raw)) {
    return null;
  }

  const mappings = (raw as { mappings?: unknown }).mappings;
  if (!Array.isArray(mappings)) {
    return null;
  }

  const config: CrossReferenceConfig = { mappings: [] };
  const configDir = vscode.Uri.joinPath(configUri, "..");

  for (const entry of mappings) {
    if (typeof entry !== "object" || entry === null) continue;

    const normalized: MappingEntry = {};
    for (const [key, value] of Object.entries(entry)) {
      if (key === "children") {
        if (Array.isArray(value)) {
          normalized.children = value as ChildMapping[];
        }
        continue;
      }
      if (!isComponentKey(key)) continue;

      if (isComponentRef(value)) {
        normalized[key] = value;
      } else if (typeof value === "string") {
        normalized[key] = value;
      }
    }
    if (Object.keys(normalized).length > 0) {
      config.mappings.push(normalized);
    }
  }

  return { configUri, config };
}
