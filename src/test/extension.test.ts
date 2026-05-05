import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

const EXT_ID = "toiroakr.jsonl-editor";

const COMMANDS = [
  "jsonl-editor.editJsonlLine",
  "jsonl-editor.editJsonlLineAt",
  "jsonl-editor.previewJsonl",
  "jsonl-editor.previewJsonlLine",
];

const JSONL_EXTENSIONS = [".jsonl", ".ndjson", ".jsonlines"];

suite("JSONL Editor activation", () => {
  let tmpDir: string;

  suiteSetup(async function () {
    this.timeout(20000);

    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, `Extension '${EXT_ID}' is not registered`);
    await ext.activate();

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jsonl-editor-test-"));
  });

  suiteTeardown(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("extension is active", () => {
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.strictEqual(ext?.isActive, true);
  });

  test("registers all expected commands", async () => {
    const all = await vscode.commands.getCommands(true);
    for (const cmd of COMMANDS) {
      assert.ok(all.includes(cmd), `Missing command: ${cmd}`);
    }
  });

  for (const fileExt of JSONL_EXTENSIONS) {
    test(`assigns languageId 'jsonl' to *${fileExt}`, async () => {
      const filePath = path.join(tmpDir, `lang${fileExt}`);
      fs.writeFileSync(filePath, '{"a":1}\n{"b":2}\n');
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(filePath)
      );
      assert.strictEqual(doc.languageId, "jsonl");
    });
  }

  test("Code Lens provider returns 'Show Preview'", async function () {
    this.timeout(10000);

    const filePath = path.join(tmpDir, "lens.jsonl");
    fs.writeFileSync(filePath, '{"hello":"world"}\n');
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      "vscode.executeCodeLensProvider",
      uri
    );
    assert.ok(lenses && lenses.length > 0, "No code lenses returned");
    const titles = lenses.map((l) => l.command?.title ?? "");
    assert.ok(
      titles.some((t) => /preview/i.test(t)),
      `Expected a 'Show Preview' lens, got: ${titles.join(", ")}`
    );
  });

  test("Document Link provider returns one link per JSON line", async function () {
    this.timeout(10000);

    const filePath = path.join(tmpDir, "links.jsonl");
    fs.writeFileSync(filePath, '{"a":1}\n{"b":2}\n{"c":3}\n');
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);

    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      "vscode.executeLinkProvider",
      uri
    );
    assert.ok(links, "DocumentLinks were not returned");
    assert.strictEqual(
      links.length,
      3,
      `Expected 3 links, got ${links.length}`
    );
    for (const link of links) {
      assert.strictEqual(
        link.target?.scheme,
        "command",
        "Link should target a command URI"
      );
    }
  });
});
