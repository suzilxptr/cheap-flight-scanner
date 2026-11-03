import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSerpApiProvider } from './providers/serpapi.js';
import { demoProvider } from './providers/demo.js';
import { addDays, parseParams, search } from './search.js';
import { pickNewDeals, pruneState, recordSent, topPerDuration } from './deals.js';
import { sendDeals, sendText, dealEmbed } from './discord.js';
import { loadState, saveState } from './state.js';

const configPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'config.json');

// Rotate through destination x duration combos so a daily run stays inside the SerpApi quota.
export function pickCombos(config, dayIndex) {
  const all = config.destinations.flatMap((dest) => config.durations.map((tripDays) => ({ dest, tripDays })));
  const n = Math.min(config.combosPerRun ?? all.length, all.length);
  const first = dayIndex * n;
  return {
    combos: Array.from({ length: n }, (_, i) => all[(first + i) % all.length]),
    // Shift sampled departure dates each full rotation so the whole window gets covered over time.
    offset: Math.floor(first / all.length) % config.step,
  };
}

export async function runScan({ dryRun = false, log = console.log } = {}) {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const apiKey = process.env.SERPAPI_KEY;
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  // Never notify or persist state from fake data or when explicitly asked.
  const live = !dryRun && Boolean(apiKey) && Boolean(webhook);
  if (!apiKey) log('SERPAPI_KEY not set: using demo data, dry run.');
  else if (!webhook) log('DISCORD_WEBHOOK_URL not set: dry run.');
  const provider = apiKey ? createSerpApiProvider(apiKey) : demoProvider;

  const state = await loadState();
  const today = new Date().toISOString().slice(0, 10);
  const { combos, offset } = pickCombos(config, Math.floor(Date.now() / 864e5));
  const route = `${config.from} → ${config.destinations.map((d) => d.name).join(' / ')}`;

  const deals = [];
  let failedAll = true;
  const failures = [];

  for (const { dest, tripDays } of combos) {
    const { params, errors } = parseParams({
      from: config.from,
      to: dest.code,
      start: addDays(today, config.windowStartDays + offset),
      end: addDays(today, config.windowEndDays),
      tripDays,
      step: config.step,
      maxPrice: config.maxPrice,
      // Kathmandu results reserve time for the onward hop to Pokhara.
      maxHours: config.maxHours - dest.transferHours,
      maxStops: config.maxStops,
      maxReturnChecks: config.maxReturnChecks,
    });
    if (errors.length) throw new Error(`Bad config: ${errors.join(' ')}`);

    const out = await search(provider, params);
    log(`${dest.name} ${tripDays}d: ${out.datesScanned} dates, ${out.optionsSeen} itineraries, ${out.results.length} matches, ${out.errors.length} errors`);
    if (out.optionsSeen > 0) failedAll = false;
    failures.push(...out.errors);
    deals.push(
      ...out.results.map((r) => ({
        ...r,
        tripDays,
        from: config.from,
        to: dest.code,
        destination: dest.name,
        transferHours: dest.transferHours,
      })),
    );
  }

  if (failedAll && failures.length) {
    const msg = `Flight scan failed for ${route}: ${failures[0]}`;
    if (live) await sendText(webhook, msg);
    throw new Error(msg);
  }

  pruneState(state, today);
  const fresh = topPerDuration(pickNewDeals(deals, state, config.minDropEuro), config.maxPerDuration);
  log(`${fresh.length} new deal(s) to notify`);

  if (!live) {
    for (const d of fresh) {
      const e = dealEmbed(d);
      log(e.title);
      for (const f of e.fields) log(`  ${f.name}: ${f.value.replaceAll('\n', ' | ')}`);
    }
  } else {
    if (fresh.length) await sendDeals(webhook, fresh, `${route} · under €${config.maxPrice}, max ${config.maxHours}h each way`);
    recordSent(state, fresh);
    await saveState(state);
  }
  return { combos: combos.map((c) => `${c.dest.name} ${c.tripDays}d`), notified: fresh.length };
}
