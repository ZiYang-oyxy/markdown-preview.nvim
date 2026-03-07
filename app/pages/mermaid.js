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

const mermaidChart = (code) => {
  return `<div class="mermaid">${escape(code)}</div>`
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
