import { describe, expect, it, vi } from 'vitest'

import {
  DOCUMENT_KEY_PREFIX,
  INDEX_KEY,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS,
  MAX_TOTAL_BYTES,
  createPreviewStorage,
} from './storage.js'

function createMemoryStorage() {
  const values = new Map()

  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    key(index) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
  }
}

function createStorage(options = {}) {
  let id = 0
  let now = 1_720_000_000_000
  const storage = options.storage ?? createMemoryStorage()
  const eventTarget = options.eventTarget ?? new EventTarget()

  return {
    eventTarget,
    raw: storage,
    preview: createPreviewStorage({
      eventTarget,
      storage,
      idFactory: () => `doc-${++id}`,
      now: () => ++now,
    }),
  }
}

describe('Markdown Preview local storage', () => {
  it('starts with a versioned empty index', () => {
    const { preview } = createStorage()

    expect(preview.loadIndex()).toEqual({
      version: 1,
      activeDocumentId: null,
      documents: [],
    })
  })

  it('creates separate documents and derives readable titles', () => {
    const { preview } = createStorage()

    const first = preview.createDocument('# 第一份文档\n\n正文')
    const second = preview.createDocument('没有标题的第一行\n\n正文')

    expect(first.id).toBe('doc-1')
    expect(first.title).toBe('第一份文档')
    expect(second.id).toBe('doc-2')
    expect(second.title).toBe('没有标题的第一行')
    expect(preview.loadDocument(first.id).markdown).toBe('# 第一份文档\n\n正文')
    expect(preview.loadIndex().documents.map(({ id }) => id)).toEqual([
      'doc-2',
      'doc-1',
    ])
    expect(preview.loadIndex().activeDocumentId).toBe('doc-2')
  })

  it('updates one document without overwriting another', () => {
    const { preview } = createStorage()
    const first = preview.createDocument('# A')
    const second = preview.createDocument('# B')

    preview.updateDocument(first.id, '# A2')

    expect(preview.loadDocument(first.id).markdown).toBe('# A2')
    expect(preview.loadDocument(second.id).markdown).toBe('# B')
    expect(preview.loadIndex().documents[0].id).toBe(first.id)
    expect(preview.loadIndex().documents[0].title).toBe('A2')
  })

  it('deletes a document and selects the next available document', () => {
    const { preview } = createStorage()
    const first = preview.createDocument('# A')
    const second = preview.createDocument('# B')

    preview.deleteDocument(second.id)

    expect(preview.loadDocument(second.id)).toBeNull()
    expect(preview.loadIndex().activeDocumentId).toBe(first.id)
  })

  it('recovers from invalid index and document JSON without executing data', () => {
    const { raw, preview } = createStorage()
    raw.setItem(INDEX_KEY, '{invalid')
    raw.setItem(`${DOCUMENT_KEY_PREFIX}bad`, '{invalid')

    expect(preview.loadIndex()).toEqual({
      version: 1,
      activeDocumentId: null,
      documents: [],
    })
    expect(preview.loadDocument('bad')).toBeNull()
  })

  it('enforces per-document, document-count, and total-byte limits', () => {
    const { preview } = createStorage()

    expect(() => preview.createDocument('a'.repeat(MAX_DOCUMENT_BYTES + 1))).toThrow(
      /1 MiB/,
    )

    for (let index = 0; index < MAX_DOCUMENTS; index += 1) {
      preview.createDocument(`# ${index}`)
    }
    expect(() => preview.createDocument('# overflow')).toThrow(/50/)

    const totalLimited = createStorage().preview
    const chunk = Math.floor(MAX_TOTAL_BYTES / 5)
    totalLimited.createDocument('a'.repeat(chunk))
    totalLimited.createDocument('b'.repeat(chunk))
    totalLimited.createDocument('c'.repeat(chunk))
    totalLimited.createDocument('d'.repeat(chunk))
    totalLimited.createDocument('e'.repeat(chunk))
    expect(() => totalLimited.updateDocument('doc-5', 'f'.repeat(chunk + 8))).toThrow(
      /4 MiB/,
    )
  })

  it('rolls back document data when an index write fails', () => {
    const raw = createMemoryStorage()
    const originalSetItem = raw.setItem.bind(raw)
    let failIndexWrite = false
    raw.setItem = (key, value) => {
      if (failIndexWrite && key === INDEX_KEY) {
        throw new DOMException('quota', 'QuotaExceededError')
      }
      originalSetItem(key, value)
    }
    const { preview } = createStorage({ storage: raw })
    const document = preview.createDocument('# Before')
    failIndexWrite = true

    expect(() => preview.updateDocument(document.id, '# After')).toThrow(/保存失败/)
    expect(preview.loadDocument(document.id).markdown).toBe('# Before')
  })

  it('subscribes only to Markdown Preview storage changes', () => {
    const { eventTarget, preview } = createStorage()
    const listener = vi.fn()
    const unsubscribe = preview.subscribeToStorage(listener)

    const unrelated = new Event('storage')
    Object.defineProperty(unrelated, 'key', { value: 'another-app' })
    eventTarget.dispatchEvent(unrelated)
    const relevant = new Event('storage')
    Object.defineProperty(relevant, 'key', { value: INDEX_KEY })
    eventTarget.dispatchEvent(relevant)

    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})
