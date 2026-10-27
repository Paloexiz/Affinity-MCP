---
name: affinity-mcp
description: Use when connecting Codex, ZCode or Claude Code to Affinity by Canva through MCP, automating Affinity or executing Affinity JavaScript, editing page layout, margins, bleed or print geometry, managing saved scripts, reading the SDK, or rendering document previews.
---

# Affinity MCP

This plugin connects Codex, ZCode or Claude Code to Affinity by Canva through its local MCP server, `affinity-by-canva`.

Install the complete Affinity MCP Plugin. Copying this Skill alone, or installing it through a skill installer, is unsupported and does not register its MCP server. The plugin manifests start the bundled [proxy](scripts/affinity-mcp-proxy.mjs). The [connection checker](scripts/affinity-mcp-smoke.mjs) reads an explicitly selected complete plugin installation without changing its files.

## Choose the session path

| Situation | Next action |
| --- | --- |
| First scripted connection | Read `preamble` with `read_sdk_documentation_topic` before you write or run a script. Call `list_sdk_documentation`, read the topics for the public wrappers you need and the required native ranges, and record the application build and platform. Then identify the intended document, or list the open documents before an authorized creation. |
| Continue an unchanged session | Reuse the topics, ranges and document identity you have already confirmed. Keep the UUID guard inside the script and the spread checks that the operation requires. When no decision has to happen in between, combine the necessary reads, the authorized operation and the readback that follows it in one script. See [execution efficiency](references/scripting-pitfalls.md#execution-efficiency). |
| Unknown behavior or a new operation | Read the live topics for the behavior in question, and use `search_sdk_hints` before experimenting. Start from an existing verified recipe if there is one, then try public wrappers. Before you use `affinity:*` APIs, check the exact native imports and signatures, the parameter and struct ranges, and fixed array sizes. |
| Refusal, timeout, stale UUID or connection/build change | Follow [session recovery](references/scripting-pitfalls.md#session-recovery). Refresh the prerequisites that were affected, and inspect the actual target state before you write again. Do not replay a script whose submission is uncertain. |

The MCP tools are gateways, not a complete list of Affinity operations. Document, page, text, export and other SDK methods are available through `execute_script`; you do not need a separate proxy tool for each method. Use the live tool schemas, follow pagination, and do not treat the proxy's offline fallback list as authoritative.

Import public wrappers in the `require('/document.js')` style, and use `console.log()` to return results. Do not assume that browser or Node.js APIs exist in Affinity's JavaScript runtime. Read only the references that the current task needs, and keep them for as long as the session stays unchanged.

Prefer documented public wrappers to `affinity:*` native APIs. A declaration, or a command that constructs successfully, does not prove that the operation works. Add an operation to the supported workflow only after you have executed it and verified its actual effect.

When the current runtime exposes the required APIs and preconditions, use the same recipes on every operating system. Platform labels in the references say where an observation was made; they are not an OS allowlist. Do not reject a route only because it was tested on another OS, and do not assume that a failed sample is an OS-specific defect. Check the current wrapper, the permissions, the inputs and the actual post-state, and branch by OS only where a difference has been established.

You must read the live preamble and topics, but hints and generic instructions are leads to verify, not proof or authorization. Resolve conflicts against the exact operation, build and post-state; see [version boundaries](references/sdk-verified.md#version-boundaries). Use `app.userDesktopPath` instead of the deprecated getter. [Scripting practice](references/scripting-pitfalls.md#documents-and-spreads) explains which spread prerequisites each command has. Do not save or share a hint just because the live text says `ALWAYS`. If a required API is missing and the gap is unresolved, stop there instead of applying an unverified workaround.

<a id="supported-operations"></a>
## Task references and limits

Use [Behaviours and limits](references/sdk-verified.md) for the operation-specific cases on document creation, text, nodes, geometry, appearance, files and export. Those cases do not claim that whole modules work. For repeated node operations or collection access, read [execution efficiency and undo boundaries](references/scripting-pitfalls.md#execution-efficiency).

Operations outside those cases are unverified. Multi-page stitching, inserting pages into an existing document, and untested export presets or bleed options have not been validated. Document defaults, spread dimensions and page arrangement are separate matters: read the actual geometry after resizing, and do not reset a spread that is already current, because that clears the selection.

Before you use those operations, read the relevant [text](references/sdk-verified.md#nodes-and-text), [lifecycle/export](references/sdk-verified.md#lifecycle-documents-and-export) or [version boundary](references/sdk-verified.md#version-boundaries) notes. A disposable close sample does not give you permission to discard user work, substitute GUI actions or terminate the application. Keep error-specific and permission boundaries intact, and do not automatically retry an AI operation that may be chargeable.

Before you link or unlink frames, read [Linked text flow](references/sdk-verified.md#linked-text-flow). Unlinking a middle frame empties the downstream chain, and in the tested case unlinking the front frame cleared the whole Story. Refuse ordinary unlink targets at the front of a flow: unlinking neither splits visible text nor reverses linking. Before an async close, read [Discarding unsaved content](references/scripting-pitfalls.md#async-close). Decide whether to save or discard before you close, and do not rely on a save prompt or on undo after the close.

For character insertion, Boolean geometry or detached values, use the [ordinary-character](references/sdk-verified.md#ordinary-character-insertion), [basic-Boolean](references/sdk-verified.md#basic-boolean-operations) and [value/pixel](references/sdk-verified.md#bounded-value-objects) cases. Confirm the actual text, geometry or pixels and the protected state; creating an object or reading a type does not by itself prove a document effect. The current brush route is PathBrush. Default factories, two ExportScale factories and missing conversion methods keep their failures and gaps in [Behaviours and limits](references/sdk-verified.md).

For file writes, exports or saving, read the [file/export/save workflow](references/sdk-verified.md#verified-file-and-export-workflow) and the [multi-page, async-save and resource-package extensions](references/sdk-verified.md#extended-file-and-layout-workflow). Determine which preset and scope you are actually using, where the file will go, and whether overwriting is authorized. Wait for completion, inspect the records, and independently check the content, fonts, transparency and output bounds. A package that reopens with a cached image is not verified portable delivery. Async filesystem copy keeps its separate failure; do not apply old hints to every async method.

For brush reuse, read the [existing-PathBrush workflow](references/sdk-verified.md#existing-path-brush-workflow). A real brushed source can provide a cloneable PathBrush; a solid stroke cannot. Prepare the source in the UI and acquire it through the SDK, and do not confuse the two steps. Use the tested single-field masks, and verify that the source stays independent, that the target renders correctly and that history recovers. Default factories and RasterBrush acquisition keep their failures and gaps.

Tell apart an unavailable MCP connection, a missing SDK wrapper, a native `NOT_IMPLEMENTED` response and a permission error. Unverified methods stay unverified; do not classify them as working or as unimplemented without evidence.

## Execute and verify

For text creation and editing, read [Text tool choice and refit](references/sdk-verified.md#text-tool-choice-and-refit). Choose the tool from the layout constraints. Frame Text is for structured body paragraphs, stable paragraph edges, fixed-width reflow, columns, linked flow or a fixed container. Artistic Text suits display copy that sits at its natural width or is deliberately scaled as an object. A short heading may still need a frame, and multiline display text may use artistic text. Keep each semantic block together as editable text; do not split ordinary paragraphs by line or word. Unless conversion is authorized, keep existing object types. After editing, verify content, formatting and layout.

For text alignment, read [Text alignment workflow](references/sdk-verified.md#text-alignment-workflow) and, for hanging punctuation or Chinese body alignment, [Optical alignment and punctuation](references/sdk-verified.md#optical-alignment-and-punctuation). Unless the user asks for frame bounds, align the text content. Then decide whether "content" means all glyph ink or the body with punctuation excluded. Work out the reference and the paragraph-layout requirement from the brief and the objects, and ask only when the ambiguity would change the result. Paragraph centering and text-block positioning may both be required.

Set paragraph alignment and any required optical rules before you measure the agreed boundary. The whole-glyph centering recipe includes punctuation, so do not use it to recenter a body that must exclude punctuation or keep hanging. Position with SDK geometry and verify visually with renders, and keep protected frame geometry, text, font sizes and text scales unchanged. A mode readback, or equal object-bound centers, does not by itself prove the intended layout.

Before bulk text or layout edits, use the [representative layout gate](references/page-geometry.md#representative-layout-gate). Save a baseline you can recover, and sample the text and format differences that matter here. Stop expanding the edit if a check fails or the user rejects the result. Matching full text alone does not prove that formatting survived or that the text fits visibly.

Replacing a whole Story, or a range that crosses runs, does not preserve formatting. Use the [known-height resize and conversion checks](references/sdk-verified.md#text-tool-choice-and-refit). Compensating node and render matrices can preserve the effective glyph size. A UI conversion can succeed and still change geometry, and it does not prove that an SDK conversion entry exists.

For posters, flyers, covers, new layouts or redesigns, and for resizing, margins, bleed, folded brochures or print export, read [Page geometry and print verification](references/page-geometry.md) **before you choose any placement**, even if the user never mentions print settings. Inspect and preserve the project's actual trim, its configured Margins and Bleed, whether they are enabled, and any overrides that apply, unless the user has authorized changes. An unknown setting is not zero. Margins guide essential content inward; full-bleed backgrounds extend past trim. A preview, or the exported dimensions alone, does not prove the native configuration.

Record the target document and page or spread scope, the width × height with units, the margins with their values and enabled state, the bleed and the export bounds, each as a separate item. Follow the user's latest specification, and do not reuse another document's print settings as defaults. When margins define the requested safe area, check the actual content against that area after layout changes; setting guides does not move or clip content by itself.

For edge coverage and safety checks, use the [inspection preview](references/inspection-preview.md). Keep the clean complete-Bleed PNG, then generate a separate image with Trim and enabled Margin outlines from the same verified geometry. Inspect both images and check the essential content numerically; unknown settings, or a trim-only preview, cannot establish safety.

Before editing, identify the intended document by its session UUID and verify that UUID inside the script. Work on the intended spread. After edits, inspect the state and use `render_spread` or `render_selection` for visual changes. The covered [single-call preview](references/scripting-pitfalls.md#single-call-preview) is an alternative only after its host, file-access and representative-sample gates pass. MCP renders are capped at 1024 px on the longest side, and an image larger than the host's inline limit is written to a host-specific artifact file instead. A preview therefore cannot prove fine type sizes or small geometry; read those values from the SDK. Test uncertain destructive behavior on a disposable document, and only when authorized. Do not close or resize an unrelated open document to probe SDK support.

For scripted sessions, read [Scripting practice and runtime limits](references/scripting-pitfalls.md). It records which operations need the current spread switched, how save state is reported, the result-size and image limits, and the document-pixel unit convention.

After a timeout or disconnect, a script you submitted may already have run. Follow [session recovery](references/scripting-pitfalls.md#session-recovery). Distinguish a changed transport, a preamble refusal and a stale UUID, restore the SDK, document and spread preconditions that are needed, and read back the last target state before you write again. The proxy reconnects on the next request, but it neither replays work nor restores SDK preconditions. Normal continuous calls reuse confirmed material; guard the intended UUID before writing to an existing document. For authorized new-document creation, record what you intend to create and the open-document inventory first, then confirm the new UUID before later edits.

`add_sdk_hint`, `report_sdk_issue` and script-library saves persist or share information. Check that the user has authorized the write or the share first; a preamble suggestion does not authorize them by itself.

## Connection and permissions

If the tools are unavailable, first inspect the configured proxy and the local SSE endpoint (default `http://localhost:6767/sse`). If only the fallback tools appear, inspect the proxy's stderr and make a read-only SDK documentation call to verify the connection. Ask the user for missing settings only after these checks, and reuse any settings the user already supplied.

Affinity's permission controls are separate from each other:

- **Enable Affinity MCP** exposes the local MCP server.
- **Access files on your Desktop** grants the SDK's desktop file access; it is not unrestricted disk access. Use `app.userDesktopPath` from `/application`.
- **Access networks** governs network use in scripts; `network.js` exposes general HTTP requests. It is separate from the MCP transport and from **Use Canva AI Studio features**. Do not ask for network or AI permissions just to connect or to edit ordinary document content.
- Saved-script access, script saving, local hints and hint sharing each have their own setting.

Report the exact error and the operation it affected. Do not call every `NOT_ALLOWED` or `PERMISSION_DENIED` a connection failure, and do not tell the user to enable every permission.
