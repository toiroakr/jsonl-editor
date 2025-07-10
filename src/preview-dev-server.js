const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const TEMPLATE_PATH = path.join(__dirname, 'preview-template.html');
const SAMPLE_DATA_PATH = path.join(__dirname, 'sample-data.js');
const VSCODE_THEME_PATH = path.join(__dirname, 'vscode-theme.js');

// Helper function to load modules without cache
function requireUncached(module) {
  delete require.cache[require.resolve(module)];
  return require(module);
}

// Mock VS Code API factory
function createMockVSCodeAPI(totalLines) {
  return /* js */ `
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
            } else if (message.direction === 'next' && currentLine < ${totalLines}) {
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

      if (line >= ${totalLines}) {
        nextButton.setAttribute('disabled', 'disabled');
      } else {
        nextButton.removeAttribute('disabled');
      }
    }
  `;
}

function processTemplate(template) {
  // Load fresh data on each request
  const SAMPLE_DATA = requireUncached('./sample-data');
  const vscodeThemeVars = requireUncached('./vscode-theme');
  
  let html = template;

  // Replace placeholders
  Object.keys(SAMPLE_DATA).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    html = html.replace(regex, SAMPLE_DATA[key]);
  });

  // Inject mock VS Code API before other scripts
  const mockAPI = createMockVSCodeAPI(SAMPLE_DATA.TOTAL_LINES);
  html = html.replace('<script>', `<script>${mockAPI}</script>\n  <script>`);


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
            console.log('Files changed, reloading...');
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
    // Check modification times for all watched files
    const filesToWatch = [TEMPLATE_PATH, SAMPLE_DATA_PATH, VSCODE_THEME_PATH];
    
    Promise.all(filesToWatch.map(filePath => 
      new Promise((resolve, reject) => {
        fs.stat(filePath, (err, stats) => {
          if (err) {
            reject(err);
          } else {
            resolve({ path: filePath, mtime: stats.mtime.getTime() });
          }
        });
      })
    ))
    .then(results => {
      // Get the most recent modification time
      const mostRecentMtime = Math.max(...results.map(r => r.mtime));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ modified: mostRecentMtime }));
    })
    .catch(err => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Preview template dev server running at http://localhost:${PORT}`);
  console.log('\nWatching for changes in:');
  console.log(`  - ${TEMPLATE_PATH}`);
  console.log(`  - ${SAMPLE_DATA_PATH}`);
  console.log(`  - ${VSCODE_THEME_PATH}`);
  console.log('\nPress Ctrl+C to stop the server');
});
