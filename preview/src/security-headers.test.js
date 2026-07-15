import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')

function section(path) {
  const marker = `\n${path}\n`
  const start = headers.indexOf(marker)
  if (start === -1) return ''
  const contentStart = start + marker.length
  const next = headers.indexOf('\n/', contentStart)
  return headers.slice(contentStart, next === -1 ? undefined : next)
}

describe('deployment security headers', () => {
  it('allows the top-level app to load same-origin brand images', () => {
    expect(section('/')).toContain("img-src 'self' data:")
    expect(section('/index.html')).toContain("img-src 'self' data:")
  })

  it('keeps same-origin images blocked inside the renderer iframe', () => {
    expect(section('/preview-frame.html')).toContain('img-src data:')
    expect(section('/preview-frame.html')).not.toContain("img-src 'self' data:")
  })
})
