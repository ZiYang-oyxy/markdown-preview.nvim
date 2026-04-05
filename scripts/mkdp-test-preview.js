#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const {
  createStandalonePreviewSession,
  openStandalonePreviewPage
} = require('./lib/standalone-preview-runtime')

const ARTIFACT_ROOT = path.resolve('test/artifacts/playwright')
const VIEWPORT = { width: 1440, height: 1024 }

function printUsage() {
  process.stderr.write(
    [
      'Usage: mkdp-test-preview [options]',
      '',
      'Options:',
      '  --fixture <demo|test|all>   Fixture set to run',
      '  --headed                    Run Chromium with a visible window',
      '  --case <name>               Run a specific case id or short name',
      '  -h, --help                  Show this help'
    ].join('\n') + '\n'
  )
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const parsed = {
    fixture: 'all',
    headed: false,
    cases: []
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]

    if (arg === '-h' || arg === '--help') {
      parsed.help = true
      continue
    }
    if (arg === '--fixture') {
      parsed.fixture = args[i + 1] || ''
      i += 1
      continue
    }
    if (arg === '--headed') {
      parsed.headed = true
      continue
    }
    if (arg === '--case') {
      const value = args[i + 1] || ''
      value.split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => {
        parsed.cases.push(item)
      })
      i += 1
      continue
    }

    throw new Error(`unknown option: ${arg}`)
  }

  if (!['demo', 'test', 'all'].includes(parsed.fixture)) {
    throw new Error(`invalid fixture: ${parsed.fixture}`)
  }

  return parsed
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function ensureDir(dirPath) {
  return fs.promises.mkdir(dirPath, { recursive: true })
}

function sanitizeName(value) {
  return String(value || 'artifact')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'artifact'
}

function createRunDir() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(ARTIFACT_ROOT, timestamp)
}

function createEventLog(page) {
  const events = []
  const push = (event) => {
    events.push({
      at: new Date().toISOString(),
      ...event
    })
  }

  page.on('console', (message) => {
    push({
      type: `console:${message.type()}`,
      text: message.text(),
      location: message.location()
    })
  })

  page.on('pageerror', (error) => {
    push({
      type: 'pageerror',
      text: error && error.stack ? error.stack : String(error)
    })
  })

  page.on('requestfailed', (request) => {
    const failure = request.failure()
    push({
      type: 'requestfailed',
      method: request.method(),
      url: request.url(),
      text: failure ? failure.errorText : 'request failed'
    })
  })

  page.on('response', (response) => {
    if (response.status() < 400) {
      return
    }

    push({
      type: 'response:error',
      status: response.status(),
      url: response.url()
    })
  })

  return events
}

function getBlockingEvents(events) {
  return events.filter((event) => event.type === 'pageerror' || event.type === 'console:error')
}

async function waitForHashTarget(page, expectedHash) {
  await page.waitForFunction((hash) => {
    if (!hash || window.location.hash !== hash) {
      return false
    }

    const rawId = hash.slice(1)
    const candidates = [rawId]

    try {
      const decoded = decodeURIComponent(rawId)
      if (!candidates.includes(decoded)) {
        candidates.push(decoded)
      }
    } catch (_) {}

    const encoded = encodeURIComponent(rawId)
    if (!candidates.includes(encoded)) {
      candidates.push(encoded)
    }

    const target = candidates
      .map((candidate) => document.getElementById(candidate))
      .find(Boolean)

    if (!target) {
      return false
    }

    const rect = target.getBoundingClientRect()
    return rect.top < window.innerHeight && rect.bottom > 0
  }, expectedHash, {
    timeout: 5000
  })
}

async function createPage(browser, origin, viewport = VIEWPORT) {
  const context = await browser.newContext({
    viewport
  })
  await context.tracing.start({
    screenshots: true,
    snapshots: true
  })

  const page = await context.newPage()
  const events = createEventLog(page)
  await openStandalonePreviewPage(page, origin, {
    timeout: 30000
  })

  return { context, page, events }
}

async function saveFailureArtifacts({ context, page, caseDir, events, error }) {
  await ensureDir(caseDir)

  const screenshotPath = path.join(caseDir, 'failure.png')
  const tracePath = path.join(caseDir, 'trace.zip')
  const consolePath = path.join(caseDir, 'console.log')
  const htmlPath = path.join(caseDir, 'page.html')
  const errorPath = path.join(caseDir, 'error.txt')

  try {
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    })
  } catch (_) {}

  try {
    const html = await page.content()
    await fs.promises.writeFile(htmlPath, html, 'utf8')
  } catch (_) {}

  try {
    const lines = events.map((event) => JSON.stringify(event))
    await fs.promises.writeFile(consolePath, `${lines.join('\n')}\n`, 'utf8')
  } catch (_) {}

  try {
    await fs.promises.writeFile(errorPath, `${error && error.stack ? error.stack : String(error)}\n`, 'utf8')
  } catch (_) {}

  try {
    await context.tracing.stop({ path: tracePath })
  } catch (_) {}
}

async function stopTracing(context) {
  try {
    await context.tracing.stop()
  } catch (_) {}
}

function caseMatches(caseId, filters) {
  if (!filters.length) {
    return true
  }

  const shortName = caseId.includes('-')
    ? caseId.split('-').slice(1).join('-')
    : caseId

  return filters.some((filter) => filter === caseId || filter === shortName)
}

const CASES = {
  demo: [
    {
      id: 'demo-load',
      async run({ page }) {
        const state = await page.evaluate(() => ({
          title: document.title,
          heading: document.querySelector('h1') && document.querySelector('h1').textContent.trim(),
          tocCount: document.querySelectorAll('#toc-nav .toc-link').length,
          theme: document.querySelector('main') && document.querySelector('main').getAttribute('data-theme')
        }))

        assert(state.title === '「demo」', 'unexpected demo page title')
        assert(state.heading === '英伟达 GPU / NVLink 可观测性与可视化体系深度技术分析', 'unexpected demo main heading')
        assert(state.tocCount > 10, 'demo toc was not rendered')
        assert(state.theme === 'light', 'demo page did not default to light theme')
      }
    },
    {
      id: 'demo-toc',
      async run({ page }) {
        const tocLink = page.locator('#toc-nav .toc-link', {
          hasText: '方法附录'
        }).first()

        assert(await tocLink.count(), 'can not find 方法附录 toc entry')

        const expectedHash = await tocLink.getAttribute('href')
        assert(expectedHash, 'toc entry does not have a hash target')

        await tocLink.click()
        await waitForHashTarget(page, expectedHash)
      }
    },
    {
      id: 'demo-theme',
      async run({ page }) {
        await page.selectOption('#theme-mode-select', 'dark')
        await page.waitForFunction(() => {
          const main = document.querySelector('main')
          const select = document.querySelector('#theme-mode-select')
          return main && main.getAttribute('data-theme') === 'dark' && select && select.value === 'dark'
        }, undefined, {
          timeout: 5000
        })

        const mermaidCount = await page.locator('.mermaid svg').count()
        assert(mermaidCount > 0, 'mermaid diagrams disappeared after theme switch')
      }
    },
    {
      id: 'demo-mermaid-theme',
      async run({ page }) {
        const firstStyle = page.locator('.mermaid svg style').first()
        assert(await firstStyle.count(), 'no mermaid svg style block found')

        const beforeSignature = await firstStyle.textContent()
        await page.selectOption('#mermaid-theme-preset', 'forest')
        await page.waitForFunction((previous) => {
          const select = document.querySelector('#mermaid-theme-preset')
          const styleNode = document.querySelector('.mermaid svg style')
          return Boolean(
            select &&
            select.value === 'forest' &&
            styleNode &&
            styleNode.textContent &&
            styleNode.textContent !== previous
          )
        }, beforeSignature, {
          timeout: 5000
        })
      }
    },
    {
      id: 'demo-citation',
      async run({ page }) {
        const citationLink = page.locator('.mkdp-citation-ref').first()
        assert(await citationLink.count(), 'citation link was not rendered')

        const expectedHash = await citationLink.getAttribute('href')
        assert(expectedHash, 'citation link does not have a target')

        await citationLink.click()
        await waitForHashTarget(page, expectedHash)
      }
    },
    {
      id: 'demo-export',
      async run({ page }) {
        const result = await page.evaluate(async () => {
          return window.__mkdpExport.buildStandaloneHtml()
        })

        assert(result && typeof result.html === 'string', 'standalone export did not return HTML')
        assert(result.html.includes('英伟达 GPU / NVLink 可观测性与可视化体系深度技术分析'), 'standalone export is missing document content')
        assert(result.html.includes('mkdp-static-image-link') || result.html.includes('mkdp-static-mermaid-svg'), 'standalone export did not inline preview assets')
      }
    }
  ],
  test: [
    {
      id: 'test-load',
      async run({ page }) {
        const state = await page.evaluate(() => ({
          title: document.title,
          heading: document.querySelector('h1') && document.querySelector('h1').textContent.trim(),
          tocCount: document.querySelectorAll('#toc-nav .toc-link').length
        }))

        assert(state.title === '「test」', 'unexpected test page title')
        assert(state.heading === 'markdown-preview.vim', 'unexpected test main heading')
        assert(state.tocCount >= 5, 'test toc was not rendered')
      }
    },
    {
      id: 'test-syntax-smoke',
      async run({ page }) {
        const state = await page.evaluate(() => ({
          chartCount: document.querySelectorAll('canvas.chartjs').length,
          mermaidSvgCount: document.querySelectorAll('.mermaid svg').length,
          katexCount: document.querySelectorAll('.katex').length,
          taskCount: document.querySelectorAll('input[type="checkbox"]').length,
          plantumlCount: document.querySelectorAll('img[src*="plantuml.com/plantuml"]').length,
          previewableCount: document.querySelectorAll('.mkdp-previewable').length,
          citationCount: document.querySelectorAll('.mkdp-citation-ref').length
        }))

        assert(state.chartCount >= 1, 'chart block was not rendered')
        assert(state.mermaidSvgCount >= 5, 'mermaid diagrams were not rendered')
        assert(state.katexCount >= 1, 'katex output was not rendered')
        assert(state.taskCount >= 1, 'task list checkboxes were not rendered')
        assert(state.plantumlCount >= 1, 'plantuml blocks were not converted to images')
        assert(state.previewableCount >= 1, 'preview overlay targets were not bound')
        assert(state.citationCount >= 1, 'citation links were not rendered')
      }
    },
    {
      id: 'test-links',
      async run({ page }) {
        const footnoteLink = page.locator('a[href="#footnote-demo"]').first()
        assert(await footnoteLink.count(), 'footnote demo link was not rendered')

        const footnoteHash = await footnoteLink.getAttribute('href')
        assert(footnoteHash, 'footnote demo link does not have a target')
        await footnoteLink.click()
        await waitForHashTarget(page, footnoteHash)

        const citationLink = page.locator('.mkdp-citation-ref').first()
        assert(await citationLink.count(), 'citation link was not rendered')

        const citationHash = await citationLink.getAttribute('href')
        assert(citationHash, 'citation link does not have a target')
        await citationLink.click()
        await waitForHashTarget(page, citationHash)
      }
    },
    {
      id: 'test-preview-overlay',
      async run({ page }) {
        const previewable = page.locator('.mkdp-previewable').first()
        assert(await previewable.count(), 'no previewable image or svg was found')

        await previewable.click()
        await page.waitForFunction(() => {
          const viewer = document.querySelector('#mkdp-preview-viewer')
          return Boolean(
            viewer &&
            viewer.classList.contains('is-open') &&
            document.body.classList.contains('mkdp-preview-open')
          )
        }, undefined, {
          timeout: 5000
        })

        await page.keyboard.press('Escape')
        await page.waitForFunction(() => {
          const viewer = document.querySelector('#mkdp-preview-viewer')
          return Boolean(
            viewer &&
            !viewer.classList.contains('is-open') &&
            !document.body.classList.contains('mkdp-preview-open')
          )
        }, undefined, {
          timeout: 5000
        })
      }
    },
    {
      id: 'test-mobile-toc-jump',
      viewport: { width: 390, height: 844 },
      async run({ page }) {
        const tocOpenButton = page.locator('#toc-mobile-open-btn')
        assert(await tocOpenButton.count(), 'mobile toc open button was not rendered')

        await tocOpenButton.click()
        await page.waitForSelector('#toc-panel.is-open', {
          timeout: 5000
        })

        const tocLink = page.locator('#toc-nav .toc-link[href="#citation-demo"]').first()
        assert(await tocLink.count(), 'mobile toc target was not rendered')

        await tocLink.click()
        await waitForHashTarget(page, '#citation-demo')

        const scrollState = await page.evaluate(() => ({
          y: window.pageYOffset,
          drawerOpen: document.querySelector('#toc-panel') && document.querySelector('#toc-panel').classList.contains('is-open')
        }))

        assert(scrollState.y > 0, 'mobile toc jump did not move the page')
        assert(scrollState.drawerOpen === false, 'mobile toc drawer did not close after jump')
      }
    }
  ]
}

async function runCase({ browser, caseDef, fixtureName, origin, runDir }) {
  const startedAt = Date.now()
  const viewport = caseDef.viewport || VIEWPORT
  const { context, page, events } = await createPage(browser, origin, viewport)

  try {
    await caseDef.run({ page, events })

    const blockingEvents = getBlockingEvents(events)
    assert(
      blockingEvents.length === 0,
      `blocking browser errors detected: ${blockingEvents.map((event) => event.text).join(' | ')}`
    )

    await stopTracing(context)
    await page.close()
    await context.close()

    return {
      id: caseDef.id,
      fixture: fixtureName,
      status: 'passed',
      durationMs: Date.now() - startedAt,
      warningCount: events.filter((event) => event.type === 'console:warning').length
    }
  } catch (error) {
    const caseDir = path.join(runDir, sanitizeName(caseDef.id))
    await saveFailureArtifacts({
      context,
      page,
      caseDir,
      events,
      error
    })

    try {
      await page.close()
    } catch (_) {}
    try {
      await context.close()
    } catch (_) {}

    return {
      id: caseDef.id,
      fixture: fixtureName,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      artifactDir: caseDir,
      error: error && error.stack ? error.stack : String(error)
    }
  }
}

async function main() {
  const cliArgs = parseArgs(process.argv)
  if (cliArgs.help) {
    printUsage()
    return
  }

  const runDir = createRunDir()
  await ensureDir(runDir)

  const fixtureNames = cliArgs.fixture === 'all'
    ? ['demo', 'test']
    : [cliArgs.fixture]

  const browser = await chromium.launch({
    headless: !cliArgs.headed
  })

  const summary = {
    startedAt: new Date().toISOString(),
    headed: cliArgs.headed,
    fixture: cliArgs.fixture,
    cases: [],
    runDir
  }

  try {
    for (const fixtureName of fixtureNames) {
      const session = await createStandalonePreviewSession({
        input: path.join('test', `${fixtureName}.md`)
      })

      try {
        for (const caseDef of CASES[fixtureName]) {
          if (!caseMatches(caseDef.id, cliArgs.cases)) {
            continue
          }

          process.stderr.write(`running ${caseDef.id}\n`)
          const result = await runCase({
            browser,
            caseDef,
            fixtureName,
            origin: session.origin,
            runDir
          })
          summary.cases.push(result)

          if (result.status === 'passed') {
            process.stderr.write(`passed ${caseDef.id} (${result.durationMs}ms)\n`)
          } else {
            process.stderr.write(`failed ${caseDef.id} (${result.durationMs}ms)\n`)
            process.stderr.write(`artifacts: ${result.artifactDir}\n`)
          }
        }
      } finally {
        await session.close()
      }
    }
  } finally {
    await browser.close()
  }

  summary.finishedAt = new Date().toISOString()
  summary.failedCount = summary.cases.filter((item) => item.status === 'failed').length
  summary.passedCount = summary.cases.filter((item) => item.status === 'passed').length

  const summaryPath = path.join(runDir, 'summary.json')
  await fs.promises.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

  process.stdout.write(`${summaryPath}\n`)

  if (summary.failedCount > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
