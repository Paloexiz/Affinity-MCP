# Affinity MCP Changelog

English | [简体中文](CHANGELOG.zh-cn.md)

## 2026-10-20

### 0.5.1

#### Changed

- Limit production distribution to an explicit runtime and user-documentation file allowlist, excluding development documentation, tests, fixtures and SDK evidence, including assets/sdk-evidence. Require full-tree and local-reference checks before synchronizing main; runtime Skill references and required user resources remain in the distribution.

### 0.5.0

#### Changed

- Separate first connections, continuous tasks, unknown behavior and recovery in the Skill entry point. Reuse confirmed information and combine necessary reads, authorized operations and immediate readback when no intervening decision is needed.
- Require end-to-end gains on the same task before adopting a performance optimization. Expanded creation samples were sensitive to execution order and did not establish a stable speedup. Timing includes imports, target binding and the complete preview, separates preparation, cleanup and waits between rounds, and retains guidance on shared-selection moves, collection snapshots and undo boundaries.
- Provide a single-call complete PNG preview branch for verified small synthetic tasks. Retain object checks and authorized temporary-file cleanup, and require the host to deliver the complete image. Poster samples showed that default previews omit outer Bleed; add a bounded recipe that checks the complete selection and actual bleed extent. Matched PNG comparisons support reduced total time for that scope, without claiming faster batch insertion, a default speedup for arbitrary documents or prepress acceptance.
- Check and preserve the project's Bleed, Margin and applicable overrides before choosing content positions for posters, covers, flyers and layout revisions. Verify essential content and full-bleed backgrounds separately.
- Add a separate inspection preview that outlines Trim and enabled Margins on a verified complete-Bleed PNG using geometry in the same coordinate system. Keep the clean original. The bundled local SVG helper does not change the document or proxy and rejects mismatched image/geometry records and unknown Margin state. Guides assist visual checks; essential content still requires actual-boundary verification.
- Show a transparency checkerboard beneath the source image so a solid backdrop cannot conceal incomplete bleed coverage. Add a negative fixture with text extending beyond the Margin guide and a transparent gap, a matched control, independent blind readings and six paired total-time samples including guide rendering, without claiming a general detection rate or a speedup from adding guides.
- Provide release notes in English and Simplified Chinese, with version checks comparing dates, versions, categories and entry counts across both languages.

## 2026-10-16

### 0.4.3

#### Added

- Add English and Chinese privacy policies and terms of service covering the local proxy, AI clients, logs, optional sharing and file operations, while preserving the MIT license grant.
- Link shared policies and public contact information from both READMEs. Declare policy links using the respective fields in the Codex and Claude Code plugin manifests and the ZCode marketplace entry, and retain the policy files in the installation tree.

### 0.4.2

#### Changed

- Omit the Unreleased section when no delivery is pending, grouping version entries directly by delivery date.
- Finalize and push stable versions on the development branch before synchronizing the same version's production content to the main branch.
- Support stable snapshots on the development branch in version checks and CI, including version declarations in maintenance documentation.

### 0.4.2-dev.1

#### Changed

- Name temporary regression-test paths by project purpose while retaining coverage for spaces, Chinese characters and special characters.

## 2026-10-15

### 0.4.1

#### Changed

- Update English and Chinese installation and update instructions, link version rules to their dedicated document, and remove branch-maintenance background information.

## 2026-10-14

### 0.4.1-dev.1

#### Changed

- Group version entries by verified delivery date and distinguish development batches from stable releases.
- Use the next stable target's `-dev.N` version for development deliveries and retain stable versions on `main`. Changes and reviews within one batch share a development number; maintenance-only deliveries do not force a production version bump.

#### Fixed

- Fail version increment checks when baseline objects are missing in a partial clone, without downloading remote objects automatically. Increment mode requires Git 2.45+; static checks still work without Git.
- Preserve an established pre-edit baseline when repository documentation hooks temporarily cannot read their context, allowing changes in the same turn to be checked after recovery.
- Request manual verification when the pre-edit baseline is missing instead of requiring an impossible automatic review, and do not trigger continuation solely for a historical baseline gap.
- Support confirmed baselines using the legacy proxy layout in version increment checks. Ambiguous entry points and missing objects fail explicitly, without fetching remote objects automatically.

## 2026-10-13

### 0.4.0

#### Changed

- Bundle the proxy and connection-check scripts inside the Skill directory. Complete Plugin manifests register MCP; installing the Skill alone does not register the service. [Migration](https://github.com/Paloexiz/Affinity-MCP/commit/b920c33ae554bafd14c5ccd6d4bfe6beff271824).
- Keep only installation content and this changelog on the production branch; development maintenance resources remain on the development branch.
- Renumber source versions from `0.1.0` according to product impact and channel. The `0.4.0-dev.1` development snapshot corresponds to this stable target. Existing clones, pinned commit links and plugin caches do not switch to the rewritten history automatically; verify the selected source and loaded copy.

#### Fixed

- Recognize colonless SSE `event` and `data` fields, resetting the event type and appending a data newline respectively. [Fix](https://github.com/Paloexiz/Affinity-MCP/commit/e24fd3e54d74c3615512cb884adea4c918844ea2).

## 2026-10-12

### 0.4.0-dev.1

#### Changed

- Move the proxy and connection-check scripts into the Skill directory so runtime resources ship with the complete Plugin installation. [Migration](https://github.com/Paloexiz/Affinity-MCP/commit/b920c33ae554bafd14c5ccd6d4bfe6beff271824).

#### Fixed

- Recognize colonless SSE `event` and `data` fields. [Fix](https://github.com/Paloexiz/Affinity-MCP/commit/e24fd3e54d74c3615512cb884adea4c918844ea2).

### 0.3.0

#### Added

- Add a connection check that explicitly selects an installed Plugin copy and verifies its version, online tool discovery and SDK preamble. [Source snapshot](https://github.com/Paloexiz/Affinity-MCP/commit/89ce753d13c097db5f54a1e51826a085c2196f22).

#### Fixed

- Strengthen proxy input validation, upstream handshakes and timeout/disconnection diagnostics. Distinguish unsubmitted requests from unknown outcomes, and avoid treating discovery fallback as proof of a live connection. [Fix](https://github.com/Paloexiz/Affinity-MCP/commit/f2bd45c15db119e2c8f15764ddef55ad7396dcfd).

## 2026-10-09

### 0.2.0

#### Added

- Add the `AFFINITY_MCP_REQUEST_TIMEOUT_MS` environment variable and structured error diagnostics.

#### Changed

- Strengthen operational boundaries and verification requirements in the MCP workflow and SDK guidance. [Source snapshot](https://github.com/Paloexiz/Affinity-MCP/commit/3091aedf842aee0f77fd046b543dad1531054ff6).

## 2026-09-15

### 0.1.0

#### Added

- Initial source includes plugin manifests, a local MCP proxy and an Affinity operation Skill. [Source snapshot](https://github.com/Paloexiz/Affinity-MCP/commit/340979020824c3d33f92b32f0a1a6c7640875a00).
