// 生成 PWA 图标（无外部依赖，用 zlib 手写 PNG）
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [250, 245, 236];
const INK = [45, 39, 35];
const ACCENT = [224, 140, 132];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel(x, y, size);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
      offset += 4;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

// 图形：米色底 + 圆角「纸页」+ 三行文字线 + 右下角红色拾取点
function draw(x, y, size) {
  const u = size / 100;
  const cx = 50 * u;
  const cy = 50 * u;

  // 背景（外面一圈做圆角矩形遮罩，避免 iOS 加黑边）
  const radius = size * 0.22;
  const dx = Math.abs(x - cx) - (size / 2 - radius);
  const dy = Math.abs(y - cy) - (size / 2 - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) +
    Math.min(Math.max(dx, dy), 0) - radius;
  if (outside > 0) return [0, 0, 0, 0];

  let color = BG;

  // 纸页：40..76 宽，22..80 高，圆角
  const px0 = 26 * u;
  const py0 = 20 * u;
  const px1 = 74 * u;
  const py1 = 80 * u;
  const pr = 6 * u;
  const insidePage =
    x >= px0 && x <= px1 && y >= py0 && y <= py1 &&
    !(
      (x < px0 + pr && y < py0 + pr && Math.hypot(x - px0 - pr, y - py0 - pr) > pr) ||
      (x > px1 - pr && y < py0 + pr && Math.hypot(x - px1 + pr, y - py0 - pr) > pr) ||
      (x < px0 + pr && y > py1 - pr && Math.hypot(x - px0 - pr, y - py1 + pr) > pr) ||
      (x > px1 - pr && y > py1 - pr && Math.hypot(x - px1 + pr, y - py1 + pr) > pr)
    );
  if (insidePage) color = mix(BG, INK, 0.06);

  // 文字线：三条
  const lines = [
    [34, 36, 58],
    [34, 47, 66],
    [34, 58, 50]
  ];
  for (const [lx0, ly, lx1] of lines) {
    const lw = 2.6 * u;
    if (
      x >= lx0 * u - lw && x <= lx1 * u + lw &&
      Math.abs(y - ly * u) <= lw
    ) {
      color = mix(color, INK, 0.75);
    }
  }

  // 拾取点：右下角
  const dotR = 7.5 * u;
  const dotX = 70 * u;
  const dotY = 70 * u;
  if (Math.hypot(x - dotX, y - dotY) <= dotR) color = ACCENT;
  if (Math.hypot(x - dotX, y - dotY) <= dotR * 0.42) color = BG;

  return [...color, 255];
}

const dir = new URL('../public/icons/', import.meta.url);
for (const size of [192, 512]) {
  writeFileSync(new URL(`icon-${size}.png`, dir), png(size, draw));
}
writeFileSync(new URL('apple-touch-icon.png', dir), png(180, draw));
console.log('icons written');
