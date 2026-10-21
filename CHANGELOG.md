# Affinity MCP Changelog

English | [简体中文](CHANGELOG.zh-cn.md)

## 2026-10-21

### 0.5.4-dev.2

No user-visible changes.

### 0.5.4-dev.1

#### Changed

- Treat linked text frames as merged text; unlinking no longer assumes restoring original separate text.
- Require explicitly specifying whether to save or discard unsaved changes before async document close.

#### Added

- Add workflow recipes for rectangle Boolean operations, RGBA8 pixels, multi-format export (PNG/JPEG/SVG/PDF/WebP), and native save/reopen.

#### Fixed

- Update SDK support status: regular character insertion and async PNG export are confirmed functional rather than blocked by legacy limits.
- Fix brush discovery to use PathBrush names and remove invalid VectorBrush discovery logic.

## 2026-10-20

### 0.5.3

#### Changed

- Choose text tools based on layout requirements (paragraphs, wrapping, containers, and alignment) instead of defaulting to Artistic Text.
- Distinguish Chinese body visual alignment from full glyph centering, and clarify optical alignment mode switching vs. custom punctuation hanging rules.

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

- Validate client requests and upstream handshakes to accurately identify timeout and disconnection stages.
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
