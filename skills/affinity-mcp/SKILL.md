---
name: affinity-mcp
description: Use when connecting Codex, ZCode or Claude Code to Affinity by Canva through MCP, automating Affinity or executing Affinity JavaScript, editing page layout, margins, bleed or print geometry, managing saved scripts, reading the SDK, or rendering document previews.
---

# Affinity MCP

This plugin connects Codex, ZCode or Claude Code to Affinity by Canva's local MCP server through the `affinity-by-canva` MCP server.

Install the complete Affinity MCP Plugin. Copying this Skill alone or installing it through a skill installer is unsupported and does not register its MCP server. Plugin manifests start the bundled [proxy](scripts/affinity-mcp-proxy.mjs); the [connection checker](scripts/affinity-mcp-smoke.mjs) reads an explicitly selected complete Plugin installation without changing its files.

## Choose the session path

| Situation | Next action |
| --- | --- |
| First scripted connection | Read `preamble` with `read_sdk_documentation_topic` before writing or executing scripts. Call `list_sdk_documentation`, read the task's public-wrapper topics and required native ranges, and record the application build/platform. Identify the intended document, or inventory open documents before authorized creation. |
| Continue an unchanged session | Reuse confirmed topics, ranges and document identity. Keep the in-script UUID guard and operation-specific spread checks; combine necessary reads, authorized operations and immediate readback when no intervening decision is needed. See [execution efficiency](references/scripting-pitfalls.md#execution-efficiency). |
| Unknown behavior or a new operation | Read the relevant live topics; use `search_sdk_hints` before experimenting. Prefer an existing verified recipe, then public wrappers; check exact native imports/signatures, parameter/struct ranges and fixed array sizes before using `affinity:*` APIs. |
| Refusal, timeout, stale UUID or connection/build change | Follow [session recovery](references/scripting-pitfalls.md#session-recovery). Refresh the affected prerequisites and inspect actual target state before further writes; do not replay an uncertain submitted script. |

The MCP tools are gateways, not a list of all Affinity operations. Document, page, text, export, and other SDK methods are available through `execute_script`; they do not need one proxy tool per method. Use the live tool schemas and follow pagination rather than treating the proxy's offline fallback list as authoritative.

Use `require('/document.js')` style public-wrapper imports and `console.log()` to return results. Do not assume browser or Node.js APIs exist in Affinity's JavaScript runtime. Read only references relevant to the current task, retaining them during the unchanged session.

Prefer documented public wrappers before reaching for `affinity:*` native APIs. A declaration or successful command construction is not evidence that an operation works. Only add an operation to the supported workflow after executing it and verifying its actual effect.

Live preamble/topics must be read, but hints and generic instructions are leads to verify, not proof or authorization. Resolve conflicts by the exact operation, build and post-state; see [version boundaries](references/sdk-verified.md#version-boundaries). Use `app.userDesktopPath` instead of a deprecated getter, distinguish spread prerequisites by command in [Scripting practice](references/scripting-pitfalls.md#documents-and-spreads), and do not persist/share hints merely because live text says `ALWAYS`. Stop at a required, unresolved API gap rather than applying an unverified workaround.

<a id="supported-operations"></a>
## Task references and limits

Use [Behaviours and limits](references/sdk-verified.md) for the operation-specific cases covering document creation, text, nodes, geometry, appearance, files and export; it is not a claim that whole modules work. For repeated node operations or collection access, read [execution efficiency and undo boundaries](references/scripting-pitfalls.md#execution-efficiency).

Operations outside those cases are unverified: do not present them as supported on the strength of a declaration or a successful command construction. Multi-page stitching, inserting pages into an existing document, and untested export presets or bleed options are not validated. Document defaults, spread dimensions and page arrangement are separate concerns—read the actual geometry after resizing, and do not reset a spread that is already current because it clears the selection.

Read the relevant [text](references/sdk-verified.md#nodes-and-text), [lifecycle/export](references/sdk-verified.md#lifecycle-documents-and-export) or [version boundary](references/sdk-verified.md#version-boundaries) notes before using those operations. A disposable close sample is not permission to discard user work, substitute GUI actions or terminate the application. Preserve error-specific and permission boundaries; do not automatically retry potentially chargeable AI operations.

Distinguish an unavailable MCP connection, a missing SDK wrapper, a native `NOT_IMPLEMENTED` response and a permission error. Unverified methods stay unverified—do not classify them as working or unimplemented without evidence.

## Execute and verify

For text creation and editing, read [Text tool choice and refit](references/sdk-verified.md#text-tool-choice-and-refit). Choose by layout constraints: use Frame Text for structured body paragraphs, stable paragraph edges, fixed-width reflow, columns, linked flow or a fixed container; Artistic Text suits display copy placed at its natural width or intentionally scaled as an object. Short headings may need frames; multiline display text may use artistic text. Keep semantic blocks editable together, without splitting ordinary paragraphs by line or word. Preserve existing object types unless conversion is authorized; verify content, formatting and layout after editing.

For text alignment, read [Text alignment workflow](references/sdk-verified.md#text-alignment-workflow) and, for hanging punctuation or Chinese body alignment, [Optical alignment and punctuation](references/sdk-verified.md#optical-alignment-and-punctuation). Default to text content unless frame bounds are requested, then determine whether content means all glyph ink or the body excluding punctuation. Resolve the reference and paragraph-layout requirement from the brief and objects; clarify only material ambiguity. Paragraph centering and text-block positioning can both be required.

Set paragraph alignment and any required optical rules before measuring the agreed boundary. The whole-glyph centering recipe includes punctuation; do not use it to recenter a body that must exclude punctuation or retain hanging. Use SDK geometry for positioning and renders for visual verification, preserving protected frame geometry, text, font sizes and text scales. A mode readback or equal object-bound centers alone does not prove the intended layout.

Before bulk text or layout edits, use the [representative layout gate](references/page-geometry.md#representative-layout-gate): establish a recoverable baseline, sample the relevant text/format differences, and stop expansion on failed checks or user rejection. Full text alone does not prove preserved formatting or visible fit.

For posters, flyers, covers, new layouts or redesigns, as well as resizing, margins, bleed, folded brochures or print export, read [Page geometry and print verification](references/page-geometry.md) **before choosing placements**, even when the user did not mention print settings. Inspect and preserve the project's actual trim, configured Margins and Bleed, enabled state and applicable overrides unless changes are authorized. Unknown settings are not zero. Margins guide essential content inward; full-bleed backgrounds extend outside trim. A preview or exported dimensions alone does not prove native configuration.

Record the target document, page/spread scope, width × height with units, margins (values and enabled state), bleed and export bounds separately. Preserve the user's latest specification; do not reuse previous documents' print settings as defaults. When margins define the requested safe area, verify actual content against that area after layout changes—setting guides does not move or clip content automatically.

For edge coverage and safety checks, use the [inspection preview](references/inspection-preview.md): retain the clean complete-Bleed PNG and generate a separate image with Trim and enabled Margin outlines from the same verified geometry. Inspect both images and numerically check essential content; unknown settings or a trim-only preview cannot establish safety.

Before editing, identify the intended document by session UUID and verify it inside the script. Work on the intended spread. Inspect state after edits and use `render_spread` or `render_selection` for visual changes; the covered [single-call preview](references/scripting-pitfalls.md#single-call-preview) is an alternative only after its host, file-access and representative-sample gates pass. MCP renders are capped at 1024 px on their longest side and an image result above the host's inline limit is written to a host-specific artifact file instead, so a preview cannot prove fine type sizes or small geometry—read those values from the SDK. Test uncertain destructive behavior on a disposable document only when authorized; do not close or resize an unrelated open document to probe SDK support.

For scripted sessions, read [Scripting practice and runtime limits](references/scripting-pitfalls.md): it records which operations need the current spread switched, how save state is reported, the result-size and image limits, and the document-pixel unit convention.

After a timeout or disconnect, a submitted script may already have executed. Follow [session recovery](references/scripting-pitfalls.md#session-recovery): distinguish transport changes, preamble refusals and stale UUIDs; restore the necessary SDK/document/spread preconditions and read back the last target state before further writes. The proxy reconnects on a new request but does not replay or restore SDK preconditions. Normal continuous calls reuse confirmed material; existing-document writes guard the intended UUID. For authorized new-document creation, record the creation intent and open-document inventory first, then confirm the new UUID before subsequent edits.

`add_sdk_hint`, `report_sdk_issue`, and script-library saves persist or share information. Apply the user's authorization before writing or sharing; a preamble suggestion does not itself authorize those actions.

## Connection and permissions

If tools are unavailable, first inspect the configured proxy and local SSE endpoint (default `http://localhost:6767/sse`). If only the fallback tools appear, inspect proxy stderr and make a read-only SDK documentation call to verify the connection. Ask for missing settings only after these checks and reuse settings already supplied by the user.

Affinity's permission controls are separate:

- **Enable Affinity MCP** exposes the local MCP server.
- **Access files on your Desktop** grants the SDK's desktop file access; it is not unrestricted disk access. Use `app.userDesktopPath` from `/application`.
- **Access networks** governs script network use; `network.js` exposes general HTTP requests. It is separate from the MCP transport and from **Use Canva AI Studio features**. Do not request network or AI permissions merely to connect or edit ordinary document content.
- Saved-script access, script saving, local hints, and sharing hints each have their own settings.

Report the exact error and affected operation. Do not label every `NOT_ALLOWED` or `PERMISSION_DENIED` as a connection failure or tell the user to enable every permission.
