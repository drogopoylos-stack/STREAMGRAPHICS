// Local PhotoCraft engine, driven through its native stdio MCP server.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import sharp from 'sharp';
import { DATA } from './util.js';

export function executable() {
  let configured;
  try { configured = JSON.parse(fs.readFileSync(path.join(DATA, 'photocraft.json'), 'utf8')).command; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const command = process.env.HLL_PHOTOCRAFT || configured;
  if (!command || !fs.existsSync(command)) throw new Error('PhotoCraft is not installed. Set HLL_PHOTOCRAFT to photocraft-cli.exe, or select the standard photo engine in Settings.');
  return command;
}

export class PhotoCraftMcp {
  constructor(command, root, timeout = 120_000) {
    this.pending = new Map();
    this.sequence = 0;
    this.timeout = timeout;
    this.stderr = '';
    this.child = spawn(command, ['mcp', '--automation-read-root', root, '--automation-write-root', root], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk).slice(-4000); });
    this.child.stdin.on('error', error => this.fail(error));
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', code => this.fail(new Error(`PhotoCraft exited (${code}): ${this.stderr}`)));
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      try {
        const reply = JSON.parse(line);
        const pending = this.pending.get(reply.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(reply.id);
        if (reply.error) pending.reject(new Error(reply.error.message));
        else pending.resolve(reply.result);
      } catch (error) { this.fail(error); }
    });
  }

  fail(error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }

  request(method, params) {
    if (this.child.exitCode !== null || this.child.killed) return Promise.reject(new Error(`PhotoCraft is not running: ${this.stderr}`));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`PhotoCraft timed out: ${method}`));
        this.close();
      }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async initialize() {
    const result = await this.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'hll-player-photos', version: '1.0' } });
    this.child.stdin.write(JSON.stringify({jsonrpc:'2.0', method:'notifications/initialized'}) + '\n');
    return result;
  }

  async tool(name, args = {}) {
    const result = await this.request('tools/call', { name, arguments: args });
    const message = result.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? '';
    if (result.isError) throw new Error(`PhotoCraft ${name}: ${message}`);
    let value;
    try { value = JSON.parse(message); } catch { value = message; }
    if (value?.failed || value?.results?.some(item => !item.ok)) throw new Error(`PhotoCraft command failed: ${message}`);
    return value;
  }

  close() {
    this.fail(new Error('PhotoCraft session closed'));
    this.lines.close();
    this.child.stdin.end();
    this.child.kill();
  }
}

/** PNG in/out, isolated temp files, one engine session per operation. Raw originals are never saved over. */
export async function editPhoto(input, { mask = null, correctColor = false, strength = 0.7 } = {}) {
  const command = executable();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hll-photocraft-'));
  let client;
  try {
    fs.writeFileSync(path.join(root, 'input.png'), input);
    client = new PhotoCraftMcp(command, root);
    await client.initialize();
    const steps = [];
    if (mask) {
      fs.writeFileSync(path.join(root, 'mask.png'), mask);
      await client.tool('doc_open', { path: 'mask.png' });
    }
    await client.tool('doc_open', { path: 'input.png' });
    if (mask) {
      steps.push(
        { id: 'select.loadSelection', params: { document: 0, channel: 'transparency' } },
        { id: 'select.refineEdge', params: { radius: 1.5, smartRadius: true, smooth: 1, feather: 0.3, contrast: 5, shiftEdge: -3, decontaminate: true, amount: 55, output: 'newLayerWithMask' } },
        { id: 'layer.layerMask.apply' },
      );
    }
    const amount = Math.min(1, Math.max(0, Number(strength) || 0));
    let alphaReference;
    if (correctColor && amount > 0) {
      // PhotoCraft's Fade composites partly transparent pixels and can increase their
      // alpha. Preserve the refined matte explicitly across all colour-only commands.
      if (steps.length) {
        await client.tool('command_batch', { steps });
        steps.length = 0;
        await client.tool('doc_export', { path: 'matte.png', format: 'png' });
        alphaReference = fs.readFileSync(path.join(root, 'matte.png'));
      } else alphaReference = input;
      // Fade limits automatic corrections; skin and team jersey colours stay recognisable.
      steps.push(
        { id: 'image.autoColor' },
        { id: 'edit.fade', params: { opacity: Math.round(35 * amount), mode: 'color' } },
        { id: 'image.autoContrast' },
        { id: 'edit.fade', params: { opacity: Math.round(45 * amount), mode: 'luminosity' } },
        { id: 'image.adjustments.shadowsHighlights', params: { shadowAmount: 12 * amount, highlightAmount: 5 * amount, color: 0, midtone: 0, blackClip: 0, whiteClip: 0 } },
        { id: 'image.adjustments.vibrance', params: { vibrance: 7 * amount, saturation: 0 } },
      );
    }
    if (steps.length) await client.tool('command_batch', { steps });
    await client.tool('doc_export', { path: 'output.png', format: 'png' });
    const output = fs.readFileSync(path.join(root, 'output.png'));
    if (!alphaReference) return output;
    const before = await sharp(alphaReference).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const after = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (before.info.width !== after.info.width || before.info.height !== after.info.height) throw new Error('PhotoCraft colour correction changed the canvas size');
    for (let i = 3; i < after.data.length; i += 4) after.data[i] = before.data[i];
    return sharp(after.data, { raw: { width: after.info.width, height: after.info.height, channels: 4 } }).png().toBuffer();
  } finally {
    client?.close();
    // Only this invocation's mkdtemp directory is ever removed.
    if (path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('hll-photocraft-')) {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
}
