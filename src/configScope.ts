import * as path from "path";
import * as vscode from "vscode";

/**
 * Returns true iff the resolved file is under the config directory (no `..` escape).
 * A config at a/b/cross-reference.json may only refer to files in a/b or its subdirectories.
 */
export function isFileUnderConfigDir(
  fileUri: vscode.Uri,
  configDir: vscode.Uri
): boolean {
  const relative = path.relative(configDir.fsPath, fileUri.fsPath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Returns config directories (from other configs) that are proper subdirectories of configDir.
 * These directories "take over" responsibility; the current config must not refer to files under them.
 */
export function getNestedConfigDirs(
  configDir: vscode.Uri,
  allConfigUris: vscode.Uri[],
  currentConfigUri: vscode.Uri
): vscode.Uri[] {
  const nested: vscode.Uri[] = [];
  const configDirPath = configDir.fsPath;

  for (const configUri of allConfigUris) {
    if (configUri.toString() === currentConfigUri.toString()) continue;

    const otherConfigDir = vscode.Uri.joinPath(configUri, "..");
    const relative = path.relative(configDirPath, otherConfigDir.fsPath);

    if (!relative.startsWith("..") && !path.isAbsolute(relative) && relative !== "") {
      nested.push(otherConfigDir);
    }
  }

  return nested;
}

/**
 * Returns true iff the file is under any of the nested config directories.
 */
export function isFileUnderNestedConfig(
  fileUri: vscode.Uri,
  nestedConfigDirs: vscode.Uri[]
): boolean {
  for (const nestedDir of nestedConfigDirs) {
    const relative = path.relative(nestedDir.fsPath, fileUri.fsPath);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      return true;
    }
  }
  return false;
}
