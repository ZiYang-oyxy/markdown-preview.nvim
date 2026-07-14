import { useEffect, useRef } from 'react'

export default function Sheet({ children, label, onClose, open }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (open) dialogRef.current?.showModal()
  }, [open])

  if (!open) return null

  function close() {
    dialogRef.current?.close()
    onClose()
  }

  return (
    <dialog
      aria-labelledby={`sheet-${label}`}
      className="sheet"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      ref={dialogRef}
    >
      <div className="sheet-handle" aria-hidden="true" />
      <div className="sheet-header">
        <h2 id={`sheet-${label}`}>{label}</h2>
        <button className="icon-button" onClick={close} type="button" aria-label={`关闭${label}`}>×</button>
      </div>
      <div className="sheet-content">{children}</div>
    </dialog>
  )
}
