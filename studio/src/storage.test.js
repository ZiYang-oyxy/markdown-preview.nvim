import { describe, expect, it, vi } from 'vitest'

import {
  DOCUMENT_KEY_PREFIX,
  INDEX_KEY,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS,
  MAX_TOTAL_BYTES,
  createStudioStorage,
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
    studio: createStudioStorage({
      eventTarget,
      storage,
      idFactory: () => `doc-${++id}`,
      now: () => ++now,
    }),
  }
}

describe('Markdown Studio local storage', () => {
  it('starts with a versioned empty index', () => {
    const { studio } = createStorage()

    expect(studio.loadIndex()).toEqual({
      version: 1,
      activeDocumentId: null,
      documents: [],
    })
  })

  it('creates separate documents and derives readable titles', () => {
    const { studio } = createStorage()

    const first = studio.createDocument('# 第一份文档\n\n正文')
    const second = studio.createDocument('没有标题的第一行\n\n正文')

    expect(first.id).toBe('doc-1')
    expect(first.title).toBe('第一份文档')
    expect(second.id).toBe('doc-2')
    expect(second.title).toBe('没有标题的第一行')
    expect(studio.loadDocument(first.id).markdown).toBe('# 第一份文档\n\n正文')
    expect(studio.loadIndex().documents.map(({ id }) => id)).toEqual([
      'doc-2',
      'doc-1',
    ])
    expect(studio.loadIndex().activeDocumentId).toBe('doc-2')
  })

  it('updates one document without overwriting another', () => {
    const { studio } = createStorage()
    const first = studio.createDocument('# A')
    const second = studio.createDocument('# B')

    studio.updateDocument(first.id, '# A2')

    expect(studio.loadDocument(first.id).markdown).toBe('# A2')
    expect(studio.loadDocument(second.id).markdown).toBe('# B')
    expect(studio.loadIndex().documents[0].id).toBe(first.id)
    expect(studio.loadIndex().documents[0].title).toBe('A2')
  })

  it('deletes a document and selects the next available document', () => {
    const { studio } = createStorage()
    const first = studio.createDocument('# A')
    const second = studio.createDocument('# B')

    studio.deleteDocument(second.id)

    expect(studio.loadDocument(second.id)).toBeNull()
    expect(studio.loadIndex().activeDocumentId).toBe(first.id)
  })

  it('recovers from invalid index and document JSON without executing data', () => {
    const { raw, studio } = createStorage()
    raw.setItem(INDEX_KEY, '{invalid')
    raw.setItem(`${DOCUMENT_KEY_PREFIX}bad`, '{invalid')

    expect(studio.loadIndex()).toEqual({
      version: 1,
      activeDocumentId: null,
      documents: [],
    })
    expect(studio.loadDocument('bad')).toBeNull()
  })

  it('enforces per-document, document-count, and total-byte limits', () => {
    const { studio } = createStorage()

    expect(() => studio.createDocument('a'.repeat(MAX_DOCUMENT_BYTES + 1))).toThrow(
      /1 MiB/,
    )

    for (let index = 0; index < MAX_DOCUMENTS; index += 1) {
      studio.createDocument(`# ${index}`)
    }
    expect(() => studio.createDocument('# overflow')).toThrow(/50/)

    const totalLimited = createStorage().studio
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
    const { studio } = createStorage({ storage: raw })
    const document = studio.createDocument('# Before')
    failIndexWrite = true

    expect(() => studio.updateDocument(document.id, '# After')).toThrow(/保存失败/)
    expect(studio.loadDocument(document.id).markdown).toBe('# Before')
  })

  it('subscribes only to Studio storage changes', () => {
    const { eventTarget, studio } = createStorage()
    const listener = vi.fn()
    const unsubscribe = studio.subscribeToStorage(listener)

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
