// Draws the FOCUS icon (dark rounded square, white ring, red centre dot) as PNGs. No dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function shade(x, y) {
  // coordinates in 0..1
  const cx = x - 0.5, cy = y - 0.5;
  // rounded square, radius 0.22
  const r = 0.22, q = Math.max(Math.abs(cx) - (0.5 - r), 0), p = Math.max(Math.abs(cy) - (0.5 - r), 0);
  if (Math.hypot(q, p) > r) return [0, 0, 0, 0];
  const d = Math.hypot(cx, cy);
  if (d < 0.12) return [255, 64, 64, 255]; // centre dot
  if (d > 0.24 && d < 0.33) return [245, 245, 245, 255]; // ring
  return [24, 24, 30, 255];
}

function png(size) {
  const ss = 4;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          acc = [acc[0] + c[0] * c[3], acc[1] + c[1] * c[3], acc[2] + c[2] * c[3], acc[3] + c[3]];
        }
      const a = acc[3];
      const o = 1 + x * 4;
      row[o] = a ? acc[0] / a : 0;
      row[o + 1] = a ? acc[1] / a : 0;
      row[o + 2] = a ? acc[2] / a : 0;
      row[o + 3] = a / (ss * ss);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icon', { recursive: true });
for (const s of [16, 32, 48, 128]) writeFileSync(`public/icon/${s}.png`, png(s));
console.log('icons written');
