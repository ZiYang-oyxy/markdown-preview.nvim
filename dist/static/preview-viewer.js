;(function (global) {
  if (global.MkdpPreviewViewer && global.MkdpPreviewViewer.__installed) {
    return
  }

  var VIEWER_ID = 'mkdp-preview-viewer'
  var CLICK_CLOSE_THRESHOLD = 4

  var viewerState = null

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
  }

  function getStagePadding() {
    if (!viewerState || !viewerState.stage) {
      return { top: 0, right: 0, bottom: 0, left: 0 }
    }

    var styles = window.getComputedStyle(viewerState.stage)

    return {
      top: parseFloat(styles.paddingTop) || 0,
      right: parseFloat(styles.paddingRight) || 0,
      bottom: parseFloat(styles.paddingBottom) || 0,
      left: parseFloat(styles.paddingLeft) || 0
    }
  }

  function isBackdropTarget(target, state) {
    var activeState = state || viewerState
    if (!activeState) {
      return false
    }

    return target === activeState.overlay || target === activeState.viewport || target === activeState.stage
  }

  function parseSvgSize(svg) {
    var widthAttr = parseFloat(svg.getAttribute('width'))
    var heightAttr = parseFloat(svg.getAttribute('height'))

    if (widthAttr && heightAttr) {
      return { width: widthAttr, height: heightAttr }
    }

    var viewBox = (svg.getAttribute('viewBox') || '').trim().split(/\s+/)
    if (viewBox.length === 4) {
      var width = parseFloat(viewBox[2])
      var height = parseFloat(viewBox[3])

      if (width && height) {
        return { width: width, height: height }
      }
    }

    return {
      width: svg.clientWidth || 960,
      height: svg.clientHeight || 640
    }
  }

  function createButton(label, title, onClick) {
    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'mkdp-preview-toolbar-btn'
    button.textContent = label
    button.title = title
    button.setAttribute('aria-label', title)
    button.addEventListener('click', onClick)
    return button
  }

  function applyTransform() {
    if (!viewerState || !viewerState.content) {
      return
    }

    viewerState.content.style.transform = 'translate(' + viewerState.translateX + 'px, ' + viewerState.translateY + 'px) scale(' + viewerState.scale + ')'

    if (viewerState.scaleLabel) {
      viewerState.scaleLabel.textContent = Math.round(viewerState.scale * 100) + '%'
    }
  }

  function fitContent() {
    if (!viewerState || !viewerState.content) {
      return
    }

    var viewportRect = viewerState.viewport.getBoundingClientRect()
    var padding = getStagePadding()
    var width = viewerState.baseSize.width
    var height = viewerState.baseSize.height
    var paddedWidth = Math.max(viewportRect.width - padding.left - padding.right, 120)
    var paddedHeight = Math.max(viewportRect.height - padding.top - padding.bottom, 120)
    var fitScale = Math.min(paddedWidth / width, paddedHeight / height, 1)

    viewerState.scale = clamp(fitScale, 0.2, 6)
    viewerState.translateX = 0
    viewerState.translateY = 0
    viewerState.defaultScale = viewerState.scale
    applyTransform()
  }

  function zoomAtPoint(nextScale, clientX, clientY) {
    if (!viewerState || !viewerState.content) {
      return
    }

    var previousScale = viewerState.scale
    var scale = clamp(nextScale, 0.2, 6)

    if (scale === previousScale) {
      return
    }

    var rect = viewerState.viewport.getBoundingClientRect()
    var offsetX = clientX - rect.left - rect.width / 2
    var offsetY = clientY - rect.top - rect.height / 2
    var ratio = scale / previousScale

    viewerState.translateX = offsetX - (offsetX - viewerState.translateX) * ratio
    viewerState.translateY = offsetY - (offsetY - viewerState.translateY) * ratio
    viewerState.scale = scale
    applyTransform()
  }

  function resetPointerState() {
    if (!viewerState) {
      return
    }

    viewerState.dragging = false
    viewerState.dragStartX = 0
    viewerState.dragStartY = 0
    viewerState.pointerStartX = 0
    viewerState.pointerStartY = 0
    viewerState.pointerMoved = false
    viewerState.pointerDownTarget = null

    if (viewerState.viewport) {
      viewerState.viewport.classList.remove('is-dragging')
    }
  }

  function closeViewer() {
    if (!viewerState || !viewerState.overlay) {
      return
    }

    resetPointerState()
    viewerState.overlay.classList.remove('is-open')
    viewerState.overlay.setAttribute('aria-hidden', 'true')
    viewerState.stage.innerHTML = ''
    viewerState.content = null
    viewerState.activeSource = null
    document.body.classList.remove('mkdp-preview-open')
  }

  function openViewer(source, kind) {
    if (!viewerState) {
      return
    }

    resetPointerState()

    var content = kind === 'svg'
      ? source.cloneNode(true)
      : new window.Image()

    if (kind === 'image') {
      content.src = source.currentSrc || source.src
      content.alt = source.alt || ''
      content.decoding = 'async'
    }

    content.setAttribute('class', 'mkdp-preview-content ' + (kind === 'svg' ? 'is-svg' : 'is-image'))
    content.draggable = false

    if (kind === 'svg') {
      var svgSize = parseSvgSize(source)
      viewerState.baseSize = {
        width: svgSize.width,
        height: svgSize.height
      }
      content.removeAttribute('style')
      content.setAttribute('width', svgSize.width)
      content.setAttribute('height', svgSize.height)
    } else {
      var updateSize = function () {
        viewerState.baseSize = {
          width: content.naturalWidth || source.width || 960,
          height: content.naturalHeight || source.height || 640
        }
        fitContent()
      }

      if (content.complete) {
        updateSize()
      } else {
        content.addEventListener('load', updateSize, { once: true })
      }
    }

    viewerState.stage.innerHTML = ''
    viewerState.stage.appendChild(content)
    viewerState.content = content
    viewerState.activeSource = source
    viewerState.overlay.classList.add('is-open')
    viewerState.overlay.setAttribute('aria-hidden', 'false')
    document.body.classList.add('mkdp-preview-open')

    if (kind === 'svg') {
      fitContent()
    }
  }

  function ensureViewer() {
    if (viewerState) {
      return viewerState
    }

    var existing = document.getElementById(VIEWER_ID)
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing)
    }

    var overlay = document.createElement('div')
    overlay.id = VIEWER_ID
    overlay.className = 'mkdp-preview-viewer'
    overlay.setAttribute('aria-hidden', 'true')

    var viewport = document.createElement('div')
    viewport.className = 'mkdp-preview-viewport'

    var toolbar = document.createElement('div')
    toolbar.className = 'mkdp-preview-toolbar'

    var scaleLabel = document.createElement('span')
    scaleLabel.className = 'mkdp-preview-scale'
    scaleLabel.textContent = '100%'

    var stage = document.createElement('div')
    stage.className = 'mkdp-preview-stage'

    viewerState = {
      overlay: overlay,
      viewport: viewport,
      toolbar: toolbar,
      stage: stage,
      scaleLabel: scaleLabel,
      content: null,
      activeSource: null,
      dragging: false,
      dragStartX: 0,
      dragStartY: 0,
      pointerStartX: 0,
      pointerStartY: 0,
      pointerMoved: false,
      pointerDownTarget: null,
      translateX: 0,
      translateY: 0,
      scale: 1,
      defaultScale: 1,
      baseSize: {
        width: 960,
        height: 640
      }
    }

    toolbar.appendChild(createButton('－', '缩小', function () {
      zoomAtPoint(viewerState.scale - 0.2, window.innerWidth / 2, window.innerHeight / 2)
    }))
    toolbar.appendChild(createButton('＋', '放大', function () {
      zoomAtPoint(viewerState.scale + 0.2, window.innerWidth / 2, window.innerHeight / 2)
    }))
    toolbar.appendChild(createButton('1:1', '原始大小', function () {
      viewerState.scale = 1
      viewerState.translateX = 0
      viewerState.translateY = 0
      applyTransform()
    }))
    toolbar.appendChild(createButton('适应', '适应窗口', fitContent))
    toolbar.appendChild(scaleLabel)
    toolbar.appendChild(createButton('关闭', '关闭预览', closeViewer))

    viewport.appendChild(toolbar)
    viewport.appendChild(stage)
    overlay.appendChild(viewport)
    document.body.appendChild(overlay)

    viewport.addEventListener('wheel', function (event) {
      if (!viewerState.content || event.target.closest('.mkdp-preview-toolbar')) {
        return
      }

      event.preventDefault()
      zoomAtPoint(viewerState.scale + (event.deltaY < 0 ? 0.16 : -0.16), event.clientX, event.clientY)
    }, { passive: false })

    viewport.addEventListener('pointerdown', function (event) {
      if (!viewerState.content || event.target.closest('.mkdp-preview-toolbar') || event.button !== 0) {
        return
      }

      event.preventDefault()
      viewerState.dragging = true
      viewerState.dragStartX = event.clientX - viewerState.translateX
      viewerState.dragStartY = event.clientY - viewerState.translateY
      viewerState.pointerStartX = event.clientX
      viewerState.pointerStartY = event.clientY
      viewerState.pointerMoved = false
      viewerState.pointerDownTarget = event.target
      viewport.classList.add('is-dragging')
    })

    window.addEventListener('pointermove', function (event) {
      if (!viewerState.dragging || !viewerState.content) {
        return
      }

      var distance = Math.hypot(event.clientX - viewerState.pointerStartX, event.clientY - viewerState.pointerStartY)
      if (!viewerState.pointerMoved && distance < CLICK_CLOSE_THRESHOLD) {
        return
      }

      viewerState.pointerMoved = true
      viewerState.translateX = event.clientX - viewerState.dragStartX
      viewerState.translateY = event.clientY - viewerState.dragStartY
      applyTransform()
    })

    window.addEventListener('pointerup', function (event) {
      if (!viewerState.dragging) {
        return
      }

      var shouldClose = !viewerState.pointerMoved &&
        isBackdropTarget(viewerState.pointerDownTarget, viewerState) &&
        isBackdropTarget(event.target, viewerState)

      resetPointerState()

      if (shouldClose) {
        closeViewer()
      }
    })

    window.addEventListener('pointercancel', function () {
      if (viewerState.dragging) {
        resetPointerState()
      }
    })

    window.addEventListener('keydown', function (event) {
      if (!viewerState.overlay.classList.contains('is-open')) {
        return
      }

      if (event.key === 'Escape') {
        closeViewer()
      } else if (event.key === '+' || event.key === '=') {
        zoomAtPoint(viewerState.scale + 0.2, window.innerWidth / 2, window.innerHeight / 2)
      } else if (event.key === '-') {
        zoomAtPoint(viewerState.scale - 0.2, window.innerWidth / 2, window.innerHeight / 2)
      } else if (event.key === '0') {
        fitContent()
      }
    })

    window.addEventListener('resize', function () {
      if (viewerState.overlay.classList.contains('is-open')) {
        fitContent()
      }
    })

    return viewerState
  }

  function bindPreviewNode(node, kind) {
    if (!node || node.dataset.mkdpPreviewBound === 'true') {
      return
    }

    node.dataset.mkdpPreviewBound = 'true'
    node.classList.add('mkdp-previewable')
    node.setAttribute('tabindex', '0')
    node.setAttribute('role', 'button')
    node.setAttribute('aria-label', '打开预览')

    node.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()
      openViewer(node, kind)
    })

    node.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openViewer(node, kind)
      }
    })
  }

  function bindPreviewInteractions(root) {
    var activeRoot = root || document
    ensureViewer()

    Array.prototype.forEach.call(activeRoot.querySelectorAll('.markdown-body img'), function (node) {
      bindPreviewNode(node, 'image')
    })

    Array.prototype.forEach.call(activeRoot.querySelectorAll('.markdown-body .mermaid svg'), function (node) {
      bindPreviewNode(node, 'svg')
    })
  }

  global.MkdpPreviewViewer = {
    __installed: true,
    bindPreviewInteractions: bindPreviewInteractions,
    ensureViewer: ensureViewer,
    openViewer: openViewer,
    closeViewer: closeViewer
  }
})(typeof window !== 'undefined' ? window : this)
