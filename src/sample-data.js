// Sample data for testing the preview template
const SAMPLE_CONTENT = {
  "name": "John Doe",
  "age": 30,
  "email": "john@example.com",
  "phone": null,
  "address": {
    "street": "123 Main St",
    "city": "New York",
    "country": "USA"
  },
  "hobbies": ["reading", "coding", "gaming"],
  "active": false
};
const SAMPLE_DATA = {
  LINE_NUMBER: '3',
  TOTAL_LINES: '10',
  PREV_DISABLED: '',
  NEXT_DISABLED: '',
  CONTENT: /* jsx */ `<pre><code class="language-json">${JSON.stringify(SAMPLE_CONTENT, null, 2)}</code></pre>`,
  ORIGINAL_CONTENT: JSON.stringify(SAMPLE_CONTENT),
  NONCE: 'dev-nonce',
  CSP_SOURCE: "'self'",
  PRISM_URI: '/media/prism/prism.js',
  PRISM_JSON_URI: '/media/prism/prism-json.min.js',
  PRISM_JSON5_URI: '/media/prism/prism-json5.min.js',
};

module.exports = SAMPLE_DATA;
