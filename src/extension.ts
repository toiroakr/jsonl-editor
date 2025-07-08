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

// Preview panel management
class JsonlPreviewPanel {
  private static currentPanel: JsonlPreviewPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _currentEditor: vscode.TextEditor | undefined;

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (JsonlPreviewPanel.currentPanel) {
      JsonlPreviewPanel.currentPanel._panel.reveal(column);
      return JsonlPreviewPanel.currentPanel;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      'jsonlPreview',
      'JSONL Preview',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    JsonlPreviewPanel.currentPanel = new JsonlPreviewPanel(panel, extensionUri);
    return JsonlPreviewPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Update the content based on view changes
    this._panel.onDidChangeViewState(
      () => {
        if (this._panel.visible) {
          this._update();
        }
      },
      null,
      this._disposables
    );

    // Handle cursor position changes
    vscode.window.onDidChangeTextEditorSelection(
      e => {
        if (e.textEditor.document.uri.path.endsWith('.jsonl')) {
          this._currentEditor = e.textEditor;
          this._update();
        }
      },
      null,
      this._disposables
    );

    // Handle active editor changes
    vscode.window.onDidChangeActiveTextEditor(
      editor => {
        if (editor && editor.document.uri.path.endsWith('.jsonl')) {
          this._currentEditor = editor;
          this._update();
        }
      },
      null,
      this._disposables
    );

    // Initialize with current editor
    if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.path.endsWith('.jsonl')) {
      this._currentEditor = vscode.window.activeTextEditor;
    }
  }

  public dispose() {
    JsonlPreviewPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.title = 'JSONL Preview';
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(_webview: vscode.Webview) {
    let jsonContent = '';
    let lineNumber = -1;

    if (this._currentEditor) {
      const target = getJsonlLineTarget(this._currentEditor);
      if (target) {
        try {
          const parsed = JSON.parse(target.body);
          jsonContent = JSON.stringify(parsed, null, 2);
          lineNumber = target.lineNumber + 1; // Convert to 1-based line number
        } catch (e) {
          jsonContent = 'Invalid JSON on current line';
        }
      } else {
        jsonContent = 'No valid JSON on current line';
      }
    } else {
      jsonContent = 'No JSONL file is active';
    }

    return /* html */`<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>JSONL Preview</title>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet" />
        <style>
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
            line-height: 1.6;
          }
          .line-info {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 10px;
            font-size: 0.9em;
          }
          pre[class*="language-"] {
            background-color: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 15px;
            overflow: auto;
            margin: 0;
          }
          code[class*="language-"] {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            text-shadow: none;
          }
          .error {
            color: var(--vscode-errorForeground);
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
          }
          /* Override Prism theme colors to match VS Code */
          .token.property,
          .token.string {
            color: var(--vscode-debugTokenExpression-string);
          }
          .token.number,
          .token.boolean {
            color: var(--vscode-debugTokenExpression-number);
          }
          .token.null {
            color: var(--vscode-debugTokenExpression-boolean);
          }
          .token.punctuation {
            color: var(--vscode-foreground);
          }
        </style>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-json.min.js"></script>
      </head>
      <body>
        ${lineNumber > 0 ? `<div class="line-info">Line ${lineNumber}</div>` : ''}
        ${jsonContent.startsWith('Invalid') || jsonContent.startsWith('No')
          ? `<div class="error">${this._escapeHtml(jsonContent)}</div>`
          : `<pre><code class="language-json">${this._escapeHtml(jsonContent)}</code></pre>`
        }
        <script>
          // Highlight the code
          Prism.highlightAll();
        </script>
      </body>
      </html>`;
  }

  private _escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
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

  const previewJsonlCommand = vscode.commands.registerCommand('jsonl-editor.previewJsonl', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document.uri.path.endsWith('.jsonl')) {
      vscode.window.showErrorMessage('Please open a JSONL file first');
      return;
    }

    JsonlPreviewPanel.createOrShow(context.extensionUri);
  });

  context.subscriptions.push(editJsonlLineCommand);
  context.subscriptions.push(previewJsonlCommand);
}

export function deactivate() {
  // Processing when the extension becomes inactive
  // TempFileManager's dispose is automatically called because it's registered in context.subscriptions
}
