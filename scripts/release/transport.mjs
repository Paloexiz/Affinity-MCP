import { crc32, inflateRawSync } from "node:zlib";
import { reject } from "./github.mjs";

// Actions wraps our files in its own ZIP; this is not the deterministic production recipe.
export function unpackTransport(zip, expectedNames) {
  if (!Buffer.isBuffer(zip) || zip.length < 22 || zip.length > 256 * 1024 * 1024) reject("Unsupported artifact archive size.");
  try {
    let end = zip.length - 22;
    while (end >= Math.max(0, zip.length - 65557) && (zip.readUInt32LE(end) !== 0x06054b50 || end + 22 + zip.readUInt16LE(end + 20) !== zip.length)) end--;
    if (end < 0 || zip.readUInt32LE(end) !== 0x06054b50) reject("Missing artifact directory.");
    const count = zip.readUInt16LE(end + 10), start = zip.readUInt32LE(end + 16);
    if (zip.readUInt32LE(end + 4) !== 0 || zip.readUInt16LE(end + 8) !== count || count !== expectedNames.length || count === 65535 || start + zip.readUInt32LE(end + 12) !== end) reject("Unexpected artifact directory.");
    const files = new Map(), ranges = []; let cursor = start, total = 0;
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > end || zip.readUInt32LE(cursor) !== 0x02014b50) reject("Truncated artifact entry.");
      const flags = zip.readUInt16LE(cursor + 8), method = zip.readUInt16LE(cursor + 10), checksum = zip.readUInt32LE(cursor + 16), packed = zip.readUInt32LE(cursor + 20), size = zip.readUInt32LE(cursor + 24);
      const nameLength = zip.readUInt16LE(cursor + 28), extra = zip.readUInt16LE(cursor + 30), comment = zip.readUInt16LE(cursor + 32), offset = zip.readUInt32LE(cursor + 42);
      const name = zip.subarray(cursor + 46, cursor + 46 + nameLength), path = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(name);
      if ((flags & ~0x808) || ![0, 8].includes(method) || packed === 0xffffffff || size === 0xffffffff || offset === 0xffffffff || zip.readUInt16LE(cursor + 34) !== 0 || !expectedNames.includes(path) || files.has(path)) reject("Unexpected artifact file.");
      total += size;
      // shortcut: only classic ZIP and 256 MiB expanded payloads, review before larger artifacts.
      if (total > 256 * 1024 * 1024 || offset + 30 > start || zip.readUInt32LE(offset) !== 0x04034b50 || zip.readUInt16LE(offset + 6) !== flags || zip.readUInt16LE(offset + 8) !== method || zip.readUInt16LE(offset + 26) !== nameLength) reject("Invalid artifact local entry.");
      const data = offset + 30 + nameLength + zip.readUInt16LE(offset + 28), stop = data + packed;
      if (stop > start || !zip.subarray(offset + 30, offset + 30 + nameLength).equals(name)) reject("Artifact entry bounds or names differ.");
      let boundary = stop;
      if (flags & 8) {
        const descriptor = zip.readUInt32LE(stop) === 0x08074b50 ? stop + 4 : stop;
        boundary = descriptor + 12;
        if (boundary > start || zip.readUInt32LE(descriptor) !== checksum || zip.readUInt32LE(descriptor + 4) !== packed || zip.readUInt32LE(descriptor + 8) !== size) reject("Invalid artifact data descriptor.");
      } else if (zip.readUInt32LE(offset + 14) !== checksum || zip.readUInt32LE(offset + 18) !== packed || zip.readUInt32LE(offset + 22) !== size) reject("Artifact local sizes differ.");
      const payload = zip.subarray(data, stop), bytes = method === 0 ? payload : inflateRawSync(payload, { maxOutputLength: Math.max(size, 1) });
      if (bytes.length !== size || crc32(bytes) !== checksum) reject("Artifact file integrity differs.");
      ranges.push([offset, boundary]); files.set(path, bytes); cursor += 46 + nameLength + extra + comment;
    }
    ranges.sort((a, b) => a[0] - b[0]);
    if (cursor !== end || ranges[0]?.[0] !== 0 || ranges.at(-1)?.[1] !== start || ranges.some((range, i) => i && ranges[i - 1][1] !== range[0])) reject("Overlapping or unconsumed artifact bytes.");
    return files;
  } catch { reject("Artifact transport ZIP is invalid or unsupported."); }
}
