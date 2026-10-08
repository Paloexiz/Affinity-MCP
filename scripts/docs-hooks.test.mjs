import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { handleHook, recordReview, privacyFindings } from './docs-hooks.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = (event, extra = {}) => ({session_id:'test-session',turn_id:'test-turn',hook_event_name:event,...extra});
const ticket = createHash('sha256').update('test-session\0test-turn').digest('hex').slice(0,32);
const context = value => value.hookSpecificOutput?.additionalContext || '';
const write = (root, name, value) => { fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true}); fs.writeFileSync(path.join(root,name),value,'utf8'); };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'ai-agent-docs-hooks-中文 space-'));
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

test('privacy reports dangling documentation links instead of skipping them',t=>{
  const root=fixture(t);
  const target=path.join(root,'ai-agent-missing-docs');
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
  const config=path.join(root,'ai-agent-private-gitconfig');
  write(root,'ai-agent-private-gitconfig','[broken\n');
  const result=spawnSync(process.execPath,['scripts/docs-hooks.mjs'],{
    cwd:root,input:JSON.stringify(input('PreToolUse')),encoding:'utf8',windowsHide:true,
    env:{...process.env,GIT_CONFIG_GLOBAL:config},
  });
  assert.equal(result.status,0);
  assert.match(JSON.parse(result.stdout).systemMessage,/Git file inventory failed/);
  assert.equal(result.stderr,'');
  for(const output of [result.stdout,result.stderr]) {
    assert.ok(!output.includes(root));
    assert.ok(!output.includes('ai-agent-private-gitconfig'));
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

test('late/missing events do not claim successful verification; ticket path traversal rejected',t=>{
  const root=fixture(t);
  assert.match(context(handleHook(root,input('PostToolUse'))),/缺少操作前/);
  assert.throws(()=>recordReview(root,ticket,'Checked current changes and documentation.',true),/No valid/);
  assert.throws(()=>recordReview(root,'../escape','Checked current changes and documentation.',true),/Invalid review ticket/);
  assert.match(handleHook(root,{hook_event_name:'Stop'}).systemMessage,/缺少/);
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
  const privateConfig=path.join(root,'ai-agent-private-gitconfig');
  write(root,'ai-agent-private-gitconfig','[broken\n');
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
    assert.ok(!result.stdout.includes('ai-agent-private-gitconfig'));
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
