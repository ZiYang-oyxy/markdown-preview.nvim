import { describe, expect, it } from 'vitest'

import {
  MAX_MERMAID_BLOCKS,
  MAX_MERMAID_SOURCE_BYTES,
  classifyUrl,
  validateMermaidBlocks,
} from './render-markdown.js'

describe('safe renderer policy', () => {
  it('allows safe links while rejecting executable and protocol-relative URLs', () => {
    expect(classifyUrl('https://example.com')).toBe('link')
    expect(classifyUrl('mailto:hello@example.com')).toBe('link')
    expect(classifyUrl('#section')).toBe('link')
    expect(classifyUrl('javascript:alert(1)')).toBe('blocked')
    expect(classifyUrl('//tracker.example/pixel')).toBe('blocked')
  })

  it('allows only base64 raster data images', () => {
    expect(classifyUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('image')
    expect(classifyUrl('data:image/webp;base64,UklGRg==')).toBe('image')
    expect(classifyUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBe('blocked')
    expect(classifyUrl('https://tracker.example/pixel.png')).toBe('link')
  })

  it('enforces Mermaid block count and UTF-8 source limits', () => {
    expect(validateMermaidBlocks(['graph TD; A-->B'])).toEqual({ ok: true })
    expect(
      validateMermaidBlocks(Array.from({ length: MAX_MERMAID_BLOCKS + 1 }, () => 'graph TD')),
    ).toMatchObject({ ok: false })
    expect(
      validateMermaidBlocks(['中'.repeat(MAX_MERMAID_SOURCE_BYTES)]),
    ).toMatchObject({ ok: false })
  })
})
