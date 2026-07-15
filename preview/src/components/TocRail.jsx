export function TocList({ onSelect, toc }) {
  if (toc === null) return <p className="toc-empty" role="status">正在生成目录…</p>
  if (toc.length === 0) return <p className="toc-empty">当前文档没有可用标题</p>
  return (
    <nav className="toc-list" aria-label="文档章节">
      {toc.map((item) => (
        <button
          className={`toc-level-${item.level}`}
          key={item.id}
          onClick={() => onSelect(item.id)}
          type="button"
          aria-label={`跳转到${item.text}`}
        >
          {item.text}
        </button>
      ))}
    </nav>
  )
}

export default function TocRail({ collapsed, onSelect, onToggleCollapse, toc }) {
  return (
    <aside className="toc-rail" aria-label="本文目录" data-collapsed={collapsed ? 'true' : undefined}>
      {collapsed ? null : (
        <>
          <div className="rail-heading rail-heading--toc">
            <div>
              <p className="eyebrow">文档导航</p>
              <h2>本文目录</h2>
            </div>
            <button
              aria-expanded="true"
              aria-label="收起本文目录栏"
              className="rail-collapse-button"
              onClick={onToggleCollapse}
              type="button"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <TocList onSelect={onSelect} toc={toc} />
        </>
      )}
    </aside>
  )
}
