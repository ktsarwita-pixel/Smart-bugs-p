/**
 * A tiny 2D canvas mock that paints into a pixel buffer, plus a PNG writer.
 *
 * jsdom has no canvas backend, so the procedural art could not be looked at
 * (or tested) outside a browser. The mock records every fillRect, which is
 * all the tile painters and the pixel-art icons need.
 */
import zlib from 'node:zlib';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(css: string): Rgba {
  if (css.startsWith('#')) {
    const hex = css.slice(1);
    const n =
      hex.length === 3
        ? parseInt(
            hex
              .split('')
              .map((c) => c + c)
              .join(''),
            16,
          )
        : parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 };
  }
  const m = /rgba?\(([^)]+)\)/.exec(css);
  if (m) {
    const parts = m[1]!.split(',').map((v) => parseFloat(v.trim()));
    return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: (parts[3] ?? 1) * 255 };
  }
  return { r: 0, g: 0, b: 0, a: 255 };
}

export class MockContext {
  readonly pixels: Uint8ClampedArray;
  fillStyle = '#000000';
  strokeStyle = '#000000';
  lineWidth = 1;
  globalAlpha = 1;
  imageSmoothingEnabled = false;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const c = parseColor(this.fillStyle);
    const a = (c.a / 255) * this.globalAlpha;
    if (a <= 0) return;
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * this.width + px) * 4;
        const dstA = this.pixels[i + 3]! / 255;
        const outA = a + dstA * (1 - a);
        if (outA <= 0) continue;
        this.pixels[i] = Math.round((c.r * a + this.pixels[i]! * dstA * (1 - a)) / outA);
        this.pixels[i + 1] = Math.round((c.g * a + this.pixels[i + 1]! * dstA * (1 - a)) / outA);
        this.pixels[i + 2] = Math.round((c.b * a + this.pixels[i + 2]! * dstA * (1 - a)) / outA);
        this.pixels[i + 3] = Math.round(outA * 255);
      }
    }
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * this.width + px) * 4;
        this.pixels[i] = 0;
        this.pixels[i + 1] = 0;
        this.pixels[i + 2] = 0;
        this.pixels[i + 3] = 0;
      }
    }
  }

  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arc(): void {}
  fill(): void {}
  stroke(): void {}
  save(): void {}
  restore(): void {}
  translate(): void {}
  rotate(): void {}
  scale(): void {}
  transform(): void {}
  setTransform(): void {}
  drawImage(): void {}
  putImageData(): void {}
  clip(): void {}
  rect(): void {}
  fillText(): void {}
  strokeText(): void {}
  setLineDash(): void {}
  createImageData(w: number, h: number) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }
  getImageData(_x: number, _y: number, w: number, h: number) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }
  measureText() {
    return { width: 10 };
  }
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width * 4; x++) {
      raw[y * (width * 4 + 1) + 1 + x] = rgba[y * width * 4 + x]!;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Nearest neighbour upscale. */
export function scale(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  factor: number,
  bg: [number, number, number] = [24, 22, 20],
): { pixels: Uint8ClampedArray; width: number; height: number } {
  const out = new Uint8ClampedArray(w * factor * h * factor * 4);
  for (let y = 0; y < h * factor; y++) {
    for (let x = 0; x < w * factor; x++) {
      const sx = Math.floor(x / factor);
      const sy = Math.floor(y / factor);
      const si = (sy * w + sx) * 4;
      const a = src[si + 3]! / 255;
      const di = (y * w * factor + x) * 4;
      out[di] = Math.round(src[si]! * a + bg[0] * (1 - a));
      out[di + 1] = Math.round(src[si + 1]! * a + bg[1] * (1 - a));
      out[di + 2] = Math.round(src[si + 2]! * a + bg[2] * (1 - a));
      out[di + 3] = 255;
    }
  }
  return { pixels: out, width: w * factor, height: h * factor };
}

/** Installs the mock canvas into a jsdom window. */
export function installMockCanvas(window: unknown): WeakMap<object, MockContext> {
  const contexts = new WeakMap<object, MockContext>();
  const proto = (window as { HTMLCanvasElement: { prototype: Record<string, unknown> } })
    .HTMLCanvasElement.prototype;
  proto.getContext = function (this: { width: number; height: number }) {
    let ctx = contexts.get(this as object);
    if (!ctx) {
      ctx = new MockContext(this.width || 1, this.height || 1);
      contexts.set(this as object, ctx);
    }
    return ctx;
  };
  proto.toDataURL = function (this: object) {
    const ctx = contexts.get(this);
    if (!ctx) return 'data:image/png;base64,';
    const png = encodePng(ctx.width, ctx.height, ctx.pixels);
    return `data:image/png;base64,${png.toString('base64')}`;
  };
  return contexts;
}

/** Boots a jsdom window with the mock canvas and the usual globals. */
export async function bootDom(url = 'http://localhost/'): Promise<{
  window: Record<string, unknown>;
  contexts: WeakMap<object, MockContext>;
}> {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url,
  });
  const window = dom.window as unknown as Record<string, unknown>;
  const contexts = installMockCanvas(window);

  const g = globalThis as unknown as Record<string, unknown>;
  g.window = window;
  g.document = window.document;
  Object.defineProperty(globalThis, 'navigator', {
    value: (window as unknown as { navigator: unknown }).navigator,
    configurable: true,
    writable: true,
  });
  for (const k of [
    'HTMLCanvasElement',
    'Image',
    'ImageData',
    'HTMLElement',
    'HTMLDivElement',
    'SVGElement',
    'HTMLInputElement',
    'Event',
    'CustomEvent',
    'Blob',
    'URL',
    'Node',
    'Element',
  ]) {
    g[k] = (window as unknown as Record<string, unknown>)[k];
  }
  g.localStorage = (window as unknown as { localStorage: unknown }).localStorage;
  g.devicePixelRatio = 1;

  return { window, contexts };
}
