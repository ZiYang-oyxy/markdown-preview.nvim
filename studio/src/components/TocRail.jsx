export function TocList({ onSelect, toc }) {
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

export default function TocRail({ onSelect, toc }) {
  return (
    <aside className="toc-rail" aria-label="本文目录">
      <p className="eyebrow">本文目录</p>
      <TocList onSelect={onSelect} toc={toc} />
    </aside>
  )
}
