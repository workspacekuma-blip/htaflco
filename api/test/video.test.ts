import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import ffmpeg from 'ffmpeg-static';
import { validateVideo } from '../src/video';

async function clip(seconds: number) {
  const dir = await mkdtemp(join(tmpdir(), 'htafl-video-test-'));
  try {
    const path = join(dir, 'fixture.mp4');
    await promisify(execFile)(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10', '-t', String(seconds), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path]);
    return await readFile(path);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('video validation decodes and re-encodes a real short MP4', async () => {
  const result = await validateVideo(await clip(2));
  assert.equal(result.toString('ascii', 4, 8), 'ftyp');
  assert.ok(result.length > 100);
});
test('video validation rejects forged, truncated and over-length MP4 contents', async () => {
  await assert.rejects(validateVideo(Buffer.from('not a video')), /valid MP4/);
  const valid = await clip(2);
  await assert.rejects(validateVideo(valid.subarray(0, 100)), /valid MP4/);
  await assert.rejects(validateVideo(await clip(31)), /30 seconds/);
});
