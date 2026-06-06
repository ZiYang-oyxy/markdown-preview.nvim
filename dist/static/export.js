;(function () {
  var EXPORT_BUTTON_ID = 'mkdp-export-btn'
  var EXPORT_SLOT_ID = 'mkdp-export-slot'
  var EXPORT_SHORTCUT_LABEL = 'Ctrl/Cmd+Shift+E'
  var EXPORT_TIMEOUT_MS = 60000
  var assetDataUrlCache = new Map()
  var assetTextCache = new Map()
  var currentSocket = null
  var isExporting = false
  var previewReadySequence = 0
  var previewReadyTimer = null

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function sanitizeFileName(name) {
    var sanitized = String(name || '')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
    if (!sanitized) {
      sanitized = 'markdown-preview'
    }
    return sanitized
  }

  function getExportFileName() {
    var headerName = ''
    var header = document.querySelector('#page-header h3')
    if (header) {
      headerName = (header.textContent || '').trim()
    }
    var titleName = (document.title || '').trim()
    var baseName = sanitizeFileName(headerName || titleName)
    return baseName + '.preview.html'
  }

  function toAbsoluteUrl(raw, baseUrl) {
    return new URL(raw, baseUrl || window.location.href).href
  }

  function shouldProxyUrl(url) {
    try {
      return new URL(url, window.location.href).origin !== window.location.origin
    } catch (e) {
      return false
    }
  }

  function toProxyUrl(url) {
    return '/_mkdp_export_proxy?url=' + encodeURIComponent(url)
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onload = function () {
        resolve(reader.result)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  function replaceAsync(text, regex, asyncReplacer) {
    var matches = []
    text.replace(regex, function () {
      var args = Array.prototype.slice.call(arguments)
      matches.push(args)
      return ''
    })
    return Promise.all(matches.map(function (args) {
      return asyncReplacer.apply(null, args)
    })).then(function (replacements) {
      var idx = 0
      return text.replace(regex, function () {
        var replacement = replacements[idx]
        idx += 1
        return replacement
      })
    })
  }

  function markPreviewDirty() {
    previewReadySequence += 1
    if (previewReadyTimer) {
      clearTimeout(previewReadyTimer)
    }
    previewReadyTimer = null
  }

  function markPreviewReady() {
    var nextSequence = previewReadySequence + 1
    previewReadySequence = nextSequence
    if (previewReadyTimer) {
      clearTimeout(previewReadyTimer)
    }
    previewReadyTimer = setTimeout(function () {
      window.__mkdpPreviewState = {
        status: 'ready',
        sequence: nextSequence,
        updatedAt: Date.now()
      }
      previewReadyTimer = null
    }, 120)
  }

  function markPreviewError(error) {
    window.__mkdpPreviewState = {
      status: 'error',
      message: error && error.message ? error.message : String(error || 'preview render failed'),
      updatedAt: Date.now()
    }
  }

  async function fetchAssetAsDataUrl(assetUrl, warnings) {
    if (assetDataUrlCache.has(assetUrl)) {
      return assetDataUrlCache.get(assetUrl)
    }

    var requestUrl = assetUrl
    if (shouldProxyUrl(assetUrl)) {
      requestUrl = toProxyUrl(assetUrl)
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    var timer = null
    if (controller) {
      timer = setTimeout(function () {
        controller.abort()
      }, EXPORT_TIMEOUT_MS)
    }

    try {
      var response = await fetch(requestUrl, {
        credentials: 'same-origin',
        signal: controller ? controller.signal : undefined
      })
      if (!response.ok) {
        throw new Error('HTTP ' + response.status)
      }
      var blob = await response.blob()
      var dataUrl = await blobToDataUrl(blob)
      assetDataUrlCache.set(assetUrl, dataUrl)
      return dataUrl
    } catch (e) {
      warnings.push('资源内联失败: ' + assetUrl + ' (' + (e.message || e) + ')')
      return ''
    } finally {
      if (timer) {
        clearTimeout(timer)
      }
    }
  }

  async function fetchAssetAsText(assetUrl, warnings) {
    if (assetTextCache.has(assetUrl)) {
      return assetTextCache.get(assetUrl)
    }

    var requestUrl = shouldProxyUrl(assetUrl) ? toProxyUrl(assetUrl) : assetUrl
    try {
      var response = await fetch(requestUrl, {
        credentials: 'same-origin'
      })
      if (!response.ok) {
        throw new Error('HTTP ' + response.status)
      }
      var text = await response.text()
      assetTextCache.set(assetUrl, text)
      return text
    } catch (e) {
      warnings.push('样式读取失败: ' + assetUrl + ' (' + (e.message || e) + ')')
      return ''
    }
  }

  function stripFontFaceRules(cssText) {
    return String(cssText || '').replace(/@font-face\s*{[^}]*}/gi, '')
  }

  function stripUnusedStandaloneCss(cssText) {
    return String(cssText || '')
      .replace(/\/\*\s*HEIC图片处理状态样式\s*\*\/[\s\S]*$/i, '')
  }

  function shouldKeepInlineStyle(cssText, pageClone) {
    var text = String(cssText || '')
    if (!text.trim()) {
      return false
    }

    if (/immersive-translate-|imt-|\.heic-/i.test(text)) {
      return false
    }

    if (/#mermaid-[\w-]+/i.test(text) && !pageClone.querySelector('.mermaid svg')) {
      return false
    }

    return true
  }

  function normalizeCssForDedup(cssText) {
    return String(cssText || '').replace(/\s+/g, ' ').trim()
  }

  function shouldInlineStylesheet(pathname, pageClone) {
    if (!pathname) {
      return false
    }

    if (/\/page\.css$/i.test(pathname) || /\/markdown\.css$/i.test(pathname) || /\/highlight\.css$/i.test(pathname)) {
      return true
    }

    if (/\/katex@[^/]+\.css$/i.test(pathname)) {
      return !!pageClone.querySelector('.katex')
    }

    if (/\/sequence-diagram-min\.css$/i.test(pathname)) {
      return !!pageClone.querySelector('.sequence-diagram')
    }

    return false
  }

  async function inlineCssUrls(cssText, baseUrl, warnings) {
    var urlPattern = /url\(([^)]+)\)/g
    return replaceAsync(cssText, urlPattern, async function (fullMatch, rawUrl) {
      var normalized = String(rawUrl || '')
        .trim()
        .replace(/^["']|["']$/g, '')
      if (!normalized || /^data:/i.test(normalized) || /^#/.test(normalized) || /^blob:/i.test(normalized)) {
        return fullMatch
      }
      var assetUrl = ''
      try {
        assetUrl = toAbsoluteUrl(normalized, baseUrl)
      } catch (e) {
        warnings.push('样式 URL 解析失败: ' + normalized)
        return fullMatch
      }

      var dataUrl = await fetchAssetAsDataUrl(assetUrl, warnings)
      if (!dataUrl) {
        return fullMatch
      }
      return 'url("' + dataUrl + '")'
    })
  }

  async function collectInlineStyles(pageClone, warnings) {
    // 离线导出页用统一的 MkdpPreviewViewer 接管图片/Mermaid 的放大查看，
    // 所以这里只保留 mermaid 节点本身的 layout 兜底样式，不再注入老的
    // :target 静态 lightbox（毛玻璃 + 工具栏样式来自页面已内联的 page.css）。
    var styles = [
      '.mkdp-static-mermaid-image{display:block;width:100%;height:auto;}',
      '.mkdp-static-mermaid-svg{display:block;width:100%;height:auto;max-width:100%;}'
    ]
    var seenStyleTexts = new Set()
    var styleNodes = Array.from(document.querySelectorAll('style'))
    styleNodes.forEach(function (node) {
      var cssText = stripUnusedStandaloneCss(stripFontFaceRules(node.textContent || ''))
      var normalizedCss = normalizeCssForDedup(cssText)
      if (!shouldKeepInlineStyle(cssText, pageClone) || seenStyleTexts.has(normalizedCss)) {
        return
      }
      seenStyleTexts.add(normalizedCss)
      styles.push(cssText)
    })

    var styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
    for (var i = 0; i < styleLinks.length; i += 1) {
      var link = styleLinks[i]
      var href = link.getAttribute('href')
      if (!href) {
        continue
      }
      var absUrl = ''
      try {
        absUrl = toAbsoluteUrl(href, window.location.href)
      } catch (e) {
        warnings.push('样式链接解析失败: ' + href)
        continue
      }
      if (!shouldInlineStylesheet(new URL(absUrl).pathname, pageClone)) {
        continue
      }
      var cssText = await fetchAssetAsText(absUrl, warnings)
      if (!cssText) {
        continue
      }
      var inlinedCss = await inlineCssUrls(stripUnusedStandaloneCss(stripFontFaceRules(cssText)), absUrl, warnings)
      var normalizedInlinedCss = normalizeCssForDedup(inlinedCss)
      if (!shouldKeepInlineStyle(inlinedCss, pageClone) || seenStyleTexts.has(normalizedInlinedCss)) {
        continue
      }
      seenStyleTexts.add(normalizedInlinedCss)
      styles.push(inlinedCss)
    }

    return styles
      .map(function (content) {
        return '<style>\n' + content + '\n</style>'
      })
      .join('\n')
  }

  async function inlineElementImages(root, warnings) {
    var imgNodes = Array.from(root.querySelectorAll('img[src]'))
    for (var i = 0; i < imgNodes.length; i += 1) {
      var img = imgNodes[i]
      var src = img.getAttribute('src')
      if (!src || /^data:/i.test(src)) {
        continue
      }
      var absUrl = ''
      try {
        absUrl = toAbsoluteUrl(src, window.location.href)
      } catch (e) {
        warnings.push('图片 URL 解析失败: ' + src)
        continue
      }
      var dataUrl = await fetchAssetAsDataUrl(absUrl, warnings)
      if (!dataUrl) {
        continue
      }
      img.setAttribute('src', dataUrl)
      if (img.hasAttribute('srcset')) {
        img.removeAttribute('srcset')
      }
    }

    var sourceNodes = Array.from(root.querySelectorAll('source[srcset]'))
    for (var j = 0; j < sourceNodes.length; j += 1) {
      var source = sourceNodes[j]
      var srcset = source.getAttribute('srcset')
      if (!srcset || /^data:/i.test(srcset)) {
        continue
      }
      var firstSource = srcset.split(',')[0].trim().split(/\s+/)[0]
      if (!firstSource) {
        continue
      }
      var absSourceUrl = ''
      try {
        absSourceUrl = toAbsoluteUrl(firstSource, window.location.href)
      } catch (e) {
        warnings.push('source URL 解析失败: ' + srcset)
        continue
      }
      var sourceDataUrl = await fetchAssetAsDataUrl(absSourceUrl, warnings)
      if (!sourceDataUrl) {
        continue
      }
      source.setAttribute('srcset', sourceDataUrl)
    }
  }

  function inlineCanvasSnapshots(liveRoot, cloneRoot, warnings) {
    var liveCanvases = Array.from((liveRoot || document).querySelectorAll('canvas'))
    var cloneCanvases = Array.from((cloneRoot || document).querySelectorAll('canvas'))
    var total = Math.min(liveCanvases.length, cloneCanvases.length)

    for (var i = 0; i < total; i += 1) {
      var liveCanvas = liveCanvases[i]
      var cloneCanvas = cloneCanvases[i]
      try {
        var dataUrl = liveCanvas.toDataURL('image/png')
        var replacement = document.createElement('img')
        replacement.src = dataUrl
        replacement.alt = cloneCanvas.getAttribute('aria-label') || liveCanvas.getAttribute('aria-label') || 'Canvas snapshot'
        replacement.className = cloneCanvas.className || liveCanvas.className || ''
        replacement.style.cssText = cloneCanvas.style.cssText || liveCanvas.style.cssText || ''
        replacement.setAttribute('width', liveCanvas.width || cloneCanvas.getAttribute('width') || liveCanvas.clientWidth || 0)
        replacement.setAttribute('height', liveCanvas.height || cloneCanvas.getAttribute('height') || liveCanvas.clientHeight || 0)
        cloneCanvas.parentNode.replaceChild(replacement, cloneCanvas)
      } catch (e) {
        warnings.push('Canvas 内联失败: ' + (e.message || e))
      }
    }
  }

  function svgToDataUrl(svgText) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText)
  }

  function cleanupStaticSvg(svg) {
    if (!svg) {
      return svg
    }

    svg.removeAttribute('data-mkdp-preview-bound')
    svg.removeAttribute('tabindex')
    svg.removeAttribute('role')
    svg.removeAttribute('aria-label')
    svg.classList.remove('mkdp-previewable')
    svg.classList.add('mkdp-static-mermaid-svg')

    Array.from(svg.querySelectorAll('[data-mkdp-preview-bound], [tabindex], [role="button"]')).forEach(function (node) {
      node.removeAttribute('data-mkdp-preview-bound')
      node.removeAttribute('tabindex')
      if (node.getAttribute('role') === 'button') {
        node.removeAttribute('role')
      }
      if (node.getAttribute('aria-label') === '打开预览') {
        node.removeAttribute('aria-label')
      }
    })

    return svg
  }

  function resolveSvgDimensions(svg) {
    var viewBox = svg.getAttribute('viewBox')
    var width = svg.getAttribute('width')
    var height = svg.getAttribute('height')
    if ((!width || width.indexOf('%') !== -1 || !height || height.indexOf('%') !== -1) && viewBox) {
      var parts = viewBox.trim().split(/\s+/)
      if (parts.length === 4) {
        width = parts[2]
        height = parts[3]
      }
    }

    return {
      width: width,
      height: height
    }
  }

  function convertMermaidSvgsToImages(root) {
    var mermaidNodes = Array.from(root.querySelectorAll('.mermaid'))
    mermaidNodes.forEach(function (node, index) {
      var svg = node.querySelector('svg')
      if (!svg) {
        return
      }

      var serializer = typeof XMLSerializer !== 'undefined' ? new XMLSerializer() : null
      if (!serializer) {
        return
      }

      var clonedSvg = cleanupStaticSvg(svg.cloneNode(true))
      if (!clonedSvg.getAttribute('xmlns')) {
        clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      }
      if (!clonedSvg.getAttribute('xmlns:xlink')) {
        clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
      }

      var dimensions = resolveSvgDimensions(clonedSvg)
      var width = dimensions.width
      var height = dimensions.height

      // 显式 width/height 让浏览器能解出 intrinsic size, 同时让放大视图里 svg 缩放正确
      if (width) {
        clonedSvg.setAttribute('width', width)
      }
      if (height) {
        clonedSvg.setAttribute('height', height)
      }

      // 离线导出统一交给 MkdpPreviewViewer 接管:
      //   - 含 foreignObject 的图直接放原 svg(viewer 按 svg 类型绑定)
      //   - 其余序列化为 data: URL 走 <img>(viewer 按 image 类型绑定)
      // 不再外套 <a href="#..."> + :target lightbox.
      node.textContent = ''
      node.removeAttribute('data-processed')
      node.removeAttribute('data-mkdp-mermaid-source')

      if (clonedSvg.querySelector('foreignObject')) {
        clonedSvg.style.display = 'block'
        clonedSvg.style.width = '100%'
        clonedSvg.style.height = 'auto'
        clonedSvg.classList.add('mkdp-static-mermaid-svg')
        node.appendChild(clonedSvg)
        return
      }

      var svgMarkup = serializer.serializeToString(clonedSvg)
      var dataUrl = svgToDataUrl(svgMarkup)
      var img = document.createElement('img')
      img.className = 'mkdp-static-mermaid-image'
      img.src = dataUrl
      img.alt = node.getAttribute('aria-label') || ('Mermaid diagram ' + (index + 1))
      img.setAttribute('loading', 'eager')
      img.setAttribute('decoding', 'sync')
      if (width) {
        img.setAttribute('width', width)
      }
      if (height) {
        img.setAttribute('height', height)
      }
      node.appendChild(img)
    })
  }

  function syncSelectValue(liveSelect, cloneSelect) {
    if (!liveSelect || !cloneSelect) {
      return
    }

    cloneSelect.value = liveSelect.value
    Array.from(cloneSelect.options).forEach(function (option) {
      if (option.value === liveSelect.value) {
        option.setAttribute('selected', 'selected')
      } else {
        option.removeAttribute('selected')
      }
    })
  }

  function removeNode(node) {
    if (node && node.parentNode) {
      node.parentNode.removeChild(node)
    }
  }

  function stripStandaloneControls(clone) {
    Array.from(clone.querySelectorAll('#' + EXPORT_SLOT_ID + ', #' + EXPORT_BUTTON_ID + ', #mkdp-export-shortcut-tip')).forEach(removeNode)

    Array.from(clone.querySelectorAll('#theme-mode-select, #mermaid-theme-preset')).forEach(function (select) {
      var control = select.closest('.mkdp-page-control')
      if (control) {
        removeNode(control)
      } else {
        removeNode(select)
      }
    })

    Array.from(clone.querySelectorAll('#toc-mobile-open-btn, #toc-close-btn, #toc-drawer-backdrop')).forEach(removeNode)
    Array.from(clone.querySelectorAll('.toc-collapse-btn')).forEach(removeNode)
    Array.from(clone.querySelectorAll('.toc-item.has-children')).forEach(function (item) {
      item.classList.add('is-expanded')
    })

    var toolbar = clone.querySelector('.mkdp-page-toolbar')
    if (toolbar && !toolbar.textContent.trim() && !toolbar.querySelector('input, select, button, a')) {
      removeNode(toolbar)
    }

    var headerActions = clone.querySelector('.mkdp-header-actions')
    if (headerActions && !headerActions.textContent.trim() && !headerActions.querySelector('input, select, button, a')) {
      removeNode(headerActions)
    }
  }

  function clonePageRoot() {
    var nextRoot = document.getElementById('__next')
    if (!nextRoot) {
      throw new Error('can not find #__next')
    }
    var clone = nextRoot.cloneNode(true)

    var exportButton = clone.querySelector('#' + EXPORT_BUTTON_ID)
    if (exportButton) {
      exportButton.remove()
    }
    var shortcutTip = clone.querySelector('#mkdp-export-shortcut-tip')
    if (shortcutTip) {
      shortcutTip.remove()
    }

    var liveMain = document.querySelector('main')
    var cloneMain = clone.querySelector('main')
    if (liveMain && cloneMain) {
      cloneMain.setAttribute('data-theme', liveMain.getAttribute('data-theme') || '')
    }

    syncSelectValue(
      document.getElementById('theme-mode-select'),
      clone.querySelector('#theme-mode-select')
    )
    syncSelectValue(
      document.getElementById('mermaid-theme-preset'),
      clone.querySelector('#mermaid-theme-preset')
    )

    stripStandaloneControls(clone)

    return clone
  }

  async function fetchPreviewViewerScript(warnings) {
    var url = toAbsoluteUrl('/_static/preview-viewer.js', window.location.href)
    var text = await fetchAssetAsText(url, warnings)
    if (!text) {
      warnings.push('preview viewer 脚本读取失败, 离线 HTML 将无法放大查看图片')
    }
    return text || ''
  }

  function buildPreviewViewerBootstrap() {
    return [
      '(function () {',
      '  function bind() {',
      '    if (window.MkdpPreviewViewer && typeof window.MkdpPreviewViewer.bindPreviewInteractions === "function") {',
      '      window.MkdpPreviewViewer.bindPreviewInteractions(document);',
      '    }',
      '  }',
      '  if (document.readyState === "loading") {',
      '    document.addEventListener("DOMContentLoaded", bind);',
      '  } else {',
      '    bind();',
      '  }',
      '})();'
    ].join('\n')
  }

  async function buildStandaloneHtml() {
    var warnings = []
    var pageClone = clonePageRoot()
    inlineCanvasSnapshots(document, pageClone, warnings)
    await inlineElementImages(pageClone, warnings)
    convertMermaidSvgsToImages(pageClone)
    var inlineStyles = await collectInlineStyles(pageClone, warnings)
    var viewerScript = await fetchPreviewViewerScript(warnings)
    var title = escapeHtml(document.title || 'Markdown Preview')
    var bodyParts = ['<body>', pageClone.outerHTML]
    if (viewerScript) {
      bodyParts.push('<script>' + viewerScript + '</script>')
      bodyParts.push('<script>' + buildPreviewViewerBootstrap() + '</script>')
    }
    bodyParts.push('</body>')
    var html = [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + title + '</title>',
      inlineStyles,
      '</head>'
    ].concat(bodyParts).concat(['</html>']).join('\n')
    return {
      html: html,
      warnings: warnings
    }
  }

  function triggerDownload(content, filename) {
    var blob = new Blob([content], { type: 'text/html;charset=utf-8' })
    var objectUrl = URL.createObjectURL(blob)
    var anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(function () {
      URL.revokeObjectURL(objectUrl)
    }, 1500)
  }

  function setButtonState(loading) {
    var btn = document.getElementById(EXPORT_BUTTON_ID)
    if (!btn) {
      return
    }
    if (loading) {
      btn.setAttribute('disabled', 'disabled')
      btn.classList.add('is-exporting')
      btn.textContent = '导出中...'
      return
    }
    btn.removeAttribute('disabled')
    btn.classList.remove('is-exporting')
    btn.textContent = '导出 HTML'
  }

  async function runExport(options, socket) {
    if (isExporting) {
      return
    }
    isExporting = true
    setButtonState(true)

    var mode = options && options.mode === 'write' ? 'write' : 'download'
    var requestId = options && options.requestId ? options.requestId : ''

    try {
      var result = await buildStandaloneHtml()
      if (mode === 'download') {
        triggerDownload(result.html, getExportFileName())
      }

      if (socket && requestId) {
        var payload = {
          requestId: requestId,
          mode: mode,
          ok: true,
          warnings: result.warnings.slice(0, 30)
        }
        if (mode === 'write') {
          payload.html = result.html
        }
        socket.emit('mkdp_export_result', payload)
      }
    } catch (e) {
      if (socket && requestId) {
        socket.emit('mkdp_export_result', {
          requestId: requestId,
          mode: mode,
          ok: false,
          error: e.message || String(e)
        })
      } else {
        // eslint-disable-next-line no-console
        console.error('[markdown-preview] export failed:', e)
      }
    } finally {
      isExporting = false
      setButtonState(false)
    }
  }

  function bindSocket(socket) {
    if (!socket || socket.__mkdpExportBound) {
      return
    }
    socket.__mkdpExportBound = true
    socket.on('mkdp_export_request', function (payload) {
      runExport(payload || {}, socket)
    })
  }

  function watchSocketBinding() {
    setInterval(function () {
      if (!window.socket || window.socket === currentSocket) {
        return
      }
      currentSocket = window.socket
      bindSocket(currentSocket)
    }, 300)
  }

  function ensureExportButton() {
    var slot = document.getElementById(EXPORT_SLOT_ID)
    var header = document.getElementById('page-header')
    var host = slot || header
    if (!host) {
      return
    }

    var button = document.getElementById(EXPORT_BUTTON_ID)
    if (!button) {
      button = document.createElement('button')
      button.type = 'button'
      button.id = EXPORT_BUTTON_ID
      button.className = 'mkdp-export-btn'
      button.textContent = '导出 HTML'
      button.title = '导出为自包含单文件 HTML (' + EXPORT_SHORTCUT_LABEL + ')'
      button.addEventListener('click', function () {
        runExport({ mode: 'download' })
      })
      host.appendChild(button)
      return
    }

    if (button.parentNode !== host) {
      host.appendChild(button)
    }
  }

  function watchHeaderButton() {
    ensureExportButton()
    setInterval(ensureExportButton, 400)
    if (typeof MutationObserver !== 'undefined') {
      var observer = new MutationObserver(function () {
        ensureExportButton()
      })
      observer.observe(document.body, {
        childList: true,
        subtree: true
      })
    }
  }

  function registerShortcut() {
    window.addEventListener('keydown', function (event) {
      var isShortcut = (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        String(event.key || '').toLowerCase() === 'e'
      if (!isShortcut) {
        return
      }
      if (event.defaultPrevented || isExporting) {
        return
      }
      event.preventDefault()
      runExport({ mode: 'download' })
    })
  }

  function bootstrap() {
    watchSocketBinding()
    watchHeaderButton()
    registerShortcut()
    markPreviewReady()
  }

  function waitForPreviewReady(timeoutMs) {
    var timeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 30000
    var startedAt = Date.now()

    return new Promise(function (resolve, reject) {
      function check() {
        var state = window.__mkdpPreviewState || {}
        if (state.status === 'ready') {
          resolve(state)
          return
        }
        if (state.status === 'error') {
          reject(new Error(state.message || 'preview render failed'))
          return
        }
        if (Date.now() - startedAt >= timeout) {
          reject(new Error('preview render timed out'))
          return
        }
        window.setTimeout(check, 60)
      }

      check()
    })
  }

  window.__mkdpExport = {
    buildStandaloneHtml: buildStandaloneHtml,
    runExport: runExport,
    waitForPreviewReady: waitForPreviewReady
  }
  window.__mkdpPreviewState = {
    status: 'booting',
    updatedAt: Date.now()
  }

  if (typeof MutationObserver !== 'undefined') {
    var renderObserver = new MutationObserver(function () {
      markPreviewDirty()
      markPreviewReady()
    })

    if (document.documentElement) {
      renderObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      })
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap)
  } else {
    bootstrap()
  }
})()
