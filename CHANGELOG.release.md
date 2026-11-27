# Affinity MCP Changelog

## 2026-10-27

### 0.5.4

#### Added

- Add bundled Skill workflow recipes with bounded sample limits for basic rectangle Boolean operations (union, subtract, intersect, XOR), ordinary character insertion, detached values and RGBA8 pixel readback, synchronous PNG/JPEG/SVG/PDF/WebP and asynchronous PNG export of the current spread (without Bleed), and synchronous native save-as and reopen of a task-owned file.
- Add bundled Skill workflow recipes with documented limits for three-frame linked text across spreads, resizing a text frame to a known height without automatic height calculation, two-page whole-document and selected-page PDF export, transparent mixed Chinese and Latin text export (including explicit native `Size` and asynchronous PNG for the current page), and asynchronous native save-as, overwrite, and reopen of a task-owned file.
- Add a bundled Skill recipe for asynchronous resource packaging with `PackageResourcesPolicy.None` on a task-owned sample without external linked resources: packaging keeps the live document's original path and leaves pre-existing unsaved changes marked dirty, so users who want to save the current project must still execute a save.
- Add a bundled Skill recipe for reusing an existing `PathBrush`. First apply a brush preset to the source curve in the UI, then clone its `PathBrush`, adjust the width, and apply the brush to another curve using single-field line-style masks. In the sample, both `PathBrush.createDefault()` and `RasterBrush.createDefault()` threw errors. The SDK interfaces checked offered no other way to obtain a `RasterBrush` instance, so cloning, modifying, and painting with one were not tested.

#### Changed

- Reorganize both READMEs around quick start, usage notes, and common questions, and update the bundled Skill to treat recipes as shared across operating systems when runtime APIs and preconditions match, using recorded OS labels as provenance rather than an allowlist.
- Update the bundled Privacy Policy to state that your AI client will typically send document text, script outputs, and canvas previews returned by tools to your chosen AI model provider, where they may be logged or retained; how that data is handled depends on the terms and account settings of your AI client and model provider.
- Update the bilingual Terms of Service wording to state that operations involving file writes, network calls, paid AI tools, hint sharing, or issue reporting must remain within explicit user authorization (instead of "should remain within the relevant authorization"), while noting that the bundled Skill only guides the AI and the local proxy does not independently audit permissions or verify script intent.
- Update the bundled Skill and README guidance to treat linked text frames as one merged Story: linking merges their text, and unlinking does not split visible text or restore original separate texts. In the tested samples, unlinking a non-front frame left the full Story in the upstream frame and left the unlinked frame and downstream chain empty, while unlinking the front frame cleared the whole Story; guidance now advises rejecting front-frame targets before ordinary unlinking.
- Update the bundled Skill and README guidance to require deciding whether to save or discard unsaved work before an asynchronous close, as tested `closeAsync` and `promises.close` calls discarded unsaved content directly without showing a save prompt.
- Update the bundled Skill's text editing guidance to note that whole-Story or cross-run `createSetText` replacement does not guarantee that mixed formatting is preserved: even when the call succeeds (including replacing with the same string or equal-length text across a style boundary), character runs can merge or shift, so formatting tasks must verify character and paragraph runs before and after editing.
- Update the bundled Skill's export guidance to require reading back native Bleed settings and inspecting actual output dimensions or PDF boxes whenever complete Bleed is required: default areas (`CurrentSpread`) and print presets (such as print PDF `WholeDocument`) can omit outer Bleed even when Bleed was requested at creation and export records report `OK`, and no general include-Bleed option is verified.
- Update the bundled Skill's packaging guidance with an offline fidelity verification requirement for linked images: in a separate `PackageResourcesPolicy.IncludeImages` sample, reopening a package via `Document.load` after the linked source image became unavailable (such as being renamed, moved, or removed) kept text, geometry, and resource metadata intact while the exported image region degraded; verify actual original files and an offline render before portable delivery, and do not delete source files still in use.

#### Fixed

- Earlier bundled Skill references recorded ordinary character insertion as failing at construction, while older SDK hints claimed every Mac asynchronous PNG export fails with `NO_ENVIRONMENT` (earlier bundled references had already recorded asynchronous `PNG/CurrentPage`, but not `PNG/CurrentSpread`). Now the references record passing bounded 3.3.1.4940 MacOS samples for ordinary character insertion and asynchronous `PNG/CurrentSpread` export via `promises.export` (alongside updated asynchronous `PNG/CurrentPage` coverage), while keeping `FileSystemPromises.copyFile` as failing and recording two `ExportScale` factory counterexamples.
- Earlier bundled Skill references pointed to `VectorBrush` and `lineStyle.vectorBrush`. Now the references record that `lineStyle.vectorBrush` was undefined and `/vectorbrush.js` failed to load on 3.3.1.4940 MacOS, and update brush references to `PathBrush` and `lineStyle.pathBrush`. In that build, `PathBrush.createDefault()` and `RasterBrush.createDefault()` both threw a “not yet implemented in C++ API” error. No other way to obtain a `RasterBrush` instance was found in the SDK interfaces checked.

## 2026-10-20

### 0.5.3

#### Changed

- Update the bundled Skill's text tool guidance to choose between Frame Text and Artistic Text based on layout constraints (paragraphs, wrapping, containers, and alignment) instead of preferring Artistic Text by default.
- Update the bundled Skill's alignment guidance to distinguish visual alignment of Chinese body text from full-glyph-bounds centering, and note that while single-line samples verified switching optical alignment modes (`None`, `Manual`, `Font`) through the SDK, no SDK entry point was found for custom punctuation hanging rules.

### 0.5.2

No user-visible changes.

### 0.5.1

#### Fixed

- The 0.5.0 installation package accidentally included seven development SDK evidence files (five verification images and two geometry fixtures). Now those files are removed from the release package.

### 0.5.0

#### Added

- Add a bundled local inspection helper (`inspection-preview.mjs`) and Skill guide that generate a standalone SVG inspection preview from a clean complete-Bleed PNG and matching geometry JSON—showing outer Bleed, Trim, and enabled Margin outlines over a transparency checkerboard—without modifying the Affinity document or proxy.
- Add bilingual release notes (`CHANGELOG.md` in English and `CHANGELOG.zh-cn.md` in Simplified Chinese) with links from both READMEs.

#### Changed

- Reorganize the bundled Skill entry point by session path and add execution-efficiency and undo-boundary guidance, including a conditional single-call complete PNG preview recipe for covered small synthetic samples (requiring authorized Desktop file access, host native image forwarding, and a verified complete selection when outer Bleed must be included).
- Add Bleed, enabled Margin, essential-content safety, and full-bleed background coverage preflight checks to the bundled Skill guidance for posters, flyers, covers, new layouts, and redesigns.

## 2026-10-16

### 0.4.3

#### Added

- Add bilingual Privacy Policy and Terms of Service in English and Simplified Chinese, with links in installation guides and plugin listings.

### 0.4.2

No user-visible changes.

## 2026-10-15

### 0.4.1

#### Changed

- Remove internal branch-maintenance details from both READMEs and add a link to the versioning guide for channel numbering and changelog conventions.

## 2026-10-13

### 0.4.0

#### Changed

- Package the proxy service and connection checker inside `skills/affinity-mcp/scripts/`; installing the full Plugin is required to register MCP.
- Remove internal development docs, hooks, tests, and developer tools from the release package.

#### Fixed

- When an SSE stream contained a bare `event` or `data` line without a colon, the proxy ignored it. Now bare `event` resets the event type and bare `data` appends a newline.

## 2026-10-12

### 0.3.0

#### Added

- Add a connection check script (`affinity-mcp-smoke.mjs`) for an explicitly selected plugin installation to verify its launch configuration, manifest and proxy versions, online `tools/list` pagination (failing if offline fallback tools are used), SDK preamble readback, and clean proxy shutdown.

#### Fixed

- Invalid client JSON-RPC IDs, non-object `params`, malformed `tools/list` or `tools/call` parameters, and `c`/`C`-prefixed non-header inputs could bypass local validation or trigger wrong legacy `Content-Length` framing, and an empty-string `cursor` fell back to static tools on error. Now the proxy validates client requests and standalone `Content-Length` headers locally before connecting upstream, and rejects failed `tools/list` calls whenever `cursor` is provided, including `""`.
- The proxy previously accepted unvalidated upstream `initialize` results and JSON-RPC payloads, did not answer upstream requests such as `ping`, and split SSE streams only on LF (`\n`). Now it validates upstream `initialize` fields, protocol version match, and JSON-RPC message shapes, replies to upstream requests (closing that connection and rejecting calls still waiting on it if reply delivery fails), and handles bare CR and split CRLF SSE line endings.

## 2026-10-09

### 0.2.0

#### Added

- Support configuring upstream request and POST timeouts via `AFFINITY_MCP_REQUEST_TIMEOUT_MS` (100–300000 ms, default 30000 ms; invalid values exit at startup) and structured JSON-RPC error diagnostics identifying `phase` (`connect`, `endpoint`, `post`, `response`, `sse`, `upstream`) and `outcome` (`not_submitted` vs. `unknown` for attempted `tools/call` requests).

#### Changed

- Add bundled Skill guidance for choosing between Artistic Text and Frame Text, multiline paragraph centering and glyph-bounds alignment (from tested 3.3.0.4850 Win32 samples), target-scope/parent-coordinate checks and a representative sample gate before bulk text or layout edits, and updated 3.3.0.4850 Win32 boundaries for synchronous disposable document close and plain text replacement.
- Update the bundled Skill to reuse confirmed SDK documentation during an unchanged connection and application build, and add structured session-recovery guidance with mandatory in-script document UUID verification before modifying existing documents.

#### Fixed

- Client `initialize` previously echoed arbitrary `protocolVersion` values without type checks, non-`connect` proxy errors always appended the startup hint, SSE failures during endpoint wait or initialization could be missed, and POST/SSE completion races did not separate `post` and `response` timeouts. Now `initialize` validates `protocolVersion` as a string and returns the proxy's supported version (`2025-11-25`), only `connect` failures show the Affinity startup hint, initialization aborts on stream errors, and the first terminal POST/SSE event settles each request without duplicate responses.

## 2026-09-15

### 0.1.0

#### Added

- Initial release for Codex, ZCode, and Claude Code, including the local Node.js MCP proxy for connecting to Affinity by Canva's local MCP server (forwarding SDK documentation, script execution, spread and selection previews, script library, and hint tools) and the bundled Affinity Skill and references.
