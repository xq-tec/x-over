import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Test Suite", () => {
  test("Extension activates", async () => {
    const ext = vscode.extensions.getExtension("xq-Tec.x-over");
    assert.ok(ext, "Extension should be found");
    await ext.activate();
    assert.strictEqual(ext.isActive, true, "Extension should be active");
  });
});
