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
          className="icon-button mobile-theme-button"
          onClick={onToggleTheme}
          type="button"
          aria-label={theme === 'light' ? '切换深色主题' : '切换浅色主题'}
        >
          <Icon>
            {theme === 'light' ? (
              <path d="M19 15.5A7.8 7.8 0 0 1 8.5 5 7.8 7.8 0 1 0 19 15.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
            ) : (
              <>
                <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
              </>
            )}
          </Icon>
        </button>
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

      <a className="brand" href="./" aria-label="Markdown Preview 首页">
        <img
          alt="Markdown Preview"
          className="brand-mark"
          height="34"
          src="./icon-192.png"
          width="34"
        />
        <span className="brand-name">Markdown Preview</span>
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
