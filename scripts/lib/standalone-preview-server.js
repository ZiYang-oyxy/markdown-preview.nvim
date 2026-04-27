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
  searchBrowseFiles,
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
    colorTheme: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M7 1.5A5.5 5.5 0 007 12.5V1.5z" fill="currentColor"/></svg>',
    mermaidChart: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="7" width="3" height="5.5" rx="0.5" stroke="currentColor" stroke-width="1.2"/><rect x="5.5" y="4" width="3" height="8.5" rx="0.5" stroke="currentColor" stroke-width="1.2"/><rect x="10" y="1.5" width="3" height="11" rx="0.5" stroke="currentColor" stroke-width="1.2"/></svg>',
    exportHtml: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 1.5h5l3.5 3.5v7.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-11a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2"/><path d="M8 1.5V5h3.5" stroke="currentColor" stroke-width="1.2"/><path d="M5 8.5l2 2 2-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
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
      flex: 1;
      min-width: 0;
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      direction: rtl;
      text-align: left;
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
    .file-name { display: block; overflow-wrap: anywhere; word-break: break-word; line-height: 1.25; }
    .file-meta { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; overflow-wrap: anywhere; word-break: break-word; }
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
    .toc-tree { list-style: none; margin: 0; padding: 0; }
    .toc-node { margin: 1px 0; }
    .toc-node-row { display: flex; align-items: flex-start; gap: 2px; }
    .toc-node-toggle {
      width: 18px; height: 18px; flex: 0 0 18px;
      margin-top: 1px;
      border: 0; background: transparent; color: var(--muted);
      cursor: pointer; border-radius: 4px; font-size: 12px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      font-family: inherit; line-height: 1;
    }
    .toc-node-toggle:hover { background: var(--accent-soft); color: var(--text); }
    .toc-node-placeholder { width: 18px; height: 18px; flex: 0 0 18px; }
    .toc-node-link {
      flex: 1; min-width: 0;
      padding: 3px 6px; border-radius: 4px;
      font-size: 12px; color: var(--muted);
      text-decoration: none; cursor: pointer;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      border-left: 2px solid transparent;
    }
    .toc-node-link:hover { color: var(--text); background: var(--accent-soft); }
    .toc-node.is-active > .toc-node-row > .toc-node-link {
      border-left-color: var(--accent); color: var(--accent); font-weight: 500;
    }
    .toc-node-children {
      margin-left: 9px; padding-left: 8px;
      border-left: 1px solid var(--border);
    }
    .toc-node.is-collapsed > .toc-node-children { display: none; }

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

    /* ---- Popover ---- */
    .topbar-btn-wrap { position: relative; }
    .topbar-popover {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 120px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      padding: 4px;
      z-index: 50;
      display: none;
    }
    .topbar-popover.is-open { display: block; }
    .topbar-popover-item {
      display: block;
      width: 100%;
      padding: 6px 10px;
      border: none;
      background: transparent;
      color: var(--text);
      font-size: 12px;
      text-align: left;
      border-radius: 5px;
      cursor: pointer;
      font-family: inherit;
    }
    .topbar-popover-item:hover { background: var(--accent-soft); }
    .topbar-popover-item.is-active { color: var(--accent); font-weight: 500; }
    .topbar-sep {
      display: inline-block;
      width: 1px;
      height: 18px;
      background: var(--border);
      vertical-align: middle;
    }

    /* ---- Responsive ---- */
    @media (min-width: 1100px) {
      .toc-float.is-visible { display: block; }
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
        <span class="title" id="sidebar-title" title="Files">Files</span>
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
          <div class="topbar-btn-wrap is-hidden" id="color-theme-wrap">
            <button class="topbar-btn" id="color-theme-btn" type="button" title="Document color theme">${esc(icons.colorTheme)}</button>
            <div class="topbar-popover" id="color-theme-popover">
              <button class="topbar-popover-item" data-value="light" type="button">☀️ 浅色</button>
              <button class="topbar-popover-item" data-value="dark" type="button">🌙 深色</button>
            </div>
          </div>
          <div class="topbar-btn-wrap is-hidden" id="mermaid-theme-wrap">
            <button class="topbar-btn" id="mermaid-theme-btn" type="button" title="Mermaid chart theme">${esc(icons.mermaidChart)}</button>
            <div class="topbar-popover" id="mermaid-theme-popover">
              <button class="topbar-popover-item" data-value="modern" type="button">现代</button>
              <button class="topbar-popover-item" data-value="minimal" type="button">极简</button>
              <button class="topbar-popover-item" data-value="warm" type="button">暖色</button>
              <button class="topbar-popover-item" data-value="forest" type="button">森林</button>
            </div>
          </div>
          <button class="topbar-btn is-hidden" id="export-btn" type="button" title="Export HTML">${esc(icons.exportHtml)}</button>
          <span class="topbar-sep is-hidden" id="doc-controls-sep"></span>
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
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div class="toc-title">On this page</div>
            <button class="toc-drawer-close" id="toc-float-close" type="button" title="Close">&times;</button>
          </div>
          <div class="toc-tree" id="toc-float-list"></div>
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
      <div class="toc-tree" id="toc-drawer-list"></div>
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
    var sidebarTitle = document.getElementById('sidebar-title');
    var tocFloat = document.getElementById('toc-float');
    var tocFloatList = document.getElementById('toc-float-list');
    var tocDrawerBackdrop = document.getElementById('toc-drawer-backdrop');
    var tocDrawer = document.getElementById('toc-drawer');
    var tocDrawerClose = document.getElementById('toc-drawer-close');
    var tocDrawerList = document.getElementById('toc-drawer-list');
    var colorThemeWrap = document.getElementById('color-theme-wrap');
    var colorThemeBtn = document.getElementById('color-theme-btn');
    var colorThemePopover = document.getElementById('color-theme-popover');
    var mermaidThemeWrap = document.getElementById('mermaid-theme-wrap');
    var mermaidThemeBtn = document.getElementById('mermaid-theme-btn');
    var mermaidThemePopover = document.getElementById('mermaid-theme-popover');
    var exportBtn = document.getElementById('export-btn');
    var docControlsSep = document.getElementById('doc-controls-sep');
    var tocFloatClose = document.getElementById('toc-float-close');

    /* ---- State ---- */
    var currentDir = '.';
    var selectedPath = '';
    var allEntries = [];
    var searchEntries = null;
    var tocHeadings = [];
    var activeTocId = '';
    var sidebarCollapsed = localStorage.getItem('mkdp-sidebar-collapsed') === '1';
    var currentTheme = localStorage.getItem('mkdp-theme') || 'light';
    var docTheme = 'light';
    var docMermaidPreset = 'modern';
    var docHasMermaid = false;
    var tocExpandedMap = {};
    var tocCollapsed = localStorage.getItem('mkdp-toc-collapsed') === '1';

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

    /* ---- Popover helper ---- */
    var activePopover = null;

    function openPopover(popoverEl) {
      if (activePopover && activePopover !== popoverEl) {
        activePopover.classList.remove('is-open');
      }
      popoverEl.classList.toggle('is-open');
      activePopover = popoverEl.classList.contains('is-open') ? popoverEl : null;
    }

    function closeAllPopovers() {
      if (activePopover) {
        activePopover.classList.remove('is-open');
        activePopover = null;
      }
    }

    document.addEventListener('click', function(e) {
      if (activePopover && !e.target.closest('.topbar-btn-wrap')) {
        closeAllPopovers();
      }
    });

    /* ---- Document control buttons ---- */
    function showDocControls() {
      colorThemeWrap.classList.remove('is-hidden');
      exportBtn.classList.remove('is-hidden');
      docControlsSep.classList.remove('is-hidden');
      if (docHasMermaid) {
        mermaidThemeWrap.classList.remove('is-hidden');
      } else {
        mermaidThemeWrap.classList.add('is-hidden');
      }
    }

    function hideDocControls() {
      colorThemeWrap.classList.add('is-hidden');
      mermaidThemeWrap.classList.add('is-hidden');
      exportBtn.classList.add('is-hidden');
      docControlsSep.classList.add('is-hidden');
    }

    function updatePopoverActive(popoverEl, activeValue) {
      var items = popoverEl.querySelectorAll('.topbar-popover-item');
      for (var i = 0; i < items.length; i++) {
        if (items[i].getAttribute('data-value') === activeValue) {
          items[i].classList.add('is-active');
        } else {
          items[i].classList.remove('is-active');
        }
      }
    }

    colorThemeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      openPopover(colorThemePopover);
    });

    colorThemePopover.addEventListener('click', function(e) {
      var item = e.target.closest('.topbar-popover-item');
      if (!item) return;
      var value = item.getAttribute('data-value');
      if (value) {
        docTheme = value;
        previewFrame.contentWindow.postMessage({ type: 'mkdp:set-theme', theme: value }, '*');
        updatePopoverActive(colorThemePopover, value);
      }
      closeAllPopovers();
    });

    mermaidThemeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      openPopover(mermaidThemePopover);
    });

    mermaidThemePopover.addEventListener('click', function(e) {
      var item = e.target.closest('.topbar-popover-item');
      if (!item) return;
      var value = item.getAttribute('data-value');
      if (value) {
        docMermaidPreset = value;
        previewFrame.contentWindow.postMessage({ type: 'mkdp:set-mermaid-theme', preset: value }, '*');
        updatePopoverActive(mermaidThemePopover, value);
      }
      closeAllPopovers();
    });

    exportBtn.addEventListener('click', function() {
      if (previewFrame.classList.contains('is-visible')) {
        previewFrame.contentWindow.postMessage({ type: 'mkdp:export' }, '*');
      }
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

    function setSidebarTitle(rootPath) {
      var title = rootPath || 'Files';
      sidebarTitle.textContent = title;
      sidebarTitle.title = title;
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
    var searchRequestId = 0;

    async function searchCurrentDirectory(query) {
      var requestId = ++searchRequestId;
      if (!query) {
        searchEntries = null;
        renderFileList(allEntries);
        return;
      }

      try {
        var payload = await apiJson('/_mkdp/browse/search?' + new URLSearchParams({
          path: currentDir || '.',
          q: query
        }).toString());
        if (requestId !== searchRequestId) return;
        searchEntries = payload.entries || [];
        renderFileList(searchEntries);
      } catch (error) {
        if (requestId !== searchRequestId) return;
        searchEntries = [];
        fileListEl.innerHTML = '<div style="padding:12px 10px;color:var(--blocked-color);font-size:13px">' + escHtml(error.message || String(error)) + '</div>';
      }
    }

    searchInput.addEventListener('input', function() {
      var q = searchInput.value.toLowerCase().trim();
      searchCurrentDirectory(q);
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
        else if (entry.kind === 'file' && searchInput.value.trim() && entry.relativePath.indexOf('/') !== -1) {
          meta = entry.relativePath.split('/').slice(0, -1).join('/');
        }
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
        setSidebarTitle(payload.rootPath);
        searchEntries = null;
        searchInput.value = '';
        searchRequestId += 1;
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
      hideDocControls();
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
      hideDocControls();
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
      renderFileList(searchEntries || allEntries);

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

    /* ---- TOC tree ---- */
    function buildTocTree(headings) {
      var root = { level: 0, children: [] };
      var stack = [root];
      headings.forEach(function(h) {
        var node = { id: h.id, text: h.text, level: h.level, children: [] };
        while (stack.length > 1 && node.level <= stack[stack.length - 1].level) {
          stack.pop();
        }
        stack[stack.length - 1].children.push(node);
        stack.push(node);
      });
      return root.children;
    }

    function ensureAncestorsExpanded(tree, targetId) {
      function walk(nodes) {
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (node.id === targetId) return true;
          if (node.children.length > 0 && walk(node.children)) {
            tocExpandedMap[node.id] = true;
            return true;
          }
        }
        return false;
      }
      walk(tree);
    }

    function renderTocTree(container, nodes) {
      container.innerHTML = '';
      function renderNodes(parentEl, nodeList) {
        nodeList.forEach(function(node) {
          var li = document.createElement('div');
          li.className = 'toc-node';
          if (node.id === activeTocId) li.classList.add('is-active');

          var hasChildren = node.children.length > 0;
          var isExpanded = hasChildren ? tocExpandedMap[node.id] !== false : false;
          if (hasChildren && !isExpanded) li.classList.add('is-collapsed');

          var row = document.createElement('div');
          row.className = 'toc-node-row';

          if (hasChildren) {
            var toggle = document.createElement('button');
            toggle.className = 'toc-node-toggle';
            toggle.type = 'button';
            toggle.textContent = isExpanded ? '\u2212' : '+';
            toggle.addEventListener('click', (function(nid) {
              return function(e) {
                e.stopPropagation();
                tocExpandedMap[nid] = !tocExpandedMap[nid];
                renderTocFloat();
                renderTocDrawerList();
              };
            })(node.id));
            row.appendChild(toggle);
          } else {
            var placeholder = document.createElement('span');
            placeholder.className = 'toc-node-placeholder';
            row.appendChild(placeholder);
          }

          var link = document.createElement('a');
          link.className = 'toc-node-link';
          link.textContent = node.text;
          link.title = node.text;
          link.addEventListener('click', function() {
            previewFrame.contentWindow.postMessage({ type: 'mkdp:scroll-to', id: node.id }, '*');
            closeTocDrawer();
          });
          row.appendChild(link);

          li.appendChild(row);

          if (hasChildren) {
            var childContainer = document.createElement('div');
            childContainer.className = 'toc-node-children';
            renderNodes(childContainer, node.children);
            li.appendChild(childContainer);
          }

          parentEl.appendChild(li);
        });
      }
      var tree = buildTocTree(tocHeadings);
      renderNodes(container, tree);
    }

    function renderTocFloat() { renderTocTree(tocFloatList, tocHeadings); }
    function renderTocDrawerList() { renderTocTree(tocDrawerList, tocHeadings); }

    /* ---- TOC events ---- */
    window.addEventListener('message', function(event) {
      if (!event.data || typeof event.data.type !== 'string') return;

      if (event.data.type === 'mkdp:toc') {
        tocHeadings = event.data.headings || [];
        activeTocId = '';
        // Initialize expanded map: h1/h2 expanded, h3+ collapsed
        tocExpandedMap = {};
        tocHeadings.forEach(function(h) {
          tocExpandedMap[h.id] = h.level <= 2;
        });
        if (tocHeadings.length > 0) {
          if (!tocCollapsed) {
            tocFloat.classList.add('is-visible');
          }
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
        var tree = buildTocTree(tocHeadings);
        ensureAncestorsExpanded(tree, activeTocId);
        renderTocFloat();
        renderTocDrawerList();
      }

      if (event.data.type === 'mkdp:state') {
        docTheme = event.data.theme || 'light';
        docMermaidPreset = event.data.mermaidPreset || 'modern';
        docHasMermaid = Boolean(event.data.hasMermaid);
        updatePopoverActive(colorThemePopover, docTheme);
        updatePopoverActive(mermaidThemePopover, docMermaidPreset);
        showDocControls();
      }
    });

    /* ---- TOC float close and toggle ---- */
    tocFloatClose.addEventListener('click', function() {
      tocFloat.classList.remove('is-visible');
      tocCollapsed = true;
      localStorage.setItem('mkdp-toc-collapsed', '1');
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

    tocToggleBtn.addEventListener('click', function() {
      // On wide screens: toggle the float panel
      if (window.innerWidth >= 1100) {
        tocCollapsed = !tocCollapsed;
        localStorage.setItem('mkdp-toc-collapsed', tocCollapsed ? '1' : '0');
        if (tocCollapsed) {
          tocFloat.classList.remove('is-visible');
        } else if (tocHeadings.length > 0) {
          tocFloat.classList.add('is-visible');
          renderTocFloat();
        }
      } else {
        // On narrow screens: open the drawer
        openTocDrawer();
      }
    });
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

  if (pathname === "/_mkdp/browse/search") {
    try {
      const payload = await searchBrowseFiles(
        context.browseRoot,
        requestUrl.searchParams.get("path") || ".",
        requestUrl.searchParams.get("q") || ""
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
