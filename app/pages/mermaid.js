import {escape} from './utils';

/*
 * global mermaid
*/
const MERMAID_KEYWORDS = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'mindmap',
  'timeline',
  'gitGraph',
  'requirementDiagram',
  'c4Context',
  'c4Container',
  'c4Component',
  'c4Dynamic',
  'c4Deployment',
  'quadrantChart',
  'xychart-beta',
  'sankey-beta',
  'block-beta',
  'packet-beta',
  'kanban',
  'architecture-beta'
]

const isMermaidStartLine = (line = '') => {
  const first = line.trim()
  if (!first) {
    return false
  }

  if (first.startsWith('graph ')) {
    return true
  }

  return MERMAID_KEYWORDS.some((keyword) => first === keyword || first.startsWith(`${keyword} `))
}

const normalizeMermaidLineBreaks = (code = '') => {
  let i = 0
  let output = ''

  while (i < code.length) {
    if (code[i] !== '\\') {
      output += code[i]
      i += 1
      continue
    }

    let slashCount = 0
    while (code[i + slashCount] === '\\') {
      slashCount += 1
    }

    const nextChar = code[i + slashCount]
    if (nextChar === 'n' && slashCount % 2 === 1) {
      output += '\\'.repeat(slashCount - 1)
      output += '\n'
      i += slashCount + 1
      continue
    }

    output += '\\'.repeat(slashCount)
    i += slashCount
  }

  return output
}

const mermaidChart = (code) => {
  return `<div class="mermaid">${escape(normalizeMermaidLineBreaks(code))}</div>`
}

const MermaidPlugin = (md) => {
  const origin = md.renderer.rules.fence.bind(md.renderer.rules)
  md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    const token = tokens[idx]
    const code = token.content.trim()
    if (typeof token.info === 'string' && token.info.trim() === 'mermaid') {
      return mermaidChart(code)
    }
    const firstLine = code.split(/\n/)[0].trim()
    if (isMermaidStartLine(firstLine)) {
      return mermaidChart(code)
    }
    return origin(tokens, idx, options, env, slf)
  }
}

export default MermaidPlugin
