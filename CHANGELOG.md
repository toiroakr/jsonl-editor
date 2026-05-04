# Change Log

All notable changes to the "jsonl-editor" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Changed
- Bundle Prism.js syntax highlighter locally instead of loading from a CDN, so the preview works in offline environments. The webview now loads scripts from the extension's `media/prism/` directory under a strict Content Security Policy with a per-render nonce.

## [0.5.1] - 2026-04-28

### Added
- Setting `jsonl-editor.disableEditLink` to suppress the underline VS Code renders under each JSON line (caused by the document link used for Cmd/Ctrl+Click editing). Disabling the link still leaves Code Lens, Quick Fix, and the command palette as ways to edit a line. ([#1](https://github.com/toiroakr/jsonl-editor/issues/1))

## [0.5.0] - 2025-01-XX

### Added
- Code Lens: "Show Preview" link at the top of JSONL files for quick access to preview
- Document Link: Cmd/Ctrl+Click on any JSON line to edit it directly
- Code Action: Quick Fix menu (💡) with "Edit JSON line" and "Preview JSON line" options
- Edit button in preview panel to quickly edit the current line being previewed

### Changed
- Improved user experience with multiple ways to access edit and preview functionality

## [0.4.x]

- Add copy button to preview

## [0.3.x]

- Transform multiline string to string array

## [0.2.x]

- Initial release
