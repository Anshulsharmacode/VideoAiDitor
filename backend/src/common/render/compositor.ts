import { createCanvas, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import type { RenderedLayer } from '../template-render.js';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VideoFrame {
  buffer: Buffer; // RGB24
  width: number;
  height: number;
}

export type VideoFrameProvider = (source: string, sourceMs: number) => VideoFrame | null;

function roundedRectPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function rgb24ToCanvas(frame: VideoFrame): Canvas {
  const offscreen = createCanvas(frame.width, frame.height);
  const offCtx = offscreen.getContext('2d');
  const imageData = offCtx.createImageData(frame.width, frame.height);
  for (let i = 0, p = 0; i < frame.buffer.length; i += 3, p += 4) {
    imageData.data[p] = frame.buffer[i];
    imageData.data[p + 1] = frame.buffer[i + 1];
    imageData.data[p + 2] = frame.buffer[i + 2];
    imageData.data[p + 3] = 255;
  }
  offCtx.putImageData(imageData, 0, 0);
  return offscreen;
}

function drawFitImage(ctx: SKRSContext2D, image: Canvas, box: Box, fit: 'cover' | 'contain' | 'fill'): void {
  const sw = image.width;
  const sh = image.height;
  if (fit === 'fill') {
    ctx.drawImage(image, 0, 0, sw, sh, box.x, box.y, box.width, box.height);
    return;
  }
  if (fit === 'contain') {
    const scale = Math.min(box.width / sw, box.height / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(image, 0, 0, sw, sh, box.x + (box.width - dw) / 2, box.y + (box.height - dh) / 2, dw, dh);
    return;
  }
  // cover: crop the source to the box's aspect ratio, then stretch to fill it
  const boxAspect = box.width / box.height;
  const srcAspect = sw / sh;
  let sx = 0, sy = 0, sWidth = sw, sHeight = sh;
  if (srcAspect > boxAspect) {
    sWidth = sh * boxAspect;
    sx = (sw - sWidth) / 2;
  } else {
    sHeight = sw / boxAspect;
    sy = (sh - sHeight) / 2;
  }
  ctx.drawImage(image, sx, sy, sWidth, sHeight, box.x, box.y, box.width, box.height);
}

/** Draws one output frame: resolved template layers (already time-sliced by the caller via
 * TemplateRenderer.layersVisibleAt) plus the real decoded video pixels for video-slot layers. */
export function drawFrame(
  canvasPx: { width: number; height: number },
  backgroundColor: string,
  layers: RenderedLayer[],
  tMs: number,
  getVideoFrame: VideoFrameProvider,
): Buffer {
  const canvas = createCanvas(canvasPx.width, canvasPx.height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvasPx.width, canvasPx.height);

  for (const layer of [...layers].sort((a, b) => a.zIndex - b.zIndex)) {
    const box: Box = {
      x: layer.x * canvasPx.width,
      y: layer.y * canvasPx.height,
      width: layer.width * canvasPx.width,
      height: layer.height * canvasPx.height,
    };

    switch (layer.type) {
      case 'video-slot': {
        if (!layer.source || !layer.trim) break;
        const sourceMs = layer.trim.startMs + (tMs - layer.startMs);
        const frame = getVideoFrame(layer.source, Math.min(sourceMs, layer.trim.endMs));
        if (frame) drawFitImage(ctx, rgb24ToCanvas(frame), box, layer.fit);
        break;
      }
      case 'image': {
        roundedRectPath(ctx, box.x, box.y, box.width, box.height, 24);
        ctx.fillStyle = '#c4b5fd';
        ctx.fill();
        break;
      }
      case 'text': {
        ctx.fillStyle = layer.style.color;
        ctx.font = `${layer.style.fontSize}px ${layer.style.fontFamily}, sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(layer.text, box.x, box.y);
        break;
      }
      case 'content-slot': {
        roundedRectPath(ctx, box.x, box.y, box.width, box.height, 16);
        ctx.fillStyle = '#ede9fe';
        ctx.fill();
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (layer.title) {
          ctx.fillStyle = '#8b5cf6';
          ctx.font = '28px sans-serif';
          ctx.textBaseline = 'top';
          ctx.fillText(layer.title, box.x + 12, box.y + 12);
        }
        break;
      }
      case 'caption-slot': {
        roundedRectPath(ctx, box.x, box.y, box.width, box.height, box.height / 2);
        ctx.fillStyle = '#111111';
        ctx.fill();

        const words = layer.words ?? [];
        const active = new Set(words.filter((w) => w.startMs <= tMs && tMs <= w.endMs).map((w) => w.text));
        const spoken = words.filter((w) => w.endMs <= tMs).slice(-8);

        ctx.font = `${layer.style.fontSize}px ${layer.style.fontFamily}, sans-serif`;
        ctx.textBaseline = 'middle';
        let cursorX = box.x + 16;
        const centerY = box.y + box.height / 2;
        for (const word of [...spoken, ...words.filter((w) => active.has(w.text))]) {
          const isActive = active.has(word.text);
          ctx.fillStyle = isActive ? layer.style.highlightColor : layer.style.color;
          const text = `${word.text} `;
          ctx.fillText(text, cursorX, centerY);
          cursorX += ctx.measureText(text).width;
          if (cursorX > box.x + box.width - 16) break;
        }
        break;
      }
    }
  }

  return Buffer.from(ctx.getImageData(0, 0, canvasPx.width, canvasPx.height).data);
}
