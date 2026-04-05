function createTextToken(Token, content) {
  const token = new Token('text', '', 0)
  token.content = content
  return token
}

function createAnchorToken(Token, refId) {
  const token = new Token('html_inline', '', 0)
  token.content = `<span id="mkdp-ref-${refId}" class="mkdp-citation-target"></span>`
  return token
}

function createCitationLinkTokens(Token, refId) {
  const open = new Token('link_open', 'a', 1)
  open.attrSet('href', `#mkdp-ref-${refId}`)
  open.attrJoin('class', 'mkdp-citation-ref')

  const text = createTextToken(Token, `[${refId}]`)

  const close = new Token('link_close', 'a', -1)

  return [open, text, close]
}

function anchorBibliographyEntries(children, Token, referenceIds) {
  const anchoredChildren = []
  let lineStart = true

  children.forEach((child) => {
    if (child.type === 'text') {
      let text = child.content

      while (text.length > 0) {
        if (lineStart) {
          const match = text.match(/^\[(\d+)\]\s+/)
          if (match) {
            referenceIds.add(match[1])
            anchoredChildren.push(createAnchorToken(Token, match[1]))
            anchoredChildren.push(createTextToken(Token, match[0]))
            text = text.slice(match[0].length)
            lineStart = false
            continue
          }
        }

        if (text.length > 0) {
          anchoredChildren.push(createTextToken(Token, text))
          lineStart = false
          text = ''
        }
      }
      return
    }

    anchoredChildren.push(child)

    if (child.type === 'softbreak' || child.type === 'hardbreak') {
      lineStart = true
    } else if (!(child.type === 'html_inline' && /mkdp-citation-target/.test(child.content))) {
      lineStart = false
    }
  })

  return anchoredChildren
}

function linkifyCitationReferences(children, Token, referenceIds) {
  const linkedChildren = []
  let lineStart = true
  let linkLevel = 0

  children.forEach((child) => {
    if (child.type === 'link_open') {
      linkLevel += 1
      linkedChildren.push(child)
      lineStart = false
      return
    }

    if (child.type === 'link_close') {
      linkLevel = Math.max(0, linkLevel - 1)
      linkedChildren.push(child)
      lineStart = false
      return
    }

    if (child.type === 'softbreak' || child.type === 'hardbreak') {
      linkedChildren.push(child)
      lineStart = true
      return
    }

    if (child.type === 'html_inline' && /mkdp-citation-target/.test(child.content)) {
      linkedChildren.push(child)
      return
    }

    if (child.type !== 'text' || linkLevel > 0) {
      linkedChildren.push(child)
      lineStart = false
      return
    }

    let text = child.content
    while (text.length > 0) {
      if (lineStart) {
        const definitionMatch = text.match(/^\[(\d+)\]\s+/)
        if (definitionMatch) {
          linkedChildren.push(createTextToken(Token, definitionMatch[0]))
          text = text.slice(definitionMatch[0].length)
          lineStart = false
          continue
        }
      }

      const match = text.match(/\[(\d+)\]/)
      if (!match) {
        linkedChildren.push(createTextToken(Token, text))
        lineStart = false
        break
      }

      const refId = match[1]
      if (!referenceIds.has(refId)) {
        linkedChildren.push(createTextToken(Token, text))
        lineStart = false
        break
      }

      const [fullMatch] = match
      const matchIndex = match.index || 0
      const prefix = text.slice(0, matchIndex)
      if (prefix) {
        linkedChildren.push(createTextToken(Token, prefix))
      }

      linkedChildren.push(...createCitationLinkTokens(Token, refId))
      text = text.slice(matchIndex + fullMatch.length)
      lineStart = false
    }
  })

  return linkedChildren
}

export default function markdownItCitation(md) {
  md.core.ruler.after('inline', 'mkdp_citation_links', (state) => {
    const referenceIds = new Set()

    state.tokens.forEach((token) => {
      if (!token.children || token.children.length === 0) {
        return
      }

      token.children = anchorBibliographyEntries(token.children, state.Token, referenceIds)
    })

    if (referenceIds.size === 0) {
      return
    }

    state.tokens.forEach((token) => {
      if (!token.children || token.children.length === 0) {
        return
      }

      token.children = linkifyCitationReferences(token.children, state.Token, referenceIds)
    })
  })
}
