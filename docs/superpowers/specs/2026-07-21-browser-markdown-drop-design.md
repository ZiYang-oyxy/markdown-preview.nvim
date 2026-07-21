# Browser Markdown Drop Design

## Goal

Allow a user to drag one local `.md` file from the operating system into the
Markdown preview browser page and render it immediately, without copying text
or uploading the file.

## Scope

- The whole preview viewport is a drop target.
- Accept exactly one file whose name ends in `.md`, case-insensitively.
- Read the file locally in the browser as UTF-8 text.
- Reuse the existing MarkdownIt, diagram, syntax highlighting, TOC, and preview
  interaction pipeline.
- Use the dropped filename as the displayed document name and page title input.
- Keep the dropped document visible until the browser page is refreshed or a
  different valid `.md` file is dropped.
- Do not upload or persist the file.

The feature does not resolve relative images, accept directories, accept
multiple files, or add support for extensions such as `.markdown`.

## Interaction

- On `dragenter`/`dragover` with files, prevent browser navigation and show a
  full-page overlay reading `松开以预览 Markdown`.
- Remove the overlay when the drag leaves the page or a drop completes.
- On a valid drop, read and render the file, reset the document scroll position,
  update TOC state, and enter local-file mode.
- While local-file mode is active, ignore socket `refresh_content` events so a
  live Neovim update cannot immediately replace the dropped file.
- On an invalid drop or read failure, preserve the current rendered document and
  show a short, dismissible status message.

## Components

- `PreviewPage` owns transient drag state and local-file mode because it already
  owns browser lifecycle listeners and the render pipeline.
- A small file-validation/read helper isolates extension, file-count, and read
  error handling so behavior can be tested without rendering the full page.
- Existing `onRefreshContent` remains the single rendering entry point. Local
  file content is adapted to its current payload shape instead of creating a
  second Markdown renderer.
- Styling lives in `app/_static/page.css` and follows the existing light/dark
  theme variables and responsive layout.

## Error Handling

- Zero files: ignore the drop after removing drag feedback.
- Multiple files: report that only one `.md` file is supported.
- Wrong extension: report that only `.md` files are supported.
- Read error: report that the file could not be read.
- All failures leave the current content and socket mode unchanged.

## Testing

- Unit-level tests cover case-insensitive `.md` validation, wrong extensions,
  multiple files, successful UTF-8 reads, and read failures.
- A browser test dispatches a real file drop and verifies that the filename,
  rendered heading/body, and generated TOC change.
- Regression checks confirm the application builds and existing preview tests
  still pass.

## Security And Compatibility

The browser reads the user-selected file through the standard File API. The
content is processed with the previewer's existing Markdown configuration,
including its existing HTML behavior; this feature adds no network transfer or
new content execution path. `FileReader` is preferred over newer convenience
APIs to remain compatible with the project's older browser target.
