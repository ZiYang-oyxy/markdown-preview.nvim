import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './styles.css'

function StudioShell() {
  return (
    <div className="studio-shell">
      <header className="app-header">
        <a className="brand" href="./" aria-label="Markdown Studio 首页">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>Markdown Studio</span>
        </a>
        <div className="header-actions" aria-label="应用操作">
          <button className="quiet-button" type="button">主题</button>
          <button className="primary-button" type="button">粘贴新文档</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="document-rail" aria-label="临时文档">
          <div>
            <p className="eyebrow">本地工作区</p>
            <h2>临时文档</h2>
          </div>
          <div className="empty-rail">
            <span aria-hidden="true">＋</span>
            <p>粘贴后会在这里保留，不覆盖其他文档。</p>
          </div>
        </aside>

        <main className="reading-workspace">
          <section className="empty-state" aria-labelledby="empty-title">
            <span className="empty-symbol" aria-hidden="true">M↓</span>
            <p className="eyebrow">Paste · Read · Keep local</p>
            <h1 id="empty-title">把 Markdown 变成舒适的阅读页面</h1>
            <p>
              粘贴 AI 输出或导入 <code>.md</code> 文件；Markdown、代码块和
              Mermaid 图都会在隔离预览中渲染。
            </p>
            <div className="empty-actions">
              <button className="primary-button" type="button">粘贴新文档</button>
              <button className="secondary-button" type="button">导入 .md</button>
            </div>
            <small>内容只保存在当前浏览器，不会上传。</small>
          </section>

          <iframe
            className="preview-frame"
            hidden
            referrerPolicy="no-referrer"
            sandbox="allow-scripts"
            src="./studio-preview.html"
            title="Markdown 渲染结果"
          />
        </main>

        <aside className="toc-rail" aria-label="本文目录">
          <p className="eyebrow">本文目录</p>
          <p>创建文档后自动生成</p>
        </aside>
      </div>

      <button className="mobile-create" type="button" aria-label="粘贴新文档">＋</button>

      <dialog aria-label="粘贴 Markdown" />
      <dialog aria-label="查看或编辑源文本" />
      <div hidden data-sheet="documents" aria-label="临时文档列表" />
      <div hidden data-sheet="toc" aria-label="本文目录" />
    </div>
  )
}

createRoot(document.querySelector('#root')).render(
  <StrictMode>
    <StudioShell />
  </StrictMode>,
)
