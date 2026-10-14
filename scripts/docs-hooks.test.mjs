import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { handleHook, recordReview, privacyFindings, relatedDocs } from './docs-hooks.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = (event, extra = {}) => ({session_id:'test-session',turn_id:'test-turn',hook_event_name:event,...extra});
const ticket = createHash('sha256').update('test-session\0test-turn').digest('hex').slice(0,32);
const context = value => value.hookSpecificOutput?.additionalContext || '';
const stored = (root, id = ticket) => JSON.parse(fs.readFileSync(path.join(root,'.scratch/docs-hooks',`${id}.json`),'utf8'));
const write = (root, name, value) => { fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true}); fs.writeFileSync(path.join(root,name),value,'utf8'); };
test('Skill runtime scripts require architecture review while other Skill code retains SDK review',()=>{
  for(const name of ['affinity-mcp-proxy.mjs','affinity-mcp-smoke.mjs']) assert.deepEqual(relatedDocs(`skills/affinity-mcp/scripts/${name}`),['docs/architecture.md']);
  for(const name of ['skills/affinity-mcp/scripts/affinity-mcp-proxy.test.mjs','skills/affinity-mcp/scripts/other.mjs','skills/other/scripts/affinity-mcp-proxy.mjs']) assert.deepEqual(relatedDocs(name),['docs/sdk/README.md','docs/sdk/verification.md']);
});
function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'docs-hooks-中文 space-'));
  t.after(()=>{ assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir())); fs.rmSync(root,{recursive:true,force:true}); });
  execFileSync('git',['init','--quiet'],{cwd:root,windowsHide:true});
  write(root,'.gitignore','/docs/\n/.scratch/\n');
  write(root,'scripts/sample.mjs','export const version = 1;\n');
  for(const name of ['README.md','agents/domain.md','maintaining.md','architecture.md','sdk/README.md','hooks.md']) write(root,`docs/${name}`,`# ${name}\nRepository technical context.\n`);
  return root;
}

test('start/pre events inject actual docs before edits, initialize only once per turn',t=>{
  const root=fixture(t);
  assert.match(context(handleHook(root,input('SessionStart'))),/Repository technical context/);
  assert.match(context(handleHook(root,input('PreToolUse'))),/docs\/architecture.md/);
  assert.deepEqual(handleHook(root,input('PreToolUse')),{});
  assert.deepEqual(handleHook(root,input('Stop')),{});
});

test('existing dirty/untracked source is baseline, later shell and MCP writes are detected',t=>{
  const root=fixture(t);
  handleHook(root,input('UserPromptSubmit'));
  assert.deepEqual(handleHook(root,input('PostToolUse',{tool_name:'Bash'})),{});
  write(root,'scripts/sample.mjs','export const version = 2;');
  assert.match(context(handleHook(root,input('PostToolUse',{tool_name:'mcp__fastctx__replace'}))),/docs\/architecture.md/);
  assert.deepEqual(handleHook(root,input('PostToolUse',{tool_name:'Bash'})),{});
});

test('docs-only edits including ignored docs do not create a sync loop',t=>{
  const root=fixture(t);
  handleHook(root,input('UserPromptSubmit'));
  write(root,'docs/architecture.md','# Revised architecture\n');
  write(root,'README.md','# Updated installation\n');
  assert.deepEqual(handleHook(root,input('PostToolUse')),{});
  assert.deepEqual(handleHook(root,input('Stop')),{});
});

test('deleted and new source files both require review',t=>{
  const root=fixture(t);
  handleHook(root,input('UserPromptSubmit'));
  fs.unlinkSync(path.join(root,'scripts/sample.mjs'));
  write(root,'scripts/new.mjs','export default 3;');
  const result=context(handleHook(root,input('PostToolUse')));
  assert.match(result,/scripts\/sample.mjs/);
  assert.match(result,/scripts\/new.mjs/);
});

test('review requires relevant docs, binds to source version, docs edits do not re-open it',t=>{
  const root=fixture(t);
  handleHook(root,input('UserPromptSubmit'));
  write(root,'scripts/sample.mjs','export const version = 2;');
  write(root,'docs/README.md','# Unrelated navigation edit');
  assert.throws(()=>recordReview(root,ticket,'Checked the implementation and documentation.'),/Related docs/);
  write(root,'docs/architecture.md','# Describes version 2');
  assert.equal(recordReview(root,ticket,'Updated the architecture for the changed behavior.').reviewed,true);
  assert.deepEqual(handleHook(root,input('Stop')),{});
  write(root,'docs/architecture.md','# Describes version 2 with corrected wording');
  assert.deepEqual(handleHook(root,input('PostToolUse')),{});
  write(root,'scripts/sample.mjs','export const version = 3;');
  assert.equal(handleHook(root,input('Stop')).decision,'block');
});

test('no-doc-change needs a specific reason and explicit opt-in',t=>{
  const root=fixture(t);
  handleHook(root,input('UserPromptSubmit'));
  write(root,'scripts/sample.mjs','export const version = 1; // comment fix');
  assert.throws(()=>recordReview(root,ticket,'ok',true),/specific review reason/);
  assert.equal(recordReview(root,ticket,'Only a code comment changed; documented behavior is unchanged.',true).noDocChange,true);
  assert.deepEqual(handleHook(root,input('Stop')),{});
});

test('Stop continues at most once and respects the host continuation flag',t=>{
  const root=fixture(t);
  handleHook(root,input('UserPromptSubmit'));
  write(root,'scripts/sample.mjs','export const version = 2;');
  assert.equal(handleHook(root,input('Stop')).decision,'block');
  assert.equal(handleHook(root,input('Stop')).decision,undefined);
  assert.match(handleHook(root,input('Stop')).systemMessage,/仍未完成/);
  const other=fixture(t);
  handleHook(other,input('UserPromptSubmit'));
  write(other,'scripts/sample.mjs','export const version = 2;');
  assert.equal(handleHook(other,input('Stop',{stop_hook_active:true})).decision,undefined);
});

test('steered prompts do not reset dirty baseline or continuation budget',t=>{
  const root=fixture(t);
  handleHook(root,input('UserPromptSubmit'));
  write(root,'scripts/sample.mjs','export const version = 2;');
  handleHook(root,input('UserPromptSubmit'));
  assert.equal(handleHook(root,input('Stop')).decision,'block');
  handleHook(root,input('UserPromptSubmit'));
  assert.equal(handleHook(root,input('Stop')).decision,undefined);
});

test('privacy scans ignored docs, refuses private context, never echoes sensitive text',t=>{
  const root=fixture(t);
  const secret='private.owner@private-company.test';
  write(root,'docs/private.md',`# Private\n${secret}\n[raw](../.scratch/internal.json)\n`);
  const findings=privacyFindings(root);
  assert.deepEqual(findings.map(x=>x.rule),['email','private-evidence-link']);
  const output=JSON.stringify(handleHook(root,input('SessionStart')));
  assert.ok(!output.includes(secret));
  assert.match(output,/隐私检查未通过/);
  assert.match(output,/docs\/private.md/);
});

test('private file references are blocked across markup and bare paths without echoing them',t=>{
  const root=fixture(t);
  const samples=[
    '[raw](../.scratch/evidence.json)',
    '![image](../.scratch/evidence.png)',
    '[raw][evidence]\n[evidence]: ../.scratch/evidence.json',
    '<a href="../.scratch/evidence.json">raw</a>',
    '<img src="../.scratch/secret">',
    '<a href="../.scratch/evidence/(raw).md">raw</a>',
    '<img src="../.scratch/evidence/[raw].png">',
    '<a href="../.scratch/evidence/ raw file.md">raw</a>',
    '`../.scratch/evidence/ raw file`',
    '[raw](<../.scratch/evidence/ raw file.md>)',
    '[raw]: <../.scratch/evidence/ raw file.md>',
    '../.scratch/evidence/(raw).md',
    '../.scratch/evidence/(nested[raw]).md',
    '（../.scratch/evidence/【raw】.md）',
    '<a href="../.scratch/evidence/)raw.md">raw</a>',
    '../.scratch/evidence/)raw.md',
    '../.scratch/evidence/）raw.md',
    'Directory (.scratch/evidence/) and file .scratch/secret',
    '[directory](.scratch/evidence/)[file](.scratch/secret)',
    '`mv .scratch/evidence.json .scratch/archive/`',
    '`cp .scratch/secret .scratch/<effort>/`',
    '`cat "../.scratch/evidence/ raw file"`',
    '`./.scratch/run --output public/`',
    '`./.scratch/run public/`',
    '`.scratch/a b/`',
    '` .scratch/ a b/ `',
    '`".scratch/a b"`',
    '`<.scratch/a b>`',
    '".scratch/secret .scratch/archive/"',
    '`../.scratch/evidence/,raw`',
    '`../.scratch/evidence.json`',
    'Evidence: ../.scratch/internal.json',
    'Evidence: ..\\.scratch\\secret',
    '../.scratch/secret?download=1',
    '../.scratch/secret#section',
    '../.scratch/<effort>/evidence/ and ../.scratch/secret',
    '[raw]: ../transcript.jsonl',
    '<a href="../db.sqlite">raw</a>',
  ];
  for(const [i,sample] of samples.entries()) {
    write(root,'docs/README.md',`# Context\nDO_NOT_INJECT_PRIVATE_DOCUMENT\n${sample}\n`);
    const findings=privacyFindings(root);
    assert.deepEqual(findings,[{file:'docs/README.md',line:sample.includes('\n')?4:3,rule:'private-evidence-link'}],sample);
    for(const event of ['SessionStart','PreToolUse']) {
      const output=JSON.stringify(handleHook(root,input(event,{turn_id:`private-${i}`})));
      assert.match(output,/隐私检查未通过/,sample);
      assert.ok(!output.includes('DO_NOT_INJECT_PRIVATE_DOCUMENT'),sample);
      assert.ok(!output.includes(sample),sample);
    }
  }
  write(root,'docs/README.md','# Public context\nPUBLIC_DOCUMENT_RESTORED');
  assert.match(context(handleHook(root,input('PreToolUse',{turn_id:`private-${samples.length-1}`}))),/PUBLIC_DOCUMENT_RESTORED/);
});

test('directory descriptions and public references remain eligible for context',t=>{
  const root=fixture(t);
  write(root,'docs/README.md',[
    '# Public context',
    '.scratch', '.scratch/', '.scratch/docs-hooks/',
    '`../.scratch/<effort>/evidence/`', '.scratch/<effort>/archives/',
    '`../.scratch/(archive)/`', '`"../.scratch/ directory with spaces/"`',
    '`<.scratch/a b/>`', '`ls ".scratch/a b/"`',
    '<../.scratch/ directory with spaces/>',
    'Internal directory (.scratch/evidence/) stores raw data.',
    'Internal data is stored in .scratch/evidence/, for local use.',
    'Internal data is stored in .scratch/evidence/.',
    'Internal directory .scratch/evidence/: stores raw data.',
    '内部资料保存在 .scratch/evidence/，仅供本机使用。',
    '内部资料保存在 .scratch/evidence/。',
    '`"../.scratch/evidence/, directory/"`',
    '内部目录（.scratch/evidence/）用于存放原始资料。',
    '内部目录【.scratch/(archive)/】用于存放原始资料。',
    '[directory](.scratch/evidence/)',
    '`../.scratch/foo)/`',
    '..\\.scratch\\<effort>\\evidence\\', '.scratch/evidence/#说明',
    '[architecture](architecture.md)', '<a href="https://example.com/docs">public</a>',
  ].join('\n'));
  assert.deepEqual(privacyFindings(root),[]);
  assert.match(context(handleHook(root,input('SessionStart'))),/Public context/);
});

test('privacy reports dangling documentation links instead of skipping them',t=>{
  const root=fixture(t);
  const target=path.join(root,'missing-docs');
  fs.mkdirSync(target);
  fs.symlinkSync(target,path.join(root,'docs/dangling'),process.platform==='win32'?'junction':'dir');
  fs.rmdirSync(target);
  assert.deepEqual(privacyFindings(root),[{file:'docs/dangling',line:1,rule:'symbolic-link'}]);
  assert.match(context(handleHook(root,input('SessionStart'))),/隐私检查未通过/);
});

test('privacy repair retries document injection and cannot silently pass before injection',t=>{
  const root=fixture(t);
  write(root,'docs/private.md','private.owner@private-company.test');
  assert.match(context(handleHook(root,input('UserPromptSubmit'))),/隐私检查未通过/);
  fs.unlinkSync(path.join(root,'docs/private.md'));
  assert.match(handleHook(root,input('Stop')).reason,/文档正文尚未/);
  assert.match(context(handleHook(root,input('PreToolUse'))),/Repository technical context/);
  assert.deepEqual(handleHook(root,input('PreToolUse')),{});
  assert.deepEqual(handleHook(root,input('Stop',{stop_hook_active:true})),{});
});

test('Git failures expose neither native stderr nor local paths on either output stream',t=>{
  const root=fixture(t);
  write(root,'scripts/docs-hooks.mjs',fs.readFileSync(path.join(repo,'scripts/docs-hooks.mjs'),'utf8'));
  const config=path.join(root,'private-gitconfig');
  write(root,'private-gitconfig','[broken\n');
  const result=spawnSync(process.execPath,['scripts/docs-hooks.mjs'],{
    cwd:root,input:JSON.stringify(input('PreToolUse')),encoding:'utf8',windowsHide:true,
    env:{...process.env,GIT_CONFIG_GLOBAL:config},
  });
  assert.equal(result.status,0);
  assert.match(JSON.parse(result.stdout).systemMessage,/Git file inventory failed/);
  assert.equal(result.stderr,'');
  for(const output of [result.stdout,result.stderr]) {
    assert.ok(!output.includes(root));
    assert.ok(!output.includes('private-gitconfig'));
  }
});

test('identifiers/paths/keys are detected but placeholders and public repo links are allowed',t=>{
  const root=fixture(t);
  write(root,'docs/safe.md','contact: maintainer@example.com\nhttps://github.com/org/repo\n<session-id>\n');
  assert.deepEqual(privacyFindings(root),[]);
  write(root,'docs/unsafe.md','C:\\Users\\Example\\work\n12345678-1234-1234-1234-123456789abc\nsess_example\n-----BEGIN PRIVATE KEY-----');
  assert.equal(privacyFindings(root).length,4);
});

test('privacy-only edits are checked at Stop without any source changes',t=>{
  const root=fixture(t);
  handleHook(root,input('UserPromptSubmit'));
  write(root,'docs/private.md','private.owner@private-company.test');
  assert.match(context(handleHook(root,input('PostToolUse'))),/隐私检查失败/);
  assert.equal(handleHook(root,input('Stop')).decision,'block');
  fs.unlinkSync(path.join(root,'docs/private.md'));
  assert.deepEqual(handleHook(root,input('Stop',{stop_hook_active:true})),{});
});

test('late events retain manual limits without spending Stop budget; invalid tickets are rejected',t=>{
  const root=fixture(t);
  assert.match(context(handleHook(root,input('PostToolUse'))),/缺少操作前/);
  assert.throws(()=>recordReview(root,ticket,'Checked current changes and documentation.',true),/No valid/);
  handleHook(root,input('PreToolUse'));
  const stop=handleHook(root,input('Stop'));
  assert.equal(stop.decision,undefined);
  assert.match(stop.systemMessage,/缺少操作前/);
  assert.equal(stored(root).missingBaseline,true);
  assert.equal(stored(root).stopBlocked,false);
  assert.throws(()=>recordReview(root,'../escape','Checked current changes and documentation.',true),/Invalid review ticket/);
  assert.match(handleHook(root,{hook_event_name:'Stop'}).systemMessage,/缺少/);
});

test('late source changes require manual checking while privacy can still continue once',t=>{
  const root=fixture(t);
  handleHook(root,input('PostToolUse'));
  handleHook(root,input('PreToolUse'));
  write(root,'scripts/sample.mjs','export const version = 2;');
  const notice=context(handleHook(root,input('PostToolUse')));
  assert.match(notice,/scripts\/sample.mjs/);
  assert.match(notice,/docs\/architecture.md/);
  assert.match(notice,/人工/);
  assert.doesNotMatch(notice,/review --ticket/);
  assert.deepEqual(handleHook(root,input('PostToolUse')),{});
  assert.throws(()=>recordReview(root,ticket,'Manually checked current sources and documentation.',true),/No valid/);
  assert.equal(handleHook(root,input('Stop')).decision,undefined);
  assert.equal(stored(root).stopBlocked,false);
  write(root,'docs/private.md','private.owner@private-company.test');
  assert.equal(handleHook(root,input('Stop')).decision,'block');
  assert.equal(handleHook(root,input('Stop')).decision,undefined);
  fs.unlinkSync(path.join(root,'docs/private.md'));
  const repaired=handleHook(root,input('Stop',{stop_hook_active:true}));
  assert.equal(repaired.decision,undefined);
  assert.match(repaired.systemMessage,/缺少操作前/);
  assert.doesNotMatch(repaired.systemMessage,/review --ticket/);
});

test('pre-event context exceptions preserve the real baseline and recover normal review',async t=>{
  for(const event of ['UserPromptSubmit','PreToolUse']) for(const failure of ['missing','oversized']) await t.test(`${event}: ${failure}`,sub=>{
    const root=fixture(sub);
    const original=fs.readFileSync(path.join(root,'scripts/sample.mjs'));
    if(failure==='missing') fs.unlinkSync(path.join(root,'docs/hooks.md'));
    else write(root,'docs/hooks.md','# Synthetic context\n'+'x'.repeat(60001));
    const output=handleHook(root,input(event));
    assert.match(context(output),/正文未能成功提供/);
    assert.ok(!JSON.stringify(output).includes(root));
    const saved=stored(root);
    assert.equal(saved.baseline.sources['scripts/sample.mjs'],createHash('sha256').update(original).digest('hex'));
    assert.equal(saved.contextProvided,false);
    assert.equal(saved.missingBaseline,undefined);
    write(root,'scripts/sample.mjs','export const version = 2;');
    write(root,'docs/hooks.md','# Restored context\n');
    assert.match(context(handleHook(root,input('PreToolUse'))),/Restored context/);
    assert.equal(stored(root).baseline.sources['scripts/sample.mjs'],saved.baseline.sources['scripts/sample.mjs']);
    assert.equal(stored(root).contextProvided,true);
    assert.match(context(handleHook(root,input('PostToolUse'))),/scripts\/sample.mjs/);
    write(root,'docs/architecture.md','# Updated source behavior\n');
    assert.equal(recordReview(root,ticket,'Updated the architecture after restoring failed context.').reviewed,true);
    assert.deepEqual(handleHook(root,input('Stop')),{});
  });
});

test('UTF-8 and privacy refusals keep the baseline without claiming context was supplied',t=>{
  for(const content of [Buffer.from([255]),'private.owner@private-company.test']){
    const root=fixture(t);
    write(root,'docs/hooks.md',content);
    assert.match(context(handleHook(root,input('PreToolUse'))),/隐私检查未通过/);
    assert.equal(stored(root).contextProvided,false);
    assert.equal(stored(root).missingBaseline,undefined);
    write(root,'docs/hooks.md','# Restored public context\n');
    assert.match(context(handleHook(root,input('PreToolUse'))),/Restored public context/);
    assert.equal(stored(root).contextProvided,true);
  }
});

test('context handling does not swallow corrupt, busy or failing state persistence',t=>{
  const root=fixture(t);
  handleHook(root,input('PreToolUse'));
  const file=path.join(root,'.scratch/docs-hooks',`${ticket}.json`);
  const original=fs.readFileSync(file,'utf8');
  fs.writeFileSync(file,'{broken','utf8');
  assert.throws(()=>handleHook(root,input('PreToolUse')),SyntaxError);
  assert.equal(fs.readFileSync(file,'utf8'),'{broken');
  fs.writeFileSync(file,original,'utf8');
  fs.mkdirSync(`${file}.lock`);
  assert.throws(()=>handleHook(root,input('PreToolUse')),/Hook state is busy/);
  assert.equal(fs.readFileSync(file,'utf8'),original);
  fs.rmdirSync(`${file}.lock`);
  const conflict=path.join(root,'.scratch/docs-hooks',`${ticket}-${process.pid}.tmp`);
  fs.mkdirSync(conflict);
  assert.throws(()=>handleHook(root,input('PreToolUse')));
  assert.equal(fs.readFileSync(file,'utf8'),original);
  assert.equal(fs.existsSync(`${file}.lock`),false);
});

test('a first Stop repairs context once, preserves steered history and isolates the next turn',t=>{
  const root=fixture(t);
  assert.equal(handleHook(root,input('Stop')).decision,'block');
  const original=stored(root);
  assert.equal(original.missingBaseline,true);
  assert.equal(original.contextProvided,false);
  assert.equal(original.stopBlocked,true);
  handleHook(root,input('UserPromptSubmit'));
  assert.deepEqual(stored(root).baseline,original.baseline);
  assert.equal(stored(root).missingBaseline,true);
  assert.equal(stored(root).contextProvided,true);
  assert.equal(handleHook(root,input('Stop',{stop_hook_active:true})).decision,undefined);
  write(root,'scripts/sample.mjs','export const version = 2;');
  handleHook(root,input('UserPromptSubmit'));
  const notice=context(handleHook(root,input('PostToolUse')));
  assert.match(notice,/人工/);
  assert.doesNotMatch(notice,/review --ticket/);
  assert.equal(stored(root).stopBlocked,true);
  const next={turn_id:'next-turn'};
  const nextTicket=createHash('sha256').update('test-session\0next-turn').digest('hex').slice(0,32);
  handleHook(root,input('UserPromptSubmit',next));
  assert.equal(stored(root,nextTicket).missingBaseline,undefined);
  assert.equal(stored(root,nextTicket).stopBlocked,false);
  assert.deepEqual(handleHook(root,input('Stop',next)),{});
});

test('repeated failed context on a steered prompt cannot replace an established baseline',t=>{
  const root=fixture(t);
  fs.unlinkSync(path.join(root,'docs/hooks.md'));
  handleHook(root,input('PreToolUse'));
  const original=stored(root).baseline;
  write(root,'scripts/sample.mjs','export const version = 2;');
  assert.match(context(handleHook(root,input('UserPromptSubmit'))),/正文未能成功提供/);
  assert.deepEqual(stored(root).baseline,original);
  assert.equal(stored(root).missingBaseline,undefined);
  write(root,'docs/hooks.md','# Restored context\n');
  handleHook(root,input('PreToolUse'));
  assert.match(context(handleHook(root,input('PostToolUse'))),/review --ticket/);
  write(root,'docs/architecture.md','# Updated behavior\n');
  assert.equal(recordReview(root,ticket,'Updated docs while preserving the steered pre-edit baseline.').reviewed,true);
  assert.deepEqual(handleHook(root,input('Stop')),{});
});

test('a real launcher missing before edits recovers without inventing an earlier baseline',t=>{
  const root=fixture(t);
  const config=JSON.parse(fs.readFileSync(path.join(repo,'.codex/hooks.json'),'utf8'));
  const windows=process.platform==='win32';
  const invoke=event=>{
    const hook=config.hooks[event][0].hooks[0];
    const command=windows?hook.commandWindows:hook.command;
    const result=spawnSync(windows?'powershell.exe':'/bin/sh',windows?['-NoLogo','-NoProfile','-NonInteractive','-Command',command]:['-c',command],{
      cwd:path.join(root,'scripts'),input:JSON.stringify(input(event)),encoding:'utf8',timeout:15000,windowsHide:true,
    });
    assert.equal(result.status,0);
    assert.equal(result.stderr,'');
    assert.ok(!result.stdout.includes(root));
    return JSON.parse(result.stdout.trim());
  };
  assert.match(invoke('PreToolUse').systemMessage,/Node hook startup failed/);
  assert.equal(fs.existsSync(path.join(root,'.scratch/docs-hooks',`${ticket}.json`)),false);
  write(root,'scripts/docs-hooks.mjs',fs.readFileSync(path.join(repo,'scripts/docs-hooks.mjs'),'utf8'));
  assert.match(context(invoke('PostToolUse')),/缺少操作前/);
  assert.match(context(invoke('PreToolUse')),/Repository technical context/);
  const stop=invoke('Stop');
  assert.equal(stop.decision,undefined);
  assert.match(stop.systemMessage,/缺少操作前/);
  assert.equal(stored(root).missingBaseline,true);
  assert.equal(stored(root).stopBlocked,false);
  assert.throws(()=>recordReview(root,ticket,'Checked recovered launcher and related documentation.',true),/No valid/);
});

test('direct CLI executes through equivalent paths and imported modules stay silent',t=>{
  const root=fixture(t);
  const entry=path.join(root,'scripts/docs-hooks.mjs');
  write(root,'scripts/docs-hooks.mjs',fs.readFileSync(path.join(repo,'scripts/docs-hooks.mjs'),'utf8'));
  const entries=process.platform==='win32'?[entry,path.toNamespacedPath(entry)]:[entry];
  for(const file of entries){
    const clean=spawnSync(process.execPath,[file,'check'],{cwd:root,encoding:'utf8',timeout:10000,windowsHide:true});
    assert.equal(clean.status,0,clean.stderr);
    assert.equal(clean.stderr,'');
    assert.deepEqual(JSON.parse(clean.stdout),{ok:true,findings:[]});
    write(root,'docs/private.md','private.owner@private-company.test');
    const unsafe=spawnSync(process.execPath,[file,'check'],{cwd:root,encoding:'utf8',timeout:10000,windowsHide:true});
    assert.equal(unsafe.status,1,unsafe.stderr);
    assert.equal(unsafe.stderr,'');
    assert.deepEqual(JSON.parse(unsafe.stdout),{ok:false,findings:[{file:'docs/private.md',line:1,rule:'email'}]});
    assert.ok(!unsafe.stdout.includes('private.owner'));
    fs.unlinkSync(path.join(root,'docs/private.md'));
    const invalid=spawnSync(process.execPath,[file,'unknown'],{cwd:root,encoding:'utf8',timeout:10000,windowsHide:true});
    assert.equal(invalid.status,1);
    assert.equal(invalid.stdout,'');
    assert.match(invalid.stderr,/Expected hook, check or review/);
  }
  const imported=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(pathToFileURL(entry).href)}); console.log('import-only');`],{
    cwd:root,input:JSON.stringify(input('SessionStart')),encoding:'utf8',timeout:10000,windowsHide:true,
  });
  assert.equal(imported.status,0,imported.stderr);
  assert.equal(imported.stdout.trim(),'import-only');
  assert.equal(imported.stderr,'');
  assert.ok(!fs.existsSync(path.join(root,'.scratch')),'Importing hooks creates no state');
});

test('configuration launches real hooks from a Unicode subdirectory with JSON-only stdout',t=>{
  const root=fixture(t);
  write(root,'scripts/docs-hooks.mjs',fs.readFileSync(path.join(repo,'scripts/docs-hooks.mjs'),'utf8'));
  const config=JSON.parse(fs.readFileSync(path.join(repo,'.codex/hooks.json'),'utf8'));
  for(const [event,groups] of Object.entries(config.hooks)){
    assert.equal(groups.length,1);
    const hook=groups[0].hooks[0];
    assert.match(hook.command,/git rev-parse --show-toplevel/);
    assert.match(hook.commandWindows,/git rev-parse --show-toplevel/);
    const shell=process.platform==='win32'?'powershell.exe':'/bin/sh';
    const args=process.platform==='win32'?['-NoLogo','-NoProfile','-NonInteractive','-Command',hook.commandWindows]:['-c',hook.command];
    const result=spawnSync(shell,args,{cwd:path.join(root,'scripts'),input:JSON.stringify(input(event)),encoding:'utf8',timeout:15000,windowsHide:true});
    assert.equal(result.status,0,`${event}: ${result.stderr}`);
    const parsed=JSON.parse(result.stdout.trim());
    assert.ok(!parsed.systemMessage,`${event}: ${JSON.stringify(parsed)}`);
    if(['SessionStart','UserPromptSubmit'].includes(event)) {
      assert.equal(parsed.hookSpecificOutput.hookEventName,event);
      assert.match(context(parsed),/以下是本仓库当前文档内容/);
    }
  }
});

test('configured launcher suppresses Git root lookup errors before Node starts',t=>{
  const root=fixture(t);
  const privateConfig=path.join(root,'private-gitconfig');
  write(root,'private-gitconfig','[broken\n');
  const config=JSON.parse(fs.readFileSync(path.join(repo,'.codex/hooks.json'),'utf8'));
  const windows=process.platform==='win32';
  const commands=new Set(Object.values(config.hooks).flatMap(groups=>groups.flatMap(group=>group.hooks.map(hook=>windows?hook.commandWindows:hook.command))));
  for(const command of commands){
    const result=spawnSync(windows?'powershell.exe':'/bin/sh',windows?['-NoLogo','-NoProfile','-NonInteractive','-Command',command]:['-c',command],{
      cwd:root,input:JSON.stringify(input('PreToolUse')),encoding:'utf8',timeout:15000,windowsHide:true,
      env:{...process.env,GIT_CONFIG_GLOBAL:privateConfig},
    });
    assert.equal(result.status,0);
    assert.match(JSON.parse(result.stdout).systemMessage,/Git root lookup failed/);
    assert.equal(result.stderr,'');
    assert.ok(!result.stdout.includes('private-gitconfig'));
  }
});

test('configured launcher suppresses missing, invalid and crashing Node entry output',t=>{
  const root=fixture(t);
  const hook=JSON.parse(fs.readFileSync(path.join(repo,'.codex/hooks.json'),'utf8')).hooks.PreToolUse[0].hooks[0];
  const windows=process.platform==='win32';
  for(const source of [null,'export const = ;','console.log("DO_NOT_ECHO_NATIVE_OUTPUT"); throw new Error("synthetic failure");']){
    if(source!==null)write(root,'scripts/docs-hooks.mjs',source);
    const result=spawnSync(windows?'powershell.exe':'/bin/sh',windows?['-NoLogo','-NoProfile','-NonInteractive','-Command',hook.commandWindows]:['-c',hook.command],{
      cwd:root,input:JSON.stringify(input('PreToolUse')),encoding:'utf8',timeout:15000,windowsHide:true,
    });
    assert.equal(result.status,0);
    assert.match(JSON.parse(result.stdout).systemMessage,/Node hook startup failed/);
    assert.equal(result.stderr,'');
    assert.ok(!result.stdout.includes(root));
    assert.ok(!result.stdout.includes('DO_NOT_ECHO_NATIVE_OUTPUT'));
  }
});

test('CLI handles malformed input with JSON warning and does not expose payload',t=>{
  const root=fixture(t);
  write(root,'scripts/docs-hooks.mjs',fs.readFileSync(path.join(repo,'scripts/docs-hooks.mjs'),'utf8'));
  for (const payload of ['{"private":"do-not-echo"', 'do-not-echo']) {
    const result=spawnSync(process.execPath,['scripts/docs-hooks.mjs'],{cwd:root,input:payload,encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0);
    const output=JSON.parse(result.stdout);
    assert.ok(output.systemMessage);
    assert.ok(!result.stdout.includes('do-not-echo'));
  }
});
