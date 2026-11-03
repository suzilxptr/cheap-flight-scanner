# cheap-flight-scanner

Small local website that scans round-trip flights Helsinki (HEL) → Pokhara (PHH) and Kathmandu (KTM) and lists only options under a price cap and a travel-time cap (see `config.json`).

Data comes from Google Flights via [SerpApi](https://serpapi.com), which aggregates many airlines and travel sites. Pokhara (PHH) has few international itineraries, so Kathmandu is scanned too; for Kathmandu the time cap reserves `transferHours` for the hop to Pokhara.

## Run

```sh
npm install
cp .env.example .env   # add SERPAPI_KEY; leave empty for demo data
npm start              # http://localhost:3000
npm test
```

## Automatic Discord alerts

`npm run scan` checks 7, 15 and 30 day round trips (see `config.json`) and posts new cheap deals to a Discord channel. A deal is re-posted only if its price drops by at least `minDropEuro`. Add `-- --dry-run` to print instead of posting.

## Deploy to Vercel (daily)

`vercel.json` registers a cron that calls `/api/cron` daily at 07:00 UTC. In the Vercel project set env vars `SERPAPI_KEY`, `DISCORD_WEBHOOK_URL` and `CRON_SECRET` (any long random string; Vercel sends it as a bearer token and the endpoint rejects anything else). Add an Upstash Redis store from the Marketplace so `KV_REST_API_URL` / `KV_REST_API_TOKEN` exist; it remembers what was already announced.

Budget: each run scans `combosPerRun` of the 6 destination x duration combos (rotating daily), about 5 dates + up to 2 return checks = ~7 SerpApi calls, ~210/month on the free 250. With a paid SerpApi plan set `combosPerRun` to 6 to scan everything daily.

## How it works

- One SerpApi call per departure date (every N days across the window, max 20 dates per scan). The free tier is 250 searches/month, so results are cached for 6 hours.
- Round-trip price covers both legs. The cheapest candidates get an extra call to verify the return leg is also within the time limit (max 10 checks per scan); unverified ones are labelled.
- API key stays server-side.
