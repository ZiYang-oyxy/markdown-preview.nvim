import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { createPreviewChannel } from '../protocol.js'

const PreviewPane = forwardRef(function PreviewPane({ markdown, onError, onToc, theme }, ref) {
  const iframeRef = useRef(null)
  const channelRef = useRef(null)
  const renderCompleteRef = useRef(Promise.resolve())
  const resolveRenderRef = useRef(null)
  const [rendering, setRendering] = useState(true)
  const [failure, setFailure] = useState('')

  useImperativeHandle(ref, () => ({
    scrollTo(headingId) {
      return channelRef.current?.scrollTo(headingId)
    },
    requestSnapshot() {
      return renderCompleteRef.current.then(() => channelRef.current?.requestSnapshot())
    },
  }), [])

  useEffect(() => {
    const iframe = iframeRef.current
    const channel = createPreviewChannel(iframe, {
      onRendered(message) {
        resolveRenderRef.current?.()
        setRendering(false)
        setFailure('')
        onToc(message.toc)
      },
      onError(message) {
        resolveRenderRef.current?.()
        setRendering(false)
        setFailure(message.message)
        onError(message.message)
      },
      onProtocolError(message) {
        setRendering(false)
        setFailure(message)
        onError(message)
      },
    })
    channelRef.current = channel
    // A fresh browsing context prevents a StrictMode cleanup from leaving the
    // one-time preview handshake bound to an obsolete MessagePort.
    iframe.src = `./preview-frame.html?session=${crypto.randomUUID()}`
    return () => {
      resolveRenderRef.current?.()
      channelRef.current = null
      channel.destroy()
    }
  }, [onError, onToc])

  useEffect(() => {
    setRendering(true)
    setFailure('')
    renderCompleteRef.current = new Promise((resolve) => {
      resolveRenderRef.current = resolve
    })
    channelRef.current?.render(markdown, theme).catch(() => {
      resolveRenderRef.current?.()
      setRendering(false)
      const message = '安全预览无法启动，请刷新页面重试。'
      setFailure(message)
      onError(message)
    })
  }, [markdown, onError, theme])

  return (
    <div className="preview-container">
      <div className="render-line" data-active={rendering ? 'true' : 'false'} />
      <iframe
        className="preview-frame"
        hidden={Boolean(failure)}
        ref={iframeRef}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        title="Markdown 渲染结果"
      />
      {failure ? (
        <section className="preview-failure" role="status" aria-label="预览暂时不可用">
          <p className="eyebrow">安全预览已停止</p>
          <h2>预览暂时不可用</h2>
          <p>{failure}</p>
          <p>源文本和其他临时文档仍保存在当前浏览器中。</p>
        </section>
      ) : null}
      {rendering ? <span className="rendering-label" role="status">正在安全渲染…</span> : null}
    </div>
  )
})

export default PreviewPane
