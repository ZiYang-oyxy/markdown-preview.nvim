function formatTime(timestamp) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

export function DocumentList({ activeId, documents, onSelect }) {
  if (documents.length === 0) {
    return (
      <div className="empty-rail">
        <span aria-hidden="true">＋</span>
        <p>每次粘贴都会生成一份新文档，不会覆盖已有内容。</p>
      </div>
    )
  }

  return (
    <div className="document-list">
      {documents.map((document) => (
        <button
          aria-current={document.id === activeId ? 'page' : undefined}
          className="document-item"
          key={document.id}
          onClick={() => onSelect(document.id)}
          type="button"
          aria-label={`${document.title}，${formatTime(document.updatedAt)}`}
        >
          <span className="document-title">{document.title}</span>
          <span className="document-meta">
            {formatTime(document.updatedAt)} · {Math.max(1, Math.ceil(document.bytes / 1024))} KiB
          </span>
        </button>
      ))}
    </div>
  )
}

export default function DocumentRail({ activeId, collapsed, documents, onCreate, onSelect, onToggleCollapse }) {
  return (
    <aside className="document-rail" aria-label="临时文档" data-collapsed={collapsed ? 'true' : undefined}>
      {collapsed ? null : (
        <>
          <div className="rail-heading">
            <div>
              <p className="eyebrow">本地工作区</p>
              <h2>临时文档</h2>
            </div>
            <div className="rail-heading-actions">
              <button className="small-icon-button" onClick={onCreate} type="button" aria-label="粘贴新文档">＋</button>
              <button
                aria-expanded="true"
                aria-label="收起临时文档栏"
                className="rail-collapse-button"
                onClick={onToggleCollapse}
                type="button"
              >
                <span aria-hidden="true">‹</span>
              </button>
            </div>
          </div>
          <DocumentList activeId={activeId} documents={documents} onSelect={onSelect} />
          <p className="local-note"><span aria-hidden="true">●</span> 仅保存在此浏览器</p>
        </>
      )}
    </aside>
  )
}
