import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSerpApiProvider } from './providers/serpapi.js';
import { demoProvider } from './providers/demo.js';
import { parseParams, search } from './search.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

const provider = process.env.SERPAPI_KEY ? createSerpApiProvider(process.env.SERPAPI_KEY) : demoProvider;

const app = express();
app.disable('x-powered-by');

app.get('/api/search', async (req, res) => {
  const { params, errors } = parseParams(req.query);
  if (errors.length) return res.status(400).json({ errors });

  const key = JSON.stringify(params);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return res.json({ ...hit.data, cached: true });

  try {
    const data = await search(provider, params);
    if (!data.errors.length) cache.set(key, { at: Date.now(), data });
    res.json({ ...data, cached: false });
  } catch (e) {
    console.error(e);
    res.status(502).json({ errors: ['Search failed.'] });
  }
});

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
app.use(express.static(publicDir));

const port = Number(process.env.PORT) || 3000;
app.listen(port, '127.0.0.1', () => {
  console.log(`http://localhost:${port}  [provider: ${provider.name}]`);
});
