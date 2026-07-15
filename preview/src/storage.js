export const INDEX_KEY = 'mkdp-preview:index:v1'
export const PREFERENCES_KEY = 'mkdp-preview:preferences:v1'
export const DOCUMENT_KEY_PREFIX = 'mkdp-preview:document:'
export const MAX_DOCUMENTS = 50
export const MAX_DOCUMENT_BYTES = 1024 * 1024
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024

const INDEX_VERSION = 1
const EMPTY_TITLE = '未命名文档'
const PREVIEW_KEY_PREFIX = 'mkdp-preview:'
const TITLE_LIMIT = 80
const ATX_HEADING = /^ {0,3}#\s+(.+?)\s*#*\s*$/
const encoder = new TextEncoder()

function emptyIndex() {
  return {
    version: INDEX_VERSION,
    activeDocumentId: null,
    documents: [],
  }
}

function parseJson(value) {
  if (value === null) return null

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function isDocumentMetadata(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number' &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes >= 0
  )
}

function isIndex(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    value.version === INDEX_VERSION &&
    (value.activeDocumentId === null ||
      typeof value.activeDocumentId === 'string') &&
    Array.isArray(value.documents) &&
    value.documents.every(isDocumentMetadata)
  )
}

function isStoredDocument(value, expectedId) {
  return (
    value !== null &&
    typeof value === 'object' &&
    value.version === INDEX_VERSION &&
    value.id === expectedId &&
    typeof value.markdown === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number'
  )
}

function utf8Bytes(value) {
  return encoder.encode(value).byteLength
}

function deriveTitle(markdown) {
  const lines = markdown.split(/\r?\n/)
  let fallback = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const heading = ATX_HEADING.exec(line)
    if (heading) return heading[1].trim().slice(0, TITLE_LIMIT)
    if (!fallback) fallback = trimmed
  }

  return (fallback || EMPTY_TITLE).slice(0, TITLE_LIMIT)
}

function defaultIdFactory() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function storageError(cause) {
  return new Error('保存失败：浏览器本地存储空间不足或不可用。', { cause })
}

export function createPreviewStorage({
  storage = globalThis.localStorage,
  eventTarget = globalThis,
  idFactory = defaultIdFactory,
  now = Date.now,
} = {}) {
  if (!storage) throw new Error('当前环境不支持 localStorage。')

  function loadIndex() {
    const parsed = parseJson(storage.getItem(INDEX_KEY))
    return isIndex(parsed) ? parsed : emptyIndex()
  }

  function loadDocument(id) {
    if (typeof id !== 'string' || id.length === 0) return null
    const parsed = parseJson(storage.getItem(`${DOCUMENT_KEY_PREFIX}${id}`))
    return isStoredDocument(parsed, id) ? parsed : null
  }

  function assertCapacity(index, markdown, replacingId = null) {
    const bytes = utf8Bytes(markdown)
    if (bytes > MAX_DOCUMENT_BYTES) {
      throw new Error('单份文档不能超过 1 MiB。')
    }

    if (replacingId === null && index.documents.length >= MAX_DOCUMENTS) {
      throw new Error('最多只能保留 50 份临时文档。')
    }

    let totalBytes = bytes
    for (const document of index.documents) {
      if (document.id !== replacingId) totalBytes += document.bytes
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error('全部临时文档合计不能超过 4 MiB。')
    }

    return bytes
  }

  function createDocument(markdown) {
    if (typeof markdown !== 'string') throw new TypeError('Markdown 必须是文本。')

    const index = loadIndex()
    const bytes = assertCapacity(index, markdown)
    const id = idFactory()
    const timestamp = now()
    const document = {
      version: INDEX_VERSION,
      id,
      markdown,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const metadata = {
      id,
      title: deriveTitle(markdown),
      titleMode: 'auto',
      createdAt: timestamp,
      updatedAt: timestamp,
      bytes,
    }
    const documentKey = `${DOCUMENT_KEY_PREFIX}${id}`

    try {
      storage.setItem(documentKey, JSON.stringify(document))
      storage.setItem(
        INDEX_KEY,
        JSON.stringify({
          ...index,
          activeDocumentId: id,
          documents: [metadata, ...index.documents],
        }),
      )
    } catch (cause) {
      try {
        storage.removeItem(documentKey)
      } catch {
        // An orphaned key is harmless and can be reclaimed by a later cleanup.
      }
      throw storageError(cause)
    }

    return metadata
  }

  function updateDocument(id, markdown) {
    if (typeof markdown !== 'string') throw new TypeError('Markdown 必须是文本。')

    const previousDocument = loadDocument(id)
    if (!previousDocument) throw new Error('找不到要更新的文档。')

    const index = loadIndex()
    const previousMetadata = index.documents.find((document) => document.id === id)
    if (!previousMetadata) throw new Error('文档索引已损坏，请重新粘贴该文档。')

    const bytes = assertCapacity(index, markdown, id)
    const timestamp = now()
    const nextDocument = {
      ...previousDocument,
      markdown,
      updatedAt: timestamp,
    }
    const nextMetadata = {
      ...previousMetadata,
      title:
        previousMetadata.titleMode === 'auto'
          ? deriveTitle(markdown)
          : previousMetadata.title,
      updatedAt: timestamp,
      bytes,
    }
    const documentKey = `${DOCUMENT_KEY_PREFIX}${id}`
    const nextDocuments = [
      nextMetadata,
      ...index.documents.filter((document) => document.id !== id),
    ]

    try {
      storage.setItem(documentKey, JSON.stringify(nextDocument))
      storage.setItem(
        INDEX_KEY,
        JSON.stringify({
          ...index,
          activeDocumentId: id,
          documents: nextDocuments,
        }),
      )
    } catch (cause) {
      try {
        storage.setItem(documentKey, JSON.stringify(previousDocument))
      } catch {
        // Preserve the original failure; the caller can still recover from Markdown.
      }
      throw storageError(cause)
    }

    return nextMetadata
  }

  function deleteDocument(id) {
    const index = loadIndex()
    if (!index.documents.some((document) => document.id === id)) return false

    const documents = index.documents.filter((document) => document.id !== id)
    const activeDocumentId =
      index.activeDocumentId === id
        ? (documents[0]?.id ?? null)
        : index.activeDocumentId

    try {
      storage.setItem(
        INDEX_KEY,
        JSON.stringify({ ...index, activeDocumentId, documents }),
      )
      storage.removeItem(`${DOCUMENT_KEY_PREFIX}${id}`)
    } catch (cause) {
      throw storageError(cause)
    }

    return true
  }

  function setActiveDocument(id) {
    const index = loadIndex()
    if (id !== null && !index.documents.some((document) => document.id === id)) {
      return false
    }

    try {
      storage.setItem(INDEX_KEY, JSON.stringify({ ...index, activeDocumentId: id }))
    } catch (cause) {
      throw storageError(cause)
    }
    return true
  }

  function subscribeToStorage(listener) {
    const onStorage = (event) => {
      if (event.key === null || event.key?.startsWith(PREVIEW_KEY_PREFIX)) listener()
    }
    eventTarget.addEventListener('storage', onStorage)
    return () => eventTarget.removeEventListener('storage', onStorage)
  }

  return {
    createDocument,
    deleteDocument,
    loadDocument,
    loadIndex,
    setActiveDocument,
    subscribeToStorage,
    updateDocument,
  }
}

let browserStorage

function getBrowserStorage() {
  browserStorage ??= createPreviewStorage()
  return browserStorage
}

export const loadIndex = () => getBrowserStorage().loadIndex()
export const loadDocument = (id) => getBrowserStorage().loadDocument(id)
export const createDocument = (markdown) =>
  getBrowserStorage().createDocument(markdown)
export const updateDocument = (id, markdown) =>
  getBrowserStorage().updateDocument(id, markdown)
export const deleteDocument = (id) => getBrowserStorage().deleteDocument(id)
export const setActiveDocument = (id) =>
  getBrowserStorage().setActiveDocument(id)
export const subscribeToStorage = (listener) =>
  getBrowserStorage().subscribeToStorage(listener)
