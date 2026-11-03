import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'data', 'state.json');
const KEY = 'flight-scanner:state';

// Upstash Redis REST (Vercel Marketplace sets the KV_* names).
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const remote = Boolean(url && token);

async function redis(cmd, body) {
  const res = await fetch(`${url}/${cmd}/${encodeURIComponent(KEY)}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token}` },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`State store failed: HTTP ${res.status}`);
  return (await res.json()).result;
}

export async function loadState() {
  if (remote) {
    const raw = await redis('get');
    return raw ? JSON.parse(raw) : {};
  }
  // Vercel's filesystem is ephemeral, so without a store every run would re-announce everything.
  if (process.env.VERCEL) throw new Error('No state store configured (KV_REST_API_URL / KV_REST_API_TOKEN).');
  return JSON.parse(await fs.readFile(file, 'utf8').catch(() => '{}'));
}

export async function saveState(state) {
  const json = JSON.stringify(state, null, 2);
  if (remote) return void (await redis('set', json));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, json + '\n');
}
