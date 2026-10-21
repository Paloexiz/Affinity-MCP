<p align="center">
  <img src="assets/affinity-mcp-icon.svg" width="112" height="112" alt="Affinity MCP">
</p>

<h1 align="center">Affinity MCP</h1>

<p align="center">Let your AI assistant work in Affinity</p>
<p align="center">English | <a href="README.zh-cn.md">简体中文</a></p>
<p align="center">
  <a href="#get-started">Get started</a> ·
  <a href="#what-can-it-do">What can it do?</a> ·
  <a href="#privacy-and-terms">Privacy and terms</a>
</p>

## Get started

You need **Affinity by Canva**, **Node.js 24.20+**, and **Codex, ZCode or Claude Code** with plugin support. Run Affinity and your AI assistant on the same computer.

### 1. Enable MCP

Open **Settings → Model Context Protocol** in Affinity and turn on **Enable Affinity MCP** to enable the local connection.

<details>
<summary>Settings screenshot and optional permissions</summary>

![Affinity's Model Context Protocol settings panel](assets/affinity-mcp-settings.png)

The default address is `http://localhost:6767/sse`. Enable other switches when a task needs them; they are not all required for a connection.

| What you want to do | Switch and scope |
| --- | --- |
| Open, edit or save Desktop files | **Access files on your Desktop**; Desktop access only, not the entire disk. |
| Use existing scripts | **Use saved scripts**. |
| Save scripts to the panel | **Save scripts to your scripting panel**. |
| Save local task hints | **Save task hints to your device's local memory**. |
| Let scripts make HTTP requests | **Access networks**; the MCP connection works with this off. |
| Use Canva AI | **Use Canva AI Studio features**; Premium and Ultra tools consume your plan's monthly AI allowance. |
| Share anonymized task hints | **Share task hints with Affinity**; sharing is your choice. |

</details>

<a id="install"></a>

### 2. Install the plugin

**Codex**: add `Paloexiz/Affinity-MCP` in the plugin marketplace and install **Affinity MCP**. Or run in your terminal:

```shell
codex plugin marketplace add Paloexiz/Affinity-MCP
codex plugin add affinity-mcp@affinity-mcp
```

<details>
<summary>Claude Code</summary>

Add the marketplace and install the plugin in your terminal:

```shell
claude plugin marketplace add https://github.com/Paloexiz/Affinity-MCP.git
claude plugin install affinity-mcp@affinity-mcp
```

</details>

<details>
<summary>ZCode</summary>

Open a workspace, then go to **Settings → Plugins → Create → Add Plugin Marketplace**. Enter `Paloexiz/Affinity-MCP` and install **affinity-mcp** from the personal marketplace. You can also add a local repository directory.

</details>

Install the complete plugin: it registers the MCP server automatically. Installing the Skill alone cannot connect.

### 3. Send your first request

Ask your AI assistant:

> Connect to Affinity and list the open documents. Don't modify anything yet.

## What can it do?

<a id="supported-features"></a>

| Common task | Work you can ask for |
| --- | --- |
| Edit text | Create Artistic Text or Frame Text, change content, fonts, sizes and paragraph formatting, and link text frames. |
| Organize layers | Inspect, select, rename and move layers; change locking and visibility. |
| Adjust layouts | Align and resize objects, set margins, and work with basic shapes, fills and strokes. |
| Save and export | Save and reopen native documents; export PNG, JPEG, SVG, PDF or WebP. |

Once connected, name the document or objects you want to work on and describe the result. For example:

> Align the selected text frames to the left without changing their font sizes.

Available operations depend on Affinity's APIs, the current objects and permissions. See the [operation guide](skills/affinity-mcp/SKILL.md#supported-operations) and [verified cases](skills/affinity-mcp/references/sdk-verified.md#version-boundaries) for details.

<a id="unsupported-or-unverified-features"></a>

### Before you use it

- **Save before closing.** Tested async-close paths discarded unsaved content without prompting; do not rely on a save prompt.
- **Unlinking text frames does not restore their original text.** In the tested two-frame case, all merged text stays in the source frame and the target becomes empty.
- **Check the actual layout.** Chinese punctuation, mixed formatting and overflow need inspection. Choose Artistic Text or Frame Text to suit the layout. [Text and punctuation guide](skills/affinity-mcp/references/sdk-verified.md#text-tool-choice-and-refit)
- **Check exported files too.** Basic format exports do not establish Bleed, multi-page output, font embedding or custom dimensions. [Export scope](skills/affinity-mcp/references/sdk-verified.md#verified-file-and-export-workflow)
- **Inspect the document after a timeout.** The operation may already have run; check its state before retrying.

<details>
<summary>What other limits should I know about?</summary>

Not every Affinity interface feature is available through MCP. There is no verified SDK route for setting custom Chinese punctuation hanging rules or text-frame vertical alignment. Default brush creation and async file copy still have recorded failures. Complex text chains, advanced selections and other untested parameters are not verified either.

See the [SDK reference](skills/affinity-mcp/references/sdk-verified.md) for the full cases and limits, and [troubleshooting notes](skills/affinity-mcp/references/scripting-pitfalls.md) for connection, permission and scripting issues.

</details>

## Common questions

| Problem | What to check first |
| --- | --- |
| Can't connect | Keep Affinity open, enable MCP, and make `node` available on `PATH`. `node --version` must be at least 24.20; 24.21+ is recommended. Seeing tools in a list does not prove a live connection. |
| Tools appear twice | Disable other plugins or MCP configurations providing the same Affinity tools. |
| Old content after an update | Refresh the marketplace, update the plugin, then open a new task or restart the session. |
| File access is denied | Enable Desktop file access and check that the target is within the permitted Desktop scope. |

<details>
<summary>How do I update?</summary>

Refresh the marketplace, then update or reinstall in your client. Codex CLI:

```shell
codex plugin marketplace upgrade affinity-mcp
codex plugin add affinity-mcp@affinity-mcp
```

Claude Code:

```shell
claude plugin marketplace update affinity-mcp
claude plugin update affinity-mcp@affinity-mcp
```

In ZCode, refresh the personal marketplace and update the plugin. Open a new task or restart the session afterward to avoid keeping old tools and Skill content.

See the [changelog](CHANGELOG.md) ([简体中文](CHANGELOG.zh-cn.md)) for version changes.

</details>

<a id="check-a-real-installed-connection"></a>
<details>
<summary>Advanced: check a real installed connection</summary>

Keep Affinity open with MCP enabled. From the plugin's installation directory, run:

```shell
node skills/affinity-mcp/scripts/affinity-mcp-smoke.mjs --plugin-root "<absolute-plugin-root>" --config codex
```

Replace `<absolute-plugin-root>` with the exact absolute installation path. Use `--config shared` for Claude Code / ZCode.

The checker verifies that copy's manifest and proxy versions, discovers online tools and reads the SDK preamble. It does not execute document scripts or change documents, settings, hints or the script library, and it does not choose a cached copy automatically. A pass verifies the selected configuration's connection only, not which copy the client interface loaded or whether document operations work.

</details>

## Privacy and terms

The plugin connects to Affinity locally by default, but document content and previews returned to your AI client may be sent to its model provider. Read the [Privacy Policy](PRIVACY.md) and [Terms of Service](TERMS.md) before use.

This is a community project maintained by [Paloexiz](https://github.com/Paloexiz), not an official OpenAI, Z.ai, Anthropic, Canva or Affinity product. For help, use [project Issues](https://github.com/Paloexiz/Affinity-MCP/issues). Issues are public; remove sensitive information before posting.

## Project information and credits

See the [versioning guide](docs/versioning.md) for development channels and delivery rules.

The plugin layout follows [Superpowers](https://github.com/obra/superpowers). ZCode reuses the format through its [Claude Code plugin compatibility](https://zcode.z.ai/en/docs/plugin). Claude Code integration follows its [plugin reference](https://code.claude.com/docs/en/plugins-reference) and [marketplace specification](https://code.claude.com/docs/en/plugin-marketplaces).

The proxy and Skill derive from [deba33/codex-plugins-by-deba33](https://github.com/deba33/codex-plugins-by-deba33), with source revision `9f2c2db` in Paloexiz's fork. Original MIT attribution is retained in [LICENSE.upstream](LICENSE.upstream) and [NOTICE](NOTICE). This repository uses the [MIT license](LICENSE).
