// VS Code theme variables and switcher styles
const vscodeThemeVars = /* html */`
  <style>
    :root {
      /* VS Code Default Dark Theme Colors */
      --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --vscode-font-size: 13px;
      --vscode-editor-font-family: Menlo, Monaco, "Courier New", monospace;
      --vscode-editor-font-size: 12px;

      /* Background and foreground */
      --vscode-editor-background: #1e1e1e;
      --vscode-foreground: #cccccc;
      --vscode-descriptionForeground: #ccccccb3;
      --vscode-errorForeground: #f48771;

      /* Panel and borders */
      --vscode-panel-border: #2b2b2b;
      --vscode-textBlockQuote-background: #222222;

      /* Button colors */
      --vscode-button-background: #0e639c;
      --vscode-button-foreground: #ffffff;
      --vscode-button-hoverBackground: #1177bb;

      /* Input colors */
      --vscode-input-background: #3c3c3c;
      --vscode-input-foreground: #cccccc;
      --vscode-input-border: #3c3c3c;

      /* Token colors for syntax highlighting */
      --vscode-debugTokenExpression-type: #4A90E2;
      --vscode-debugTokenExpression-string: #ce9178;
      --vscode-debugTokenExpression-number: #b5cea8;
      --vscode-debugTokenExpression-boolean: #569cd6;
      --vscode-debugTokenExpression-value: #cccccc99;
    }

    /* Light theme colors */
    body.vscode-light {
      --vscode-editor-background: #ffffff;
      --vscode-foreground: #333333;
      --vscode-descriptionForeground: #717171;
      --vscode-errorForeground: #e51400;

      --vscode-panel-border: #e7e7e7;
      --vscode-textBlockQuote-background: #f3f3f3;

      --vscode-button-background: #007acc;
      --vscode-button-foreground: #ffffff;
      --vscode-button-hoverBackground: #005a9e;

      --vscode-input-background: #ffffff;
      --vscode-input-foreground: #333333;
      --vscode-input-border: #cecece;

      --vscode-debugTokenExpression-string: #a31515;
      --vscode-debugTokenExpression-number: #098658;
      --vscode-debugTokenExpression-boolean: #0000ff;
    }

    /* Theme switcher styles */
    .theme-switcher {
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 1000;
      display: flex;
      gap: 10px;
      background: var(--vscode-textBlockQuote-background);
      padding: 8px;
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border);
    }

    .theme-switcher button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
    }

    .theme-switcher button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .theme-switcher button.active {
      background: var(--vscode-button-hoverBackground);
      outline: 2px solid var(--vscode-button-foreground);
    }
  </style>
`;

module.exports = vscodeThemeVars;