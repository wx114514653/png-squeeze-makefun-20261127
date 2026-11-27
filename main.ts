import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync, constants as Z } from 'node:zlib';

const INPUT = process.env.MAKEFUN_INPUT_DIR || '/input';
const OUTPUT = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const W = 1280, H = 720;
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(b, start, end) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function paeth(a, b, c) {
  const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}
function decode(bytes) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(SIG)) throw Error('bad input PNG signature');
  let at = 8, width = 0, height = 0, ct = -1, depth = -1, ended = false;
  const idats = [];
  while (at + 12 <= bytes.length) {
    const len = bytes.readUInt32BE(at), type = bytes.toString('ascii', at + 4, at + 8);
    if (len > bytes.length - at - 12) throw Error('truncated PNG chunk');
    const data = bytes.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; ct = data[9];
      if (data.length !== 13 || depth !== 8 || ct !== 6 || data[10] || data[11] || data[12]) throw Error('expected non-interlaced 8-bit RGBA PNG');
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') { ended = true; break; }
    at += len + 12;
  }
  if (!ended || width !== W || height !== H || !idats.length) throw Error('input PNG does not match 1280 x 720 RGBA contract');
  const raw = inflateSync(Buffer.concat(idats), { maxOutputLength: H * (W * 4 + 1) + 1 });
  const stride = W * 4;
  if (raw.length !== H * (stride + 1)) throw Error('unexpected input scanline size');
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const src = y * (stride + 1) + 1, dst = y * stride, ft = raw[src - 1];
    if (ft > 4) throw Error('invalid PNG filter');
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? rgba[dst + i - 4] : 0;
      const b = y ? rgba[dst - stride + i] : 0;
      const c = y && i >= 4 ? rgba[dst - stride + i - 4] : 0;
      const pred = ft === 0 ? 0 : ft === 1 ? a : ft === 2 ? b : ft === 3 ? ((a + b) >> 1) : paeth(a, b, c);
      rgba[dst + i] = raw[src + i] + pred;
    }
  }
  return rgba;
}
function keyAt(rgba, p) { return ((rgba[p] * 256 + rgba[p + 1]) * 256 + rgba[p + 2]) * 256 + rgba[p + 3]; }
function inspect(rgba) {
  let opaque = true, grey = true, transparentKey = null;
  const counts = new Map();
  let tooMany = false;
  for (let p = 0; p < rgba.length; p += 4) {
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2], a = rgba[p + 3];
    if (a !== 255) opaque = false;
    if (r !== g || r !== b) grey = false;
    if (!tooMany) {
      const k = keyAt(rgba, p), old = counts.get(k);
      if (old === undefined) {
        if (counts.size === 256) tooMany = true;
        else counts.set(k, 1);
      } else counts.set(k, old + 1);
    }
    if (a !== 255) {
      if (a !== 0) transparentKey = -1;
      else if (transparentKey === null) transparentKey = (r << 16) | (g << 8) | b;
      else if (transparentKey >= 0 && transparentKey !== ((r << 16) | (g << 8) | b)) transparentKey = -1;
    }
  }
  if (transparentKey !== null && transparentKey >= 0) {
    for (let p = 0; p < rgba.length; p += 4) {
      if (rgba[p + 3] === 255 && ((rgba[p] << 16) | (rgba[p + 1] << 8) | rgba[p + 2]) === transparentKey) { transparentKey = -1; break; }
    }
  }
  return { opaque, grey, colours: tooMany ? null : counts, transparentKey: transparentKey >= 0 ? transparentKey : null };
}
function rgbaSamples(rgba, ct) {
  if (ct === 6) return rgba;
  const bpp = ct === 0 ? 1 : ct === 2 ? 3 : 2;
  const out = new Uint8Array(W * H * bpp);
  for (let p = 0, q = 0; p < rgba.length; p += 4, q += bpp) {
    if (ct === 0) out[q] = rgba[p];
    else if (ct === 2) { out[q] = rgba[p]; out[q + 1] = rgba[p + 1]; out[q + 2] = rgba[p + 2]; }
    else { out[q] = rgba[p]; out[q + 1] = rgba[p + 3]; }
  }
  return out;
}
function paletteForms(rgba, counts) {
  const colours = [];
  for (const [word, count] of counts) {
    const a = word & 255, b = (word >>> 8) & 255, g = (word >>> 16) & 255, r = word >>> 24;
    colours.push({ word, count, r, g, b, a });
  }
  const forms = [];
  for (const order of ['count', 'luma']) {
    const entries = [...colours].sort((x, y) => {
      const tx = x.a === 255 ? 1 : 0, ty = y.a === 255 ? 1 : 0;
      if (tx !== ty) return tx - ty;
      if (!tx && x.a !== y.a) return x.a - y.a;
      if (order === 'luma') return (299 * x.r + 587 * x.g + 114 * x.b) - (299 * y.r + 587 * y.g + 114 * y.b) || x.word - y.word;
      return y.count - x.count || x.word - y.word;
    });
    const ix = new Map(), plte = Buffer.alloc(entries.length * 3);
    let lastAlpha = 0;
    for (let i = 0; i < entries.length; i++) {
      const c = entries[i]; ix.set(c.word, i); plte[i * 3] = c.r; plte[i * 3 + 1] = c.g; plte[i * 3 + 2] = c.b;
      if (c.a !== 255) lastAlpha = i + 1;
    }
    const trns = lastAlpha ? Buffer.from(entries.slice(0, lastAlpha).map(c => c.a)) : null;
    const samples = new Uint8Array(W * H);
    for (let p = 0, q = 0; p < rgba.length; p += 4, q++) samples[q] = ix.get(keyAt(rgba, p));
    forms.push({ ct: 3, bpp: 1, samples, plte, trns });
  }
  return forms;
}
function makeForms(rgba) {
  const meta = inspect(rgba), forms = [];
  if (meta.colours) forms.push(...paletteForms(rgba, meta.colours));
  let ct, trns = null;
  if (meta.grey) {
    if (meta.opaque || meta.transparentKey !== null) {
      ct = 0;
      if (meta.transparentKey !== null) trns = Buffer.from([0, meta.transparentKey & 255]);
    } else ct = 4;
  } else if (meta.opaque || meta.transparentKey !== null) {
    ct = 2;
    if (meta.transparentKey !== null) trns = Buffer.from([0, meta.transparentKey >>> 16, 0, (meta.transparentKey >>> 8) & 255, 0, meta.transparentKey & 255]);
  } else ct = 6;
  const bpp = ct === 0 ? 1 : ct === 2 ? 3 : ct === 4 ? 2 : 4;
  forms.push({ ct, bpp, samples: rgbaSamples(rgba, ct), plte: null, trns });
  return forms;
}
function filter(samples, bpp, kind) {
  const stride = W * bpp, raw = new Uint8Array(H * (stride + 1));
  const trials = Array.from({ length: 5 }, () => new Uint8Array(stride));
  for (let y = 0; y < H; y++) {
    const base = y * stride, outAt = y * (stride + 1), prev = base - stride;
    let chosen = kind;
    if (kind === 5) {
      let best = Infinity;
      for (let t = 0; t < 5; t++) {
        const row = trials[t]; let sum = 0;
        for (let i = 0; i < stride; i++) {
          const a = i >= bpp ? samples[base + i - bpp] : 0;
          const b = y ? samples[prev + i] : 0;
          const c = y && i >= bpp ? samples[prev + i - bpp] : 0;
          const pred = t === 0 ? 0 : t === 1 ? a : t === 2 ? b : t === 3 ? ((a + b) >> 1) : paeth(a, b, c);
          const v = (samples[base + i] - pred) & 255; row[i] = v; sum += v < 128 ? v : 256 - v;
        }
        if (sum < best) { best = sum; chosen = t; }
      }
      raw[outAt] = chosen; raw.set(trials[chosen], outAt + 1);
    } else {
      raw[outAt] = chosen;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? samples[base + i - bpp] : 0;
        const b = y ? samples[prev + i] : 0;
        const c = y && i >= bpp ? samples[prev + i - bpp] : 0;
        const pred = chosen === 0 ? 0 : chosen === 1 ? a : chosen === 2 ? b : chosen === 3 ? ((a + b) >> 1) : paeth(a, b, c);
        raw[outAt + 1 + i] = (samples[base + i] - pred) & 255;
      }
    }
  }
  return raw;
}
function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 4, 'ascii'); data.copy(out, 8);
  out.writeUInt32BE(crc32(out, 4, 8 + data.length), 8 + data.length);
  return out;
}
function png(form, compressed) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = form.ct;
  const parts = [SIG, chunk('IHDR', ihdr)];
  if (form.plte) parts.push(chunk('PLTE', form.plte));
  if (form.trns) parts.push(chunk('tRNS', form.trns));
  parts.push(chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
function encode(rgba) {
  let best = null;
  for (const form of makeForms(rgba)) {
    const filters = form.ct === 3 ? [0, 2, 5] : [0, 1, 2, 3, 4, 5];
    for (const f of filters) {
      const raw = filter(form.samples, form.bpp, f);
      for (const level of [6, 9]) {
        const z = deflateSync(raw, { level });
        const bytes = png(form, z);
        if (best === null || bytes.length < best.length) best = bytes;
      }
      if (f === 5 || f === 2) {
        for (const strategy of [Z.Z_FILTERED, Z.Z_RLE]) {
          const z = deflateSync(raw, { level: 9, strategy });
          const bytes = png(form, z);
          if (bytes.length < best.length) best = bytes;
        }
      }
    }
  }
  return best;
}

for (let i = 1; i <= 8; i++) {
  const id = `i${String(i).padStart(3, '0')}`;
  const dir = join(INPUT, id);
  const rgba = decode(readFileSync(join(dir, 'image.png')));
  const answer = encode(rgba);
  const outDir = join(OUTPUT, id);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'image.png'), answer);
}
