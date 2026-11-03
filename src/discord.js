const ALLOWED = /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\//;

const fmtDur = (min) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;

const fmtDay = (iso, withYear = true) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear && { year: 'numeric' }),
    timeZone: 'UTC',
  });

// Provider timestamps look like "2027-01-14 15:45" in the airport's local time.
function fmtStamp(stamp, fallbackDate) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(stamp ?? '');
  return m ? `${fmtDay(m[1], false)}, ${m[2]}` : fmtDay(fallbackDate, false);
}

function legField(name, date, leg) {
  if (!leg) return { name, value: `**${fmtDay(date)}**\nDetails not verified` };
  const first = leg.route[0];
  const last = leg.route.at(-1);
  const lines = [`**Departs** ${fmtStamp(leg.departTime, date)} (${first})`];
  for (const l of leg.layovers ?? []) {
    lines.push(`**Layover** ${l.airport} \u00b7 ${l.minutes ? fmtDur(l.minutes) : '?'}${l.overnight ? ' (overnight)' : ''}`);
  }
  if (!(leg.layovers ?? []).length && leg.route.length > 2) lines.push(`**Via** ${leg.route.slice(1, -1).join(', ')}`);
  if (leg.arriveTime) lines.push(`**Arrives** ${fmtStamp(leg.arriveTime, date)} (${last})`);
  lines.push(`**Total** ${fmtDur(leg.durationMin)} \u00b7 ${leg.airlines.join(', ')}`);
  return { name: `${name}: ${first} \u2192 ${last}`, value: lines.join('\n') };
}

const COLORS = { PHH: 0x2ecc71, KTM: 0x3498db };

export function dealEmbed(d) {
  const url = /^https:\/\//.test(d.url ?? '') ? d.url : undefined;
  const footer = ['Times are local to each airport.'];
  if (d.transferHours) footer.push('Price is to Kathmandu; the hop to Pokhara (domestic flight or bus) is extra.');
  return {
    title: `\u20ac${Math.round(d.price)} \u00b7 ${d.destination ?? d.to} \u00b7 ${d.tripDays}-day trip`,
    url,
    description: [`${fmtDay(d.departDate, false)} \u2192 ${fmtDay(d.returnDate)}`, url && `[View on Google Flights](${url})`]
      .filter(Boolean)
      .join('\n'),
    fields: [legField('Outbound', d.departDate, d), legField('Return', d.returnDate, d.returnLeg)],
    footer: { text: footer.join(' ') },
    color: COLORS[d.to] ?? 0x95a5a6,
  };
}

async function post(webhookUrl, body) {
  if (!ALLOWED.test(webhookUrl)) throw new Error('DISCORD_WEBHOOK_URL must be a Discord webhook URL.');
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'Flight Scanner', ...body }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Discord webhook failed: HTTP ${res.status}`);
}

// Discord allows at most 10 embeds per message.
export async function sendDeals(webhookUrl, deals, summary) {
  for (let i = 0; i < deals.length; i += 10) {
    const chunk = deals.slice(i, i + 10);
    await post(webhookUrl, {
      content: i === 0 ? `**${deals.length} cheap flight${deals.length > 1 ? 's' : ''} found**\n${summary}` : undefined,
      embeds: chunk.map(dealEmbed),
    });
  }
}

export const sendText = (webhookUrl, content) => post(webhookUrl, { content });
