import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { eventIdentity, verifyCheckout, fetchInputs, dispatchInput, deliveryType } from "./ci.mjs";

const base = "a".repeat(40), head = "b".repeat(40), merge = "c".repeat(40);
test("dispatch modes reject missing, cross-mode, malformed and unbound control identities", () => {
  assert.deepEqual(dispatchInput({ base_sha: base }), { operation: "ci", base_sha: base });
  const common = { expected_tool_sha: head, entry_id: "d".repeat(32), source_sha: base, version: "0.5.4" };
  for (const input of [
    { ...common, operation: "publish", base_sha: merge, push_run_id: "1", push_attempt: "2", ref_artifact_id: "3", ref_artifact_digest: "e".repeat(64) },
    { ...common, operation: "recover", base_sha: merge, production_sha: head, receipt_sha: base },
    { ...common, operation: "retire-candidate", reason: "withdraw" },
    { ...common, operation: "control-recover" },
  ]) {
    assert.deepEqual(dispatchInput(input), input);
    assert.throws(() => dispatchInput({ ...input, expected_tool_sha: "" }));
    assert.throws(() => dispatchInput({ ...input, entry_id: "invalid" }));
    assert.throws(() => dispatchInput({ ...input, extra: "" }));
  }
  for (const input of [{}, { operation: "__proto__" }, { base_sha: base, source_sha: head }, { ...common, operation: "retire-candidate", reason: "cancel" }, { ...common, operation: "control-recover", reason: "withdraw" }]) assert.throws(() => dispatchInput(input));
});
test("delivery type is chosen from version shapes before validation, never by retrying an ordinary failure", () => {
  for (const [previous, current, production, expected] of [
    ["0.5.4-dev.3", "0.5.4-dev.4", "0.5.3", "development"],
    ["0.5.4-dev.3", "0.5.4-dev.3", "0.5.3", "development-date"],
    ["0.5.4", "0.5.5-dev.1", "0.5.4", "development"],
    ["0.5.4-dev.3", "0.5.4", "0.5.3", "promote"],
    ["0.5.4", "0.5.4", "0.5.3", "date-revision"],
    ["0.5.4", "0.5.4-dev.4", "0.5.3", "withdraw"],
  ]) assert.equal(deliveryType(previous, current, production), expected);
  assert.throws(() => deliveryType("invalid", "0.5.4", "0.5.3"));
});
test("PR identity separates exact head/base from integration SHA, including edited and ready", () => {
  for (const action of ["opened", "synchronize", "reopened", "edited", "ready_for_review"]) {
    const event = { action, number: 7, pull_request: { base: { ref: "develop", sha: base }, head: { sha: head } } };
    assert.deepEqual(eventIdentity("pull_request", event, { GITHUB_SHA: merge, GITHUB_REF: "refs/pull/7/merge" }), { event: "pull_request", base, head, integration: merge, ref: "refs/pull/7/merge", title: "" });
  }
});
test("push and readonly dispatch bind exact event commits, reject zero and unrelated refs", () => {
  assert.equal(eventIdentity("push", { before: base, after: head, ref: "refs/heads/develop" }, { GITHUB_SHA: head, GITHUB_REF: "refs/heads/develop" }).base, base);
  assert.equal(eventIdentity("workflow_dispatch", { inputs: { base_sha: base } }, { GITHUB_SHA: head, GITHUB_REF: "refs/heads/develop" }).head, head);
  for (const event of [{ before: "0".repeat(40), after: head, ref: "refs/heads/develop" }, { before: base, after: merge, ref: "refs/heads/develop" }, { before: base, after: head, ref: "refs/tags/develop" }]) assert.throws(() => eventIdentity("push", event, { GITHUB_SHA: head, GITHUB_REF: "refs/heads/develop" }));
  assert.throws(() => eventIdentity("workflow_dispatch", {}, { GITHUB_SHA: head, GITHUB_REF: "refs/heads/develop" }));
  assert.throws(() => eventIdentity("workflow_dispatch", { inputs: { base_sha: base } }, { GITHUB_SHA: head, GITHUB_REF: "refs/heads/other" }));
  assert.throws(() => eventIdentity("pull_request_target", {}, {}));
});
test("checkout verification checks real merge parents, not just a declared head", t => {
  const root = mkdtempSync(join(tmpdir(), "ai-agent-ci-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q"); git("config", "user.name", "CI test"); git("config", "user.email", "test@example.invalid"); git("config", "commit.gpgSign", "false"); git("config", "core.hooksPath", ".git/no-hooks");
  writeFileSync(join(root, "sample"), "one"); git("add", "."); git("commit", "-qm", "base"); const b = git("rev-parse", "HEAD");
  writeFileSync(join(root, "sample"), "two"); git("commit", "-qam", "head"); const h = git("rev-parse", "HEAD");
  const tree = git("rev-parse", "HEAD^{tree}"); const m = git("commit-tree", tree, "-p", b, "-p", h, "-m", "Synthetic merge"); git("checkout", "-q", "--detach", m);
  assert.doesNotThrow(() => verifyCheckout(root, { event: "pull_request", base: b, head: h, integration: m }));
  assert.throws(() => verifyCheckout(root, { event: "pull_request", base: h, head: b, integration: m }), /parents/);
  assert.throws(() => verifyCheckout(root, { event: "push", integration: h }), /checkout/);
});
test("actual aggregate workflow command rejects failure, cancellation, skipping and missing jobs", () => {
  const workflow = readFileSync(new URL("../.github/workflows/docs-hooks.yml", import.meta.url), "utf8");
  const expression = /node --input-type=module -e '([^']+)'/.exec(workflow)?.[1];
  assert.ok(expression, "aggregate command is directly executable without checkout");
  const run = needs => spawnSync(process.execPath, ["--input-type=module", "-e", expression], { env: { ...process.env, CI_NEEDS: JSON.stringify(needs) } }).status;
  assert.equal(run({ test: { result: "success" }, policy: { result: "success" } }), 0);
  for (const result of ["failure", "cancelled", "skipped", "pending", undefined]) {
    assert.notEqual(run({ test: { result }, policy: { result: "success" } }), 0);
    assert.notEqual(run({ test: { result: "success" }, policy: { result } }), 0);
  }
  assert.notEqual(run({ test: { result: "success" } }), 0);
});

test("explicit fetch fills a shallow checkout and obtains a head absent from advertised branches", t => {
  const root = mkdtempSync(join(tmpdir(), "ai-agent-ci-fetch-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const upstream = join(root, "upstream"), checkout = join(root, "checkout"); mkdirSync(upstream);
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  git(upstream, "init", "-qb", "main"); git(upstream, "config", "user.name", "CI test"); git(upstream, "config", "user.email", "test@example.invalid"); git(upstream, "config", "commit.gpgSign", "false"); git(upstream, "config", "core.hooksPath", ".git/no-hooks");
  writeFileSync(join(upstream, "sample"), "stable"); git(upstream, "add", "."); git(upstream, "commit", "-qm", "stable"); const stable = git(upstream, "rev-parse", "HEAD");
  git(upstream, "checkout", "-qb", "develop"); writeFileSync(join(upstream, "sample"), "base"); git(upstream, "commit", "-qam", "base"); const b = git(upstream, "rev-parse", "HEAD");
  writeFileSync(join(upstream, "sample"), "head"); git(upstream, "commit", "-qam", "head"); const h = git(upstream, "rev-parse", "HEAD");
  git(upstream, "update-ref", "refs/pull/7/head", h); git(upstream, "reset", "--hard", b);
  const url = pathToFileURL(upstream).href;
  git(root, "clone", "--quiet", "--depth=1", "--branch", "develop", url, checkout);
  assert.equal(git(checkout, "rev-parse", "--is-shallow-repository"), "true");
  assert.equal(fetchInputs(checkout, { base: b, head: h }, url), stable);
  assert.equal(git(checkout, "rev-parse", "--is-shallow-repository"), "false");
  assert.equal(git(checkout, "show", `${h}:sample`), "head");
  assert.equal(git(checkout, "rev-parse", "HEAD"), b, "fetch does not substitute the checkout identity");
  assert.throws(() => fetchInputs(checkout, { base: b, head: "f".repeat(40) }, url), /fetch failed/);
});
