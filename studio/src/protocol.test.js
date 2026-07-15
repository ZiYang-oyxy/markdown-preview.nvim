import { describe, expect, it } from 'vitest'

import {
  MAX_MARKDOWN_BYTES,
  validateInitMessage,
  validatePreviewMessage,
  validateShellMessage,
} from './protocol.js'

const token = '0123456789abcdef0123456789abcdef'

describe('Markdown Preview protocol validation', () => {
  it('accepts only an exact versioned initialization message', () => {
    expect(
      validateInitMessage({ type: 'mkdp:studio-init', version: 1, token }),
    ).toEqual({ ok: true })
    expect(
      validateInitMessage({ type: 'mkdp:studio-init', version: 2, token }),
    ).toMatchObject({ ok: false })
    expect(
      validateInitMessage({ type: 'mkdp:studio-init', version: 1, token, extra: true }),
    ).toMatchObject({ ok: false })
  })

  it('rejects bad tokens, unknown message types, and unknown fields', () => {
    const render = {
      type: 'render',
      version: 1,
      token,
      renderId: 1,
      markdown: '# Safe',
      theme: 'light',
    }

    expect(validateShellMessage(render, { token, lastRenderId: 0 })).toEqual({ ok: true })
    expect(
      validateShellMessage({ ...render, token: 'wrong' }, { token, lastRenderId: 0 }),
    ).toMatchObject({ ok: false })
    expect(
      validateShellMessage({ ...render, type: 'execute' }, { token, lastRenderId: 0 }),
    ).toMatchObject({ ok: false })
    expect(
      validateShellMessage({ ...render, html: '<b>no</b>' }, { token, lastRenderId: 0 }),
    ).toMatchObject({ ok: false })
  })

  it('enforces Markdown size and monotonically increasing render IDs', () => {
    const base = {
      type: 'render',
      version: 1,
      token,
      renderId: 4,
      markdown: '# Safe',
      theme: 'dark',
    }

    expect(validateShellMessage(base, { token, lastRenderId: 4 })).toMatchObject({ ok: false })
    expect(
      validateShellMessage(
        { ...base, renderId: 5, markdown: 'a'.repeat(MAX_MARKDOWN_BYTES + 1) },
        { token, lastRenderId: 4 },
      ),
    ).toMatchObject({ ok: false })
  })

  it('validates scroll and snapshot requests without accepting arbitrary selectors', () => {
    expect(
      validateShellMessage(
        { type: 'scrollTo', version: 1, token, headingId: 'safe-heading' },
        { token, lastRenderId: 0 },
      ),
    ).toEqual({ ok: true })
    expect(
      validateShellMessage(
        { type: 'scrollTo', version: 1, token, headingId: '#x > script' },
        { token, lastRenderId: 0 },
      ),
    ).toMatchObject({ ok: false })
    expect(
      validateShellMessage(
        { type: 'requestSnapshot', version: 1, token, requestId: 9 },
        { token, lastRenderId: 0 },
      ),
    ).toEqual({ ok: true })
  })

  it('rejects malformed preview responses and TOC entries', () => {
    const rendered = {
      type: 'rendered',
      version: 1,
      token,
      renderId: 2,
      height: 720,
      toc: [{ id: 'intro', text: '介绍', level: 2 }],
    }

    expect(validatePreviewMessage(rendered, { token, lastRenderId: 2 })).toEqual({ ok: true })
    expect(
      validatePreviewMessage(
        { ...rendered, toc: [{ id: 'intro', text: '<img>', level: 9 }] },
        { token, lastRenderId: 2 },
      ),
    ).toMatchObject({ ok: false })
    expect(
      validatePreviewMessage({ ...rendered, renderId: 1 }, { token, lastRenderId: 2 }),
    ).toMatchObject({ ok: false })
  })
})
