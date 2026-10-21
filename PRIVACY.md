# Affinity MCP Privacy Policy

**Language: English | [简体中文](PRIVACY.zh-cn.md)**

This Privacy Policy applies to the Affinity MCP plugin (including the local proxy service, connection smoke test script, and bundled Skill) maintained by [Paloexiz](https://github.com/Paloexiz). The project repository is located at [Paloexiz/Affinity-MCP](https://github.com/Paloexiz/Affinity-MCP). For privacy inquiries, contact the maintainer through [GitHub Issues](https://github.com/Paloexiz/Affinity-MCP/issues). "We" refers to the project maintainer.

This is an independent open-source community project. Affinity by Canva, Codex, ZCode, Claude Code, your chosen AI model providers, and GitHub each operate under their own privacy policies. This document describes only the data handling practices of this plugin and its maintainer, and does not replace the policies of any third-party platforms.

## 1. Local connection and AI clients

The plugin's local proxy service runs locally on the user's device. By default, it connects to Affinity's MCP interface at `http://localhost:6767` to forward tool calls and return execution results between your AI client and Affinity. The maintainer does not operate any backend server to collect runtime data. The plugin contains no advertising, usage tracking, telemetry, tracking cookies, or user account systems.

**Please note: A local connection does not mean your overall AI workflow is completely offline. Document text, script outputs, and canvas previews returned to your AI client will typically be sent to your chosen AI model provider, where they may be logged or retained.** How that data is handled—including retention periods, training policies, and server locations—depends on your AI client and model provider's terms of service and account settings. Always review those third-party terms before processing sensitive personal information, confidential documents, or proprietary assets.

## 2. Information the plugin processes

The data handled by the plugin depends on the specific tool calls initiated by the user or the AI assistant:

| Category | Purpose and destination |
| --- | --- |
| Tool names, parameters, script code, file paths, and document/object identifiers | Forwarded from the AI client through the local proxy to Affinity to locate elements and execute requested actions. |
| Document text, object properties, file metadata, execution results, and errors | Returned from Affinity to your AI client; may include document text, property values, or console outputs from scripts. |
| Canvas or selection previews | Rendered by Affinity and returned to your AI client; may capture the full page or selected items containing sensitive information. |
| SDK documentation, script libraries, task hints, and issue reports | Read, saved, searched, or submitted only when corresponding tools are invoked, as detailed below. |
| Protocol version, plugin version, request correlation IDs, and connection diagnostics | Used to initialize connections, correlate requests and responses, and troubleshoot networking or proxy issues. |

The proxy service does not independently scan your local drive or upload documents in bulk. Scripts operate within the file and network permissions granted in Affinity settings and supported by the SDK. Outputs returned to the client are not redacted by the proxy. Additionally, the bundled Skill serves as operational guidance for AI agents, not an enforced security boundary or content filter.

## 3. Storage, logs, and retention

- **Proxy runtime data:** Request payloads, response buffers, and connection states are kept temporarily in process memory. The proxy maintains no document database, call history archive, or independent log files. Pending states are cleared when requests complete, and all process memory is released upon exit; this does not constitute secure data erasure or remove logs created by external software.
- **Client output and diagnostics:** Tool results and error messages return to the client via standard output (`stdout`), while connection diagnostics write to standard error (`stderr`). Error messages may contain file paths or network addresses. Your terminal, operating system, or client software may retain these outputs according to their own configurations.
- **Connection smoke test:** Runs only on manual execution. It inspects manifests and proxy code in the specified directory, discovers available tools, and reads the SDK preamble (which may include local task hints). The summary output prints paths, version identifiers, hash values, and tool counts to your terminal without uploading data to the maintainer.
- **Affinity content:** Saved documents, exported files, scripts in your scripting panel, and local task hints are stored and managed directly by Affinity or your filesystem until you remove them. Uninstalling the plugin does not automatically delete these files.
- **Support and issue records:** When you open a GitHub Issue, the maintainer can view your public account details and submitted issue contents to answer questions, troubleshoot, and maintain the project. Issues and technical discussions remain part of the public project history; nonessential personal details can be redacted or removed upon request where feasible.

## 4. Optional features and third-party services

- **Script networking:** If network access (**Access networks**) is enabled in Affinity settings, scripts making HTTP calls will send data directly to the external endpoints specified in those scripts.
- **Script library and task hints:** Reading or saving scripts and local hints occurs only when the corresponding tools are invoked. Note the distinction between local task hints and sharing hints with Affinity: local hints remain on your computer, whereas Canva AI features and hint sharing are managed by Affinity/Canva cloud services under their own terms.
- **Submitting SDK issues:** Calling `report_sdk_issue` transmits an issue description and optional code sample to Affinity. The bundled Skill requires explicit user confirmation prior to calling this tool; ensure any private details are removed before submission.
- **Downloads, updates, and external links:** Installing the plugin, updating versions, or visiting external links connects to GitHub, plugin marketplaces, or respective websites, which process network traffic under their own privacy policies. See the [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

The maintainer will never collect your document contents for advertising, commercial data sales, or model training. Data transfers to AI services, Affinity, external websites, or public GitHub Issues follow the separate paths outlined above. Third-party services may process information on servers outside your region.

If you configure `AFFINITY_MCP_BASE_URL` to point to a remote server, requests and results will be routed there instead. The local proxy provides no built-in authentication or extra transport encryption layer; standard HTTP traffic is unencrypted. Ensure remote endpoints are trustworthy and properly secured before configuring them.

## 5. User choices and rights

Users can decline tool calls in their AI client, disable or uninstall the plugin, or turn off MCP, file access, networking, and hint sharing in Affinity settings at any time (disabling permissions may limit related features). We recommend sharing only the files necessary for your task and reviewing previews and logs before submission.

Where applicable privacy laws grant rights to access, correct, delete, or restrict processing of your personal data, you may reach out via [GitHub Issues](https://github.com/Paloexiz/Affinity-MCP/issues) regarding records held directly by the maintainer. For records held independently by GitHub, AI model providers, or Affinity, please contact the respective platforms directly.

**Note: GitHub Issues is a public venue. Never post identification numbers, API credentials, unredacted logs, or confidential files.** If private communication is needed, post a request in an Issue first so a secure channel can be arranged.

## 6. Security and minors

Please safeguard your computer and client accounts, keep regular document backups, and grant only the minimum permissions required for each task. The plugin does not provide independent access control or backup recovery services. In the event of a security incident affecting records under the maintainer's direct control, we will take remedial action and provide notification in accordance with applicable law.

This plugin is not directed at minors and does not intentionally solicit their personal data. Use of this software must comply with applicable regulations and client platform age requirements. If you believe the maintainer has inadvertently received personal data from a minor, please contact us to have it removed.

## 7. Policy updates

This policy is distributed alongside the corresponding plugin version. If data handling practices change significantly, we will update this document and note the changes in the release changelog.

For usage guidelines, see our [Terms of Service](TERMS.md).
