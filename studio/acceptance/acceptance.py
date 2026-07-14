"""Independent black-box acceptance suite for Markdown Studio."""

from __future__ import annotations

import json
import re
from pathlib import Path

from playwright.sync_api import Page, Playwright, sync_playwright


BASE_URL = "http://127.0.0.1:4175"
ARTIFACTS = Path(__file__).with_name("artifacts")
RESULTS: list[dict[str, str]] = []
CONSOLE_ERRORS: list[str] = []

RICH_MARKDOWN = """# AI 输出验收

这是 **Markdown Studio** 的黑盒验收文档。

## 表格与代码

| 能力 | 状态 |
| --- | --- |
| Markdown | 通过 |
| Mermaid | 通过 |

```js
const answer = 42
```

行内公式 $E = mc^2$。

```mermaid
flowchart TD
  A[粘贴 Markdown] --> B[安全渲染]
  B --> C[阅读与导出]
```

<img src=x onerror="window.__acceptance_xss = true">
[危险链接](javascript:alert(1))
![远程追踪图](https://tracker.invalid/pixel.png)
"""


def record(name: str, status: str, detail: str = "") -> None:
    RESULTS.append({"name": name, "status": status, "detail": detail})
    print(f"[{status}] {name}{': ' + detail if detail else ''}", flush=True)


def run_case(name: str, callback) -> None:
    try:
        callback()
    except Exception as error:  # Keep running so one defect does not hide others.
        lines = str(error).splitlines()
        record(name, "FAIL", (lines[0] if lines else type(error).__name__)[:500])
    else:
        record(name, "PASS")


def attach_diagnostics(page: Page) -> None:
    page.on(
        "console",
        lambda message: CONSOLE_ERRORS.append(f"console.{message.type}: {message.text}")
        if message.type == "error"
        else None,
    )
    page.on("pageerror", lambda error: CONSOLE_ERRORS.append(f"pageerror: {error}"))


def reset(page: Page) -> None:
    page.goto(BASE_URL, wait_until="networkidle")
    page.evaluate("localStorage.clear()")
    page.reload(wait_until="networkidle")


def open_paste(page: Page) -> None:
    page.get_by_role("button", name="粘贴新文档").first.click()
    page.get_by_role("dialog", name="粘贴 Markdown").wait_for(state="visible")


def paste(page: Page, markdown: str) -> None:
    open_paste(page)
    dialog = page.get_by_role("dialog", name="粘贴 Markdown")
    dialog.get_by_label("Markdown 源文本").fill(markdown)
    dialog.get_by_role("button", name="渲染为新文档").click()
    dialog.wait_for(state="hidden")


def read_download(download) -> str:
    path = download.path()
    assert path, "download did not expose a temporary file"
    return Path(path).read_text(encoding="utf-8")


def desktop_suite(playwright: Playwright) -> None:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.set_default_timeout(10_000)
    attach_diagnostics(page)
    reset(page)

    def empty_state() -> None:
        page.get_by_role("heading", name="把 Markdown 变成舒适的阅读页面").wait_for()
        assert page.get_by_text("内容只保存在当前浏览器，不会上传").is_visible()
        assert page.locator("main").count() == 1
        page.screenshot(path=ARTIFACTS / "desktop-empty.png", full_page=True)

    run_case("桌面空状态与主操作", empty_state)

    def empty_validation_and_focus() -> None:
        open_paste(page)
        dialog = page.get_by_role("dialog", name="粘贴 Markdown")
        textarea = dialog.get_by_label("Markdown 源文本")
        assert textarea.evaluate("el => el === document.activeElement")
        dialog.get_by_role("button", name="渲染为新文档").click()
        assert dialog.get_by_role("alert").inner_text() == "先粘贴一些 Markdown 文本。"
        assert textarea.evaluate("el => el === document.activeElement")
        page.screenshot(path=ARTIFACTS / "desktop-paste-validation.png", full_page=True)
        page.keyboard.press("Escape")
        dialog.wait_for(state="hidden")

    run_case("空输入校验、焦点与 Escape", empty_validation_and_focus)

    def rich_rendering() -> None:
        paste(page, RICH_MARKDOWN)
        frame = page.frame_locator(".preview-frame")
        frame.get_by_role("heading", name="AI 输出验收").wait_for()
        frame.locator("table").wait_for()
        frame.locator("pre code").first.wait_for()
        frame.locator(".katex").wait_for()
        frame.locator(".mermaid-diagram svg").wait_for()
        content = frame.locator("#preview-root")
        assert content.locator("script, iframe, object, embed, foreignObject").count() == 0
        assert content.locator("img").count() == 0
        assert content.locator('a[href^="javascript:"]').count() == 0
        assert page.evaluate("window.__acceptance_xss !== true")
        page.screenshot(path=ARTIFACTS / "desktop-rich-light.png", full_page=True)

    run_case("Markdown、代码、KaTeX、Mermaid 与安全过滤", rich_rendering)

    def toc_and_theme() -> None:
        page.get_by_role("button", name="跳转到表格与代码").click()
        page.get_by_role("button", name="切换深色主题").click()
        assert page.locator(".studio-shell").get_attribute("data-theme") == "dark", "shell theme did not switch"
        assert page.locator("html").evaluate("el => getComputedStyle(el).colorScheme") == "dark", "root color-scheme is not dark"
        page.reload(wait_until="networkidle")
        assert page.locator(".studio-shell").get_attribute("data-theme") == "dark"
        page.frame_locator(".preview-frame").get_by_role("heading", name="AI 输出验收").wait_for()
        page.evaluate("scrollTo(0, 0)")
        page.screenshot(path=ARTIFACTS / "desktop-rich-dark.png", full_page=True)

    run_case("目录跳转、深色主题与刷新恢复", toc_and_theme)

    def multiple_documents_and_source() -> None:
        paste(page, "# 第二份文档\n\n不会覆盖第一份。")
        rail = page.get_by_role("complementary", name="临时文档")
        assert rail.get_by_role("button", name=re.compile("AI 输出验收")).count() == 1
        assert rail.get_by_role("button", name=re.compile("第二份文档")).count() == 1
        page.get_by_role("button", name="查看源文本").click()
        source = page.get_by_role("dialog", name="查看或编辑源文本")
        source.get_by_label("Markdown 源文本").fill("# 第二份已修改\n\n只修改当前文档。")
        source.get_by_role("button", name="完成").click()
        page.frame_locator(".preview-frame").get_by_role("heading", name="第二份已修改").wait_for()
        rail.get_by_role("button", name=re.compile("AI 输出验收")).click()
        page.frame_locator(".preview-frame").get_by_role("heading", name="AI 输出验收").wait_for()

    run_case("多文档隔离与按需编辑", multiple_documents_and_source)

    def export_is_inert() -> None:
        with page.expect_download() as download_info:
            page.get_by_role("button", name="导出 HTML").click()
        html = read_download(download_info.value)
        assert "<svg" in html and "AI 输出验收" in html
        assert "default-src 'none'" in html
        assert not re.search(r"<script|<iframe|<object|<embed|<foreignObject", html, re.I)
        assert not re.search(r"<[^>]+\son[a-z]+\s*=", html, re.I)
        assert not re.search(r"(?:src|href)=[\"']https?://", html, re.I)

    run_case("即时导出为 inert HTML", export_is_inert)

    def file_import_paths() -> None:
        file_input = page.locator('input[type="file"]')
        file_input.set_input_files({
            "name": "invalid.md",
            "mimeType": "text/markdown",
            "buffer": bytes([0xC3, 0x28]),
        })
        page.get_by_role("alert").filter(has_text="UTF-8").wait_for()
        page.get_by_role("button", name="关闭提示").click()
        file_input.set_input_files({
            "name": "accepted.md",
            "mimeType": "text/markdown",
            "buffer": "# 文件导入成功\n\nUTF-8 文本".encode("utf-8"),
        })
        page.frame_locator(".preview-frame").get_by_role("heading", name="文件导入成功").wait_for()

    run_case("UTF-8 文件导入与非法编码拒绝", file_import_paths)

    def destructive_confirmation() -> None:
        rail = page.get_by_role("complementary", name="临时文档")
        before = rail.locator(".document-item").count()
        page.once("dialog", lambda dialog: dialog.dismiss())
        page.get_by_role("button", name="删除当前文档").click()
        assert rail.locator(".document-item").count() == before
        page.once("dialog", lambda dialog: dialog.accept())
        page.get_by_role("button", name="删除当前文档").click()
        assert rail.locator(".document-item").count() == before - 1

    run_case("删除取消与确认", destructive_confirmation)

    def oversized_document() -> None:
        open_paste(page)
        dialog = page.get_by_role("dialog", name="粘贴 Markdown")
        dialog.get_by_label("Markdown 源文本").fill("# 超限\n" + "a" * (1024 * 1024))
        dialog.get_by_role("button", name="渲染为新文档").click()
        assert dialog.is_visible()
        assert "1 MiB" in page.get_by_role("alert").inner_text()
        page.keyboard.press("Escape")

    run_case("单文档 1 MiB 硬限制", oversized_document)

    def accessibility_dom_audit() -> None:
        findings = page.evaluate("""
          () => {
            const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
            const name = (el) => el.getAttribute('aria-label') || el.textContent.trim()
            const missingButtonNames = [...document.querySelectorAll('button')]
              .filter(visible).filter((el) => !name(el)).length
            const missingLabels = [...document.querySelectorAll('textarea,input:not([type=hidden])')]
              .filter(visible).filter((el) => !el.getAttribute('aria-label') && !document.querySelector(`label[for="${el.id}"]`)).length
            const ids = [...document.querySelectorAll('[id]')].map((el) => el.id)
            return {
              missingButtonNames,
              missingLabels,
              duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
              mainCount: document.querySelectorAll('main').length,
              hasSkipLink: !!document.querySelector('a[href^="#main"], a[href="#content"]'),
            }
          }
        """)
        assert findings["missingButtonNames"] == 0, findings
        assert findings["missingLabels"] == 0, findings
        assert findings["duplicateIds"] == [], findings
        assert findings["mainCount"] == 1, findings
        if not findings["hasSkipLink"]:
            record("跳过导航链接", "WARN", "键盘用户缺少直接跳到主内容的入口")
        skip_link = page.locator(".skip-link")
        skip_link.focus()
        skip_box = skip_link.bounding_box()
        assert skip_box and skip_box["y"] >= 0, "skip link is clipped while focused"
        page.keyboard.press("Enter")
        assert page.locator("#main-content").evaluate("el => el === document.activeElement")

    run_case("可访问名称、标签与 DOM 语义", accessibility_dom_audit)

    context.close()
    browser.close()


def mobile_suite(playwright: Playwright) -> None:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=1,
        is_mobile=True,
        has_touch=True,
    )
    page = context.new_page()
    page.set_default_timeout(10_000)
    attach_diagnostics(page)
    reset(page)

    def mobile_paste_and_layout() -> None:
        page.get_by_role("button", name="新建文档").click()
        dialog = page.get_by_role("dialog", name="粘贴 Markdown")
        box = dialog.bounding_box()
        assert box and box["width"] >= 389 and box["height"] >= 843
        page.screenshot(path=ARTIFACTS / "mobile-paste.png", full_page=True)
        dialog.get_by_label("Markdown 源文本").fill("# 手机验收\n\n## 第一节\n\n移动端内容")
        dialog.get_by_role("button", name="渲染为新文档").click()
        page.frame_locator(".preview-frame").get_by_role("heading", name="手机验收").wait_for()
        overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert overflow <= 1
        page.screenshot(path=ARTIFACTS / "mobile-reading.png", full_page=True)

    run_case("移动端全屏粘贴与无横向溢出", mobile_paste_and_layout)

    def mobile_sheets_and_keyboard() -> None:
        page.get_by_role("button", name="打开文档列表").click()
        documents = page.get_by_role("dialog", name="文档")
        documents.wait_for()
        assert documents.get_by_role("button", name="删除当前文档").is_visible()
        page.screenshot(path=ARTIFACTS / "mobile-documents-sheet.png", full_page=True)
        page.keyboard.press("Escape")
        documents.wait_for(state="hidden")
        page.get_by_role("button", name="打开本文目录").click()
        toc = page.get_by_role("dialog", name="目录")
        toc.get_by_role("button", name="跳转到第一节").click()
        toc.wait_for(state="hidden")
        page.get_by_role("button", name="查看源文本").click()
        source = page.get_by_role("dialog", name="查看或编辑源文本")
        source_box = source.bounding_box()
        assert source_box and source_box["width"] >= 389 and source_box["height"] >= 843
        page.keyboard.press("Escape")
        page.get_by_role("button", name="打开文档列表").click()
        documents = page.get_by_role("dialog", name="文档")
        page.once("dialog", lambda dialog: dialog.dismiss())
        documents.get_by_role("button", name="删除当前文档").click()
        assert documents.is_visible()
        page.once("dialog", lambda dialog: dialog.accept())
        documents.get_by_role("button", name="删除当前文档").click()
        documents.wait_for(state="hidden")
        page.get_by_role("heading", name="把 Markdown 变成舒适的阅读页面").wait_for()

    run_case("移动文档 Sheet、目录 Sheet 与源码页", mobile_sheets_and_keyboard)

    def touch_targets() -> None:
        too_small = page.evaluate("""
          () => [...document.querySelectorAll('button')]
            .filter((el) => el.offsetWidth && getComputedStyle(el).visibility !== 'hidden')
            .map((el) => ({ name: el.getAttribute('aria-label') || el.textContent.trim(), rect: el.getBoundingClientRect() }))
            .filter(({ rect }) => rect.width < 40 || rect.height < 40)
            .map(({ name, rect }) => `${name}:${Math.round(rect.width)}x${Math.round(rect.height)}`)
        """)
        if too_small:
            record("移动端触控尺寸", "WARN", ", ".join(too_small))

    run_case("移动触控目标检查", touch_targets)

    context.close()
    browser.close()


def tablet_suite(playwright: Playwright) -> None:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 900, "height": 900})
    page = context.new_page()
    page.set_default_timeout(10_000)
    attach_diagnostics(page)
    reset(page)
    paste(page, "# 平板验收\n\n## 章节\n\n内容")

    def tablet_navigation() -> None:
        assert page.get_by_role("button", name="打开文档列表").is_visible()
        assert page.get_by_role("button", name="打开本文目录").is_visible()
        page.get_by_role("button", name="打开文档列表").click()
        page.get_by_role("dialog", name="文档").wait_for()
        page.keyboard.press("Escape")
        page.get_by_role("button", name="打开本文目录").click()
        page.get_by_role("dialog", name="目录").wait_for()
        page.screenshot(path=ARTIFACTS / "tablet-toc-sheet.png", full_page=True)

    run_case("平板宽度仍可访问文档与目录", tablet_navigation)
    context.close()
    browser.close()


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        desktop_suite(playwright)
        mobile_suite(playwright)
        tablet_suite(playwright)

    if CONSOLE_ERRORS:
        for error in sorted(set(CONSOLE_ERRORS)):
            record("浏览器控制台", "FAIL", error)
    else:
        record("浏览器控制台与未捕获异常", "PASS")

    summary = {
        "passed": sum(item["status"] == "PASS" for item in RESULTS),
        "failed": sum(item["status"] == "FAIL" for item in RESULTS),
        "warnings": sum(item["status"] == "WARN" for item in RESULTS),
        "results": RESULTS,
    }
    (ARTIFACTS / "results.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({key: summary[key] for key in ("passed", "failed", "warnings")}, ensure_ascii=False))
    raise SystemExit(1 if summary["failed"] else 0)


if __name__ == "__main__":
    main()
