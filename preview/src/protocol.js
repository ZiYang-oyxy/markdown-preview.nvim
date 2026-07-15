export const PROTOCOL_VERSION = 1
export const MAX_MARKDOWN_BYTES = 1024 * 1024
export const PREVIEW_RESPONSE_TIMEOUT_MS = 5_000

const encoder = new TextEncoder()
const TOKEN_PATTERN = /^[a-f0-9]{32,128}$/
const HEADING_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/
const MESSAGE_TYPES = new Set(['render', 'scrollTo', 'requestSnapshot'])

function result(ok, error) {
  return ok ? { ok: true } : { ok: false, error }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value, required, optional = []) {
  const keys = Object.keys(value)
  const allowed = new Set([...required, ...optional])
  return required.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key))
}

function hasEnvelope(value, token) {
  return (
    isRecord(value) &&
    value.version === PROTOCOL_VERSION &&
    value.token === token &&
    typeof value.type === 'string'
  )
}

function isSafeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum
}

export function validateInitMessage(value) {
  if (!isRecord(value)) return result(false, '初始化消息必须是对象。')
  if (!hasExactKeys(value, ['type', 'version', 'token'])) {
    return result(false, '初始化消息字段不合法。')
  }
  if (value.type !== 'mkdp:preview-init' || value.version !== PROTOCOL_VERSION) {
    return result(false, '初始化协议版本不受支持。')
  }
  if (typeof value.token !== 'string' || !TOKEN_PATTERN.test(value.token)) {
    return result(false, '初始化令牌不合法。')
  }
  return result(true)
}

export function validateShellMessage(value, { token, lastRenderId }) {
  if (!hasEnvelope(value, token)) return result(false, '消息信封不合法。')
  if (!MESSAGE_TYPES.has(value.type)) return result(false, '消息类型不受支持。')

  if (value.type === 'render') {
    if (!hasExactKeys(value, ['type', 'version', 'token', 'renderId', 'markdown', 'theme'])) {
      return result(false, '渲染消息字段不合法。')
    }
    if (!isSafeInteger(value.renderId, 1) || value.renderId <= lastRenderId) {
      return result(false, '渲染编号已过期。')
    }
    if (
      typeof value.markdown !== 'string' ||
      encoder.encode(value.markdown).byteLength > MAX_MARKDOWN_BYTES
    ) {
      return result(false, 'Markdown 超过安全大小限制。')
    }
    if (value.theme !== 'light' && value.theme !== 'dark') {
      return result(false, '主题值不合法。')
    }
    return result(true)
  }

  if (value.type === 'scrollTo') {
    if (!hasExactKeys(value, ['type', 'version', 'token', 'headingId'])) {
      return result(false, '滚动消息字段不合法。')
    }
    if (typeof value.headingId !== 'string' || !HEADING_ID_PATTERN.test(value.headingId)) {
      return result(false, '标题标识不合法。')
    }
    return result(true)
  }

  if (!hasExactKeys(value, ['type', 'version', 'token', 'requestId'])) {
    return result(false, '快照消息字段不合法。')
  }
  return result(isSafeInteger(value.requestId, 1), '快照请求编号不合法。')
}

function isTocEntry(entry) {
  return (
    isRecord(entry) &&
    hasExactKeys(entry, ['id', 'text', 'level']) &&
    typeof entry.id === 'string' &&
    HEADING_ID_PATTERN.test(entry.id) &&
    typeof entry.text === 'string' &&
    entry.text.length <= 240 &&
    Number.isInteger(entry.level) &&
    entry.level >= 1 &&
    entry.level <= 6
  )
}

export function validatePreviewMessage(value, { token, lastRenderId }) {
  if (!hasEnvelope(value, token)) return result(false, '预览消息信封不合法。')

  if (value.type === 'ready') {
    return result(
      hasExactKeys(value, ['type', 'version', 'token']),
      '就绪消息字段不合法。',
    )
  }

  if (value.type === 'rendered') {
    if (!hasExactKeys(value, ['type', 'version', 'token', 'renderId', 'height', 'toc'])) {
      return result(false, '渲染完成消息字段不合法。')
    }
    if (value.renderId !== lastRenderId) return result(false, '渲染结果已过期。')
    if (!isSafeInteger(value.height) || value.height > 10_000_000) {
      return result(false, '预览高度不合法。')
    }
    if (!Array.isArray(value.toc) || value.toc.length > 500 || !value.toc.every(isTocEntry)) {
      return result(false, '目录数据不合法。')
    }
    return result(true)
  }

  if (value.type === 'snapshot') {
    if (!hasExactKeys(value, ['type', 'version', 'token', 'requestId', 'renderId', 'html'])) {
      return result(false, '快照消息字段不合法。')
    }
    if (
      !isSafeInteger(value.requestId, 1) ||
      value.renderId !== lastRenderId ||
      typeof value.html !== 'string' ||
      value.html.length > 4 * MAX_MARKDOWN_BYTES
    ) {
      return result(false, '快照内容不合法。')
    }
    return result(true)
  }

  if (value.type === 'error') {
    if (!hasExactKeys(value, ['type', 'version', 'token', 'renderId', 'message'])) {
      return result(false, '错误消息字段不合法。')
    }
    return result(
      value.renderId === lastRenderId &&
        typeof value.message === 'string' &&
        value.message.length <= 500,
      '错误消息内容不合法。',
    )
  }

  return result(false, '预览消息类型不受支持。')
}

function createToken() {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createPreviewChannel(iframe, handlers = {}) {
  if (!(iframe instanceof HTMLIFrameElement)) {
    throw new TypeError('preview channel requires an iframe element')
  }

  let token = ''
  let port = null
  let renderId = 0
  let requestId = 0
  let readyResolve
  let readyReject
  let readyTimer = null
  let ready = new Promise((resolve, reject) => {
    readyResolve = resolve
    readyReject = reject
  })
  const snapshots = new Map()

  function closePort(reason = new Error('预览连接已关闭。')) {
    clearTimeout(readyTimer)
    readyTimer = null
    port?.close()
    port = null
    for (const { reject, timer } of snapshots.values()) {
      clearTimeout(timer)
      reject(reason)
    }
    snapshots.clear()
  }

  function onLoad() {
    closePort()
    token = createToken()
    renderId = 0
    readyTimer = setTimeout(() => {
      const error = new Error('安全预览启动超时。')
      readyReject(error)
      closePort(error)
    }, PREVIEW_RESPONSE_TIMEOUT_MS)
    const channel = new MessageChannel()
    port = channel.port1
    port.onmessage = ({ data }) => {
      const validation = validatePreviewMessage(data, { token, lastRenderId: renderId })
      if (!validation.ok) {
        handlers.onProtocolError?.(validation.error)
        return
      }
      if (data.type === 'ready') {
        clearTimeout(readyTimer)
        readyTimer = null
        readyResolve()
      }
      if (data.type === 'rendered') handlers.onRendered?.(data)
      if (data.type === 'error') handlers.onError?.(data)
      if (data.type === 'snapshot') {
        const pending = snapshots.get(data.requestId)
        if (pending) {
          snapshots.delete(data.requestId)
          clearTimeout(pending.timer)
          pending.resolve(data.html)
        }
      }
    }
    port.onmessageerror = () => handlers.onProtocolError?.('预览消息无法解析。')
    port.start()
    iframe.contentWindow.postMessage(
      { type: 'mkdp:preview-init', version: PROTOCOL_VERSION, token },
      '*',
      [channel.port2],
    )
  }

  iframe.addEventListener('load', onLoad)

  return {
    get ready() {
      return ready
    },
    async render(markdown, theme = 'light') {
      await ready
      renderId += 1
      port.postMessage({
        type: 'render',
        version: PROTOCOL_VERSION,
        token,
        renderId,
        markdown,
        theme,
      })
      return renderId
    },
    async scrollTo(headingId) {
      await ready
      port.postMessage({
        type: 'scrollTo',
        version: PROTOCOL_VERSION,
        token,
        headingId,
      })
    },
    async requestSnapshot() {
      await ready
      requestId += 1
      const response = new Promise((resolve, reject) => {
        const currentRequestId = requestId
        const timer = setTimeout(() => {
          snapshots.delete(currentRequestId)
          reject(new Error('预览响应超时，请刷新页面后重试。'))
        }, PREVIEW_RESPONSE_TIMEOUT_MS)
        snapshots.set(currentRequestId, { resolve, reject, timer })
      })
      port.postMessage({
        type: 'requestSnapshot',
        version: PROTOCOL_VERSION,
        token,
        requestId,
      })
      return response
    },
    destroy() {
      iframe.removeEventListener('load', onLoad)
      readyReject?.(new Error('预览连接已销毁。'))
      closePort()
    },
  }
}
