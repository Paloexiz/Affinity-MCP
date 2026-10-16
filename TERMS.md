# Affinity MCP Terms of Service

**Language: English | [简体中文](TERMS.zh-cn.md)**

These terms accompany Affinity MCP and explain use, support and risks. The project is maintained by [Paloexiz](https://github.com/Paloexiz) at [Paloexiz/Affinity-MCP](https://github.com/Paloexiz/Affinity-MCP). Contact the maintainer through [project Issues](https://github.com/Paloexiz/Affinity-MCP/issues). Read these terms before use, especially the file-operation risks in section 3 and liability provisions in section 6.

## 1. Project and open-source license

Affinity MCP is a community open-source plugin connecting AI clients to Affinity by Canva's local MCP service. It is not an official product of OpenAI, Z.ai, Anthropic, Canva or Affinity, and does not imply their endorsement or warranty.

The software and accompanying documentation are provided under the [MIT License](LICENSE). Upstream licensing and attribution appear in [LICENSE.upstream](LICENSE.upstream) and [NOTICE](NOTICE). **These terms do not replace MIT or add license restrictions on using, copying, modifying, distributing or commercially exploiting the software. MIT controls any conflict concerning software licensing.** Third-party software, fonts, assets and services retain their own licenses or terms.

## 2. Permissions and authorization

You should have the legal authority to use the relevant software, services and content, including organizational authorization when acting for an organization. Minors must meet applicable legal and client requirements and obtain guardian consent where required.

Operate only on documents, files and services you are authorized to access and modify. Follow applicable law, intellectual property rights and confidentiality obligations. Do not unlawfully obtain or disclose others' data, infringe third-party rights or bypass others' access controls. These describe lawful-use obligations and do not change the MIT grant.

Set appropriate permissions in your client and Affinity, and identify the agent's target documents and permitted operations. File writes, script networking, paid AI use, hint sharing and issue reports should remain within the relevant authorization. Skill instructions guide the agent; the proxy does not independently check your authority or whether each script matches your intent.

## 3. Automation and file risks

**Scripts may modify, overwrite, delete, save or close documents, access files and send data over networks. Back up important files, check targets and scripts before running them, and inspect actual documents, previews and exports afterward.** AI-generated code and results may be wrong. A successful tool call does not establish correct content, layout or files.

**A timeout or disconnect does not mean cancellation. A script may already have executed; the proxy provides no transactional rollback and does not automatically replay submitted calls.** Inspect actual state before retrying to avoid duplicate changes or overwrites. SDK capabilities vary by application build, platform and object; recorded samples do not guarantee every version or operation.

## 4. Data, works and third-party services

Using the plugin does not transfer your rights in documents, scripts, inputs or outputs to the maintainer. These terms grant the maintainer no right to use your documents for advertising or model training. Check third-party asset and AI-output conditions separately.

See the [Privacy Policy](PRIVACY.md) for data flows, logs, optional sharing and privacy requests. Reading these terms, installing the plugin or enabling MCP is not blanket consent to disclose data to any third party. Any legally required notice and consent must be handled separately.

Affinity, AI clients, model services and GitHub are operated by their respective providers. Their availability, data practices, charges and allowances follow their own rules; the maintainer does not collect those third-party fees. The plugin is provided free under MIT. No hosted service, paid support, response time or service level is promised with it.

## 5. Support and feedback

Report problems or suggestions through [project Issues](https://github.com/Paloexiz/Affinity-MCP/issues). This channel is public. Redact material before posting and do not upload private documents, credentials, personal information or unauthorized third-party content. For private handling, first request contact without sensitive details, then agree on an appropriate channel.

Support and fixes depend on maintenance resources; implementation of requests is not guaranteed. Receiving feedback does not give the maintainer ownership of your existing works.

## 6. Warranties and liability

**To the extent permitted by applicable law, the software is provided as is under MIT, without warranties of merchantability, fitness for a particular purpose or noninfringement, and subject to that license's liability limitations.** The project makes no additional promise of continuous availability, error-free operation, compatibility with every environment or the expected outcome of any script, AI output or export.

These provisions do not exclude or limit liability that applicable law prohibits excluding or limiting, including liability for personal injury, intentional misconduct or gross negligence where it cannot be excluded. They do not remove mandatory consumer, personal-information or other statutory rights.

## 7. Updates and stopping use

Features, compatibility and these terms may change with plugin versions. Material changes will be described in the project changelog. Updated terms accompany the version containing them, subject to any notice or consent required by law, and do not retroactively add MIT license conditions to older versions.

You may disable or uninstall the plugin at any time. Uninstalling does not reverse completed Affinity edits or automatically delete documents, exports, library scripts, hints or client records. The maintainer may discontinue maintenance or distribution without revoking MIT rights already granted.

## 8. Law and disputes

These terms impose no exclusive court, mandatory arbitration or class-action waiver and do not remove mandatory legal protections. Disputes follow the applicable law and procedures of the competent jurisdiction. You may first contact the maintainer through project Issues to seek a resolution, but doing so is not a prerequisite to legal remedies. An unenforceable provision does not affect other provisions that can lawfully apply.
