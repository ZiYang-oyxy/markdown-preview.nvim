function Icon({ children, size = 18 }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  )
}

export default function AppHeader({
  hasDocument,
  onCreate,
  onOpenDocuments,
  onOpenToc,
  onToggleTheme,
  theme,
}) {
  return (
    <header className="app-header">
      <div className="mobile-header-actions">
        <button
          className="icon-button"
          disabled={!hasDocument}
          onClick={onOpenDocuments}
          type="button"
          aria-label="打开文档列表"
        >
          <Icon>
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          </Icon>
        </button>
      </div>

      <a className="brand" href="./" aria-label="Markdown Studio 首页">
        <span className="brand-mark" aria-hidden="true">M</span>
        <span className="brand-name">Markdown Studio</span>
      </a>

      <div className="header-actions" aria-label="应用操作">
        <button
          className="quiet-button"
          onClick={onToggleTheme}
          type="button"
          aria-label={theme === 'light' ? '切换深色主题' : '切换浅色主题'}
        >
          {theme === 'light' ? '深色' : '浅色'}
        </button>
        <button className="primary-button" onClick={onCreate} type="button">
          <span aria-hidden="true">＋</span> 粘贴新文档
        </button>
      </div>

      <div className="mobile-header-actions">
        <button
          className="icon-button"
          disabled={!hasDocument}
          onClick={onOpenToc}
          type="button"
          aria-label="打开本文目录"
        >
          <Icon>
            <path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
            <circle cx="4.5" cy="6" fill="currentColor" r="1.2" />
            <circle cx="4.5" cy="12" fill="currentColor" r="1.2" />
            <circle cx="4.5" cy="18" fill="currentColor" r="1.2" />
          </Icon>
        </button>
      </div>
    </header>
  )
}
