import { describe, expect, it } from 'vitest'

import { buildExportDocument, escapeHtml } from './export.js'

describe('inert HTML export', () => {
  it('escapes document metadata and emits a restrictive CSP without scripts', () => {
    const html = buildExportDocument({
      title: '<img src=x onerror=alert(1)>',
      bodyHtml: '<h1>Safe</h1><script>alert(1)</script>',
      sanitize: () => '<h1>Safe</h1>',
    })

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain("default-src 'none'")
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/<iframe/i)
    expect(html).not.toMatch(/<foreignObject/i)
  })

  it('escapes all HTML-significant title characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})
