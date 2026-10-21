# Affinity MCP Changelog

English | [简体中文](CHANGELOG.zh-cn.md)

## 2026-10-21

### 0.5.4-dev.1

#### Changed

- Account for merged text when linking frames; stop treating unlinking as restoring their original separate text.
- Resolve whether to save or discard unsaved changes before async document close.

#### Added

- Agent recipes for rectangle Boolean operations, RGBA8 pixels, PNG/JPEG/SVG/PDF/WebP export and native save/reopen.

#### Fixed

- Stop rejecting ordinary character insertion and async PNG export based on older SDK limitations.
- Correct brush discovery to use PathBrush names and remove the invalid VectorBrush fallback.

## 2026-10-20

### 0.5.3

#### Changed

- Choose text tools by paragraph, reflow, container and alignment needs instead of preferring Artistic Text for all new copy.
- Distinguish Chinese-body alignment from whole-glyph centering, and optical mode changes from custom hanging-rule configuration.

### 0.5.2

No user-visible changes.

### 0.5.1

#### Fixed

- Remove seven SDK verification images and geometry fixtures from the installation package.

### 0.5.0

#### Changed

- Add a single-call operation and complete PNG preview recipe for the verified small synthetic sample.
- Add Bleed, Margin, text safe-area and background-coverage checks to poster layout guidance.
- Add a standalone SVG inspection image with Trim and Margin guides and a checkerboard showing transparent areas.

## 2026-10-16

### 0.4.3

#### Added

- Add privacy policies and terms of service in English and Simplified Chinese, with links in the installation guides and plugin listings.

### 0.4.2

No user-visible changes.

### 0.4.2-dev.1

No user-visible changes.

## 2026-10-15

### 0.4.1

#### Changed

- Remove repository-maintenance information from the installation guides.

## 2026-10-14

### 0.4.1-dev.1

No user-visible changes.

## 2026-10-13

### 0.4.0

#### Changed

- Package the proxy and connection checker inside the Skill directory; install the complete Plugin to register MCP.
- Remove development documentation and tools from the installation package.

#### Fixed

- Correctly parse SSE `event` and `data` fields without colons.

## 2026-10-12

### 0.4.0-dev.1

#### Changed

- Move runtime scripts into the Skill directory; install the complete Plugin to register MCP.

#### Fixed

- Correctly parse SSE `event` and `data` fields without colons.

### 0.3.0

#### Added

- Add a connection checker for a selected Plugin installation, including version, online tool discovery and SDK preamble checks.

#### Fixed

- Validate client requests and upstream handshakes, and identify timeout and disconnection stages.
- Distinguish unsubmitted operations from unknown outcomes and reject offline fallback as proof of a live connection.

## 2026-10-09

### 0.2.0

#### Added

- Add configurable request timeouts through `AFFINITY_MCP_REQUEST_TIMEOUT_MS` and structured error diagnostics.

#### Changed

- Add guidance for multiline text, paragraph centering and batch layout edits.
- Avoid repeated SDK documentation reads while the connection and application build are unchanged.

## 2026-09-15

### 0.1.0

#### Added

- Initial release with Affinity connection, SDK scripting and document previews.
