const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const TEMPLATE_PATH = path.join(__dirname, 'preview-template.html');

// Sample data for testing
const SAMPLE_DATA = {
  LINE_NUMBER: '3',
  TOTAL_LINES: '10',
  PREV_DISABLED: '',
  NEXT_DISABLED: '',
  CONTENT: /* jsx */ `<pre><code class="language-json">{
  "name": "John Doe",
  "age": 30,
  "email": "john@example.com",
  "address": {
    "street": "123 Main St",
    "city": "New York",
    "country": "USA"
  },
  "hobbies": ["reading", "coding", "gaming"],
  "active": true
}</code></pre>`
};

// Mock VS Code API
const MOCK_VSCODE_API = /* js */ `
  window.acquireVsCodeApi = function() {
    return {
      postMessage: function(message) {
        console.log('VS Code API message:', message);
        // Mock navigation
        if (message.command === 'navigate') {
          const currentLine = parseInt(document.getElementById('lineInput').value);
          let newLine = currentLine;
          if (message.direction === 'prev' && currentLine > 1) {
            newLine = currentLine - 1;
          } else if (message.direction === 'next' && currentLine < ${SAMPLE_DATA.TOTAL_LINES}) {
            newLine = currentLine + 1;
          }
          document.getElementById('lineInput').value = newLine;
          updateNavigationButtons(newLine);
        } else if (message.command === 'goToLine') {
          updateNavigationButtons(message.line);
        }
      }
    };
  };

  function updateNavigationButtons(line) {
    const prevButton = document.querySelector('button[onclick="navigate(\\'prev\\')"]');
    const nextButton = document.querySelector('button[onclick="navigate(\\'next\\')"]');

    if (line <= 1) {
      prevButton.setAttribute('disabled', 'disabled');
    } else {
      prevButton.removeAttribute('disabled');
    }

    if (line >= ${SAMPLE_DATA.TOTAL_LINES}) {
      nextButton.setAttribute('disabled', 'disabled');
    } else {
      nextButton.removeAttribute('disabled');
    }
  }
`;

function processTemplate(template) {
  let html = template;

  // Replace placeholders
  Object.keys(SAMPLE_DATA).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    html = html.replace(regex, SAMPLE_DATA[key]);
  });

  // Inject mock VS Code API before other scripts
  html = html.replace('<script>', `<script>${MOCK_VSCODE_API}</script>\n  <script>`);

  // Add VS Code theme variables with theme switcher
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

  // Inject VS Code theme variables after <head>
  html = html.replace('<head>', `<head>\n${vscodeThemeVars}`);

  // Add theme switcher HTML
  const themeSwitcherHtml = `
    <div class="theme-switcher">
      <button id="darkTheme" class="active" onclick="setTheme('dark')">Dark</button>
      <button id="lightTheme" onclick="setTheme('light')">Light</button>
    </div>
  `;

  // Add theme switcher after opening body tag
  html = html.replace('<body>', `<body>\n${themeSwitcherHtml}`);

  // Add theme switcher and auto-reload scripts
  const combinedScripts = /* html */ `
    <script>
      // Theme switcher
      function setTheme(theme) {
        if (theme === 'light') {
          document.body.classList.add('vscode-light');
          document.getElementById('lightTheme').classList.add('active');
          document.getElementById('darkTheme').classList.remove('active');
        } else {
          document.body.classList.remove('vscode-light');
          document.getElementById('darkTheme').classList.add('active');
          document.getElementById('lightTheme').classList.remove('active');
        }
        // Save theme preference
        localStorage.setItem('vscode-theme', theme);
      }

      // Load saved theme preference
      const savedTheme = localStorage.getItem('vscode-theme') || 'dark';
      setTheme(savedTheme);

      // Auto-reload on file change
      let lastModified = null;

      async function checkForChanges() {
        try {
          const response = await fetch('/check-modified');
          const data = await response.json();

          if (lastModified && data.modified !== lastModified) {
            console.log('Template changed, reloading...');
            location.reload();
          }

          lastModified = data.modified;
        } catch (e) {
          console.error('Failed to check for changes:', e);
        }
      }

      // Check every second
      setInterval(checkForChanges, 1000);
      checkForChanges();
    </script>
  `;

  // Add before closing body tag
  html = html.replace('</body>', `${combinedScripts}\n</body>`);

  return html;
}

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    fs.readFile(TEMPLATE_PATH, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading template: ' + err.message);
        return;
      }

      const html = processTemplate(data);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });
  } else if (req.url === '/check-modified') {
    fs.stat(TEMPLATE_PATH, (err, stats) => {
      if (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ modified: stats.mtime.getTime() }));
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Preview template dev server running at http://localhost:${PORT}`);
  console.log(`Watching for changes in: ${TEMPLATE_PATH}`);
  console.log('\nPress Ctrl+C to stop the server');
});
