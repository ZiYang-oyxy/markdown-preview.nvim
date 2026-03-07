const VIEWER_ID = 'mkdp-preview-viewer'

let viewerState = null

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const parseSvgSize = (svg) => {
  const widthAttr = parseFloat(svg.getAttribute('width'))
  const heightAttr = parseFloat(svg.getAttribute('height'))

  if (widthAttr && heightAttr) {
    return { width: widthAttr, height: heightAttr }
  }

  const viewBox = (svg.getAttribute('viewBox') || '').trim().split(/\s+/)
  if (viewBox.length === 4) {
    const width = parseFloat(viewBox[2])
    const height = parseFloat(viewBox[3])

    if (width && height) {
      return { width, height }
    }
  }

  return {
    width: svg.clientWidth || 960,
    height: svg.clientHeight || 640
  }
}

const createButton = (label, title, onClick) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'mkdp-preview-toolbar-btn'
  button.textContent = label
  button.title = title
  button.setAttribute('aria-label', title)
  button.addEventListener('click', onClick)
  return button
}

const applyTransform = () => {
  if (!viewerState || !viewerState.content) {
    return
  }

  viewerState.content.style.transform = `translate(${viewerState.translateX}px, ${viewerState.translateY}px) scale(${viewerState.scale})`

  if (viewerState.scaleLabel) {
    viewerState.scaleLabel.textContent = `${Math.round(viewerState.scale * 100)}%`
  }
}

const fitContent = () => {
  if (!viewerState || !viewerState.content) {
    return
  }

  const viewportRect = viewerState.viewport.getBoundingClientRect()
  const { width, height } = viewerState.baseSize
  const paddedWidth = Math.max(viewportRect.width - 80, 120)
  const paddedHeight = Math.max(viewportRect.height - 80, 120)
  const fitScale = Math.min(paddedWidth / width, paddedHeight / height, 1)

  viewerState.scale = clamp(fitScale, 0.2, 6)
  viewerState.translateX = 0
  viewerState.translateY = 0
  viewerState.defaultScale = viewerState.scale
  applyTransform()
}

const zoomAtPoint = (nextScale, clientX, clientY) => {
  if (!viewerState || !viewerState.content) {
    return
  }

  const previousScale = viewerState.scale
  const scale = clamp(nextScale, 0.2, 6)

  if (scale === previousScale) {
    return
  }

  const rect = viewerState.viewport.getBoundingClientRect()
  const offsetX = clientX - rect.left - rect.width / 2
  const offsetY = clientY - rect.top - rect.height / 2
  const ratio = scale / previousScale

  viewerState.translateX = offsetX - (offsetX - viewerState.translateX) * ratio
  viewerState.translateY = offsetY - (offsetY - viewerState.translateY) * ratio
  viewerState.scale = scale
  applyTransform()
}

const closeViewer = () => {
  if (!viewerState || !viewerState.overlay) {
    return
  }

  viewerState.overlay.classList.remove('is-open')
  viewerState.overlay.setAttribute('aria-hidden', 'true')
  viewerState.stage.innerHTML = ''
  viewerState.content = null
  viewerState.activeSource = null
  document.body.classList.remove('mkdp-preview-open')
}

const openViewer = (source, kind) => {
  if (!viewerState) {
    return
  }

  const content = kind === 'svg'
    ? source.cloneNode(true)
    : new window.Image()

  if (kind === 'image') {
    content.src = source.currentSrc || source.src
    content.alt = source.alt || ''
    content.decoding = 'async'
  }

  content.className = `mkdp-preview-content ${kind === 'svg' ? 'is-svg' : 'is-image'}`
  content.draggable = false

  if (kind === 'svg') {
    const { width, height } = parseSvgSize(source)
    viewerState.baseSize = { width, height }
    content.removeAttribute('style')
    content.setAttribute('width', width)
    content.setAttribute('height', height)
  } else {
    const updateSize = () => {
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

const ensureViewer = () => {
  if (viewerState) {
    return viewerState
  }

  const existing = document.getElementById(VIEWER_ID)
  if (existing) {
    existing.parentNode.removeChild(existing)
  }

  const overlay = document.createElement('div')
  overlay.id = VIEWER_ID
  overlay.className = 'mkdp-preview-viewer'
  overlay.setAttribute('aria-hidden', 'true')

  const viewport = document.createElement('div')
  viewport.className = 'mkdp-preview-viewport'

  const toolbar = document.createElement('div')
  toolbar.className = 'mkdp-preview-toolbar'

  const scaleLabel = document.createElement('span')
  scaleLabel.className = 'mkdp-preview-scale'
  scaleLabel.textContent = '100%'

  const stage = document.createElement('div')
  stage.className = 'mkdp-preview-stage'

  const state = {
    overlay,
    viewport,
    toolbar,
    stage,
    scaleLabel,
    content: null,
    activeSource: null,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    translateX: 0,
    translateY: 0,
    scale: 1,
    defaultScale: 1,
    baseSize: {
      width: 960,
      height: 640
    }
  }

  viewerState = state

  toolbar.appendChild(createButton('－', '缩小', () => zoomAtPoint(state.scale - 0.2, window.innerWidth / 2, window.innerHeight / 2)))
  toolbar.appendChild(createButton('＋', '放大', () => zoomAtPoint(state.scale + 0.2, window.innerWidth / 2, window.innerHeight / 2)))
  toolbar.appendChild(createButton('1:1', '原始大小', () => {
    state.scale = 1
    state.translateX = 0
    state.translateY = 0
    applyTransform()
  }))
  toolbar.appendChild(createButton('适应', '适应窗口', fitContent))
  toolbar.appendChild(scaleLabel)
  toolbar.appendChild(createButton('关闭', '关闭预览', closeViewer))

  viewport.appendChild(toolbar)
  viewport.appendChild(stage)
  overlay.appendChild(viewport)
  document.body.appendChild(overlay)

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target === viewport || event.target === stage) {
      closeViewer()
    }
  })

  viewport.addEventListener('wheel', (event) => {
    if (!state.content) {
      return
    }

    event.preventDefault()
    zoomAtPoint(state.scale + (event.deltaY < 0 ? 0.16 : -0.16), event.clientX, event.clientY)
  }, { passive: false })

  viewport.addEventListener('pointerdown', (event) => {
    if (!state.content || event.target.closest('.mkdp-preview-toolbar')) {
      return
    }

    state.dragging = true
    state.dragStartX = event.clientX - state.translateX
    state.dragStartY = event.clientY - state.translateY
    viewport.classList.add('is-dragging')
  })

  window.addEventListener('pointermove', (event) => {
    if (!state.dragging || !state.content) {
      return
    }

    state.translateX = event.clientX - state.dragStartX
    state.translateY = event.clientY - state.dragStartY
    applyTransform()
  })

  window.addEventListener('pointerup', () => {
    if (!state.dragging) {
      return
    }

    state.dragging = false
    viewport.classList.remove('is-dragging')
  })

  window.addEventListener('keydown', (event) => {
    if (!state.overlay.classList.contains('is-open')) {
      return
    }

    if (event.key === 'Escape') {
      closeViewer()
    } else if (event.key === '+' || event.key === '=') {
      zoomAtPoint(state.scale + 0.2, window.innerWidth / 2, window.innerHeight / 2)
    } else if (event.key === '-') {
      zoomAtPoint(state.scale - 0.2, window.innerWidth / 2, window.innerHeight / 2)
    } else if (event.key === '0') {
      fitContent()
    }
  })

  window.addEventListener('resize', () => {
    if (state.overlay.classList.contains('is-open')) {
      fitContent()
    }
  })

  return state
}

const bindPreviewNode = (node, kind) => {
  if (!node || node.dataset.mkdpPreviewBound === 'true') {
    return
  }

  node.dataset.mkdpPreviewBound = 'true'
  node.classList.add('mkdp-previewable')
  node.setAttribute('tabindex', '0')
  node.setAttribute('role', 'button')
  node.setAttribute('aria-label', '打开预览')

  node.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    openViewer(node, kind)
  })

  node.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openViewer(node, kind)
    }
  })
}

export const bindPreviewInteractions = (root = document) => {
  ensureViewer()

  root.querySelectorAll('.markdown-body img').forEach((node) => {
    bindPreviewNode(node, 'image')
  })

  root.querySelectorAll('.markdown-body .mermaid svg').forEach((node) => {
    bindPreviewNode(node, 'svg')
  })
}

export const closePreviewInteractions = closeViewer
