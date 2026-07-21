# Browser Markdown Drop Design

## Goal

Allow a user to drag one local `.md` file from the operating system into the
Markdown preview browser page and render it immediately, without copying text
or uploading the file.

## Scope

- The whole preview viewport is a drop target.
- Accept exactly one file whose name ends in `.md`, case-insensitively.
- Read the file locally in the browser as UTF-8 text.
- Reuse the Web app's existing file import, local document storage, sandboxed
  Markdown renderer, and TOC pipeline.
- Create a new local document from the dropped content and make it active, just
  like the existing file picker does.
- Persist the document only in the Web app's existing browser `localStorage`.
- Do not upload the file.

The feature does not resolve relative images, accept directories, accept
multiple files, or add support for extensions such as `.markdown`.

## Interaction

- On `dragenter`/`dragover` with files, prevent browser navigation and show a
  full-page overlay reading `松开以预览 Markdown`.
- Remove the overlay when the drag leaves the page or a drop completes.
- On a valid drop, read the file, create a local document, make it active, and
  render it through the sandboxed preview iframe.
- On an invalid drop or read failure, preserve the current rendered document and
  show a short, dismissible status message.

## Components

- `App` owns transient drag state because it already owns file import, document
  creation, alerts, and the full browser viewport.
- A small file-validation/read helper isolates extension, file-count, size,
  UTF-8 decoding, and read errors so the picker and drop paths share behavior.
- Existing `createDocument` remains the single persistence entry point and
  `PreviewPane` remains the single rendering entry point.
- Styling lives in `preview/src/styles.css` and follows the existing light/dark
  theme variables and responsive layout.

## Error Handling

- Zero files: ignore the drop after removing drag feedback.
- Multiple files: report that only one `.md` file is supported.
- Wrong extension: report that only `.md` files are supported.
- Read error: report that the file could not be read.
- All failures leave the current active document unchanged.

## Testing

- Unit-level tests cover case-insensitive `.md` validation, wrong extensions,
  multiple files, successful UTF-8 reads, and read failures.
- A browser test dispatches a file drop and verifies that the new local document,
  rendered heading/body, and generated TOC appear.
- Regression checks confirm the application builds and existing preview tests
  still pass.

## Security And Compatibility

The browser reads the user-selected file through the standard File API. The
content follows the Web app's existing size limit, strict UTF-8 decoding,
browser storage limits, iframe isolation, and sanitization policy. This feature
adds no network transfer or new content execution path.
