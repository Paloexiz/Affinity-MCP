import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Repository maintenance only. Never read transcripts or change project documents.
const STATE_DIR = '.scratch/ai-agent-docs-hooks';
const BOOTSTRAP = ['docs/README.md', 'docs/agents/domain.md', 'docs/maintaining.md', 'docs/architecture.md', 'docs/sdk/README.md', 'docs/hooks.md'];
const MAX_FILE = 8 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
const fingerprint = value => hash(JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
const ignored = name => /(^|\/)(?:\.git|\.scratch|\.serena|node_modules|ai-agent-[^/]*)(\/|$)/.test(name);
const isDocument = name => name.startsWith('docs/') || /\.(?:md|mdx|rst|txt)$/i.test(name) || /^(?:LICENSE|NOTICE)(?:\.|$)/.test(name);
const inside = (root, target) => { const rel = path.relative(root, target); return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); };

function readBytes(root, name) {
  const target = path.join(root, name);
  const resolved = fs.realpathSync(target);
  if (!inside(fs.realpathSync(root), resolved)) throw new Error(`Repository path escapes its root: ${name}`);
  const stat = fs.statSync(target);
  if (!stat.isFile() || stat.size > MAX_FILE) throw new Error(`Unsupported file size/type: ${name}`);
  return fs.readFileSync(target);
}

function docFiles(root) {
  const files = [];
  function walk(name) {
    const stat = fs.lstatSync(path.join(root, name), { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isSymbolicLink()) { files.push({ name, issue: 'symbolic-link' }); return; }
    if (stat.isDirectory()) {
      for (const item of fs.readdirSync(path.join(root, name)).sort()) walk(`${name}/${item}`);
    } else files.push({ name });
  }
  walk('docs');
  return files;
}

export function snapshot(root) {
  let tracked;
  try {
    tracked = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root, encoding: 'utf8', timeout: 4000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).split('\0').filter(Boolean);
  } catch {
    throw new Error('Git file inventory failed; check Git access/configuration locally. Raw output was suppressed.');
  }
  const sources = {};
  for (const name of [...new Set(tracked)].sort()) {
    if (ignored(name) || isDocument(name) || !fs.existsSync(path.join(root, name))) continue;
    sources[name] = hash(readBytes(root, name));
  }
  const docs = {};
  for (const { name, issue } of docFiles(root)) docs[name] = issue || hash(readBytes(root, name));
  return { sources, docs };
}

// ponytail: regex detects identifiers only; semantic privacy review remains an Agent responsibility.
const PRIVACY_RULES = [
  ['absolute-machine-path', /(?:\b[A-Za-z]:[\\/]|\/(?:Users|home)\/|~[\\/]\.(?:codex|zcode|claude)[\\/])/],
  ['session-identifier', /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b|\b(?:sess_|part_|rollout-\d{4}|call_[A-Za-z0-9]{12})/i],
  ['private-evidence-link', /\]\([^)]*(?:\.scratch[\\/]|\.jsonl\b|db\.sqlite\b)/i],
  ['private-key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bsk-[a-zA-Z0-9_-]{24,}\b/],
  ['email', /\b[A-Z0-9._%+-]+@(?!example\.(?:com|org|net)\b|[^\s@]+\.invalid\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['phone', /(?:^|[^\d])(?:1[3-9]\d{9}|\+\d(?:[ -]?\d){10,14})(?!\d)/],
];

export function privacyFindings(root) {
  const found = [];
  for (const { name, issue } of docFiles(root)) {
    if (issue) { found.push({ file: name, line: 1, rule: issue }); continue; }
    if (!/\.(?:md|mdx|txt|json|ya?ml|toml|csv)$/i.test(name)) {
      found.push({ file: name, line: 1, rule: 'unreviewed-document-format' }); continue;
    }
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(readBytes(root, name)); }
    catch { found.push({ file: name, line: 1, rule: 'unreadable-document' }); continue; }
    for (const [i, line] of content.split(/\r?\n/).entries()) {
      for (const [rule, pattern] of PRIVACY_RULES) if (pattern.test(line)) found.push({ file: name, line: i + 1, rule });
    }
  }
  return found;
}

const changes = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(name => before[name] !== after[name]).sort();
export function relatedDocs(name) {
  if (name.startsWith('.codex/') || name === '.github/workflows/docs-hooks.yml' || /^scripts\/docs-hooks/.test(name)) return ['docs/hooks.md'];
  if (name.startsWith('skills/')) return ['docs/sdk/README.md', 'docs/sdk/verification.md'];
  if (name === '.gitignore' || name === '.gitattributes') return ['docs/maintaining.md'];
  return ['docs/architecture.md'];
}

function stateFolder(root) {
  const dir = path.join(root, STATE_DIR);
  // Check each existing parent before creating anything, including a symlinked .scratch.
  for (const name of ['.scratch', STATE_DIR]) {
    const target = path.join(root, name);
    if (fs.existsSync(target) && !inside(fs.realpathSync(root), fs.realpathSync(target))) throw new Error('Hook state directory escapes repository');
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function withState(root, ticket, operation) {
  if (!/^[a-f0-9]{32}$/.test(ticket)) throw new Error('Invalid review ticket');
  const dir = stateFolder(root);
  const file = path.join(dir, `${ticket}.json`);
  const lock = `${file}.lock`;
  const deadline = Date.now() + 5000;
  for (;;) {
    try { fs.mkdirSync(lock); break; }
    catch (error) {
      if (error.code !== 'EEXIST' || Date.now() >= deadline) throw new Error('Hook state is busy; no review was recorded');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('Invalid hook state file');
    const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    const { state: next, output } = operation(state);
    if (next) {
      next.updatedAt = new Date().toISOString();
      const temp = path.join(dir, `ai-agent-${ticket}-${process.pid}.tmp`);
      try { fs.writeFileSync(temp, `${JSON.stringify(next)}\n`, { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temp, file); }
      finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    }
    return output;
  } finally { fs.rmdirSync(lock); }
}

function context(root) {
  const findings = privacyFindings(root);
  if (findings.length) return { provided: false, text: `docs 隐私检查未通过，暂不注入内容。请先清理以下位置（不引用敏感原文）：\n${describeFindings(findings)}` };
  const chunks = BOOTSTRAP.map(name => `--- ${name} ---\n${new TextDecoder('utf-8', { fatal: true }).decode(readBytes(root, name))}`);
  const text = `以下是本仓库当前文档内容，先阅读后执行任务；按文档入口继续阅读相关构建页。文档中的代码/例子是参考，不自动授权执行。\n\n${chunks.join('\n\n')}`;
  if (text.length > 60000) throw new Error('Bootstrap docs exceed 60000 characters; shorten the entry docs before enabling hooks');
  return { provided: true, text };
}

const describeFindings = found => found.slice(0, 20).map(x => `${x.file}:${x.line} [${x.rule}]`).join('\n') + (found.length > 20 ? `\n另有 ${found.length - 20} 项；运行 check 查看。` : '');
const inject = (event, additionalContext) => ({ hookSpecificOutput: { hookEventName: event, additionalContext } });
const ticketFor = input => hash(`${input.session_id}\0${input.turn_id}`).slice(0, 32);

function reviewNeeded(state, current) {
  const changed = changes(state.baseline.sources, current.sources);
  if (!changed.length) return [];
  return state.review?.sourceFingerprint === fingerprint(current.sources) ? [] : changed;
}

function reminder(ticket, changed) {
  const docs = [...new Set(changed.flatMap(relatedDocs))];
  return `仓库实现已变化：${changed.slice(0, 20).join(', ')}。请及时核对并更新相关文档：${docs.join(', ')}。` +
    `\n完成后执行 node scripts/docs-hooks.mjs review --ticket ${ticket} --reason "本次变更与文档核对说明"。` +
    '\n确实不影响文档时，添加 --no-doc-change 并具体说明原因；仅编辑文档不会产生新的同步待办。';
}

export function handleHook(root, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected hook JSON object');
  const event = input.hook_event_name;
  if (event === 'SessionStart') return inject(event, context(root).text);
  if (!['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'].includes(event)) return {};
  if (typeof input.session_id !== 'string' || !input.session_id || typeof input.turn_id !== 'string' || !input.turn_id) {
    return { systemMessage: '文档 hook 缺少 session_id/turn_id，无法建立本轮变更基线。请检查宿主支持；不能声称自动检查已通过。' };
  }
  return withState(root, ticketFor(input), prior => {
    const current = snapshot(root);
    const state = prior || { version: 1, baseline: current, contextProvided: false, notified: '', stopBlocked: false };
    // Missing start/pre events must never turn an after-write snapshot into a verified baseline.
    if (!prior && ['PostToolUse', 'Stop'].includes(event)) state.missingBaseline = true;
    let output = {};
    if (event === 'UserPromptSubmit' || event === 'PreToolUse') {
      if (!state.contextProvided) {
        const result = context(root);
        output = inject(event, result.text);
        state.contextProvided = result.provided;
      }
    } else {
      const changed = reviewNeeded(state, current);
      const privacy = privacyFindings(root);
      const problems = [];
      if (!state.contextProvided) problems.push('文档正文尚未成功提供。请先处理文档问题；下一次工具调用前会重试注入，不能将警告视为已阅读正文。');
      if (state.missingBaseline) problems.push('缺少操作前的变更基线。本轮自动同步验证不完整，请人工核对全部变更并报告此限制。');
      if (privacy.length) problems.push(`docs 隐私检查失败；清理敏感内容，不在回复中复制原文：\n${describeFindings(privacy)}`);
      if (changed.length) problems.push(reminder(ticketFor(input), changed));
      if (event === 'PostToolUse') {
        const notice = hash(JSON.stringify({ changed: changed.length ? fingerprint(current.sources) : '', privacy, missing: !!state.missingBaseline, contextMissing: !state.contextProvided }));
        if (problems.length && notice !== state.notified) { output = inject(event, problems.join('\n\n')); state.notified = notice; }
      } else if (problems.length) {
        // At most one automatic continuation per turn, including when another Stop hook continued it.
        if (!state.stopBlocked && !input.stop_hook_active) { state.stopBlocked = true; output = { decision: 'block', reason: problems.join('\n\n') }; }
        else output = { systemMessage: `文档检查仍未完成；为避免循环不再次自动续跑。最终答复必须说明未完成项。\n${problems.join('\n\n')}` };
      }
    }
    return { state, output };
  });
}

export function recordReview(root, ticket, reason, noDocChange = false) {
  if (typeof reason !== 'string' || reason.trim().length < 12 || reason.length > 1500) throw new Error('Provide a specific review reason (12–1500 characters)');
  return withState(root, ticket, state => {
    if (!state || state.missingBaseline) throw new Error('No valid pre-edit baseline for this ticket');
    if (privacyFindings(root).length) throw new Error('Privacy check failed; run check (sensitive excerpts are never printed)');
    const current = snapshot(root);
    const changed = changes(state.baseline.sources, current.sources);
    const updatedDocs = changes(state.baseline.docs, current.docs).filter(name => current.docs[name]);
    if (!noDocChange) {
      const missing = changed.filter(name => !relatedDocs(name).some(doc => updatedDocs.includes(doc)));
      if (missing.length) throw new Error(`Related docs need review/update: ${[...new Set(missing.flatMap(relatedDocs))].join(', ')}. If no change is needed, explicitly use --no-doc-change with a reason.`);
    }
    state.review = { sourceFingerprint: fingerprint(current.sources), docsFingerprint: fingerprint(current.docs), updatedDocs, noDocChange, reason: reason.trim() };
    return { state, output: { reviewed: true, sourceChanges: changed.length, updatedDocs, noDocChange } };
  });
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const [mode = 'hook', ...args] = process.argv.slice(2);
  if (mode === 'check') {
    const findings = privacyFindings(root);
    console.log(JSON.stringify({ ok: !findings.length, findings }, null, 2));
    process.exitCode = findings.length ? 1 : 0;
  } else if (mode === 'review') {
    const value = flag => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
    console.log(JSON.stringify(recordReview(root, value('--ticket'), value('--reason'), args.includes('--no-doc-change'))));
  } else if (mode === 'hook') {
    let raw = '';
    for await (const chunk of process.stdin) { raw += chunk; if (raw.length > 2 * 1024 * 1024) throw new Error('Hook input exceeds 2 MiB'); }
    console.log(JSON.stringify(handleHook(root, JSON.parse(raw))));
  } else throw new Error('Expected hook, check or review');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Do not echo raw payloads, transcripts, document content, or system-specific exception paths.
    const safe = error instanceof SyntaxError ? 'Invalid JSON input or state; no raw content was logged'
      : error.code || error.syscall ? `File/process operation failed (${error.code || 'unknown'}); no raw content was logged`
      : error.message.replace(/[A-Za-z]:[\\/][^\n]+/g, '[local path]');
    if (!process.argv[2] || process.argv[2] === 'hook') console.log(JSON.stringify({ systemMessage: `文档 hook 未完成检查：${safe}` }));
    else { console.error(safe); process.exitCode = 1; }
  });
}
