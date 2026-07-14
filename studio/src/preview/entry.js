import 'highlight.js/styles/github.css'
import 'katex/dist/katex.min.css'
import './preview.css'

import {
  PROTOCOL_VERSION,
  validateInitMessage,
  validateShellMessage,
} from '../protocol.js'
import { renderMarkdown } from './render-markdown.js'

const root = document.querySelector('#preview-root')
let initialized = false

function initialize(event) {
  if (initialized || event.source !== window.parent || event.ports.length !== 1) return
  const validation = validateInitMessage(event.data)
  if (!validation.ok) return

  initialized = true
  window.removeEventListener('message', initialize)
  const { token } = event.data
  const [port] = event.ports
  let lastRenderId = 0

  function post(type, fields = {}) {
    port.postMessage({ type, version: PROTOCOL_VERSION, token, ...fields })
  }

  port.onmessage = async ({ data }) => {
    const message = validateShellMessage(data, { token, lastRenderId })
    if (!message.ok) return

    if (data.type === 'render') {
      lastRenderId = data.renderId
      try {
        const result = await renderMarkdown(data.markdown, root, { theme: data.theme })
        if (lastRenderId !== data.renderId) return
        post('rendered', {
          renderId: data.renderId,
          height: Math.min(10_000_000, Math.ceil(document.documentElement.scrollHeight)),
          toc: result.toc,
        })
      } catch {
        if (lastRenderId !== data.renderId) return
        root.replaceChildren()
        const alert = document.createElement('p')
        alert.className = 'preview-fatal-error'
        alert.setAttribute('role', 'alert')
        alert.textContent = '文档渲染失败，请检查内容大小后重试。'
        root.append(alert)
        post('error', { renderId: data.renderId, message: alert.textContent })
      }
      return
    }

    if (data.type === 'scrollTo') {
      document.getElementById(data.headingId)?.scrollIntoView({ block: 'start' })
      return
    }

    post('snapshot', {
      requestId: data.requestId,
      renderId: lastRenderId,
      html: root.innerHTML,
    })
  }
  port.onmessageerror = () => {
    // Ignore malformed structured-clone payloads; the private port remains usable.
  }
  port.start()
  post('ready')
}

window.addEventListener('message', initialize)
