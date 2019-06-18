import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

interface EditTarget {
  body: string;
  lineNumber: number;
}

interface TempFileInfo {
  filePath: string;
  originalUri: vscode.Uri;
  lineNumber: number;
}

// Temporary file management class
class TempFileManager {
  private _tempFiles = new Map<string, TempFileInfo>();
  private _disposables: vscode.Disposable[] = [];

  constructor() {
    // Register event listener when editor is closed
    this._disposables.push(
      vscode.workspace.onDidCloseTextDocument(document => {
        const filePath = document.uri.fsPath;
        if (this._tempFiles.has(filePath)) {
          this.deleteTempFile(filePath).catch(err => {
            console.error(`Failed to delete temporary file: ${err}`);
          });
        }
      })
    );

    // Register event listener when file is saved
    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument(async document => {
        const filePath = document.uri.fsPath;
        if (this._tempFiles.has(filePath)) {
          await this.saveToOriginalDocument(document).catch(err => {
            vscode.window.showErrorMessage(`Failed to save to original document: ${err}`);
          });
        }
      })
    );
  }

  // Save the temporary file content to the original document
  public async saveToOriginalDocument(document: vscode.TextDocument): Promise<void> {
    const filePath = document.uri.fsPath;
    const tempFileInfo = this._tempFiles.get(filePath);

    if (!tempFileInfo) {
      return;
    }

    let jsonContent = document.getText();
    const originalDocument = await vscode.workspace.openTextDocument(tempFileInfo.originalUri);
    const originalEditor = await vscode.window.showTextDocument(originalDocument);

    try {
      // Validate and minify JSON
      try {
        const parsed = JSON.parse(jsonContent.trim());
        jsonContent = JSON.stringify(parsed);
      } catch (e) {
        vscode.window.showErrorMessage('Invalid JSON format');
        return;
      }

      // Replace the specific line in JSONL file
      await originalEditor.edit((editBuilder: vscode.TextEditorEdit) => {
        const line = originalDocument.lineAt(tempFileInfo.lineNumber);
        editBuilder.replace(line.range, jsonContent);
      });

      const tabs = vscode.window.tabGroups.all
        .flatMap(group => group.tabs)
        .filter(tab => tab.input instanceof vscode.TabInputText &&
          tab.input.uri.fsPath === document.uri.fsPath);
      await vscode.window.tabGroups.close(tabs);

      await this.deleteTempFile(filePath);
    } catch (error) {
      if (error instanceof Error) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
      } else {
        vscode.window.showErrorMessage('An unknown error occurred');
      }
      throw error;
    }
  }

  public async createTempFile(content: string, originalUri: vscode.Uri, lineNumber: number): Promise<string> {
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const fileName = `jsonl_line_${timestamp}.json`;
    const filePath = path.join(tempDir, fileName);

    await fs.promises.writeFile(filePath, content, 'utf8');

    this._tempFiles.set(filePath, {
      filePath,
      originalUri,
      lineNumber,
    });

    return filePath;
  }

  public getTempFileInfo(filePath: string): TempFileInfo | undefined {
    return this._tempFiles.get(filePath);
  }

  public async deleteTempFile(filePath: string): Promise<void> {
    try {
      await fs.promises.unlink(filePath);
      this._tempFiles.delete(filePath);
    } catch (error) {
      console.error(`Failed to delete temporary file: ${error}`);
    }
  }

  public async deleteAllTempFiles(): Promise<void> {
    for (const [filePath] of this._tempFiles) {
      await this.deleteTempFile(filePath);
    }
  }

  // Release resources
  public dispose(): void {
    this._disposables.forEach(d => d.dispose());
    this.deleteAllTempFiles().catch(err => {
      console.error(`Failed to delete all temporary files: ${err}`);
    });
  }
}

function getJsonlLineTarget(editor: vscode.TextEditor): EditTarget | null {
  const document = editor.document;
  const selection = editor.selection;
  const lineNumber = selection.start.line;
  
  // Get the current line
  const line = document.lineAt(lineNumber);
  const lineText = line.text.trim();
  
  if (!lineText) {
    return null;
  }
  
  // Try to parse the line as JSON
  try {
    JSON.parse(lineText);
    return {
      body: lineText,
      lineNumber: lineNumber
    };
  } catch (e) {
    // Not valid JSON
    return null;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const tempFileManager = new TempFileManager();
  context.subscriptions.push({ dispose: () => tempFileManager.dispose() });

  const editJsonlLineCommand = vscode.commands.registerCommand('jsonl-editor.editJsonlLine', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor');
      return;
    }

    const target = getJsonlLineTarget(editor);
    if (!target) {
      vscode.window.showErrorMessage('No valid JSON found on the current line.');
      return;
    }

    try {
      let jsonContent: string;
      
      try {
        // Parse and format the JSON line
        const parsed = JSON.parse(target.body);
        jsonContent = JSON.stringify(parsed, null, 2);
      } catch (e) {
        if (e instanceof Error) {
          vscode.window.showErrorMessage(`Invalid JSON: ${e.message}`);
        } else {
          vscode.window.showErrorMessage('Invalid JSON format');
        }
        return;
      }

      const tempFilePath = await tempFileManager.createTempFile(
        jsonContent,
        editor.document.uri,
        target.lineNumber,
      );

      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(tempFilePath));
      await vscode.window.showTextDocument(document, { preview: false });
      vscode.languages.setTextDocumentLanguage(document, 'json');
      vscode.window.showInformationMessage('JSONL line opened as JSON. Edit and save (Ctrl+S) to update the original line.');
    } catch (error) {
      if (error instanceof Error) {
        vscode.window.showErrorMessage(`Error: ${error.message} ${error.stack}`);
      } else {
        vscode.window.showErrorMessage('An unknown error occurred');
      }
    }
  });

  context.subscriptions.push(editJsonlLineCommand);
}

export function deactivate() {
  // Processing when the extension becomes inactive
  // TempFileManager's dispose is automatically called because it's registered in context.subscriptions
}
