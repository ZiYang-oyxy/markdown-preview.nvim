import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
const documentRailSource = readFileSync(
  new URL('./components/DocumentRail.jsx', import.meta.url),
  'utf8',
)
const tocRailSource = readFileSync(
  new URL('./components/TocRail.jsx', import.meta.url),
  'utf8',
)
const stylesSource = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('desktop page-index side rails', () => {
  it('renders semantic document and toc restore handles only for collapsed rails', () => {
    expect(appSource).toContain("railsCollapsed.documents ? (")
    expect(appSource).toContain('rail-restore-handle--documents')
    expect(appSource).toContain('>文档</span>')
    expect(appSource).toContain("railsCollapsed.toc ? (")
    expect(appSource).toContain('rail-restore-handle--toc')
    expect(appSource).toContain('>目录</span>')
    expect(appSource).toContain("aria-label=\"展开临时文档栏\"")
    expect(appSource).toContain("aria-label=\"展开本文目录栏\"")
  })

  it('integrates each collapse action into its rail heading', () => {
    expect(documentRailSource).toContain('className="rail-collapse-button"')
    expect(documentRailSource.indexOf('className="rail-heading"')).toBeLessThan(
      documentRailSource.indexOf('className="rail-collapse-button"'),
    )
    expect(tocRailSource).toContain('className="rail-heading rail-heading--toc"')
    expect(tocRailSource).toContain('className="rail-collapse-button"')
    expect(tocRailSource).toContain('<h2>本文目录</h2>')
  })

  it('removes collapsed rails from layout and styles edge-bound restore handles', () => {
    expect(stylesSource).toMatch(
      /\.workspace\[data-rail-documents="collapsed"\]\s*{[^}]*--rail-documents-width:\s*0px/s,
    )
    expect(stylesSource).toMatch(
      /\.workspace\[data-rail-toc="collapsed"\]\s*{[^}]*--rail-toc-width:\s*0px/s,
    )
    expect(stylesSource).toContain('.rail-restore-handle')
    expect(stylesSource).toContain('.rail-restore-handle--documents')
    expect(stylesSource).toContain('.rail-restore-handle--toc')
    expect(stylesSource).toMatch(
      /\.document-rail\[data-collapsed="true"\][\s\S]*border-color:\s*transparent/,
    )
    expect(stylesSource).toMatch(
      /\.rail-restore-handle--documents:hover\s*{[^}]*transform:\s*translateX\(-1px\)/s,
    )
    expect(stylesSource).toMatch(
      /\.rail-restore-handle--toc:hover\s*{[^}]*transform:\s*translateX\(1px\)/s,
    )
  })

  it('keeps handles desktop-only and respects reduced motion', () => {
    expect(stylesSource).toMatch(
      /@media\s*\(max-width:\s*1179px\)[\s\S]*\.rail-restore-handle[\s\S]*display:\s*none/,
    )
    expect(stylesSource).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.workspace[\s\S]*transition:\s*none/,
    )
  })
})
