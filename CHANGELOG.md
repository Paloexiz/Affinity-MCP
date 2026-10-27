# Affinity MCP Changelog

English | [简体中文](CHANGELOG.zh-cn.md)

## 2026-10-27

### 0.5.4

#### Added

- Add bundled, verified recipes for basic rectangle Boolean operations (union, subtract, intersect, XOR), ordinary character insertion, RGBA8 pixels and detached values, and PNG/JPEG/SVG/PDF/WebP export of the current spread followed by a native save and reopen.
- Add further recipes and their limits for three-frame linked text across spreads, resizing a frame to a known height, exporting the whole document or selected pages to PDF, exporting transparent mixed Chinese and Latin text, and asynchronous native save, overwrite and reopen.
- Add a PathBrush reuse recipe: clone a PathBrush from a curve that already has a brushed style, change its width, and apply it to another curve; preparing the preset in the UI stays a separate step.

#### Changed

- Treat linked text frames as one merged Story: linking merges the two frames' text, and unlinking does not restore visible separate text. In the tested cases, unlinking a middle frame moved the full text upstream and left the downstream frames empty, while unlinking the front frame cleared the whole Story, so ordinary unlinking now rejects a front-of-flow target first.
- Require choosing between saving and discarding unsaved work before an asynchronous close: the tested close discarded the unsaved content without showing a save prompt.

#### Fixed

- Require separate checks of mixed-format replacement, complete Bleed and packaged originals: a successful call can still merge or lose formatting, keep the outer Bleed out of the output, or return a package whose image region degrades once the source files are gone.
- Correct the recorded support status and brush route: ordinary character insertion and asynchronous PNG export are confirmed working, the earlier judgements came from legacy limits, brush discovery uses PathBrush names, and the undefined VectorBrush route is gone.

### 0.5.4-dev.8

No user-visible changes.

## 2026-10-26

### 0.5.4-dev.7

No user-visible changes.

### 0.5.4-dev.6

No user-visible changes.

## 2026-10-25

### 0.5.4-dev.5

#### Changed

- Clarify in the READMEs which non-front targets were tested, require ordinary unlinking to reject front-frame targets first, and warn that unlinking the front frame can clear the entire Story.

### 0.5.4-dev.4

No user-visible changes.

## 2026-10-22

### 0.5.4-dev.3

#### Changed

- Reject front-frame unlinking: a tested call cleared the whole Story. A middle-frame unlink leaves the full text in the upstream frame and empties the downstream chain.

#### Added

- Clone a PathBrush from an existing brushed curve, adjust its width, and reuse it on another curve; preparing a preset in the UI remains a separate step.
- Add recipes with documented limits for three-frame flows across spreads, known-height frame reflow, multi-page and selected-page PDF export, transparent text export, and asynchronous native save, overwrite, and reopen.

#### Fixed

- Require explicit checks of mixed-format replacements, complete Bleed, and packaged originals: a successful call can still lose formatting, crop the output, or leave degraded image regions after reopening.

## 2026-10-21

### 0.5.4-dev.2

No user-visible changes.

### 0.5.4-dev.1

#### Changed

- Treat linked text frames as merged text; unlinking no longer assumes restoring original separate text.
- Require the caller to state whether to save or discard unsaved changes before closing a document asynchronously.

#### Added

- Add workflow recipes for rectangle Boolean operations, RGBA8 pixel access, export in multiple formats (PNG/JPEG/SVG/PDF/WebP), and native save and reopen.

#### Fixed

- Update SDK support status: regular character insertion and async PNG export are confirmed working, and the earlier assessment was based on legacy limits.
- Fix brush discovery to use PathBrush names, and remove the invalid VectorBrush discovery logic.

## 2026-10-20

### 0.5.3

#### Changed

- Choose text tools based on layout requirements (paragraphs, wrapping, containers, and alignment) instead of defaulting to Artistic Text.
- Distinguish visual alignment of Chinese body text from full glyph centering, and clarify the difference between switching optical alignment modes and custom punctuation hanging rules.

### 0.5.2

No user-visible changes.

### 0.5.1

#### Fixed

- Remove seven SDK verification images and geometry test files from the installation package.

### 0.5.0

#### Changed

- Add single-call workflows that perform document operations and return a full PNG preview for small composite canvases.
- Add Bleed, Margin, text safe area, and background coverage checks to poster layout guidance.
- Add a standalone SVG inspection image with Trim and Margin guides and a checkerboard background indicating transparency.

## 2026-10-16

### 0.4.3

#### Added

- Add bilingual Privacy Policy and Terms of Service in English and Simplified Chinese, with links in installation guides and plugin listings.

### 0.4.2

No user-visible changes.

### 0.4.2-dev.1

No user-visible changes.

## 2026-10-15

### 0.4.1

#### Changed

- Remove internal repository maintenance details from user installation guides.

## 2026-10-14

### 0.4.1-dev.1

No user-visible changes.

## 2026-10-13

### 0.4.0

#### Changed

- Package the proxy service and connection checker inside the Skill directory; installing the full Plugin is required to register MCP.
- Remove internal development docs and developer tools from the release package.

#### Fixed

- Fix parsing of SSE `event` and `data` fields without colons.

## 2026-10-12

### 0.4.0-dev.1

#### Changed

- Move runtime scripts into the Skill directory; installing the full Plugin is required to register MCP.

#### Fixed

- Fix parsing of SSE `event` and `data` fields without colons.

### 0.3.0

#### Added

- Add a connection smoke test for installed plugins to verify versions, online tool discovery, and SDK preamble data.

#### Fixed

- Validate client requests and upstream handshakes so that timeout and disconnection stages can be identified accurately.
- Distinguish unsubmitted operations from unknown outcomes, rejecting offline tool lists as proof of a live connection.

## 2026-10-09

### 0.2.0

#### Added

- Support configurable request timeouts via `AFFINITY_MCP_REQUEST_TIMEOUT_MS` with structured error diagnostics.

#### Changed

- Add guidance for multiline text, paragraph centering, and batch layer adjustments.
- Avoid repeated SDK documentation reads when connection and application build remain unchanged.

## 2026-09-15

### 0.1.0

#### Added

- Initial release with Affinity connection, SDK scripting, and document previews.
