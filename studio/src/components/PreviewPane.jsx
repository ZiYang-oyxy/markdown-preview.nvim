import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { createPreviewChannel } from '../protocol.js'

const PreviewPane = forwardRef(function PreviewPane({ markdown, onError, onToc, theme }, ref) {
  const iframeRef = useRef(null)
  const channelRef = useRef(null)
  const [rendering, setRendering] = useState(true)

  useImperativeHandle(ref, () => ({
    scrollTo(headingId) {
      return channelRef.current?.scrollTo(headingId)
    },
  }), [])

  useEffect(() => {
    const iframe = iframeRef.current
    const channel = createPreviewChannel(iframe, {
      onRendered(message) {
        setRendering(false)
        onToc(message.toc)
      },
      onError(message) {
        setRendering(false)
        onError(message.message)
      },
      onProtocolError(message) {
        onError(message)
      },
    })
    channelRef.current = channel
    // A fresh browsing context prevents a StrictMode cleanup from leaving the
    // one-time preview handshake bound to an obsolete MessagePort.
    iframe.src = `./studio-preview.html?session=${crypto.randomUUID()}`
    return () => {
      channelRef.current = null
      channel.destroy()
    }
  }, [onError, onToc])

  useEffect(() => {
    setRendering(true)
    channelRef.current?.render(markdown, theme).catch(() => {
      setRendering(false)
      onError('安全预览无法启动，请刷新页面重试。')
    })
  }, [markdown, onError, theme])

  return (
    <div className="preview-container">
      <div className="render-line" data-active={rendering ? 'true' : 'false'} />
      <iframe
        className="preview-frame"
        ref={iframeRef}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts"
        title="Markdown 渲染结果"
      />
      {rendering ? <span className="rendering-label" role="status">正在安全渲染…</span> : null}
    </div>
  )
})

export default PreviewPane
