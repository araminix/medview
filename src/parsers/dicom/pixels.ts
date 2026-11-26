import { PIXEL_DATA, transferSyntaxName } from './dictionary';
import type { DicomValues } from './reader';

export interface ImageWindow {
  center: number;
  width: number;
}

/** A change to the brightness window the file asks for. Both run from -100 to 100; 0 changes nothing. */
export interface Adjustment {
  brightness: number;
  contrast: number;
}

export interface RenderOptions {
  /** An exact window, replacing the file's own. */
  window?: ImageWindow;
  adjustment?: Adjustment;
  /** Longer pictures are thinned to this many pixels on their longer side. */
  maxSize?: number;
}

/** One picture ready to draw: RGBA for what MedView decodes, or the JPEG as stored for the browser to decode. */
export interface FrameImage {
  width: number;
  height: number;
  rgba?: Uint8ClampedArray;
  jpeg?: Uint8Array;
  /** The brightness window used, for greyscale pictures; the starting point for the viewer's controls. */
  window?: ImageWindow;
}

const RLE = '1.2.840.10008.1.2.5';
const JPEG_BASELINE = '1.2.840.10008.1.2.4.50';
const NATIVE = new Set(['1.2.840.10008.1.2', '1.2.840.10008.1.2.1', '1.2.840.10008.1.2.1.99', '1.2.840.10008.1.2.2']);

interface Layout {
  rows: number;
  columns: number;
  samples: number;
  bytes: number;
  frames: number;
}

function layoutOf(values: DicomValues): Layout {
  return {
    rows: values.number('Rows') ?? 0,
    columns: values.number('Columns') ?? 0,
    samples: values.number('SamplesPerPixel') ?? 1,
    bytes: Math.ceil((values.number('BitsAllocated') ?? 8) / 8),
    frames: Math.max(1, values.number('NumberOfFrames') ?? 1),
  };
}

/** Why the picture of this file cannot be drawn, or undefined when it can. The words are shown to the reader. */
export function unavailableReason(values: DicomValues): string | undefined {
  const { file } = values;
  const { rows, columns, samples, bytes } = layoutOf(values);
  const hasPixels = file.fragments !== undefined || file.elements.some((element) => element.tag === PIXEL_DATA && element.depth === 0);
  if (!hasPixels || !rows || !columns) return 'This file holds no picture, only information about the study.';
  const syntax = file.transferSyntax;
  if (!NATIVE.has(syntax) && syntax !== RLE && syntax !== JPEG_BASELINE) {
    return `The picture is stored as ${transferSyntaxName(syntax)}, which MedView cannot decode yet.`;
  }
  const photometric = values.text('PhotometricInterpretation') ?? 'MONOCHROME2';
  if (syntax !== JPEG_BASELINE && !/^(MONOCHROME[12]|RGB|YBR_FULL)$/.test(photometric)) return `The picture uses the ${photometric} colour model, which MedView cannot draw yet.`;
  if (syntax !== JPEG_BASELINE && (bytes > 2 || (values.number('BitsAllocated') ?? 8) < 8 || (samples !== 1 && samples !== 3))) return 'The picture uses a pixel format MedView cannot draw yet.';
  if (file.truncated) return 'The file is cut off before the end of the picture.';
  return undefined;
}

export function frameCount(values: DicomValues): number {
  return layoutOf(values).frames;
}

/** PackBits, as DICOM RLE uses it: a count byte, then either that many literal bytes or one byte to repeat. */
function unpackBits(source: Uint8Array, target: Uint8Array): void {
  let read = 0;
  let write = 0;
  while (read < source.length && write < target.length) {
    const count = source[read] > 127 ? source[read] - 256 : source[read];
    read += 1;
    if (count >= 0) {
      for (let i = 0; i <= count && write < target.length; i += 1) target[write++] = source[read++] ?? 0;
    } else if (count !== -128) {
      const value = source[read++] ?? 0;
      for (let i = 0; i <= -count && write < target.length; i += 1) target[write++] = value;
    }
  }
}

/** An RLE frame holds one compressed plane per byte of a pixel, most significant first. Returns them as native little-endian pixels, colour by plane. */
function decodeRle(fragment: Uint8Array, layout: Layout): Uint8Array {
  const header = new DataView(fragment.buffer, fragment.byteOffset, 64);
  const segments = header.getUint32(0, true);
  const pixels = layout.rows * layout.columns;
  const output = new Uint8Array(pixels * layout.samples * layout.bytes);
  const plane = new Uint8Array(pixels);
  for (let segment = 0; segment < segments && segment < layout.samples * layout.bytes; segment += 1) {
    const start = header.getUint32(4 + segment * 4, true);
    const end = segment + 1 < segments ? header.getUint32(8 + segment * 4, true) : fragment.length;
    unpackBits(fragment.subarray(start, end), plane);
    const sample = Math.floor(segment / layout.bytes);
    const byte = layout.bytes - 1 - (segment % layout.bytes);
    const base = sample * pixels * layout.bytes + byte;
    for (let i = 0; i < pixels; i += 1) output[base + i * layout.bytes] = plane[i];
  }
  return output;
}

/** The bytes of one frame as stored, and whether colour is kept plane by plane. */
function frameBytes(values: DicomValues, index: number, layout: Layout): { bytes: Uint8Array; planar: boolean; littleEndian: boolean } | undefined {
  const { file } = values;
  const size = layout.rows * layout.columns * layout.samples * layout.bytes;
  if (file.fragments) {
    const { fragments } = file;
    // One fragment per frame is the usual layout; a single frame may also be split over several.
    const spans = layout.frames === 1 ? fragments : fragments.length === layout.frames ? [fragments[index]] : undefined;
    if (!spans?.length) return undefined;
    const length = spans.reduce((sum, span) => sum + span.length, 0);
    const joined = new Uint8Array(length);
    let at = 0;
    for (const span of spans) {
      joined.set(file.data.subarray(span.offset, span.offset + span.length), at);
      at += span.length;
    }
    if (file.transferSyntax === RLE) return { bytes: decodeRle(joined, layout), planar: true, littleEndian: true };
    return { bytes: joined, planar: false, littleEndian: true };
  }
  const pixelData = file.elements.find((element) => element.tag === PIXEL_DATA && element.depth === 0);
  if (!pixelData || pixelData.length < (index + 1) * size) return undefined;
  const start = pixelData.offset + index * size;
  return { bytes: file.data.subarray(start, start + size), planar: (values.number('PlanarConfiguration') ?? 0) === 1, littleEndian: file.littleEndian };
}

/**
 * Draws one frame. Greyscale values go through the scanner's rescale and then a brightness window
 * (the stored one, the caller's, or the full range of the frame), which an adjustment can then shift.
 */
export function renderFrame(values: DicomValues, index: number, { window, adjustment, maxSize = 1024 }: RenderOptions = {}): FrameImage | undefined {
  const layout = layoutOf(values);
  if (index < 0 || index >= layout.frames || unavailableReason(values)) return undefined;
  const frame = frameBytes(values, index, layout);
  if (!frame) return undefined;
  if (values.file.transferSyntax === JPEG_BASELINE) return { width: layout.columns, height: layout.rows, jpeg: frame.bytes.slice() };

  const { rows, columns, samples, bytes } = layout;
  const step = Math.max(1, Math.ceil(Math.max(rows, columns) / maxSize));
  const width = Math.ceil(columns / step);
  const height = Math.ceil(rows / step);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const data = frame.bytes;
  const pixels = rows * columns;

  if (samples === 3) {
    const ybr = values.text('PhotometricInterpretation') === 'YBR_FULL';
    for (let y = 0, out = 0; y < rows; y += step) {
      for (let x = 0; x < columns; x += step, out += 4) {
        const p = y * columns + x;
        let [a, b, c] = frame.planar ? [data[p], data[pixels + p], data[2 * pixels + p]] : [data[p * 3], data[p * 3 + 1], data[p * 3 + 2]];
        if (ybr) [a, b, c] = [a + 1.402 * (c - 128), a - 0.344136 * (b - 128) - 0.714136 * (c - 128), a + 1.772 * (b - 128)];
        rgba[out] = a;
        rgba[out + 1] = b;
        rgba[out + 2] = c;
        rgba[out + 3] = 255;
      }
    }
    return { width, height, rgba };
  }

  const stored = values.number('BitsStored') ?? bytes * 8;
  const signed = values.number('PixelRepresentation') === 1;
  const mask = stored >= 32 ? 0xffffffff : (1 << stored) - 1;
  const sign = 1 << (stored - 1);
  const slope = values.number('RescaleSlope') ?? 1;
  const intercept = values.number('RescaleIntercept') ?? 0;
  const [low, high] = frame.littleEndian ? [0, 1] : [1, 0];
  const grey = new Float32Array(width * height);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0, out = 0; y < rows; y += step) {
    for (let x = 0; x < columns; x += step, out += 1) {
      const p = (y * columns + x) * bytes;
      let value = (bytes === 2 ? data[p + low] | (data[p + high] << 8) : data[p]) & mask;
      if (signed && value & sign) value -= mask + 1;
      const real = value * slope + intercept;
      grey[out] = real;
      if (real < min) min = real;
      if (real > max) max = real;
    }
  }
  const storedWindow = { center: values.number('WindowCenter'), width: values.number('WindowWidth') };
  const start: ImageWindow =
    window ?? (storedWindow.center !== undefined && storedWindow.width ? { center: storedWindow.center, width: storedWindow.width } : { center: (min + max) / 2, width: Math.max(1, max - min) });
  // Brighter means a lower centre; more contrast means a narrower window.
  const used = adjustment ? { center: start.center - (adjustment.brightness / 100) * start.width, width: start.width * 2 ** (-adjustment.contrast / 50) } : start;
  const bottom = used.center - used.width / 2;
  const scale = 255 / Math.max(used.width, 1e-6);
  const inverted = values.text('PhotometricInterpretation') === 'MONOCHROME1';
  for (let i = 0, out = 0; i < grey.length; i += 1, out += 4) {
    const shade = (grey[i] - bottom) * scale;
    const level = inverted ? 255 - shade : shade;
    rgba[out] = level;
    rgba[out + 1] = level;
    rgba[out + 2] = level;
    rgba[out + 3] = 255;
  }
  return { width, height, rgba, window: used };
}
