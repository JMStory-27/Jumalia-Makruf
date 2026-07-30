'use strict';
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const SIZE = 512;
const CX = SIZE / 2, CY = SIZE / 2;

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length);
  return Buffer.concat([lenBuf, t, data, crcBuf]);
}

function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }

// Distance from point (px,py) to line segment (ax,ay)-(bx,by)
function distToSeg(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return Math.sqrt((px-ax)**2 + (py-ay)**2);
  let tt = ((px - ax) * abx + (py - ay) * aby) / len2;
  tt = Math.max(0, Math.min(1, tt));
  return Math.sqrt((px - (ax + tt*abx))**2 + (py - (ay + tt*aby))**2);
}

function getPixel(x, y) {
  const dx = x - CX, dy = y - CY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Rounded rect mask (corner radius 88px)
  const CR = 88;
  const hw = SIZE / 2 - 1, hh = SIZE / 2 - 1;
  const qx = Math.abs(dx) - hw + CR;
  const qy = Math.abs(dy) - hh + CR;
  const edgeDist = Math.sqrt(Math.max(0, qx) ** 2 + Math.max(0, qy) ** 2) - CR;
  if (edgeDist > 1) return [0, 0, 0, 0];
  const alpha = edgeDist > 0 ? Math.round(255 * (1 - edgeDist)) : 255;

  // Background: dark navy
  let r = 4, g = 7, b = 16;

  // Red radial glow from center
  const nd = dist / (SIZE * 0.5);
  const redGlow = Math.pow(Math.max(0, 1 - nd), 1.6);
  r = clamp(r + redGlow * 130, 0, 255);
  g = clamp(g + redGlow * 5, 0, 255);
  b = clamp(b + redGlow * 20, 0, 255);

  // Subtle violet corner tint
  const cornerGlow = Math.pow(Math.max(0, nd - 0.55) * 2, 2);
  r = clamp(r + cornerGlow * 40, 0, 255);
  b = clamp(b + cornerGlow * 60, 0, 255);

  // Outer glow ring
  const ringR = SIZE * 0.41;
  const ringW = SIZE * 0.025;
  const ringDist = Math.abs(dist - ringR);
  if (ringDist < ringW) {
    const t = 1 - ringDist / ringW;
    r = clamp(lerp(r, 220, t * 0.55), 0, 255);
    g = clamp(lerp(g, 0,   t * 0.45), 0, 255);
    b = clamp(lerp(b, 38,  t * 0.45), 0, 255);
  }

  // WhatsApp-style bubble body (circle)
  const bubR  = SIZE * 0.30;
  const bubCY = CY - 14;
  const bubD  = Math.sqrt(dx * dx + (y - bubCY) ** 2);

  // Tail triangle (down-left)
  const inTail = (() => {
    const tx = x - (CX - SIZE * 0.08);
    const ty = y - (bubCY + bubR - SIZE * 0.06);
    if (ty < 0 || ty > SIZE * 0.13) return false;
    const halfW = SIZE * 0.075 - ty * 0.55;
    return tx > -halfW && tx < halfW;
  })();

  const inBub = bubD < bubR - 1 || inTail;

  if (inBub) {
    r = 255; g = 255; b = 255;

    // Red inner fill
    const innerR = SIZE * 0.215;
    const innerD = Math.sqrt(dx * dx + (y - bubCY) ** 2);
    if (innerD < innerR) {
      r = 204; g = 0; b = 28;

      // White checkmark inside red circle
      const segs = [
        [CX - 62, bubCY + 6,  CX - 20, bubCY + 45],
        [CX - 20, bubCY + 45, CX + 54, bubCY - 33],
      ];
      let minD = Infinity;
      for (const [ax, ay, bx, by] of segs) {
        minD = Math.min(minD, distToSeg(x, y, ax, ay, bx, by));
      }
      if (minD < 14) {
        const blend = Math.max(0, 1 - minD / 14);
        r = clamp(lerp(r, 255, blend), 0, 255);
        g = clamp(lerp(g, 255, blend), 0, 255);
        b = clamp(lerp(b, 255, blend), 0, 255);
      }
    }
  }

  return [r, g, b, alpha];
}

function buildPng() {
  const rows = [];
  for (let y = 0; y < SIZE; y++) {
    const row = Buffer.allocUnsafe(1 + SIZE * 4);
    row[0] = 0; // filter: None
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b, a] = getPixel(x, y);
      row[1 + x * 4]     = r;
      row[1 + x * 4 + 1] = g;
      row[1 + x * 4 + 2] = b;
      row[1 + x * 4 + 3] = a;
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw, { level: 7 });

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir  = path.join(__dirname, '..', 'public');
const outPath = path.join(outDir, 'fixmerah-lawrenz-icon.png');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

console.log('Generating FixMerah Lawrenz icon...');
const png = buildPng();
fs.writeFileSync(outPath, png);
console.log(`Icon saved: ${outPath} (${(png.length / 1024).toFixed(1)} KB)`);
