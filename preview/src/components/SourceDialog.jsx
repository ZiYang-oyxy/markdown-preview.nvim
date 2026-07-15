import { useEffect, useRef, useState } from 'react'

export default function SourceDialog({ document, onClose, onSave, open }) {
  const dialogRef = useRef(null)
  const textareaRef = useRef(null)
  const timerRef = useRef(null)
  const latestRef = useRef(document?.markdown ?? '')
  const savedRef = useRef(document?.markdown ?? '')
  const [draft, setDraft] = useState(document?.markdown ?? '')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!open || !document) return
    latestRef.current = document.markdown
    savedRef.current = document.markdown
    setDraft(document.markdown)
    setSaveError('')
    dialogRef.current?.showModal()
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [document?.id, open])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  if (!open || !document) return null

  function flush() {
    clearTimeout(timerRef.current)
    if (latestRef.current !== savedRef.current) {
      const error = onSave(latestRef.current)
      if (error) {
        setSaveError(error)
        return false
      }
      savedRef.current = latestRef.current
      setSaveError('')
    }
    return true
  }

  function close() {
    if (!flush()) {
      textareaRef.current?.focus()
      return
    }
    dialogRef.current?.close()
    onClose()
  }

  function discardAndClose() {
    if (!window.confirm('确认放弃未保存的修改？此操作无法撤销。')) {
      textareaRef.current?.focus()
      return
    }
    clearTimeout(timerRef.current)
    dialogRef.current?.close()
    onClose()
  }

  function change(value) {
    latestRef.current = value
    setDraft(value)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, 250)
  }

  return (
    <dialog
      aria-labelledby="source-dialog-title"
      className="modal source-modal"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      ref={dialogRef}
    >
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <p className="eyebrow">按需编辑</p>
            <h2 id="source-dialog-title">查看或编辑源文本</h2>
          </div>
          <button className="icon-button" onClick={close} type="button" aria-label="关闭源文本">×</button>
        </div>
        <label className="textarea-label" htmlFor="source-markdown">Markdown 源文本</label>
        <textarea
          id="source-markdown"
          autoComplete="off"
          name="markdown-source"
          onChange={(event) => change(event.target.value)}
          ref={textareaRef}
          spellCheck="false"
          value={draft}
        />
        {saveError ? <p className="inline-alert" role="alert">{saveError} 草稿仍保留在当前窗口。</p> : null}
        <div className="modal-footer">
          <span>修改会自动保存到当前文档</span>
          <div>
            {saveError ? (
              <button className="danger-button" onClick={discardAndClose} type="button">放弃未保存修改</button>
            ) : null}
            <button className="primary-button" onClick={close} type="button">完成</button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
