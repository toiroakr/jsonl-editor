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
  private _currentLine: number = 0;
  private _isManualNavigation: boolean = false;
  private _htmlTemplate: string | undefined;

  public static createOrShow(extensionUri: vscode.Uri, editor?: vscode.TextEditor) {
    const column = editor
      ? editor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (JsonlPreviewPanel.currentPanel) {
      JsonlPreviewPanel.currentPanel._panel.reveal(column);
      // Update editor if provided
      if (editor) {
        JsonlPreviewPanel.currentPanel._currentEditor = editor;
        JsonlPreviewPanel.currentPanel._currentLine = editor.selection.start.line;
        JsonlPreviewPanel.currentPanel._update();
      }
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

    JsonlPreviewPanel.currentPanel = new JsonlPreviewPanel(panel, extensionUri, editor);
    return JsonlPreviewPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, editor?: vscode.TextEditor) {
    this._panel = panel;

    // Load HTML template
    const templatePath = path.join(__dirname, 'preview-template.html');
    try {
      this._htmlTemplate = fs.readFileSync(templatePath, 'utf8');
    } catch (e) {
      console.error('Failed to load preview template:', e);
    }

    // Initialize with provided editor or current editor
    if (editor) {
      this._currentEditor = editor;
      this._currentLine = editor.selection.start.line;
    } else if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.path.endsWith('.jsonl')) {
      this._currentEditor = vscode.window.activeTextEditor;
      this._currentLine = this._currentEditor.selection.start.line;
    }

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
        if (e.textEditor.document.uri.path.endsWith('.jsonl') && !this._isManualNavigation) {
          this._currentEditor = e.textEditor;
          this._currentLine = e.textEditor.selection.start.line;
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

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'goToLine':
            this._goToLine(message.line);
            return;
          case 'navigate':
            this._navigate(message.direction);
            return;
        }
      },
      null,
      this._disposables
    );
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

  private _goToLine(lineNumber: number) {
    if (!this._currentEditor) {
      return;
    }

    const document = this._currentEditor.document;
    if (lineNumber < 1 || lineNumber > document.lineCount) {
      vscode.window.showErrorMessage(`Line ${lineNumber} is out of range (1-${document.lineCount})`);
      return;
    }

    this._isManualNavigation = true;
    this._currentLine = lineNumber - 1; // Convert to 0-based
    this._update();

    // Reset manual navigation flag after a short delay
    setTimeout(() => {
      this._isManualNavigation = false;
    }, 500);
  }

  private _navigate(direction: 'prev' | 'next') {
    if (!this._currentEditor) {
      return;
    }

    const document = this._currentEditor.document;
    if (direction === 'prev' && this._currentLine > 0) {
      this._currentLine--;
    } else if (direction === 'next' && this._currentLine < document.lineCount - 1) {
      this._currentLine++;
    }

    this._isManualNavigation = true;
    this._update();

    // Reset manual navigation flag after a short delay
    setTimeout(() => {
      this._isManualNavigation = false;
    }, 500);
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.title = 'JSONL Preview';
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(_webview: vscode.Webview) {
    let jsonContent = '';
    let lineNumber = 0;
    let totalLines = 0;

    if (this._currentEditor) {
      const document = this._currentEditor.document;
      totalLines = document.lineCount;

      // Ensure current line is within bounds
      if (this._currentLine >= totalLines) {
        this._currentLine = totalLines - 1;
      }
      if (this._currentLine < 0) {
        this._currentLine = 0;
      }

      lineNumber = this._currentLine + 1; // Convert to 1-based line number

      // Get the line content
      const line = document.lineAt(this._currentLine);
      const lineText = line.text.trim();

      if (lineText) {
        try {
          const multilineMarker = "[toiroakr.jsonl-editor.multiline]";
          const parsed = JSON.parse(lineText);
          jsonContent = JSON.stringify(parsed, (key, value) => {
            // Convert strings containing newlines to arrays
            if (typeof value === 'string' && value.includes('\n')) {
              const lines = value.split('\n');
              return [multilineMarker, ...lines];
            }
            return value;
          }, 2).replace(new RegExp(`\\[\\n\\s+"\\${multilineMarker}",\\n`, 'g'), `[ // Transformed for preview multiline string\n`);
        } catch (e) {
          jsonContent = 'Invalid JSON on line ' + lineNumber;
        }
      } else {
        jsonContent = 'Empty line';
      }
    } else {
      jsonContent = 'No JSONL file is active';
    }

    // If template is not loaded, return fallback HTML
    if (!this._htmlTemplate) {
      return '<html><body><h1>Error: Template not loaded</h1></body></html>';
    }

    // Prepare content based on JSON validity
    let content = '';
    if (jsonContent.startsWith('Invalid') || jsonContent.startsWith('No') || jsonContent === 'Empty line') {
      content = `<div class="error">${this._escapeHtml(jsonContent)}</div>`;
    } else {
      content = `<pre><code class="language-json5">${this._escapeHtml(jsonContent)}</code></pre>`;
    }

    // Replace placeholders in template
    let html = this._htmlTemplate;
    html = html.replace(/{{LINE_NUMBER}}/g, lineNumber.toString());
    html = html.replace(/{{TOTAL_LINES}}/g, totalLines.toString());
    html = html.replace('{{PREV_DISABLED}}', lineNumber <= 1 ? 'disabled' : '');
    html = html.replace('{{NEXT_DISABLED}}', lineNumber >= totalLines ? 'disabled' : '');
    html = html.replace('{{CONTENT}}', content);

    return html;
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

    JsonlPreviewPanel.createOrShow(context.extensionUri, editor);
  });

  context.subscriptions.push(editJsonlLineCommand);
  context.subscriptions.push(previewJsonlCommand);
}

export function deactivate() {
  // Processing when the extension becomes inactive
  // TempFileManager's dispose is automatically called because it's registered in context.subscriptions
}
