export default function DocumentToolbar({ document, exporting, onDelete, onExport, onSource }) {
  return (
    <div className="document-toolbar">
      <div className="toolbar-title">
        <p className="eyebrow">正在阅读</p>
        <strong>{document.title}</strong>
      </div>
      <div className="toolbar-actions">
        <span className="saved-state"><span aria-hidden="true">●</span> 已保存到本地</span>
        <button className="secondary-button compact-button" onClick={onSource} type="button">
          查看源文本
        </button>
        <button className="secondary-button compact-button" disabled={exporting} onClick={onExport} type="button">
          {exporting ? '正在导出…' : '导出 HTML'}
        </button>
        <button className="danger-button compact-button" onClick={onDelete} type="button">
          删除当前文档
        </button>
      </div>
    </div>
  )
}
