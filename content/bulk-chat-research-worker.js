// On-demand worker for the manual Research Export. No permanent listeners or polling
// are installed on normal chat pages; the owner terminates this worker after the run.
'use strict';
const encoder = new TextEncoder();
const MAX_ZIP_BYTES = 300_000_000;
const table = Array.from({length: 256}, (_, n) => {
  let crc = n;
  for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function u16(view, offset, value) { view.setUint16(offset, value & 65535, true); }
function u32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }
async function packText(name, text, metrics) {
  const encodeStart = performance.now();
  const original = encoder.encode(text), nameBytes = encoder.encode(name);
  metrics.encoding += performance.now() - encodeStart;
  if (original.byteLength > 32 * 1024 * 1024)
    throw new Error('A single JSON chunk exceeds 32 MB; reduce message chunk size');
  let data = original, method = 0;
  if (typeof CompressionStream === 'function') {
    const start = performance.now();
    try {
      const stream = new Blob([original]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
      if (compressed.byteLength < original.byteLength) { data = compressed; method = 8; }
    } catch { /* ZIP STORE is valid when deflate-raw is unavailable. */ }
    metrics.compression += performance.now() - start;
  }
  const crcStart = performance.now();
  const crc = crc32(original);
  metrics.crc32 += performance.now() - crcStart;
  return { name, nameBytes, data, size: original.byteLength, crc, method };
}
async function packJson(name, object, metrics) {
  const start = performance.now();
  const json = JSON.stringify(object);
  metrics.serialization += performance.now() - start;
  return packText(name, json, metrics);
}
function makeMetrics() {
  return {serialization: 0, encoding: 0, compression: 0, crc32: 0, zipAssembly: 0};
}
async function packMessages({conversationId, messages, chunkIndex}, metrics) {
  const result = [];
  let strings = [], bytes = 0, index = chunkIndex;
  const prefix = '{"conversationId":' + JSON.stringify(conversationId) + ',"order":"oldest-first","messages":[';
  async function finish() {
    if (!strings.length && messages.length) return;
    const name = `conversations/${conversationId}/messages-${String(index++).padStart(4, '0')}.json`;
    result.push(await packText(name, prefix + strings.join(',') + ']}', metrics));
    strings = []; bytes = 0;
  }
  for (const message of messages) {
    const start = performance.now();
    const serialized = JSON.stringify(message);
    metrics.serialization += performance.now() - start;
    const byteStart = performance.now();
    const byteCount = encoder.encode(serialized).byteLength;
    metrics.encoding += performance.now() - byteStart;
    strings.push(serialized); bytes += byteCount;
    if (strings.length >= 150 || bytes >= 2_000_000) await finish();
  }
  if (strings.length || !messages.length) await finish();
  return {entries: result, nextChunkIndex: index};
}
function zipBlob(entries, metrics) {
  const start = performance.now();
  if (entries.length > 65534) throw new Error('Too many files for this ZIP part');
  const parts = [], central = [];
  let offset = 0, centralSize = 0;
  const date = new Date(), y = Math.max(1980, date.getFullYear());
  const dt = ((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const tm = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  for (const entry of entries) {
    const n = entry.nameBytes.length;
    const local = new Uint8Array(30 + n), lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x800); u16(lv, 8, entry.method);
    u16(lv, 10, tm); u16(lv, 12, dt); u32(lv, 14, entry.crc);
    u32(lv, 18, entry.data.length); u32(lv, 22, entry.size); u16(lv, 26, n);
    local.set(entry.nameBytes, 30);
    parts.push(local, entry.data);
    const dir = new Uint8Array(46 + n), dv = new DataView(dir.buffer);
    u32(dv, 0, 0x02014b50); u16(dv, 4, 20); u16(dv, 6, 20); u16(dv, 8, 0x800);
    u16(dv, 10, entry.method); u16(dv, 12, tm); u16(dv, 14, dt);
    u32(dv, 16, entry.crc); u32(dv, 20, entry.data.length); u32(dv, 24, entry.size);
    u16(dv, 28, n); u32(dv, 42, offset); dir.set(entry.nameBytes, 46);
    central.push(dir); offset += local.length + entry.data.length; centralSize += dir.length;
  }
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 8, entries.length); u16(ev, 10, entries.length);
  u32(ev, 12, centralSize); u32(ev, 16, offset);
  const blob = new Blob([...parts, ...central, end], {type: 'application/zip'});
  if (blob.size > MAX_ZIP_BYTES) throw new Error('ZIP part exceeded 300 MB');
  metrics.zipAssembly += performance.now() - start;
  return blob;
}
self.onmessage = async event => {
  const {id, type, payload} = event.data || {};
  if (!id) return;
  const metrics = makeMetrics();
  try {
    if (type === 'pack-json') {
      const entry = await packJson(payload.name, payload.object, metrics);
      self.postMessage({id, ok: true, result: {entry, metrics}}, [entry.nameBytes.buffer, entry.data.buffer]);
    } else if (type === 'pack-messages') {
      const result = await packMessages(payload, metrics);
      self.postMessage({id, ok: true, result: {...result, metrics}},
        result.entries.flatMap(e => [e.nameBytes.buffer, e.data.buffer]));
    } else if (type === 'build-zip') {
      const files = payload.entries;
      const manifest = {format: 'ds-chat-memory-research-v1', generatedAt: new Date().toISOString(),
        part: payload.partNumber, selection: {botLimit: payload.report.botSelection},
        safetyLimits: {compressedBytesPerPart: MAX_ZIP_BYTES}, summary: payload.report,
        files: files.map(e => ({path: e.name, bytes: e.size, compressedBytes: e.data.length, crc32: e.crc}))};
      const manifestEntry = await packJson('manifest.json', manifest, metrics);
      const blob = zipBlob([manifestEntry, ...files], metrics);
      self.postMessage({id, ok: true, result: {blob, metrics}});
    } else throw new Error('Unknown Research Export worker operation');
  } catch (error) {
    self.postMessage({id, ok: false, error: String(error?.message || error)});
  }
};
self.postMessage({type: 'ds-research-worker-ready'});
