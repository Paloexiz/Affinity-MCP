import { crc32 } from "node:zlib";

const fail = message => { throw new Error(message); };
export const pathOrder = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

export function checkPath(path) {
  if (typeof path !== "string" || !path || Buffer.from(path).toString("utf8") !== path || path !== path.normalize("NFC") || /[\\:<>"|?*\x00-\x1f\x7f]/.test(path) ||
      path.split("/").some(part => !part || [".", "..", ".git"].includes(part.toLowerCase()) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    fail("Invalid or nonportable archive path.");
  }
}

function orderedEntries(entries) {
  if (!Array.isArray(entries) || !entries.length) fail("ZIP requires files.");
  if (entries.length >= 0xffff) fail("ZIP64 entry counts are unsupported.");
  const names = new Set();
  for (const entry of entries) {
    checkPath(entry.path);
    if (entry.mode !== "100644") fail("Unsupported archive mode.");
    if (!Buffer.isBuffer(entry.bytes)) fail("ZIP file contents must be bytes.");
    if (entry.bytes.length >= 0xffffffff || Buffer.byteLength(entry.path) > 0xffff) fail("ZIP64 size or path length is unsupported.");
    if (names.has(entry.path)) fail("Duplicate ZIP path.");
    names.add(entry.path);
  }
  const folded = new Set([...names].map(path => path.toLowerCase()));
  if (folded.size !== names.size) fail("Archive path collision.");
  for (const path of folded) {
    let prefix = "";
    for (const part of path.split("/").slice(0, -1)) {
      prefix += (prefix ? "/" : "") + part;
      if (folded.has(prefix)) fail("Archive file/directory collision.");
    }
  }
  return [...entries].sort((a, b) => pathOrder(a.path, b.path));
}

export function encodeZip(entries) {
  const local = [], central = []; let offset = 0;
  for (const { path, bytes } of orderedEntries(entries)) {
    const name = Buffer.from(path), header = Buffer.alloc(30), directory = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0x0021, 12);
    header.writeUInt32LE(crc32(bytes), 14);
    header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(0x0314, 4);
    header.copy(directory, 6, 4, 28);
    directory.writeUInt32LE(0x81a40000, 38);
    directory.writeUInt32LE(offset, 42);
    local.push(header, name, bytes); central.push(directory, name);
    offset += header.length + name.length + bytes.length;
    if (offset >= 0xffffffff) fail("ZIP64 offsets are unsupported.");
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  if (offset + directory.length + end.length >= 0xffffffff) fail("ZIP64 archive sizes are unsupported.");
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

export function decodeZip(zip) {
  if (!Buffer.isBuffer(zip)) fail("ZIP must be bytes.");
  const entries = []; let offset = 0;
  while (offset + 4 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    if (offset + 30 > zip.length) fail("Truncated ZIP header.");
    const header = zip.subarray(offset, offset + 30), size = header.readUInt32LE(18), length = header.readUInt16LE(26);
    if (size === 0xffffffff || size !== header.readUInt32LE(22) || header.readUInt16LE(28) !== 0 || offset + 30 + length + size > zip.length) fail("Invalid ZIP size or extra field.");
    const name = zip.subarray(offset + 30, offset + 30 + length);
    let path; try { path = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(name); } catch { fail("Invalid ZIP path encoding."); }
    const bytes = zip.subarray(offset + 30 + length, offset + 30 + length + size);
    entries.push({ path, mode: "100644", bytes });
    offset += 30 + length + size;
    if (entries.length >= 0xffff) fail("ZIP64 entry counts are unsupported.");
  }
  // Exact reconstruction checks both directories, CRC, mode, offsets and every remaining byte.
  if (!encodeZip(entries).equals(zip)) fail("ZIP is not the canonical recipe v1 archive.");
  return entries;
}
