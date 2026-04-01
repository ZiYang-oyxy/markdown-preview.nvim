;(function () {
  var EXPORT_BUTTON_ID = 'mkdp-export-btn'
  var EXPORT_SLOT_ID = 'mkdp-export-slot'
  var EXPORT_SHORTCUT_LABEL = 'Ctrl/Cmd+Shift+E'
  var EXPORT_TIMEOUT_MS = 60000
  var assetDataUrlCache = new Map()
  var assetTextCache = new Map()
  var currentSocket = null
  var isExporting = false

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

  function escapeInlineScript(scriptText) {
    return String(scriptText || '').replace(/<\/script/gi, '<\\/script')
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

  async function collectInlineStyles(warnings) {
    var styles = []
    var styleNodes = Array.from(document.querySelectorAll('style'))
    styleNodes.forEach(function (node) {
      styles.push(String(node.textContent || ''))
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
      var cssText = await fetchAssetAsText(absUrl, warnings)
      if (!cssText) {
        continue
      }
      var inlinedCss = await inlineCssUrls(cssText, absUrl, warnings)
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

    return clone
  }

  async function buildStandaloneHtml() {
    var warnings = []
    var pageClone = clonePageRoot()
    await inlineElementImages(pageClone, warnings)
    var inlineStyles = await collectInlineStyles(warnings)
    var inlineScripts = await collectInlineScripts(pageClone, warnings)
    var title = escapeHtml(document.title || 'Markdown Preview')
    var html = [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + title + '</title>',
      inlineStyles,
      '</head>',
      '<body>',
      pageClone.outerHTML,
      inlineScripts,
      '</body>',
      '</html>'
    ].join('\n')
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
        console.error('[markdown-preview.nvim] export failed:', e)
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

  async function collectInlineScripts(pageClone, warnings) {
    var scripts = []
    var runtimeUrl = toAbsoluteUrl('/_static/standalone-runtime.js', window.location.href)
    var runtimeSource = await fetchAssetAsText(runtimeUrl, warnings)
    if (runtimeSource) {
      scripts.push('<script>\n' + escapeInlineScript(runtimeSource) + '\n</script>')
    }

    if (pageClone.querySelector('.mermaid')) {
      var mermaidUrl = toAbsoluteUrl('/_static/mermaid.min.js', window.location.href)
      var mermaidSource = await fetchAssetAsText(mermaidUrl, warnings)
      if (mermaidSource) {
        scripts.unshift('<script>\n' + escapeInlineScript(mermaidSource) + '\n</script>')
      }
    }

    return scripts.join('\n')
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap)
  } else {
    bootstrap()
  }
})()
