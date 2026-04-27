const assert = require('assert')

const {
  buildBrowseShellHtml
} = require('../scripts/lib/standalone-preview-server')

function extractBody(html) {
  const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/)
  assert.ok(bodyMatch, 'shell html should include a body')
  return bodyMatch[1]
}

function extractScript(html) {
  const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g))
  assert.ok(scripts.length > 0, 'shell html should include inline script')
  return scripts[scripts.length - 1][1]
}

function testTocSidebarIsWorkspaceColumn() {
  const html = buildBrowseShellHtml()
  const body = extractBody(html)

  assert.ok(
    body.includes('class="content-workspace" id="content-workspace"'),
    'content should contain a workspace wrapper for preview and toc columns'
  )
  assert.ok(
    body.includes('class="toc-sidebar" id="toc-sidebar"'),
    'shell should contain a fixed toc sidebar'
  )
  assert.ok(
    body.includes('id="toc-sidebar-list"'),
    'fixed toc sidebar should have its own tree container'
  )

  const contentBodyIndex = body.indexOf('class="content-body" id="content-body"')
  const tocSidebarIndex = body.indexOf('class="toc-sidebar" id="toc-sidebar"')
  assert.ok(contentBodyIndex !== -1, 'content body should exist')
  assert.ok(tocSidebarIndex !== -1, 'toc sidebar should exist')
  assert.ok(
    tocSidebarIndex > contentBodyIndex,
    'toc sidebar should be a sibling after content body, not an overlay inside it'
  )
}

function testFloatingTocIsRemovedFromWideLayout() {
  const html = buildBrowseShellHtml()

  assert.strictEqual(
    html.includes('class="toc-float"'),
    false,
    'wide layout should not render the old floating toc container'
  )
  assert.strictEqual(
    html.includes('id="toc-float-list"'),
    false,
    'wide layout should not keep the old floating toc list id'
  )
  assert.strictEqual(
    html.includes('position: absolute;\n      top: 12px;\n      right: 12px;'),
    false,
    'toc should no longer be positioned as a floating overlay'
  )
}

function testCollapsedStateTargetsSidebar() {
  const html = buildBrowseShellHtml()
  const script = extractScript(html)

  assert.ok(
    script.includes("var tocSidebar = document.getElementById('toc-sidebar');"),
    'script should keep a tocSidebar DOM reference'
  )
  assert.ok(
    script.includes("var tocSidebarList = document.getElementById('toc-sidebar-list');"),
    'script should render the fixed sidebar list'
  )
  assert.ok(
    script.includes("localStorage.getItem('mkdp-toc-collapsed') === '1'"),
    'script should read persisted collapsed state'
  )
  assert.ok(
    script.includes("localStorage.setItem('mkdp-toc-collapsed', '1')"),
    'close action should persist collapsed state'
  )
  assert.ok(
    script.includes("localStorage.setItem('mkdp-toc-collapsed', '0')"),
    'topbar action should persist expanded state'
  )
}

function main() {
  testTocSidebarIsWorkspaceColumn()
  testFloatingTocIsRemovedFromWideLayout()
  testCollapsedStateTargetsSidebar()
  process.stdout.write('browse fixed toc sidebar tests: ok\n')
}

main()
