import createDOMPurify from 'dompurify'

const DATA_RASTER_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i
const SAFE_HREF = /^(?:https?:|mailto:|#[a-z0-9-]+$)/i

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function cssIsInert(value) {
  if (/@import|@namespace|javascript:|data:|expression\s*\(|behavior\s*:|-moz-binding/i.test(value)) {
    return false
  }
  const urls = value.match(/url\(([^)]+)\)/gi) ?? []
  return urls.every((entry) => /^url\(["']?#[a-z0-9_.:-]+["']?\)$/i.test(entry.replace(/\s/g, '')))
}

export function sanitizeExportSnapshot(bodyHtml, documentRef = document) {
  const purifier = createDOMPurify(documentRef.defaultView)
  purifier.addHook('uponSanitizeAttribute', (node, data) => {
    const name = data.attrName.toLowerCase()
    const value = data.attrValue.trim()
    if (name.startsWith('on')) data.keepAttr = false
    if (name === 'style' && !cssIsInert(value)) data.keepAttr = false
    if ((name === 'href' || name === 'xlink:href') && !SAFE_HREF.test(value)) {
      data.keepAttr = false
    }
    if (name === 'src' && node.nodeName.toLowerCase() === 'img' && !DATA_RASTER_IMAGE.test(value)) {
      data.keepAttr = false
    }
  })

  const clean = purifier.sanitize(bodyHtml, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    ADD_TAGS: ['style'],
    ADD_ATTR: ['aria-roledescription', 'dominant-baseline', 'marker-end', 'text-anchor', 'viewBox'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: [
      'audio', 'base', 'embed', 'foreignObject', 'form', 'iframe', 'link', 'meta',
      'object', 'picture', 'script', 'source', 'video',
    ],
    FORBID_ATTR: ['action', 'formaction', 'srcset'],
  })
  const template = documentRef.createElement('template')
  template.innerHTML = clean
  for (const style of template.content.querySelectorAll('style')) {
    if (!cssIsInert(style.textContent)) throw new Error('导出快照包含不安全样式，已停止导出。')
  }
  for (const element of template.content.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name)
    }
  }
  return template.innerHTML
}

const EXPORT_CSS = `
:root{color:#171a21;background:#f6f8fb;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
*{box-sizing:border-box}body{margin:0;padding:48px 20px 80px}article{width:min(100%,1040px);margin:auto;padding:48px clamp(24px,4vw,56px) 80px;border:1px solid #dde3ec;border-radius:20px;background:#fff;box-shadow:0 22px 60px rgba(30,51,84,.09);font-size:16px;line-height:1.6;overflow-wrap:anywhere}
h1,h2,h3,h4,h5,h6{line-height:1.24;letter-spacing:-.025em}h1{margin-top:0;font-size:clamp(32px,5vw,44px);letter-spacing:-.045em}h2{margin-top:1.8em;padding-top:.3em;border-top:1px solid #dde3ec;font-size:25px}h3{font-size:20px}p,ul,ol,blockquote,table,pre,.math-block,.mermaid-diagram,.diagram-error{margin:.9em 0}a{color:#1769e8}blockquote{padding:.4em 1.2em;border-left:3px solid #1769e8;color:#566174;background:#f6f8fb}code{padding:.16em .38em;border-radius:5px;background:#eef2f7;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.88em}pre{max-width:100%;padding:20px;overflow:auto;border:1px solid #dde3ec;border-radius:14px;background:#f6f8fb}pre code{padding:0;background:transparent;white-space:pre}table{display:block;max-width:100%;overflow-x:auto;border-collapse:collapse}th,td{padding:9px 14px;border:1px solid #dde3ec;text-align:left}.mermaid-diagram{padding:24px;overflow:auto;border:1px solid #dde3ec;border-radius:16px;background:#fbfcfe}.mermaid-diagram svg{display:block;max-width:100%;height:auto;margin:auto}.math-block{max-width:100%;overflow:auto;text-align:center}@media(max-width:640px){body{padding:0}article{padding:32px 20px;border:0;border-radius:0;box-shadow:none;font-size:16px}}
`

export function buildExportDocument({ title, bodyHtml, sanitize = sanitizeExportSnapshot }) {
  const safeBody = sanitize(bodyHtml)
  const safeTitle = escapeHtml(title || 'Markdown 文档')
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'">
<title>${safeTitle}</title>
<style>${EXPORT_CSS}</style>
</head>
<body><article>${safeBody}</article></body>
</html>`
}

export function downloadHtml(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  queueMicrotask(() => URL.revokeObjectURL(url))
}

export function exportFilename(title) {
  const safe = String(title || 'markdown-document')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${safe || 'markdown-document'}.html`
}
