import * as vscode from "vscode";

import { MappingIndex } from "./mappingIndex";
import { XOverReferenceProvider } from "./referenceProvider";

export function activate(context: vscode.ExtensionContext): void {
  const index = new MappingIndex();

  const configWatcher = vscode.workspace.createFileSystemWatcher(
    "**/cross-reference.json"
  );
  configWatcher.onDidChange(() => index.invalidate());
  configWatcher.onDidCreate(() => index.invalidate());
  configWatcher.onDidDelete(() => index.invalidate());
  context.subscriptions.push(configWatcher);

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => index.invalidate())
  );

  const documentSelector: vscode.DocumentSelector = [
    { language: "rust" },
    { language: "typescript" },
    { language: "javascript" },
  ];

  const referenceProvider = new XOverReferenceProvider(index);
  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(
      documentSelector,
      referenceProvider
    )
  );
}

export function deactivate(): void {}
