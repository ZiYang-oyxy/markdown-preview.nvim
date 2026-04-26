const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const socketIo = require("socket.io");
const { resolveRuntimeAssetLayout } = require("../../app/runtime-asset-layout");
const {
  listBrowseDirectory,
  readBrowseFile,
  resolveBrowseTarget,
} = require("./browse-service");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const APP_ROOT = path.join(REPO_ROOT, "app");
const assetLayout = resolveRuntimeAssetLayout({ appRoot: APP_ROOT });
const MAX_REMOTE_ASSET_SIZE = 30 * 1024 * 1024;
const MAX_REMOTE_REDIRECTS = 5;

function safeJoin(root, targetPath) {
  const normalizedRoot = path.resolve(root);
  const normalizedPath = String(targetPath || "").replace(/^[/\\]+/, "");
  const resolved = path.resolve(normalizedRoot, normalizedPath);

  if (
    resolved === normalizedRoot ||
    resolved.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    return resolved;
  }

  return "";
}

function sendFile(res, filePath, statusCode) {
  res.statusCode = statusCode || 200;
  fs.createReadStream(filePath).pipe(res);
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function svgIcons() {
  return {
    folder: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 5a2 2 0 012-2h3.172a2 2 0 011.414.586l1.828 1.828A2 2 0 0011.828 6H16a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" fill="var(--folder-color)" stroke="var(--folder-color)" stroke-width="1.2"/></svg>',
    markdown: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 2h8l4 4v12a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="var(--accent)" stroke-width="1.3" fill="none"/><path d="M12 2v4h4" stroke="var(--accent)" stroke-width="1.3" fill="none"/><path d="M7 12l2 2 4-5" stroke="var(--accent)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    textFile: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 2h8l4 4v12a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="var(--muted)" stroke-width="1.3" fill="none"/><path d="M12 2v4h4" stroke="var(--muted)" stroke-width="1.3" fill="none"/><line x1="6" y1="10" x2="14" y2="10" stroke="var(--muted)" stroke-width="1" stroke-linecap="round"/><line x1="6" y1="13" x2="12" y2="13" stroke="var(--muted)" stroke-width="1" stroke-linecap="round"/></svg>',
    blocked: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 2h8l4 4v12a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="var(--muted)" stroke-width="1.3" fill="none"/><path d="M12 2v4h4" stroke="var(--muted)" stroke-width="1.3" fill="none"/><circle cx="14" cy="14" r="4.5" fill="var(--blocked-color)"/><line x1="11.5" y1="14" x2="16.5" y2="14" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.3"/><line x1="9.5" y1="9.5" x2="12.5" y2="12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    chevronLeft: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevronRight: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevronSep: '<svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 1.5l3 2.5-3 2.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    sun: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="3" stroke="currentColor" stroke-width="1.3"/><line x1="7" y1="0.5" x2="7" y2="2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="7" y1="12" x2="7" y2="13.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="0.5" y1="7" x2="2" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="12" y1="7" x2="13.5" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="2.4" y1="2.4" x2="3.5" y2="3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="10.5" y1="10.5" x2="11.6" y2="11.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="2.4" y1="11.6" x2="3.5" y2="10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="10.5" y1="3.5" x2="11.6" y2="2.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    download: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 1v8M3.5 6.5L7 10l3.5-3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M1.5 11.5v1h11v-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    toc: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="2" y1="3" x2="12" y2="3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="2" y1="11" x2="12" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    fileEntry: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
}

function buildBrowseShellHtml() {
  const icons = svgIcons();
  // Escape backticks in SVG strings for safe embedding in JS template literals
  const esc = (s) => s.replace(/`/g, "\\`");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Markdown Browse</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #ffffff;
      --surface: #f8f9fa;
      --border: #e5e7eb;
      --text: #1f2937;
      --muted: #6b7280;
      --accent: #3b82f6;
      --accent-soft: rgba(59,130,246,0.08);
      --folder-color: #e8a948;
      --blocked-color: #ef4444;
      color-scheme: light;
    }
    html[data-theme="dark"] {
      --bg: #111827;
      --surface: #1f2937;
      --border: #374151;
      --text: #f3f4f6;
      --muted: #9ca3af;
      --accent: #60a5fa;
      --accent-soft: rgba(96,165,250,0.1);
      --folder-color: #fbbf24;
      --blocked-color: #f87171;
      color-scheme: dark;
    }

    body {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      height: 100vh;
      overflow: hidden;
      color: var(--text);
      background: var(--bg);
    }

    /* ---- Shell layout ---- */
    .shell { display: flex; height: 100vh; }

    /* ---- Sidebar ---- */
    .sidebar {
      width: 280px;
      min-width: 280px;
      display: flex;
      flex-direction: column;
      background: var(--surface);
      border-right: 1px solid var(--border);
      transition: width 200ms ease, min-width 200ms ease;
      overflow: hidden;
    }
    .sidebar.is-collapsed {
      width: 48px;
      min-width: 48px;
    }
    .sidebar-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      height: 48px;
      flex-shrink: 0;
    }
    .sidebar-topbar .title {
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
    }
    .sidebar-topbar .collapse-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      flex-shrink: 0;
    }
    .sidebar-topbar .collapse-btn:hover { background: var(--accent-soft); color: var(--text); }

    .sidebar-search {
      padding: 0 14px 8px;
      position: relative;
      flex-shrink: 0;
    }
    .sidebar-search .search-icon {
      position: absolute;
      left: 22px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--muted);
      pointer-events: none;
      display: flex;
    }
    .sidebar-search input {
      width: 100%;
      padding: 7px 10px 7px 32px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg);
      color: var(--text);
      font: inherit;
      font-size: 13px;
      outline: none;
    }
    .sidebar-search input:focus { border-color: var(--accent); }

    .sidebar-breadcrumb {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 14px 8px;
      font-size: 12px;
      color: var(--muted);
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    .sidebar-breadcrumb .bc-btn {
      border: none;
      background: transparent;
      color: var(--accent);
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      padding: 1px 2px;
      border-radius: 3px;
    }
    .sidebar-breadcrumb .bc-btn:hover { text-decoration: underline; }
    .sidebar-breadcrumb .bc-current {
      color: var(--text);
      font-weight: 500;
    }
    .sidebar-breadcrumb .bc-sep {
      display: inline-flex;
      align-items: center;
      color: var(--muted);
      opacity: 0.6;
    }
    .sidebar-breadcrumb .bc-back {
      border: none;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      padding: 2px;
      border-radius: 4px;
    }
    .sidebar-breadcrumb .bc-back:hover { color: var(--text); background: var(--accent-soft); }

    .sidebar-divider {
      height: 1px;
      background: var(--border);
      margin: 0 14px 4px;
      flex-shrink: 0;
    }

    .file-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 4px 8px 12px;
    }

    .file-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 10px;
      margin: 1px 0;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      transition: background 120ms ease;
    }
    .file-item:hover { background: var(--accent-soft); }
    .file-item.is-active { background: var(--accent-soft); }
    .file-item.is-active .file-name { color: var(--accent); font-weight: 600; }
    .file-item[disabled] { opacity: 0.4; cursor: not-allowed; }
    .file-item[disabled]:hover { background: transparent; }
    .file-icon { display: inline-flex; align-items: center; flex-shrink: 0; }
    .file-info { flex: 1; min-width: 0; }
    .file-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-meta { display: block; font-size: 11px; color: var(--muted); margin-top: 1px; }
    .file-arrow { display: inline-flex; align-items: center; color: var(--muted); flex-shrink: 0; }

    /* Collapsed sidebar: hide everything except icon strip */
    .sidebar.is-collapsed .sidebar-search,
    .sidebar.is-collapsed .sidebar-breadcrumb,
    .sidebar.is-collapsed .sidebar-divider { display: none; }
    .sidebar.is-collapsed .sidebar-topbar .title { display: none; }
    .sidebar.is-collapsed .sidebar-topbar { justify-content: center; padding: 12px 10px; }
    .sidebar.is-collapsed .file-item { padding: 6px; justify-content: center; }
    .sidebar.is-collapsed .file-info,
    .sidebar.is-collapsed .file-arrow { display: none; }
    .sidebar.is-collapsed .file-icon svg { width: 22px; height: 22px; }

    /* ---- Content area ---- */
    .content { flex: 1; display: flex; flex-direction: column; min-width: 0; }

    .content-topbar {
      display: none;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      flex-shrink: 0;
      min-height: 46px;
      gap: 8px;
    }
    .content-topbar.is-visible { display: flex; }
    .topbar-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;
    }
    .topbar-icon { display: inline-flex; align-items: center; flex-shrink: 0; }
    .topbar-path {
      font-size: 12px;
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .topbar-filename {
      font-size: 14px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .topbar-size {
      font-size: 11px;
      color: var(--muted);
      flex-shrink: 0;
    }
    .topbar-right {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .topbar-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      text-decoration: none;
    }
    .topbar-btn:hover { color: var(--text); border-color: var(--accent); }
    .topbar-btn.is-hidden { display: none; }

    /* ---- Content body ---- */
    .content-body {
      flex: 1;
      min-height: 0;
      position: relative;
      display: flex;
    }

    .welcome-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      color: var(--muted);
      user-select: none;
    }
    .welcome-screen h2 { font-size: 22px; font-weight: 600; color: var(--text); margin-bottom: 8px; }
    .welcome-screen p { font-size: 14px; }
    .welcome-screen.is-hidden { display: none; }

    .preview-frame {
      flex: 1;
      width: 100%;
      border: 0;
      background: transparent;
      display: none;
    }
    .preview-frame.is-visible { display: block; }

    .fallback-view {
      flex: 1;
      width: 100%;
      border: 0;
      display: none;
      padding: 24px;
      overflow: auto;
    }
    .fallback-view.is-visible { display: block; }
    .fallback-text {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font: 13px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace;
      color: var(--text);
    }
    .fallback-card {
      max-width: 640px;
      padding: 24px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
    }
    .fallback-card h3 { font-size: 16px; margin-bottom: 8px; }
    .fallback-card p { font-size: 13px; color: var(--muted); margin-bottom: 6px; }
    .fallback-card a { color: var(--accent); text-decoration: none; font-weight: 600; }
    .fallback-card a:hover { text-decoration: underline; }

    /* ---- Floating TOC ---- */
    .toc-float {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 200px;
      max-height: calc(100% - 24px);
      overflow-y: auto;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 12px;
      display: none;
      z-index: 5;
    }
    .toc-float.is-visible { display: block; }
    .toc-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 10px;
    }
    .toc-list { list-style: none; }
    .toc-list li { margin-bottom: 2px; }
    .toc-link {
      display: block;
      padding: 4px 8px 4px 12px;
      font-size: 12px;
      color: var(--muted);
      text-decoration: none;
      border-left: 2px solid transparent;
      border-radius: 0 4px 4px 0;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .toc-link:hover { color: var(--text); background: var(--accent-soft); }
    .toc-link.is-active { border-left-color: var(--accent); color: var(--accent); font-weight: 500; }
    .toc-link.is-deep { padding-left: 28px; }

    /* ---- TOC Drawer (narrow) ---- */
    .toc-drawer-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.35);
      z-index: 100;
    }
    .toc-drawer-backdrop.is-open { display: block; }
    .toc-drawer {
      position: fixed;
      top: 0;
      right: -280px;
      width: 280px;
      height: 100vh;
      background: var(--surface);
      border-left: 1px solid var(--border);
      z-index: 101;
      transition: right 200ms ease;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .toc-drawer.is-open { right: 0; }
    .toc-drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .toc-drawer-header span { font-size: 14px; font-weight: 600; }
    .toc-drawer-close {
      border: none;
      background: transparent;
      font-size: 18px;
      color: var(--muted);
      cursor: pointer;
      line-height: 1;
      padding: 4px;
      border-radius: 4px;
    }
    .toc-drawer-close:hover { color: var(--text); background: var(--accent-soft); }
    .toc-drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
    }

    /* ---- Responsive ---- */
    @media (min-width: 1100px) {
      .toc-float.is-visible { display: block; }
      #toc-toggle-btn { display: none !important; }
    }
    @media (max-width: 1099px) {
      .toc-float { display: none !important; }
    }
    @media (max-width: 959px) {
      .sidebar:not(.is-collapsed) {
        width: 48px;
        min-width: 48px;
      }
      .sidebar:not(.is-collapsed) .sidebar-search,
      .sidebar:not(.is-collapsed) .sidebar-breadcrumb,
      .sidebar:not(.is-collapsed) .sidebar-divider { display: none; }
      .sidebar:not(.is-collapsed) .sidebar-topbar .title { display: none; }
      .sidebar:not(.is-collapsed) .sidebar-topbar { justify-content: center; padding: 12px 10px; }
      .sidebar:not(.is-collapsed) .file-item { padding: 6px; justify-content: center; }
      .sidebar:not(.is-collapsed) .file-info,
      .sidebar:not(.is-collapsed) .file-arrow { display: none; }
      .sidebar:not(.is-collapsed) .file-icon svg { width: 22px; height: 22px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <!-- Sidebar -->
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-topbar">
        <span class="title">Files</span>
        <button class="collapse-btn" id="collapse-btn" type="button" title="Collapse sidebar">${esc(icons.chevronLeft)}</button>
      </div>
      <div class="sidebar-search">
        <span class="search-icon">${esc(icons.search)}</span>
        <input type="text" id="search-input" placeholder="Search files..." autocomplete="off" />
      </div>
      <div class="sidebar-breadcrumb" id="breadcrumb"></div>
      <div class="sidebar-divider"></div>
      <div class="file-list" id="file-list"></div>
    </aside>

    <!-- Content -->
    <section class="content">
      <div class="content-topbar" id="content-topbar">
        <div class="topbar-left">
          <span class="topbar-icon" id="topbar-icon"></span>
          <span class="topbar-path" id="topbar-path"></span>
          <span class="topbar-filename" id="topbar-filename"></span>
          <span class="topbar-size" id="topbar-size"></span>
        </div>
        <div class="topbar-right">
          <button class="topbar-btn is-hidden" id="toc-toggle-btn" type="button" title="Table of contents">${esc(icons.toc)}</button>
          <button class="topbar-btn" id="theme-btn" type="button" title="Toggle theme">${esc(icons.sun)}</button>
          <a class="topbar-btn is-hidden" id="raw-link" title="Download raw" target="_blank" rel="noopener">${esc(icons.download)}</a>
        </div>
      </div>
      <div class="content-body" id="content-body">
        <div class="welcome-screen" id="welcome-screen">
          <h2>Markdown Preview</h2>
          <p>Select a file from the sidebar to get started.</p>
        </div>
        <iframe id="preview-frame" class="preview-frame" title="Markdown preview"></iframe>
        <div id="fallback-view" class="fallback-view"></div>
        <div class="toc-float" id="toc-float">
          <div class="toc-title">On this page</div>
          <ul class="toc-list" id="toc-float-list"></ul>
        </div>
      </div>
    </section>
  </div>

  <!-- TOC Drawer -->
  <div class="toc-drawer-backdrop" id="toc-drawer-backdrop"></div>
  <div class="toc-drawer" id="toc-drawer">
    <div class="toc-drawer-header">
      <span>On this page</span>
      <button class="toc-drawer-close" id="toc-drawer-close" type="button">&times;</button>
    </div>
    <div class="toc-drawer-body">
      <ul class="toc-list" id="toc-drawer-list"></ul>
    </div>
  </div>

  <script>
    /* ---- Icon strings ---- */
    var ICONS = {
      folder: '${esc(icons.folder)}',
      markdown: '${esc(icons.markdown)}',
      textFile: '${esc(icons.textFile)}',
      blocked: '${esc(icons.blocked)}',
      chevronLeft: '${esc(icons.chevronLeft)}',
      chevronRight: '${esc(icons.chevronRight)}',
      chevronSep: '${esc(icons.chevronSep)}',
      fileEntry: '${esc(icons.fileEntry)}'
    };

    /* ---- DOM refs ---- */
    var sidebar = document.getElementById('sidebar');
    var collapseBtn = document.getElementById('collapse-btn');
    var searchInput = document.getElementById('search-input');
    var breadcrumbEl = document.getElementById('breadcrumb');
    var fileListEl = document.getElementById('file-list');
    var contentTopbar = document.getElementById('content-topbar');
    var topbarIcon = document.getElementById('topbar-icon');
    var topbarPath = document.getElementById('topbar-path');
    var topbarFilename = document.getElementById('topbar-filename');
    var topbarSize = document.getElementById('topbar-size');
    var tocToggleBtn = document.getElementById('toc-toggle-btn');
    var themeBtn = document.getElementById('theme-btn');
    var rawLink = document.getElementById('raw-link');
    var welcomeScreen = document.getElementById('welcome-screen');
    var previewFrame = document.getElementById('preview-frame');
    var fallbackView = document.getElementById('fallback-view');
    var tocFloat = document.getElementById('toc-float');
    var tocFloatList = document.getElementById('toc-float-list');
    var tocDrawerBackdrop = document.getElementById('toc-drawer-backdrop');
    var tocDrawer = document.getElementById('toc-drawer');
    var tocDrawerClose = document.getElementById('toc-drawer-close');
    var tocDrawerList = document.getElementById('toc-drawer-list');

    /* ---- State ---- */
    var currentDir = '.';
    var selectedPath = '';
    var allEntries = [];
    var tocHeadings = [];
    var activeTocId = '';
    var sidebarCollapsed = localStorage.getItem('mkdp-sidebar-collapsed') === '1';
    var currentTheme = localStorage.getItem('mkdp-theme') || 'light';

    /* ---- Theme ---- */
    function applyTheme(theme) {
      currentTheme = theme;
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.style.colorScheme = theme;
      localStorage.setItem('mkdp-theme', theme);
    }
    applyTheme(currentTheme);

    themeBtn.addEventListener('click', function() {
      applyTheme(currentTheme === 'light' ? 'dark' : 'light');
    });

    /* ---- Sidebar collapse ---- */
    function applySidebarState() {
      if (sidebarCollapsed) {
        sidebar.classList.add('is-collapsed');
        collapseBtn.innerHTML = ICONS.chevronRight;
        collapseBtn.title = 'Expand sidebar';
      } else {
        sidebar.classList.remove('is-collapsed');
        collapseBtn.innerHTML = ICONS.chevronLeft;
        collapseBtn.title = 'Collapse sidebar';
      }
    }
    applySidebarState();

    collapseBtn.addEventListener('click', function() {
      sidebarCollapsed = !sidebarCollapsed;
      localStorage.setItem('mkdp-sidebar-collapsed', sidebarCollapsed ? '1' : '0');
      applySidebarState();
    });

    /* ---- Helpers ---- */
    function toQuery(pathValue) {
      return new URLSearchParams({ path: pathValue || '.' }).toString();
    }

    function escHtml(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function buildParentPath(rel) {
      if (!rel || rel === '.') return '.';
      var parts = rel.split('/').filter(Boolean);
      parts.pop();
      return parts.length ? parts.join('/') : '.';
    }

    /* ---- Breadcrumb ---- */
    function renderBreadcrumb(dir) {
      breadcrumbEl.innerHTML = '';
      if (!dir || dir === '.') return;

      // Back button
      var backBtn = document.createElement('button');
      backBtn.className = 'bc-back';
      backBtn.type = 'button';
      backBtn.title = 'Go up';
      backBtn.innerHTML = ICONS.chevronLeft;
      backBtn.addEventListener('click', function() { loadDirectory(buildParentPath(dir)); });
      breadcrumbEl.appendChild(backBtn);

      var segments = dir.split('/').filter(Boolean);
      segments.forEach(function(seg, idx) {
        // Separator
        if (idx > 0) {
          var sep = document.createElement('span');
          sep.className = 'bc-sep';
          sep.innerHTML = ICONS.chevronSep;
          breadcrumbEl.appendChild(sep);
        }

        var isLast = idx === segments.length - 1;
        if (isLast) {
          var cur = document.createElement('span');
          cur.className = 'bc-current';
          cur.textContent = seg;
          breadcrumbEl.appendChild(cur);
        } else {
          var btn = document.createElement('button');
          btn.className = 'bc-btn';
          btn.type = 'button';
          btn.textContent = seg;
          var targetPath = segments.slice(0, idx + 1).join('/');
          btn.addEventListener('click', (function(tp) { return function() { loadDirectory(tp); }; })(targetPath));
          breadcrumbEl.appendChild(btn);
        }
      });
    }

    /* ---- Search ---- */
    searchInput.addEventListener('input', function() {
      var q = searchInput.value.toLowerCase().trim();
      if (!q) {
        renderFileList(allEntries);
        return;
      }
      var filtered = allEntries.filter(function(e) {
        return e.name.toLowerCase().indexOf(q) !== -1;
      });
      renderFileList(filtered);
    });

    /* ---- File icons ---- */
    function getFileIcon(entry) {
      if (entry.kind === 'directory') return ICONS.folder;
      if (entry.kind === 'blocked') return ICONS.blocked;
      if (entry.isMarkdown) return ICONS.markdown;
      return ICONS.textFile;
    }

    /* ---- File list ---- */
    function renderFileList(entries) {
      fileListEl.innerHTML = '';
      if (!entries || !entries.length) {
        var empty = document.createElement('div');
        empty.style.padding = '12px 10px';
        empty.style.color = 'var(--muted)';
        empty.style.fontSize = '13px';
        empty.textContent = 'No files found.';
        fileListEl.appendChild(empty);
        return;
      }

      entries.forEach(function(entry) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'file-item';
        btn.disabled = entry.kind === 'blocked';
        if (entry.relativePath === selectedPath) btn.classList.add('is-active');

        var iconSpan = document.createElement('span');
        iconSpan.className = 'file-icon';
        iconSpan.innerHTML = getFileIcon(entry);

        var info = document.createElement('span');
        info.className = 'file-info';

        var nameSpan = document.createElement('span');
        nameSpan.className = 'file-name';
        nameSpan.textContent = entry.name;
        info.appendChild(nameSpan);

        var meta = '';
        if (entry.kind === 'blocked') meta = 'blocked';
        else if (entry.isSymlink) meta = 'symlink';
        else if (entry.kind === 'directory') meta = 'folder';
        else if (entry.isMarkdown) meta = 'markdown';
        if (meta) {
          var metaSpan = document.createElement('span');
          metaSpan.className = 'file-meta';
          metaSpan.textContent = meta;
          info.appendChild(metaSpan);
        }

        btn.appendChild(iconSpan);
        btn.appendChild(info);

        if (entry.kind === 'directory') {
          var arrow = document.createElement('span');
          arrow.className = 'file-arrow';
          arrow.innerHTML = ICONS.fileEntry;
          btn.appendChild(arrow);
        }

        btn.addEventListener('click', function() {
          if (entry.kind === 'directory') { loadDirectory(entry.relativePath); return; }
          if (entry.kind === 'blocked') return;
          openFile(entry.relativePath, entry);
        });

        fileListEl.appendChild(btn);
      });
    }

    /* ---- API helper ---- */
    async function apiJson(url) {
      var response = await fetch(url);
      var payload = await response.json();
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || 'Request failed');
      }
      return payload;
    }

    /* ---- Load directory ---- */
    async function loadDirectory(pathValue) {
      try {
        var payload = await apiJson('/_mkdp/browse/tree?' + toQuery(pathValue));
        currentDir = payload.relativePath || '.';
        location.hash = currentDir === '.' ? '' : currentDir;
        allEntries = payload.entries || [];
        searchInput.value = '';
        renderBreadcrumb(currentDir);
        renderFileList(allEntries);
      } catch (error) {
        fileListEl.innerHTML = '<div style="padding:12px 10px;color:var(--blocked-color);font-size:13px">' + escHtml(error.message || String(error)) + '</div>';
      }
    }

    /* ---- Content views ---- */
    function showWelcome() {
      welcomeScreen.classList.remove('is-hidden');
      previewFrame.classList.remove('is-visible');
      previewFrame.removeAttribute('src');
      fallbackView.classList.remove('is-visible');
      fallbackView.innerHTML = '';
      contentTopbar.classList.remove('is-visible');
      tocFloat.classList.remove('is-visible');
      tocHeadings = [];
      activeTocId = '';
      tocToggleBtn.classList.add('is-hidden');
      rawLink.classList.add('is-hidden');
    }

    function showPreview(relativePath) {
      welcomeScreen.classList.add('is-hidden');
      fallbackView.classList.remove('is-visible');
      fallbackView.innerHTML = '';
      previewFrame.classList.add('is-visible');
      previewFrame.src = '/page/1?browsePath=' + encodeURIComponent(relativePath);
    }

    function showFallback(html) {
      welcomeScreen.classList.add('is-hidden');
      previewFrame.classList.remove('is-visible');
      previewFrame.removeAttribute('src');
      fallbackView.innerHTML = html;
      fallbackView.classList.add('is-visible');
      tocFloat.classList.remove('is-visible');
      tocHeadings = [];
      activeTocId = '';
      tocToggleBtn.classList.add('is-hidden');
    }

    /* ---- Topbar ---- */
    function setTopbar(entry) {
      contentTopbar.classList.add('is-visible');
      topbarIcon.innerHTML = getFileIcon(entry);
      var parts = entry.relativePath.split('/');
      var fname = parts.pop();
      topbarPath.textContent = parts.length ? parts.join('/') + '/' : '';
      topbarFilename.textContent = fname;
      topbarSize.textContent = '';
      rawLink.href = '/_mkdp/browse/raw?' + toQuery(entry.relativePath);
      rawLink.classList.remove('is-hidden');
    }

    /* ---- Open file ---- */
    async function openFile(relativePath, entry) {
      selectedPath = relativePath;
      renderFileList(allEntries.filter(function(e) {
        if (!searchInput.value.trim()) return true;
        return e.name.toLowerCase().indexOf(searchInput.value.toLowerCase().trim()) !== -1;
      }));

      try {
        var payload = await apiJson('/_mkdp/browse/file?' + toQuery(relativePath));

        var eInfo = entry || { name: payload.name, relativePath: payload.relativePath, kind: payload.kind, isMarkdown: payload.kind === 'markdown' };
        setTopbar(eInfo);

        if (payload.kind === 'markdown') {
          showPreview(payload.relativePath);
          return;
        }
        if (payload.fallback === 'text') {
          showFallback('<pre class="fallback-text"></pre>');
          fallbackView.querySelector('.fallback-text').textContent = payload.text || '';
          return;
        }
        showFallback(
          '<div class="fallback-card">' +
            '<h3>Download file</h3>' +
            '<p>This file cannot be rendered as rich text.</p>' +
            '<p><a href="/_mkdp/browse/raw?' + toQuery(payload.relativePath) + '">Download ' + escHtml(payload.name) + '</a></p>' +
          '</div>'
        );
      } catch (error) {
        showFallback('<div style="padding:16px;color:var(--blocked-color)">' + escHtml(error.message || String(error)) + '</div>');
      }
    }

    /* ---- TOC rendering ---- */
    function renderTocList(container) {
      container.innerHTML = '';
      tocHeadings.forEach(function(h) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.className = 'toc-link';
        if (h.level >= 3) a.classList.add('is-deep');
        if (h.id === activeTocId) a.classList.add('is-active');
        a.textContent = h.text;
        a.addEventListener('click', function() {
          previewFrame.contentWindow.postMessage({ type: 'mkdp:scroll-to', id: h.id }, '*');
          closeTocDrawer();
        });
        li.appendChild(a);
        container.appendChild(li);
      });
    }

    function renderTocFloat() { renderTocList(tocFloatList); }
    function renderTocDrawerList() { renderTocList(tocDrawerList); }

    /* ---- TOC events ---- */
    window.addEventListener('message', function(event) {
      if (!event.data || typeof event.data.type !== 'string') return;

      if (event.data.type === 'mkdp:toc') {
        tocHeadings = event.data.headings || [];
        activeTocId = '';
        if (tocHeadings.length > 0) {
          tocFloat.classList.add('is-visible');
          tocToggleBtn.classList.remove('is-hidden');
        } else {
          tocFloat.classList.remove('is-visible');
          tocToggleBtn.classList.add('is-hidden');
        }
        renderTocFloat();
        renderTocDrawerList();
      }

      if (event.data.type === 'mkdp:active-heading') {
        activeTocId = event.data.id || '';
        renderTocFloat();
        renderTocDrawerList();
      }
    });

    /* ---- TOC drawer open/close ---- */
    function openTocDrawer() {
      tocDrawerBackdrop.classList.add('is-open');
      tocDrawer.classList.add('is-open');
      renderTocDrawerList();
    }
    function closeTocDrawer() {
      tocDrawerBackdrop.classList.remove('is-open');
      tocDrawer.classList.remove('is-open');
    }

    tocToggleBtn.addEventListener('click', openTocDrawer);
    tocDrawerClose.addEventListener('click', closeTocDrawer);
    tocDrawerBackdrop.addEventListener('click', closeTocDrawer);

    /* ---- Init ---- */
    var initialDir = decodeURIComponent(location.hash.replace(/^#/, '')) || '.';
    loadDirectory(initialDir);
  </script>
</body>
</html>`;
}

function resolveImagePath(assetPath, context) {
  const decoded = decodeURIComponent(
    decodeURIComponent(assetPath.replace(/^\/_local_image_/, ""))
  ).replace(/\\ /g, " ");
  const searchRoots = [];

  if (context.imagesPath) {
    searchRoots.push(context.imagesPath);
  }
  if (context.fileDir) {
    searchRoots.push(context.fileDir);
  }
  if (context.cwd) {
    searchRoots.push(context.cwd);
  }

  if (!decoded) {
    return "";
  }

  if (path.isAbsolute(decoded)) {
    if (fs.existsSync(decoded) && !fs.statSync(decoded).isDirectory()) {
      return decoded;
    }

    for (let i = 0; i < searchRoots.length; i += 1) {
      let current = searchRoots[i];
      while (current && current !== path.dirname(current)) {
        const candidate = path.join(current, decoded);
        if (fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
          return candidate;
        }
        current = path.dirname(current);
      }
    }

    return "";
  }

  for (let i = 0; i < searchRoots.length; i += 1) {
    const candidate = path.resolve(searchRoots[i], decoded);
    if (fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return "";
}

function fetchRemoteAsset(target, redirects = 0) {
  return new Promise((resolve, reject) => {
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch (error) {
      reject(new Error("invalid url"));
      return;
    }

    const requester = targetUrl.protocol === "https:" ? https : http;
    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
      reject(new Error("unsupported protocol"));
      return;
    }

    const request = requester.get(targetUrl, (response) => {
      const { statusCode = 0, headers = {} } = response;
      if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
        response.resume();
        if (redirects >= MAX_REMOTE_REDIRECTS) {
          reject(new Error("too many redirects"));
          return;
        }
        resolve(
          fetchRemoteAsset(
            new URL(headers.location, targetUrl).toString(),
            redirects + 1
          )
        );
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`unexpected status code ${statusCode}`));
        return;
      }

      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_REMOTE_ASSET_SIZE) {
          request.destroy(new Error("asset too large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: headers["content-type"] || "application/octet-stream",
        });
      });
      response.on("error", reject);
    });

    request.setTimeout(15000, () => {
      request.destroy(new Error("request timeout"));
    });
    request.on("error", reject);
  });
}

function buildPreviewPayload(context, override = {}) {
  return {
    options: context.previewOptions || {},
    isActive: true,
    winline: 1,
    winheight: 1,
    cursor: [0, 1, 1, 0],
    pageTitle: context.pageTitle || "「${name}」",
    theme: context.theme || "light",
    name: context.name || "markdown-preview",
    content: context.contentLines || [],
    ...override,
  };
}

async function resolveBrowsePreviewPayload(context, browsePath) {
  const browseFile = await readBrowseFile(context.browseRoot, browsePath);
  if (browseFile.kind === "markdown") {
    return buildPreviewPayload(context, {
      name: browseFile.relativePath,
      content: browseFile.contentLines,
    });
  }

  return buildPreviewPayload(context, {
    name: browseFile.relativePath,
    content: [
      `# ${browseFile.name}`,
      "",
      "This file is handled by browse fallback mode.",
      "",
      `Fallback: ${browseFile.fallback}`,
    ],
  });
}

function resolveBrowseFileDirFromReferer(referer, browseRoot) {
  if (!referer || !browseRoot) {
    return "";
  }

  try {
    const refererUrl = new URL(referer, "http://127.0.0.1");
    const browsePath = refererUrl.searchParams.get("browsePath") || "";
    if (!browsePath) {
      return "";
    }

    const resolved = resolveBrowseTarget(browseRoot, browsePath);
    const stat = fs.statSync(resolved.realPath);
    return stat.isFile() ? path.dirname(resolved.realPath) : resolved.realPath;
  } catch (_) {
    return "";
  }
}

async function handleBrowseRawRequest(res, context, requestUrl) {
  try {
    const resolved = resolveBrowseTarget(
      context.browseRoot,
      requestUrl.searchParams.get("path") || "."
    );
    const stat = await fs.promises.stat(resolved.realPath);
    if (!stat.isFile()) {
      throw new Error("browse target is not a file");
    }

    res.setHeader(
      "content-disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(
        path.basename(resolved.realPath)
      )}`
    );
    sendFile(res, resolved.realPath);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      ok: false,
      code: error.code || "browse_error",
      error: error.message || String(error),
    });
  }
}

async function handleRequest(req, res, context) {
  const requestUrl = new URL(req.url, "http://127.0.0.1");
  const pathname = requestUrl.pathname;

  if (pathname === "/_mkdp/browse" || pathname === "/_mkdp/browse/") {
    if (!context.browseRoot) {
      sendJson(res, 404, {
        ok: false,
        code: "browse_disabled",
        error: "browse mode is not enabled",
      });
      return;
    }

    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(buildBrowseShellHtml());
    return;
  }

  if (pathname === "/_mkdp/browse/tree") {
    try {
      const payload = await listBrowseDirectory(
        context.browseRoot,
        requestUrl.searchParams.get("path") || "."
      );
      sendJson(res, 200, {
        ok: true,
        ...payload,
      });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        ok: false,
        code: error.code || "browse_error",
        error: error.message || String(error),
      });
    }
    return;
  }

  if (pathname === "/_mkdp/browse/file") {
    try {
      const payload = await readBrowseFile(
        context.browseRoot,
        requestUrl.searchParams.get("path") || "."
      );
      sendJson(res, 200, {
        ok: true,
        ...payload,
      });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        ok: false,
        code: error.code || "browse_error",
        error: error.message || String(error),
      });
    }
    return;
  }

  if (pathname === "/_mkdp/browse/raw") {
    await handleBrowseRawRequest(res, context, requestUrl);
    return;
  }

  if (/^\/page\/\d+$/.test(pathname)) {
    sendFile(res, assetLayout.indexHtml);
    return;
  }

  if (pathname.startsWith("/_next/")) {
    const filePath = safeJoin(assetLayout.htmlRoot, pathname);
    if (filePath && fs.existsSync(filePath)) {
      sendFile(res, filePath);
      return;
    }
  }

  if (
    pathname === "/_static/markdown.css" &&
    context.markdownCss &&
    fs.existsSync(context.markdownCss)
  ) {
    sendFile(res, context.markdownCss);
    return;
  }

  if (
    pathname === "/_static/highlight.css" &&
    context.highlightCss &&
    fs.existsSync(context.highlightCss)
  ) {
    sendFile(res, context.highlightCss);
    return;
  }

  if (pathname.startsWith("/_static/")) {
    const filePath = safeJoin(
      assetLayout.staticRoot,
      pathname.replace("/_static/", "")
    );
    if (filePath && fs.existsSync(filePath)) {
      sendFile(res, filePath);
      return;
    }
  }

  if (pathname === "/_mkdp_export_proxy") {
    const remoteUrl = requestUrl.searchParams.get("url") || "";
    if (!remoteUrl) {
      res.statusCode = 400;
      res.end("missing url");
      return;
    }

    try {
      const { buffer, contentType } = await fetchRemoteAsset(remoteUrl);
      res.statusCode = 200;
      res.setHeader("cache-control", "no-store");
      res.setHeader("content-type", contentType);
      res.end(buffer);
    } catch (error) {
      res.statusCode = 502;
      res.end("failed to fetch resource");
    }
    return;
  }

  if (pathname.startsWith("/_local_image_")) {
    const browseFileDir = resolveBrowseFileDirFromReferer(
      req.headers.referer || "",
      context.browseRoot
    );
    const imagePath = resolveImagePath(pathname, {
      ...context,
      fileDir: browseFileDir || context.fileDir,
    });
    if (imagePath) {
      if (/\.svg$/i.test(imagePath)) {
        res.setHeader("content-type", "image/svg+xml");
      }
      sendFile(res, imagePath);
      return;
    }
  }

  sendFile(res, assetLayout.notFoundHtml, 404);
}

async function startStandalonePreviewServer(context) {
  const server = http.createServer((req, res) => {
    handleRequest(req, res, context).catch((error) => {
      res.statusCode = 500;
      res.end(error.message || String(error));
    });
  });

  const io = socketIo(server);

  io.on("connection", async (client) => {
    const { handshake = { query: {} } } = client;
    const browsePath =
      handshake && handshake.query && typeof handshake.query.browsePath === "string"
        ? handshake.query.browsePath
        : "";

    try {
      const payload = browsePath && context.browseRoot
        ? await resolveBrowsePreviewPayload(context, browsePath)
        : buildPreviewPayload(context);
      client.emit("refresh_content", payload);
    } catch (error) {
      client.emit(
        "refresh_content",
        buildPreviewPayload(context, {
          name: browsePath || context.name || "markdown-preview",
          content: [
            "# Browse preview error",
            "",
            error.message || String(error),
          ],
        })
      );
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to resolve standalone preview server address");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        io.close();
        server.close((error) => {
          if (error && error.message !== "Server is not running.") {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

module.exports = {
  startStandalonePreviewServer,
};
