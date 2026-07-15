import { useEffect, useRef, useState } from 'react'

export default function PasteDialog({ onClose, onCreate, onImport, open }) {
  const dialogRef = useRef(null)
  const textareaRef = useRef(null)
  const [markdown, setMarkdown] = useState('')
  const [clipboardError, setClipboardError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    setMarkdown('')
    setClipboardError('')
    dialog.showModal()
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [open])

  if (!open) return null

  function close() {
    dialogRef.current?.close()
    onClose()
  }

  async function readClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      setMarkdown(text)
      setClipboardError(text ? '' : '剪贴板里没有文本，请直接粘贴。')
      textareaRef.current?.focus()
    } catch {
      setClipboardError('浏览器没有授予剪贴板权限，请在下方直接粘贴。')
      textareaRef.current?.focus()
    }
  }

  function submit(event) {
    event.preventDefault()
    if (!markdown.trim()) {
      setClipboardError('先粘贴一些 Markdown 文本。')
      textareaRef.current?.focus()
      return
    }
    const createError = onCreate(markdown)
    if (createError) {
      setClipboardError(createError)
      textareaRef.current?.focus()
      return
    }
    close()
  }

  return (
    <dialog
      aria-labelledby="paste-dialog-title"
      className="modal paste-modal"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      ref={dialogRef}
    >
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">创建临时文档</p>
            <h2 id="paste-dialog-title">粘贴 Markdown</h2>
          </div>
          <button className="icon-button" onClick={close} type="button" aria-label="关闭粘贴窗口">×</button>
        </div>

        <div className="paste-tools">
          <button className="secondary-button" onClick={readClipboard} type="button">从剪贴板读取</button>
          <button className="quiet-button" onClick={onImport} type="button">或导入 .md 文件</button>
        </div>

        <label className="textarea-label" htmlFor="paste-markdown">Markdown 源文本</label>
        <textarea
          id="paste-markdown"
          autoComplete="off"
          name="markdown-source"
          onChange={(event) => setMarkdown(event.target.value)}
          placeholder={'# 粘贴你的 Markdown…\n\n```mermaid\ngraph TD\n  A --> B\n```'}
          ref={textareaRef}
          spellCheck="false"
          value={markdown}
        />
        {clipboardError ? <p className="inline-alert" role="alert">{clipboardError}</p> : null}

        <div className="modal-footer">
          <span>{new TextEncoder().encode(markdown).byteLength.toLocaleString()} / 1,048,576 bytes</span>
          <div>
            <button className="quiet-button" onClick={close} type="button">取消</button>
            <button className="primary-button" type="submit">渲染为新文档</button>
          </div>
        </div>
      </form>
    </dialog>
  )
}
