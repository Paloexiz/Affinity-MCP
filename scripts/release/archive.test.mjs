import test from "node:test";
import assert from "node:assert/strict";
import { encodeZip, decodeZip } from "./archive.mjs";

const sample = [{ path: "a.txt", mode: "100644", bytes: Buffer.from("123456789") }];
const golden = Buffer.from(
  "504b0304140000080000000021002639f4cb090000000900000005000000612e747874313233343536373839" +
  "504b01021403140000080000000021002639f4cb0900000009000000050000000000000000000000a48100000000612e747874" +
  "504b05060000000001000100330000002c0000000000", "hex");

test("recipe v1 STORE bytes match a fixed ZIP golden and preserve raw file bytes", () => {
  assert.deepEqual(encodeZip(sample), golden);
  assert.deepEqual(decodeZip(golden), sample);
  const entries = [
    { path: "中文.txt", mode: "100644", bytes: Buffer.from("行\r\n尾\n") },
    { path: ".config", mode: "100644", bytes: Buffer.from([0, 255, 128]) },
    ...sample,
  ];
  const actual = decodeZip(encodeZip(entries));
  assert.deepEqual(actual.map(entry => entry.path), [".config", "a.txt", "中文.txt"]);
  assert.deepEqual(actual.find(entry => entry.path === "中文.txt").bytes, entries[0].bytes);
});

test("unsafe, ambiguous, duplicate, non-file, and classic ZIP overflow entries fail", () => {
  for (const path of ["", "/a", "../a", "a/../b", "a\\b", "a//b", "a/", ".git/config", "C:a", "a\0b", "a.", "aux.txt", "dir/NUL", "a ", "\ud800", "a?", "a*", "a|", "a\"", "a<", "a>"]) {
    assert.throws(() => encodeZip([{ ...sample[0], path }]), /path/i, path);
  }
  for (const mode of ["100755", "120000", "160000", "040000"]) assert.throws(() => encodeZip([{ ...sample[0], mode }]), /mode/i);
  assert.throws(() => encodeZip([...sample, ...sample]), /duplicate/i);
  assert.throws(() => encodeZip([...sample, { ...sample[0], path: "A.txt" }]), /collision/i);
  assert.throws(() => encodeZip([...sample, { ...sample[0], path: "a.txt/b" }]), /collision/i);
  assert.throws(() => encodeZip(Array(65535).fill(sample[0])), /ZIP64/i);
});

test("ZIP verifier rejects altered content, mode, CRC, offsets, flags, trailing and truncated data", () => {
  for (const offset of [4, 6, 8, 10, 12, 14, 18, 22, 26, 28, 35, 44 + 38, 44 + 42, golden.length - 6]) {
    const altered = Buffer.from(golden); altered[offset] ^= 1;
    assert.throws(() => decodeZip(altered), /ZIP|path/i, `offset ${offset}`);
  }
  assert.throws(() => decodeZip(Buffer.concat([golden, Buffer.from([0])])), /ZIP/i);
  for (let length = 0; length < golden.length; length++) assert.throws(() => decodeZip(golden.subarray(0, length)), /ZIP/i);
  const zip64 = Buffer.from(golden); zip64.writeUInt32LE(0xffffffff, 18);
  assert.throws(() => decodeZip(zip64), /ZIP/i);
});
