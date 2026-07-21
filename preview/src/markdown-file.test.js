import { describe, expect, it } from 'vitest'

import { getDroppedMarkdownFile, readMarkdownFile } from './markdown-file.js'

function fakeFile(name, bytes, overrides = {}) {
  const buffer = Uint8Array.from(bytes).buffer
  return {
    name,
    size: bytes.length,
    arrayBuffer: async () => buffer,
    ...overrides,
  }
}

describe('Markdown file import', () => {
  it('accepts exactly one case-insensitive .md drop', () => {
    const lower = fakeFile('notes.md', [])
    const upper = fakeFile('NOTES.MD', [])

    expect(getDroppedMarkdownFile([lower])).toBe(lower)
    expect(getDroppedMarkdownFile([upper])).toBe(upper)
  })

  it('rejects missing, multiple, and non-.md drops', () => {
    expect(() => getDroppedMarkdownFile([])).toThrow('请拖入一个 .md 文件。')
    expect(() => getDroppedMarkdownFile([
      fakeFile('a.md', []),
      fakeFile('b.md', []),
    ])).toThrow('一次只能拖入一个 .md 文件。')
    expect(() => getDroppedMarkdownFile([fakeFile('notes.markdown', [])]))
      .toThrow('仅支持 .md 文件。')
  })

  it('reads valid UTF-8 and preserves the size limit', async () => {
    const bytes = [...new TextEncoder().encode('# 拖入成功')]

    await expect(readMarkdownFile(fakeFile('notes.md', bytes)))
      .resolves.toBe('# 拖入成功')
    await expect(readMarkdownFile(fakeFile('large.md', [], { size: 1024 * 1024 + 1 })))
      .rejects.toThrow('单份文档不能超过 1 MiB。')
  })

  it('reports invalid UTF-8 and file read failures', async () => {
    await expect(readMarkdownFile(fakeFile('invalid.md', [0xc3, 0x28])))
      .rejects.toThrow('文件不是有效的 UTF-8 文本。')
    await expect(readMarkdownFile(fakeFile('broken.md', [], {
      arrayBuffer: async () => { throw new Error('disk error') },
    }))).rejects.toThrow('无法读取文件。')
  })
})
