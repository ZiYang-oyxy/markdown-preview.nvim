const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const socketIo = require("socket.io");
const { resolveAssetLayout } = require("./asset-layout");
const {
  listBrowseDirectory,
  readBrowseFile,
  resolveBrowseTarget,
} = require("./browse-service");

const assetLayout = resolveAssetLayout();
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

function buildBrowseShellHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Markdown Browse</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #fbf7f1;
      --panel: rgba(255, 255, 255, 0.88);
      --panel-alt: rgba(250, 244, 236, 0.92);
      --border: rgba(48, 40, 34, 0.14);
      --text: #261b14;
      --muted: #7e6859;
      --accent: #b6502d;
      --accent-soft: rgba(182, 80, 45, 0.12);
      --shadow: 0 18px 50px rgba(54, 33, 21, 0.12);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #171310;
        --panel: rgba(32, 27, 24, 0.9);
        --panel-alt: rgba(27, 22, 19, 0.92);
        --border: rgba(255, 244, 232, 0.11);
        --text: #f7ede2;
        --muted: #c8b6a6;
        --accent: #ff8b5e;
        --accent-soft: rgba(255, 139, 94, 0.16);
        --shadow: 0 24px 70px rgba(0, 0, 0, 0.35);
      }
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(220, 150, 95, 0.18), transparent 34%),
        radial-gradient(circle at bottom right, rgba(109, 162, 154, 0.15), transparent 28%),
        var(--bg);
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(260px, 320px) 1fr;
      gap: 18px;
      min-height: 100vh;
      padding: 18px;
    }
    .sidebar,
    .content {
      min-height: calc(100vh - 36px);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: var(--shadow);
      overflow: hidden;
      background: var(--panel);
      backdrop-filter: blur(18px);
    }
    .sidebar {
      display: flex;
      flex-direction: column;
      background: linear-gradient(180deg, var(--panel), var(--panel-alt));
    }
    .sidebar-header,
    .content-header {
      padding: 18px 20px;
      border-bottom: 1px solid var(--border);
    }
    .sidebar-header h1,
    .content-header h2 {
      margin: 0;
      font-size: 16px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .path-row {
      margin-top: 8px;
      font-size: 13px;
      color: var(--muted);
      word-break: break-all;
    }
    .tree {
      padding: 10px;
      overflow: auto;
      flex: 1;
    }
    .tree-item {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      margin: 2px 0;
      border: 0;
      border-radius: 12px;
      color: inherit;
      background: transparent;
      text-align: left;
      cursor: pointer;
      font: inherit;
    }
    .tree-item:hover,
    .tree-item.is-active {
      background: var(--accent-soft);
    }
    .tree-item[disabled] {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .tree-kind {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      font-size: 12px;
      color: var(--accent);
      flex: 0 0 auto;
    }
    .tree-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tree-meta {
      font-size: 11px;
      color: var(--muted);
      flex: 0 0 auto;
    }
    .content {
      display: flex;
      flex-direction: column;
    }
    .content-body {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      background: var(--panel);
    }
    .status {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      color: var(--muted);
      font-size: 13px;
      min-height: 48px;
    }
    .status.is-error {
      color: #d24637;
    }
    .preview-frame,
    .fallback-view {
      flex: 1;
      width: 100%;
      border: 0;
      background: transparent;
      min-height: 0;
    }
    .fallback-view {
      display: none;
      padding: 20px;
      overflow: auto;
    }
    .fallback-view.is-visible {
      display: block;
    }
    .fallback-text {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .fallback-card {
      max-width: 760px;
      padding: 20px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--panel-alt);
    }
    .fallback-card a {
      color: var(--accent);
      text-decoration: none;
      font-weight: 600;
    }
    .toolbar {
      display: flex;
      gap: 10px;
      padding: 12px 20px 0;
    }
    .toolbar button {
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      border-radius: 999px;
      padding: 8px 12px;
      cursor: pointer;
      font: inherit;
    }
    .toolbar button:hover {
      color: var(--text);
      border-color: var(--accent);
    }
    @media (max-width: 960px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .sidebar,
      .content {
        min-height: auto;
      }
      .content {
        min-height: 60vh;
      }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>Browse</h1>
        <div class="path-row" id="root-path">Loading root…</div>
      </div>
      <div class="toolbar">
        <button type="button" id="up-button">Up</button>
      </div>
      <div class="tree" id="tree"></div>
    </aside>
    <section class="content">
      <div class="content-header">
        <h2 id="content-title">Select a file</h2>
        <div class="path-row" id="content-path">Markdown files open in the live preview pane.</div>
      </div>
      <div class="status" id="status">Browse mode is ready.</div>
      <div class="content-body">
        <iframe id="preview-frame" class="preview-frame" title="Markdown preview"></iframe>
        <div id="fallback-view" class="fallback-view"></div>
      </div>
    </section>
  </div>
  <script>
    const treeEl = document.getElementById('tree');
    const rootPathEl = document.getElementById('root-path');
    const contentTitleEl = document.getElementById('content-title');
    const contentPathEl = document.getElementById('content-path');
    const statusEl = document.getElementById('status');
    const previewFrameEl = document.getElementById('preview-frame');
    const fallbackViewEl = document.getElementById('fallback-view');
    const upButtonEl = document.getElementById('up-button');
    let currentDir = '.';
    let selectedPath = '';

    function toQuery(pathValue) {
      return new URLSearchParams({ path: pathValue || '.' }).toString();
    }

    function setStatus(message, isError) {
      statusEl.textContent = message;
      statusEl.classList.toggle('is-error', Boolean(isError));
    }

    function setContentMeta(title, relativePath) {
      contentTitleEl.textContent = title || 'Select a file';
      contentPathEl.textContent = relativePath || 'Markdown files open in the live preview pane.';
    }

    function showIframe(relativePath) {
      fallbackViewEl.classList.remove('is-visible');
      fallbackViewEl.innerHTML = '';
      previewFrameEl.style.display = 'block';
      previewFrameEl.src = '/page/1?browsePath=' + encodeURIComponent(relativePath);
    }

    function showFallbackHtml(html) {
      previewFrameEl.removeAttribute('src');
      previewFrameEl.style.display = 'none';
      fallbackViewEl.innerHTML = html;
      fallbackViewEl.classList.add('is-visible');
    }

    function buildParentPath(relativePath) {
      if (!relativePath || relativePath === '.') {
        return '.';
      }
      const parts = relativePath.split('/').filter(Boolean);
      parts.pop();
      return parts.length ? parts.join('/') : '.';
    }

    async function apiJson(pathname) {
      const response = await fetch(pathname);
      const payload = await response.json();
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || 'Request failed');
      }
      return payload;
    }

    function renderTree(payload) {
      currentDir = payload.relativePath || '.';
      location.hash = currentDir === '.' ? '' : currentDir;
      rootPathEl.textContent = payload.rootPath;
      upButtonEl.disabled = currentDir === '.';
      treeEl.innerHTML = '';

      if (!payload.entries.length) {
        const empty = document.createElement('div');
        empty.className = 'path-row';
        empty.textContent = 'This directory is empty.';
        treeEl.appendChild(empty);
        return;
      }

      payload.entries.forEach((entry) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tree-item';
        button.disabled = entry.kind === 'blocked';
        if (entry.relativePath === selectedPath) {
          button.classList.add('is-active');
        }

        const kind = document.createElement('span');
        kind.className = 'tree-kind';
        kind.textContent = entry.kind === 'directory' ? 'DIR' : entry.kind === 'blocked' ? '!' : entry.isMarkdown ? 'MD' : 'FILE';

        const name = document.createElement('span');
        name.className = 'tree-name';
        name.textContent = entry.name;

        const meta = document.createElement('span');
        meta.className = 'tree-meta';
        if (entry.kind === 'blocked') {
          meta.textContent = 'blocked';
        } else if (entry.isSymlink) {
          meta.textContent = 'symlink';
        } else if (entry.kind === 'directory') {
          meta.textContent = 'dir';
        } else if (entry.isMarkdown) {
          meta.textContent = 'markdown';
        }

        button.appendChild(kind);
        button.appendChild(name);
        button.appendChild(meta);

        button.addEventListener('click', () => {
          if (entry.kind === 'directory') {
            loadDirectory(entry.relativePath);
            return;
          }
          if (entry.kind === 'blocked') {
            setStatus('Blocked path: ' + entry.relativePath, true);
            return;
          }
          openFile(entry.relativePath);
        });

        treeEl.appendChild(button);
      });
    }

    async function loadDirectory(pathValue) {
      setStatus('Loading directory…');
      try {
        const payload = await apiJson('/_mkdp/browse/tree?' + toQuery(pathValue));
        renderTree(payload);
        setStatus('Directory loaded.');
      } catch (error) {
        setStatus(error.message || String(error), true);
      }
    }

    async function openFile(relativePath) {
      selectedPath = relativePath;
      setStatus('Loading file…');
      try {
        const payload = await apiJson('/_mkdp/browse/file?' + toQuery(relativePath));
        setContentMeta(payload.name, payload.relativePath);
        if (payload.kind === 'markdown') {
          showIframe(payload.relativePath);
          setStatus('Markdown preview loaded.');
          return;
        }
        if (payload.fallback === 'text') {
          showFallbackHtml('<pre class="fallback-text"></pre>');
          fallbackViewEl.querySelector('.fallback-text').textContent = payload.text || '';
          setStatus('Text fallback rendered.');
          return;
        }
        showFallbackHtml(
          '<div class="fallback-card">' +
            '<h3>Download fallback</h3>' +
            '<p>This file is not rendered as Markdown-rich text.</p>' +
            '<p><a href="/_mkdp/browse/raw?' + toQuery(payload.relativePath) + '">Download ' +
              payload.name.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
            '</a></p>' +
          '</div>'
        );
        setStatus('Binary/download fallback ready.');
      } catch (error) {
        showFallbackHtml('');
        setStatus(error.message || String(error), true);
      }
    }

    upButtonEl.addEventListener('click', () => {
      if (currentDir === '.') {
        return;
      }
      loadDirectory(buildParentPath(currentDir));
    });

    const initialDir = decodeURIComponent(location.hash.replace(/^#/, '')) || '.';
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
