function normalizeList(items, label) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${label} must contain at least one item`)
  }

  return items.map((item) => String(item).trim()).filter(Boolean)
}

function buildCommandBlock(title, commands) {
  return [
    `${title}:`,
    '```bash',
    ...commands,
    '```'
  ].join('\n')
}

function buildReleaseNotes(options) {
  const summary = String(options.summary || '').trim()
  if (!summary) {
    throw new Error('summary is required')
  }

  const highlights = normalizeList(options.highlights, 'highlights')
  const installCommands = normalizeList(options.installCommands, 'installCommands')
  const verificationCommands = normalizeList(options.verificationCommands, 'verificationCommands')

  return [
    summary,
    '',
    'Highlights:',
    ...highlights.map((item) => `- ${item}`),
    '',
    buildCommandBlock('Install / update', installCommands),
    '',
    buildCommandBlock('Verification', verificationCommands),
    ''
  ].join('\n')
}

module.exports = {
  buildReleaseNotes
}
