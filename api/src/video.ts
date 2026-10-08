import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import { HttpError } from './http';

export const MAX_VIDEO_BYTES = 10_000_000;
export const MAX_VIDEO_SECONDS = 30;
const run = promisify(execFile);
let busy = false;

/** Decode untrusted MP4 locally, with no network/external track access, then strip metadata. */
export async function validateVideo(bytes: Buffer): Promise<Buffer> {
  if (!ffmpeg) throw new HttpError(503, 'Video processing is unavailable. Try again later.');
  if (bytes.length > MAX_VIDEO_BYTES) throw new HttpError(400, 'Use an MP4 up to 10 MB.');
  if (bytes.toString('ascii', 4, 8) !== 'ftyp') throw new HttpError(400, 'Use a valid MP4 video.');
  if (busy) throw new HttpError(429, 'A video is being processed. Your draft is kept; try again shortly.');
  busy = true;
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), 'htafl-video-'));
    const input = join(dir, 'input.mp4'); const output = join(dir, 'output.mp4');
    await writeFile(input, bytes);
    const source = ['-hide_banner', '-nostdin', '-protocol_whitelist', 'file,pipe', '-threads', '1',
      '-f', 'mov', '-enable_drefs', '0', '-use_absolute_path', '0', '-i', input];
    // Probe only. The complete transcode below is authoritative for damaged frame data.
    const probe = await run(ffmpeg, [...source, '-map', '0:v:0', '-t', '0', '-f', 'null', '-'], { timeout: 10_000, maxBuffer: 256_000 });
    const duration = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(probe.stderr);
    if (!duration) throw new HttpError(400, 'Use a valid MP4 video with a known duration.');
    const seconds = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
    if (seconds > MAX_VIDEO_SECONDS || seconds <= 0) throw new HttpError(400, 'Use an MP4 no longer than 30 seconds.');
    const dimensions = /Video:.*?[, ](\d{2,5})x(\d{2,5})(?:[ ,]|$)/.exec(probe.stderr);
    if (!dimensions || Number(dimensions[1]) * Number(dimensions[2]) > 8_300_000) {
      throw new HttpError(400, 'Use a valid MP4 up to 4K resolution.');
    }
    const converted = await run(ffmpeg, ['-xerror', '-err_detect', 'explode', ...source,
      '-map', '0:v:0', '-map', '0:a:0?', '-t', '31', '-map_metadata', '-1', '-map_chapters', '-1',
      '-vf', "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-threads', '1',
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-fs', String(MAX_VIDEO_BYTES + 1),
      '-progress', 'pipe:1', '-loglevel', 'error', output], { timeout: 45_000, maxBuffer: 256_000 });
    const times = [...converted.stdout.matchAll(/out_time_us=(\d+)/g)].map((m) => Number(m[1]));
    if (!times.length || Math.max(...times) > 30_100_000) throw new HttpError(400, 'Use an MP4 no longer than 30 seconds.');
    const result = await readFile(output);
    if (result.length > MAX_VIDEO_BYTES) throw new HttpError(400, 'The processed video exceeds 10 MB. Use a smaller clip.');
    return result;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, 'That video could not be read. Use a valid MP4 up to 10 MB and 30 seconds.');
  } finally { busy = false; if (dir) await rm(dir, { recursive: true, force: true }); }
}
