import createDOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import katex from 'katex'
import MarkdownIt from 'markdown-it'
import mermaid from 'mermaid'

export const MAX_MERMAID_BLOCKS = 20
export const MAX_MERMAID_SOURCE_BYTES = 50 * 1024

const encoder = new TextEncoder()
const DATA_RASTER_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i
const SAFE_LINK = /^(?:https?:|mailto:)/i
const EXTERNAL_LINK = /^https?:/i
const LOCAL_FRAGMENT = /^#[a-z0-9][a-z0-9-]{0,127}$/i
const MERMAID_LANGUAGE = /^(?:language-)?mermaid$/i
const HTML_ALLOWED_TAGS = [
  'a', 'annotation', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'hr', 'input', 'li', 'math', 'mfrac', 'mi',
  'mn', 'mo', 'mover', 'mrow', 'mspace', 'mstyle', 'msub', 'msubsup',
  'msup', 'mtable', 'mtd', 'mtext', 'mtr', 'munder', 'munderover', 'ol',
  'p', 'pre', 'semantics', 'span', 'strong', 'sub', 'sup', 'table', 'tbody',
  'td', 'th', 'thead', 'tr', 'ul',
]
const HTML_ALLOWED_ATTR = [
  'aria-checked', 'aria-hidden', 'aria-label', 'checked', 'class', 'disabled',
  'href', 'role', 'start', 'style', 'target', 'title', 'type',
]

let mermaidInitialized = false

export function classifyUrl(value) {
  if (typeof value !== 'string') return 'blocked'
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, '')
  if (DATA_RASTER_IMAGE.test(normalized)) return 'image'
  if (SAFE_LINK.test(normalized) || LOCAL_FRAGMENT.test(normalized)) return 'link'
  return 'blocked'
}

export function validateMermaidBlocks(blocks) {
  if (!Array.isArray(blocks)) return { ok: false, error: 'Mermaid 数据不合法。' }
  if (blocks.length > MAX_MERMAID_BLOCKS) {
    return { ok: false, error: `一份文档最多渲染 ${MAX_MERMAID_BLOCKS} 个 Mermaid 图。` }
  }
  if (blocks.some((source) =>
    typeof source !== 'string' || encoder.encode(source).byteLength > MAX_MERMAID_SOURCE_BYTES,
  )) {
    return { ok: false, error: '单个 Mermaid 图不能超过 50 KiB。' }
  }
  return { ok: true }
}

function mathPlugin(markdown) {
  markdown.inline.ruler.after('escape', 'inline_math', (state, silent) => {
    if (state.src[state.pos] !== '$' || state.src[state.pos + 1] === '$') return false
    let end = state.pos + 1
    while ((end = state.src.indexOf('$', end)) !== -1) {
      if (state.src[end - 1] !== '\\') break
      end += 1
    }
    if (end === -1) return false
    const content = state.src.slice(state.pos + 1, end)
    if (!content || content.includes('\n') || content.length > 10_000) return false
    if (!silent) {
      const token = state.push('math_inline', 'math', 0)
      token.content = content
    }
    state.pos = end + 1
    return true
  })

  markdown.block.ruler.after('blockquote', 'math_block', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine]
    const maximum = state.eMarks[startLine]
    if (state.src.slice(start, start + 2) !== '$$') return false
    if (silent) return true

    let nextLine = startLine
    let content = state.src.slice(start + 2, maximum)
    let found = content.trimEnd().endsWith('$$') && content.trim() !== '$$'
    if (found) content = content.trimEnd().slice(0, -2)

    while (!found && ++nextLine < endLine) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine]
      const lineEnd = state.eMarks[nextLine]
      const line = state.src.slice(lineStart, lineEnd)
      if (line.trimEnd().endsWith('$$')) {
        content += `\n${line.trimEnd().slice(0, -2)}`
        found = true
      } else {
        content += `\n${line}`
      }
    }
    if (!found || content.length > 20_000) return false

    const token = state.push('math_block', 'math', 0)
    token.block = true
    token.content = content.trim()
    token.map = [startLine, nextLine + 1]
    state.line = nextLine + 1
    return true
  })

  const renderMath = (content, displayMode) => {
    try {
      return katex.renderToString(content, {
        displayMode,
        output: 'htmlAndMathml',
        strict: 'error',
        throwOnError: true,
        trust: false,
      })
    } catch {
      return `<span class="math-error" role="alert">公式无法渲染</span><code>${markdown.utils.escapeHtml(content)}</code>`
    }
  }
  markdown.renderer.rules.math_inline = (tokens, index) => renderMath(tokens[index].content, false)
  markdown.renderer.rules.math_block = (tokens, index) =>
    `<div class="math-block">${renderMath(tokens[index].content, true)}</div>`
}

function createMarkdown() {
  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    highlight(source, language) {
      if (language && hljs.getLanguage(language)) {
        try {
          return hljs.highlight(source, { language, ignoreIllegals: true }).value
        } catch {
          // Fall through to escaped plaintext.
        }
      }
      return markdown.utils.escapeHtml(source)
    },
  })

  markdown.validateLink = (url) => classifyUrl(url) !== 'blocked'

  markdown.renderer.rules.link_open = (tokens, index, options, environment, self) => {
    const token = tokens[index]
    const hrefIndex = token.attrIndex('href')
    const href = hrefIndex >= 0 ? token.attrs[hrefIndex][1] : ''
    if (classifyUrl(href) !== 'link') {
      if (hrefIndex >= 0) token.attrs.splice(hrefIndex, 1)
      return self.renderToken(tokens, index, options)
    }
    if (EXTERNAL_LINK.test(href)) {
      token.attrSet('target', '_blank')
      token.attrSet('rel', 'noopener noreferrer')
    }
    return self.renderToken(tokens, index, options)
  }

  markdown.renderer.rules.image = (tokens, index) => {
    const token = tokens[index]
    const source = token.attrGet('src') ?? ''
    const alternative = markdown.utils.escapeHtml(token.content || '图片')
    const title = markdown.utils.escapeHtml(token.attrGet('title') ?? '')
    if (classifyUrl(source) !== 'image') {
      return `<span class="blocked-image" role="note">[图片已隐藏：${alternative}]</span>`
    }
    const titleAttribute = title ? ` title="${title}"` : ''
    return `<img src="${markdown.utils.escapeHtml(source)}" alt="${alternative}"${titleAttribute}>`
  }

  mathPlugin(markdown)
  return markdown
}

function styleValueIsSafe(value) {
  const urls = value.match(/url\(([^)]+)\)/gi) ?? []
  return urls.every((entry) => /^url\(["']?#[a-z0-9_.:-]+["']?\)$/i.test(entry.replace(/\s/g, '')))
}

function installAttributePolicy(purifier, { svg = false } = {}) {
  purifier.addHook('uponSanitizeAttribute', (_node, data) => {
    const name = data.attrName.toLowerCase()
    const value = data.attrValue.trim()
    if (name.startsWith('on')) data.keepAttr = false
    if (name === 'style' && !styleValueIsSafe(value)) data.keepAttr = false
    if (svg && (name === 'href' || name === 'xlink:href') && !value.startsWith('#')) {
      data.keepAttr = false
    }
    if (svg && /url\(/i.test(value) && !styleValueIsSafe(value)) data.keepAttr = false
  })
}

function sanitizeHtml(windowRef, unsafeHtml) {
  const purifier = createDOMPurify(windowRef)
  installAttributePolicy(purifier)
  return purifier.sanitize(unsafeHtml, {
    ALLOWED_TAGS: HTML_ALLOWED_TAGS,
    ALLOWED_ATTR: HTML_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['form', 'iframe', 'object', 'embed', 'script', 'style', 'svg'],
  })
}

function sanitizeSvg(windowRef, unsafeSvg) {
  const purifier = createDOMPurify(windowRef)
  installAttributePolicy(purifier, { svg: true })
  return purifier.sanitize(unsafeSvg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: [
      'a', 'animate', 'discard', 'foreignObject', 'iframe', 'image', 'object',
      'script', 'set', 'style', 'use',
    ],
    FORBID_ATTR: ['onbegin', 'onend', 'onrepeat'],
    ALLOW_DATA_ATTR: false,
  })
}

function initializeMermaid() {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    maxTextSize: MAX_MERMAID_SOURCE_BYTES,
    maxEdges: 500,
    flowchart: { htmlLabels: false },
  })
  mermaidInitialized = true
}

function diagramFallback(documentRef, source, message) {
  const container = documentRef.createElement('div')
  container.className = 'diagram-error'
  const alert = documentRef.createElement('p')
  alert.setAttribute('role', 'alert')
  alert.textContent = message
  const pre = documentRef.createElement('pre')
  const code = documentRef.createElement('code')
  code.textContent = source
  pre.append(code)
  container.append(alert, pre)
  return container
}

function assignHeadingIds(container) {
  const used = new Set()
  const toc = []
  for (const [index, heading] of [...container.querySelectorAll('h1,h2,h3,h4,h5,h6')].entries()) {
    const base = heading.textContent
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `section-${index + 1}`
    let id = base.slice(0, 100)
    let suffix = 2
    while (used.has(id)) id = `${base.slice(0, 94)}-${suffix++}`
    used.add(id)
    heading.id = id
    toc.push({ id, text: heading.textContent.slice(0, 240), level: Number(heading.tagName[1]) })
  }
  return toc
}

export async function renderMarkdown(markdownSource, root, { theme = 'light' } = {}) {
  if (typeof markdownSource !== 'string') throw new TypeError('Markdown 必须是文本。')
  const documentRef = root.ownerDocument
  const windowRef = documentRef.defaultView
  const markdown = createMarkdown()
  const safeHtml = sanitizeHtml(windowRef, markdown.render(markdownSource))
  const template = documentRef.createElement('template')
  template.innerHTML = safeHtml

  const mermaidNodes = [...template.content.querySelectorAll('pre > code')]
    .filter((node) => [...node.classList].some((name) => MERMAID_LANGUAGE.test(name)))
  const sources = mermaidNodes.map((node) => node.textContent)
  const blockValidation = validateMermaidBlocks(sources)

  if (blockValidation.ok && mermaidNodes.length > 0) initializeMermaid()
  for (const [index, code] of mermaidNodes.entries()) {
    const pre = code.parentElement
    const source = sources[index]
    if (!blockValidation.ok) {
      pre.replaceWith(diagramFallback(documentRef, source, blockValidation.error))
      continue
    }
    try {
      const diagramId = `mermaid-${crypto.randomUUID().replaceAll('-', '')}`
      const { svg } = await mermaid.render(diagramId, source)
      const cleanSvg = sanitizeSvg(windowRef, svg)
      if (!cleanSvg.includes('<svg')) throw new Error('sanitized diagram is empty')
      const diagram = documentRef.createElement('div')
      diagram.className = 'mermaid-diagram'
      diagram.innerHTML = cleanSvg
      pre.replaceWith(diagram)
    } catch {
      pre.replaceWith(diagramFallback(documentRef, source, 'Mermaid 图无法渲染，已保留源文本。'))
    }
  }

  const toc = assignHeadingIds(template.content)
  root.replaceChildren(template.content)
  root.dataset.theme = theme
  return { toc, html: root.innerHTML }
}
