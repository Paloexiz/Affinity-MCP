<p align="center">
  <img src="assets/affinity-mcp-icon.svg" width="112" height="112" alt="Affinity MCP">
</p>

<h1 align="center">Affinity MCP</h1>

<p align="center">A Model Context Protocol (MCP) plugin connecting AI clients to Affinity by Canva</p>
<p align="center">English | <a href="README.zh-cn.md">简体中文</a></p>
<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#usage-notes">Usage notes</a> ·
  <a href="#privacy-and-terms">Privacy and terms</a>
</p>

<a id="quick-start"></a>
<a id="get-started"></a>

## Quick start

### Prerequisites

- **Affinity by Canva** (must run locally on the same machine as your AI client)
- **Node.js** 24.20 or newer (24.21+ recommended)
- Supported AI client: **Codex**, **ZCode**, or **Claude Code**

### 1. Enable MCP service

In Affinity, open **Settings → Model Context Protocol** and turn on **Enable Affinity MCP**.

<details>
<summary>Settings screenshot and permission descriptions</summary>

![Affinity's Model Context Protocol settings panel](assets/affinity-mcp-settings.png)

The default endpoint is `http://localhost:6767/sse`. Additional permissions can be configured as needed:

| Permission | Setting | Description |
| --- | --- | --- |
| Desktop file access | **Access files on your Desktop** | Grants access to your Desktop directory only; not full disk access. |
| Read saved scripts | **Use saved scripts** | Allows reading scripts stored in Affinity's scripting panel. |
| Save scripts to panel | **Save scripts to your scripting panel** | Allows saving generated scripts to the scripting panel. |
| Local hint storage | **Save task hints to your device's local memory** | Stores task context hints locally on your machine. |
| Script network access | **Access networks** | Allows scripts to make outbound HTTP requests; disabling it does not affect local MCP operation. |
| Canva AI features | **Use Canva AI Studio features** | Enables Canva AI tools (premium tools consume plan allowances). |
| Anonymous hint sharing | **Share task hints with Affinity** | Shares anonymized task hints with Affinity (optional). |

</details>

<a id="install"></a>

### 2. Install the plugin

**Codex**: Search and install `affinity-mcp` in the plugin marketplace, or run:

```shell
codex plugin marketplace add Paloexiz/Affinity-MCP
codex plugin add affinity-mcp@affinity-mcp
```

<details>
<summary>Claude Code</summary>

Add the marketplace source and install:

```shell
claude plugin marketplace add https://github.com/Paloexiz/Affinity-MCP.git
claude plugin install affinity-mcp@affinity-mcp
```

</details>

<details>
<summary>ZCode</summary>

Navigate to **Settings → Plugins → Create → Add Plugin Marketplace**, enter `Paloexiz/Affinity-MCP`, and install **affinity-mcp** from your personal marketplace. You can also specify a local repository path directly.

</details>

> [!NOTE]
> Installing the complete plugin is required to register the MCP server automatically; installing the standalone Skill cannot establish a connection.

### 3. Verify connection

Send the following prompt to your AI client to verify connectivity:

> Connect to Affinity, list open documents, and do not make changes yet.

<a id="features"></a>
<a id="what-can-it-do"></a>
<a id="supported-features"></a>

## Features

| Category | Supported operations |
| --- | --- |
| Typography | Create Artistic Text and Frame Text; edit content, font families, sizes, and paragraph styles; link text frames. |
| Layer management | Inspect, select, rename, and reorder layers; toggle lock and visibility states. |
| Layout & geometry | Align elements, resize objects, configure margins, draw primitive vector shapes, and adjust fills and strokes. |
| Documents & exports | Save and reopen native documents; export to PNG, JPEG, SVG, PDF, and WebP. |

Usage example:

> Align the selected text frames to the left without changing their font sizes.

For each operation's scope, limits, and verified cases, see the [operation guide](skills/affinity-mcp/SKILL.md#supported-operations) and [verified test cases](skills/affinity-mcp/references/sdk-verified.md#version-boundaries).

<a id="usage-notes"></a>
<a id="before-you-use-it"></a>
<a id="unsupported-or-unverified-features"></a>

### Usage notes

- **Saving and closing documents**: Closing a document asynchronously discards unsaved changes without showing a confirmation prompt. Save explicitly before you close.
- **Unlinking text frames**: In the samples we tested, unlinking a frame that was not the front of the flow left the whole Story in the upstream frame and left the unlinked frame and the rest of the chain with an empty Story. It does not split the visible text, and it does not restore the separate texts you had before linking. Unlinking the front frame can clear the entire Story, so reject front-frame targets before any ordinary unlink. For the tested builds, target preconditions, and verification limits, see [linked text flow](skills/affinity-mcp/references/sdk-verified.md#linked-text-flow); these samples do not establish behavior for every chain or version.
- **Typography needs visual inspection**: Judge Chinese punctuation wrapping and hanging, mixed formatting, and overflow on the canvas. Choose Artistic Text or Frame Text according to how the text must lay out. See [typography notes](skills/affinity-mcp/references/sdk-verified.md#text-tool-choice-and-refit).
- **Validate exported files**: A basic export that succeeds does not prove that bleeds, multi-page setups, font embedding, or custom dimensions came out as intended; check the result yourself. See [export verification scope](skills/affinity-mcp/references/sdk-verified.md#verified-file-and-export-workflow).
- **Timeout handling**: A request timeout does not mean the operation failed; the script may already have run inside Affinity. Check the document state before retrying, or you may apply the same change twice.

<details>
<summary>Known limitations</summary>

The MCP interface does not cover everything the Affinity desktop UI can do. For example, custom Chinese punctuation hanging rules and vertical text alignment inside frames have no working SDK entry points, and default brush creation and asynchronous file copy still raise exceptions in current builds. Do not rely on complex text chains or advanced selection parameters without verifying them first.

For the full boundaries and test records, see the [SDK reference](skills/affinity-mcp/references/sdk-verified.md). For connectivity, permission, and scripting problems, see the [troubleshooting guide](skills/affinity-mcp/references/scripting-pitfalls.md).

</details>

<a id="common-questions"></a>

## Common questions

| Issue | Resolution |
| --- | --- |
| Connection fails | Verify Affinity is running with MCP enabled in Settings; confirm Node.js is installed (`node --version` ≥ 24.20, recommended 24.21+). Note: seeing tools in the client list does not indicate an active connection. |
| Duplicate tools | Disable duplicate plugins or MCP entries providing overlapping Affinity tools. |
| Updates not applied | Refresh the marketplace in your client, update the plugin, and restart the session to clear cached tools and Skill files. |
| Permission denied | Verify that **Access files on your Desktop** is enabled in Affinity settings and the file resides within the user's Desktop directory. |

<details>
<summary>Updating the plugin</summary>

Refresh marketplace sources and perform updates:

**Codex CLI**:

```shell
codex plugin marketplace upgrade affinity-mcp
codex plugin add affinity-mcp@affinity-mcp
```

**Claude Code**:

```shell
claude plugin marketplace update affinity-mcp
claude plugin update affinity-mcp@affinity-mcp
```

**ZCode**: Refresh your personal marketplace and update. Restarting client sessions is recommended to load updated tools and reference guidelines.

See the [Changelog](CHANGELOG.md) ([简体中文](CHANGELOG.zh-cn.md)) for release history.

</details>

<a id="check-a-real-installed-connection"></a>
<details>
<summary>Advanced: Connection smoke test</summary>

With Affinity running and MCP enabled, execute from the plugin directory:

```shell
node skills/affinity-mcp/scripts/affinity-mcp-smoke.mjs --plugin-root "<absolute-plugin-root>" --config codex
```

Replace `<absolute-plugin-root>` with the absolute installation path; use `--config shared` for Claude Code / ZCode.

The script checks local manifests, proxy versions, tool discovery, and the SDK preamble. It does not execute document manipulation scripts, alter document data, or modify script panels. A passing check confirms only that the local interface of the selected copy is reachable; it does not prove that the UI loaded this copy.

</details>

<a id="privacy-and-terms"></a>

## Privacy and terms

By default, the plugin communicates only with the local Affinity service. However, any document data, text, and previews returned to your AI client are passed on to the model provider configured in that client. Review our [Privacy Policy](PRIVACY.md) and [Terms of Service](TERMS.md) before use.

This is an open-source community project maintained by [Paloexiz](https://github.com/Paloexiz), not an official product of OpenAI, Z.ai, Anthropic, Canva, or Affinity. Report issues via [GitHub Issues](https://github.com/Paloexiz/Affinity-MCP/issues) (public tracker; remove sensitive data before posting).

## Project structure and credits

Release channels and versioning conventions are documented in the [versioning guide](docs/versioning.md).

The layout follows [Superpowers](https://github.com/obra/superpowers); ZCode reuses this format through its [plugin compatibility feature](https://zcode.z.ai/en/docs/plugin); the Claude Code integration follows the official [plugin guidelines](https://code.claude.com/docs/en/plugins-reference) and [marketplace specifications](https://code.claude.com/docs/en/plugin-marketplaces).

The proxy implementation and bundled Skill are derived from [deba33/codex-plugins-by-deba33](https://github.com/deba33/codex-plugins-by-deba33) (source commit `9f2c2db` in Paloexiz's fork). Upstream MIT attribution is retained in [LICENSE.upstream](LICENSE.upstream) and [NOTICE](NOTICE). This project is licensed under the [MIT License](LICENSE).
