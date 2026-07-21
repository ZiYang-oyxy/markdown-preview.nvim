const MAX_MARKDOWN_FILE_BYTES = 1024 * 1024
const MARKDOWN_EXTENSION = /\.md$/i

export function getDroppedMarkdownFile(files) {
  const dropped = Array.from(files ?? [])

  if (dropped.length === 0) throw new Error('请拖入一个 .md 文件。')
  if (dropped.length > 1) throw new Error('一次只能拖入一个 .md 文件。')
  if (!MARKDOWN_EXTENSION.test(dropped[0].name)) throw new Error('仅支持 .md 文件。')

  return dropped[0]
}

export async function readMarkdownFile(file) {
  if (file.size > MAX_MARKDOWN_FILE_BYTES) {
    throw new Error('单份文档不能超过 1 MiB。')
  }

  let buffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    throw new Error('无法读取文件。')
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new Error('文件不是有效的 UTF-8 文本。')
  }
}
