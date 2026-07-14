import { useEffect, useRef, useState } from 'react'

export default function SourceDialog({ document, onClose, onSave, open }) {
  const dialogRef = useRef(null)
  const timerRef = useRef(null)
  const latestRef = useRef(document?.markdown ?? '')
  const savedRef = useRef(document?.markdown ?? '')
  const [draft, setDraft] = useState(document?.markdown ?? '')

  useEffect(() => {
    if (!open || !document) return
    latestRef.current = document.markdown
    savedRef.current = document.markdown
    setDraft(document.markdown)
    dialogRef.current?.showModal()
  }, [document?.id, open])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  if (!open || !document) return null

  function flush() {
    clearTimeout(timerRef.current)
    if (latestRef.current !== savedRef.current) {
      onSave(latestRef.current)
      savedRef.current = latestRef.current
    }
  }

  function close() {
    flush()
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
          onChange={(event) => change(event.target.value)}
          spellCheck="false"
          value={draft}
        />
        <div className="modal-footer">
          <span>修改会自动保存到当前文档</span>
          <button className="primary-button" onClick={close} type="button">完成</button>
        </div>
      </div>
    </dialog>
  )
}
