import { useCallback, useEffect, useRef, useState } from 'react'

import AppHeader from './components/AppHeader.jsx'
import DocumentRail, { DocumentList } from './components/DocumentRail.jsx'
import DocumentToolbar from './components/DocumentToolbar.jsx'
import PasteDialog from './components/PasteDialog.jsx'
import PreviewPane from './components/PreviewPane.jsx'
import Sheet from './components/Sheet.jsx'
import SourceDialog from './components/SourceDialog.jsx'
import TocRail, { TocList } from './components/TocRail.jsx'
import { buildExportDocument, downloadHtml, exportFilename } from './export.js'
import { readMarkdownFile } from './markdown-file.js'
import {
  PREFERENCES_KEY,
  createDocument,
  deleteDocument,
  loadDocument,
  loadIndex,
  setActiveDocument,
  subscribeToStorage,
  updateDocument,
} from './storage.js'

function loadPreferences() {
  try {
    return JSON.parse(localStorage.getItem(PREFERENCES_KEY)) || {}
  } catch {
    return {}
  }
}

function loadTheme() {
  return loadPreferences().theme === 'dark' ? 'dark' : 'light'
}

function loadRailsCollapsed() {
  const rails = loadPreferences().rails
  return {
    documents: rails?.documents === true,
    toc: rails?.toc === true,
  }
}

function savePreference(key, value) {
  const preferences = loadPreferences()
  localStorage.setItem(
    PREFERENCES_KEY,
    JSON.stringify({ ...preferences, version: 1, [key]: value }),
  )
}

function loadWorkspace() {
  const index = loadIndex()
  const stored = loadDocument(index.activeDocumentId)
  const metadata = index.documents.find(({ id }) => id === index.activeDocumentId)
  return {
    index,
    document: stored && metadata ? { ...stored, ...metadata } : null,
  }
}

function EmptyState({ onCreate, onImport }) {
  return (
    <section className="empty-state" aria-labelledby="empty-title">
      <span className="empty-symbol" aria-hidden="true">M↓</span>
      <p className="eyebrow">Paste · Read · Keep local</p>
      <h1 id="empty-title">把 Markdown 变成舒适的阅读页面</h1>
      <p>
        粘贴 AI 输出或导入 <code>.md</code> 文件；Markdown、代码块、公式和 Mermaid 图
        都会在隔离环境中渲染。
      </p>
      <div className="empty-actions">
        <button className="primary-button" onClick={onCreate} type="button">粘贴新文档</button>
        <button className="secondary-button" onClick={onImport} type="button">导入 .md</button>
      </div>
      <small><span aria-hidden="true">●</span> 内容只保存在当前浏览器，不会上传</small>
    </section>
  )
}

export default function App() {
  const [workspace, setWorkspace] = useState(loadWorkspace)
  const [theme, setTheme] = useState(loadTheme)
  const [railsCollapsed, setRailsCollapsed] = useState(loadRailsCollapsed)
  const [toc, setToc] = useState(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [documentsOpen, setDocumentsOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [alert, setAlert] = useState('')
  const [status, setStatus] = useState('')
  const [exporting, setExporting] = useState(false)
  const fileInputRef = useRef(null)
  const previewChannelRef = useRef(null)

  const refresh = useCallback((notify = false) => {
    setWorkspace(loadWorkspace())
    if (notify) setStatus('检测到其他标签页的更改')
  }, [])

  useEffect(() => subscribeToStorage(() => refresh(true)), [refresh])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('#theme-color')?.setAttribute(
      'content',
      theme === 'dark' ? '#11151d' : '#f6f8fb',
    )
  }, [theme])

  const handlePreviewError = useCallback((message) => {
    setAlert(message)
    setToc([])
  }, [])
  const handleToc = useCallback((items) => setToc(items), [])

  function create(markdown) {
    try {
      createDocument(markdown)
      setAlert('')
      setToc(null)
      refresh()
      return ''
    } catch (error) {
      setAlert(error.message)
      return error.message
    }
  }

  function selectDocument(id) {
    setActiveDocument(id)
    setDocumentsOpen(false)
    setToc(null)
    refresh()
  }

  function saveSource(markdown) {
    try {
      updateDocument(workspace.document.id, markdown)
      setAlert('')
      setToc(null)
      refresh()
      return ''
    } catch (error) {
      setAlert(error.message)
      return error.message
    }
  }

  function removeDocument() {
    if (!window.confirm(`确认删除“${workspace.document.title}”？此操作无法撤销。`)) return false
    deleteDocument(workspace.document.id)
    setToc(null)
    refresh()
    return true
  }

  function removeDocumentFromSheet() {
    if (removeDocument()) setDocumentsOpen(false)
  }

  async function importFile(event) {
    const [file] = event.target.files
    event.target.value = ''
    if (!file) return
    try {
      const markdown = await readMarkdownFile(file)
      const createError = create(markdown)
      if (!createError) setPasteOpen(false)
    } catch (error) {
      setAlert(error.message)
    }
  }

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    savePreference('theme', next)
  }

  function toggleRail(key) {
    setRailsCollapsed((current) => {
      const next = { ...current, [key]: !current[key] }
      savePreference('rails', next)
      return next
    })
  }

  function scrollToHeading(id) {
    previewChannelRef.current?.scrollTo?.(id)
    setTocOpen(false)
  }

  async function exportDocument() {
    setExporting(true)
    try {
      const bodyHtml = await previewChannelRef.current.requestSnapshot()
      const html = buildExportDocument({ title: workspace.document.title, bodyHtml })
      downloadHtml(html, exportFilename(workspace.document.title))
      setStatus('HTML 已导出；文件不包含脚本或远程资源')
    } catch (error) {
      setAlert(`导出失败：${error.message || '请重试。'}`)
    } finally {
      setExporting(false)
    }
  }

  const active = workspace.document

  return (
    <div className="preview-shell" data-theme={theme}>
      <a className="skip-link" href="#main-content">跳到正文</a>
      <AppHeader
        hasDocument={Boolean(active)}
        onCreate={() => setPasteOpen(true)}
        onOpenDocuments={() => setDocumentsOpen(true)}
        onOpenToc={() => setTocOpen(true)}
        onToggleTheme={toggleTheme}
        theme={theme}
      />

      <div
        className="workspace"
        data-rail-documents={railsCollapsed.documents ? 'collapsed' : undefined}
        data-rail-toc={railsCollapsed.toc ? 'collapsed' : undefined}
      >
        <DocumentRail
          activeId={workspace.index.activeDocumentId}
          collapsed={railsCollapsed.documents}
          documents={workspace.index.documents}
          onCreate={() => setPasteOpen(true)}
          onSelect={selectDocument}
          onToggleCollapse={() => toggleRail('documents')}
        />

        <main className="reading-workspace" id="main-content" tabIndex="-1">
          {railsCollapsed.documents ? (
            <button
              aria-expanded="false"
              aria-label="展开临时文档栏"
              className="rail-restore-handle rail-restore-handle--documents"
              onClick={() => toggleRail('documents')}
              type="button"
            >
              <span className="rail-restore-icon" aria-hidden="true">▤</span>
              <span>文档</span>
            </button>
          ) : null}
          {railsCollapsed.toc ? (
            <button
              aria-expanded="false"
              aria-label="展开本文目录栏"
              className="rail-restore-handle rail-restore-handle--toc"
              onClick={() => toggleRail('toc')}
              type="button"
            >
              <span className="rail-restore-icon" aria-hidden="true">≡</span>
              <span>目录</span>
            </button>
          ) : null}
          {alert ? <div className="app-alert" role="alert">{alert}<button onClick={() => setAlert('')} type="button" aria-label="关闭提示">×</button></div> : null}
          {status ? <div className="sync-status" role="status">{status}</div> : null}
          {active ? (
            <>
              <DocumentToolbar
                document={active}
                exporting={exporting}
                onDelete={removeDocument}
                onExport={exportDocument}
                onSource={() => setSourceOpen(true)}
              />
              <PreviewPane
                key={active.id}
                markdown={active.markdown}
                onError={handlePreviewError}
                onToc={handleToc}
                ref={previewChannelRef}
                theme={theme}
              />
            </>
          ) : (
            <EmptyState onCreate={() => setPasteOpen(true)} onImport={() => fileInputRef.current?.click()} />
          )}
        </main>

        <TocRail
          collapsed={railsCollapsed.toc}
          onSelect={scrollToHeading}
          onToggleCollapse={() => toggleRail('toc')}
          toc={active ? toc : []}
        />
      </div>

      <button className="mobile-create" onClick={() => setPasteOpen(true)} type="button" aria-label="新建文档">＋</button>
      <input
        accept=".md,.markdown,text/markdown,text/plain"
        aria-label="导入 Markdown 文件"
        autoComplete="off"
        className="visually-hidden"
        name="markdown-file"
        onChange={importFile}
        ref={fileInputRef}
        type="file"
      />

      <PasteDialog
        onClose={() => setPasteOpen(false)}
        onCreate={create}
        onImport={() => fileInputRef.current?.click()}
        open={pasteOpen}
      />
      <SourceDialog
        document={active}
        onClose={() => setSourceOpen(false)}
        onSave={saveSource}
        open={sourceOpen}
      />

      <Sheet label="临时文档" onClose={() => setDocumentsOpen(false)} open={documentsOpen}>
        <DocumentList
          activeId={workspace.index.activeDocumentId}
          documents={workspace.index.documents}
          onSelect={selectDocument}
        />
        {active ? (
          <button className="danger-button sheet-delete" onClick={removeDocumentFromSheet} type="button">
            删除当前文档
          </button>
        ) : null}
      </Sheet>
      <Sheet label="本文目录" onClose={() => setTocOpen(false)} open={tocOpen}>
        <TocList onSelect={scrollToHeading} toc={active ? toc : []} />
      </Sheet>
    </div>
  )
}
