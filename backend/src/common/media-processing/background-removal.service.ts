import { Injectable, type OnModuleInit } from '@nestjs/common';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as tf from '@tensorflow/tfjs-node';
import * as bodyPix from '@tensorflow-models/body-pix';
import { createAlphaMovEncoder, decodeFramesRgb24, probeVideo } from './ffmpeg.util.js';

export interface RemoveBackgroundOptions {
  maxWidth?: number;
}

/**
 * Person-segmentation background removal, entirely in Node (no Python,
 * no sidecar process to run separately). Loads the body-pix model once
 * (see onModuleInit) and reuses it for every call — same reasoning as the
 * old Flask server keeping mediapipe's model warm, just in-process now.
 *
 * ffmpeg/ffprobe (system binaries, not Python) decode/encode frames — same
 * requirement the old script had.
 */
@Injectable()
export class BackgroundRemovalService implements OnModuleInit {
  private net: bodyPix.BodyPix | null = null;
  private loading: Promise<bodyPix.BodyPix> | null = null;

  async onModuleInit(): Promise<void> {
    void this.getNet(); // warm the model in the background at startup
  }

  private getNet(): Promise<bodyPix.BodyPix> {
    if (this.net) return Promise.resolve(this.net);
    this.loading ??= bodyPix.load({
      architecture: 'MobileNetV1',
      outputStride: 16,
      multiplier: 0.75,
      quantBytes: 2,
    }).then((net) => {
      this.net = net;
      return net;
    });
    return this.loading;
  }

  /** Returns the background-removed video as a QuickTime Animation (.mov) buffer with a real alpha channel. */
  async removeBackground(video: Buffer, filename: string, options: RemoveBackgroundOptions = {}): Promise<Buffer> {
    const net = await this.getNet();
    const workDir = await mkdtemp(join(tmpdir(), 'bg-removal-'));
    const inputExt = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '.mp4';
    const inputPath = join(workDir, `input${inputExt}`);
    const outputPath = join(workDir, 'output.mov');

    try {
      await writeFile(inputPath, video);
      const probe = await probeVideo(inputPath);
      const width =
        options.maxWidth && probe.width > options.maxWidth
          ? options.maxWidth
          : probe.width;
      const height =
        width === probe.width ? probe.height : (Math.round((probe.height * width) / probe.width) >> 1) << 1;

      const encoder = createAlphaMovEncoder(inputPath, outputPath, { width, height, fps: probe.fps || 30 });

      await decodeFramesRgb24(inputPath, { width, height }, async (rgb) => {
        const tensor = tf.tensor3d(rgb, [height, width, 3], 'int32');
        let segmentation;
        try {
          segmentation = await net.segmentPerson(tensor, {
            internalResolution: 'medium',
            segmentationThreshold: 0.7,
          });
        } finally {
          tensor.dispose();
        }
        const bgra = Buffer.alloc(width * height * 4);
        for (let i = 0, p = 0; i < rgb.length; i += 3, p += 4) {
          bgra[p] = rgb[i + 2]; // B
          bgra[p + 1] = rgb[i + 1]; // G
          bgra[p + 2] = rgb[i]; // R
          bgra[p + 3] = segmentation.data[p / 4] ? 255 : 0; // A
        }
        await encoder.write(bgra);
      });

      await encoder.end();
      return await readFile(outputPath);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}
