import { timingSafeEqual } from 'node:crypto';
import { runScan } from '../src/scanner.js';

function authorized(header) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
export default async function handler(req, res) {
  if (!authorized(req.headers.authorization)) return res.status(401).json({ error: 'unauthorized' });
  try {
    res.status(200).json(await runScan());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
