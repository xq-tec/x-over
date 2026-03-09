import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Test Suite", () => {
  test("Extension activates", async () => {
    const ext = vscode.extensions.getExtension("xq-Tec.x-over");
    assert.ok(ext, "Extension should be found");
    await ext.activate();
    assert.strictEqual(ext.isActive, true, "Extension should be active");
  });

  test("Reference provider returns array", async () => {
    const ext = vscode.extensions.getExtension("xq-Tec.x-over");
    assert.ok(ext);
    await ext.activate();

    // Open a file from the example workspace and execute find references
    const workspaceFolders = vscode.workspace.workspaceFolders;
    assert.ok(workspaceFolders && workspaceFolders.length > 0);

    const typesUri = vscode.Uri.joinPath(
      workspaceFolders[0].uri,
      "typescript/src/types.ts"
    );
    const doc = await vscode.workspace.openTextDocument(typesUri);
    const editor = await vscode.window.showTextDocument(doc);

    // Position at "User" in the interface declaration
    const position = new vscode.Position(5, 2);

    const refs = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeReferenceProvider",
      typesUri,
      position
    );

    assert.ok(Array.isArray(refs), "References should be an array");
  });

  test("Document symbols on Rust types.rs", async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    assert.ok(workspaceFolders && workspaceFolders.length > 0);

    const rustTypesUri = vscode.Uri.joinPath(
      workspaceFolders[0].uri,
      "rust/src/types.rs"
    );

    const symbols = await vscode.commands.executeCommand<
      vscode.DocumentSymbol[] | vscode.SymbolInformation[]
    >("vscode.executeDocumentSymbolProvider", rustTypesUri);

    // Serialize for inspection (DocumentSymbol has range/selectionRange)
    function toPlain(obj: unknown): unknown {
      if (obj instanceof vscode.Range) {
        return {
          start: { line: obj.start.line, character: obj.start.character },
          end: { line: obj.end.line, character: obj.end.character },
        };
      }
      if (obj instanceof vscode.Position) {
        return { line: obj.line, character: obj.character };
      }
      if (obj instanceof vscode.Location) {
        return { uri: obj.uri.toString(), range: toPlain(obj.range) };
      }
      if (Array.isArray(obj)) return obj.map(toPlain);
      if (obj && typeof obj === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
          out[k] = toPlain(v);
        }
        return out;
      }
      return obj;
    }
    const serialized = JSON.stringify(toPlain(symbols), null, 2);
    console.log("executeDocumentSymbolProvider result for rust/src/types.rs:");
    console.log(serialized);
  });
});
