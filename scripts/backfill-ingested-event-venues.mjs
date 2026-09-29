#!/usr/bin/env node
// Repair only reviewed, unlinked event IDs using the same automatic venue matcher.
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { normalizeVenueStructuredData } from '../src/utils/venueNormalization.mjs';
import { loadCafe24TableRows, saveCafe24TableRow } from '../server/cafe24/generic-data-api.js';
import { getMysqlPool } from '../server/cafe24/mysql-pool.js';

dotenv.config({ path: '.env', quiet: true });
dotenv.config({ path: '.env.local', quiet: true });
const planPath = process.argv.find(arg => arg.startsWith('--plan='))?.slice(7);
if (!planPath) throw new Error('A reviewed --plan file with eventId and venueId pairs is required.');
const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
if (!Array.isArray(plan) || plan.some(p => !p.eventId || !p.venueId) || new Set(plan.map(p => p.eventId)).size !== plan.length) {
  throw new Error('Plan must contain unique event IDs and their reviewed venue IDs.');
}
const apply = process.argv.includes('--apply');
try {
  const [events, venues, candidates] = await Promise.all(['events', 'venues', 'scraped_events'].map(t => loadCafe24TableRows(t)));
  const changes = [];
  for (const item of plan) {
    const event = events.find(e => e.id === item.eventId);
    if (!event) throw new Error(`Event missing: ${item.eventId}`);
    if (!candidates.some(c => c.status === 'collected' && (c.registered_event_id || c.structured_data?.registered_event_id) === event.id)) {
      throw new Error(`Collected candidate link missing: ${event.id}`);
    }
    if (event.venue_id === item.venueId && event.location_link) continue;
    if (event.venue_id) throw new Error(`Existing venue ownership must be reviewed: ${event.id}`);
    const normalized = normalizeVenueStructuredData(event, venues, { strict: true });
    if (normalized.venue_id !== item.venueId || !normalized.location_link) throw new Error(`Venue evidence changed or map missing: ${event.id}`);
    // Preserve display names and all source text; fill only missing venue metadata.
    const after = { ...event, venue_id: normalized.venue_id,
      address: event.address || normalized.address,
      location_link: event.location_link || normalized.location_link };
    changes.push({ before: event, after });
  }
  let backupPath = null;
  if (apply && changes.length) {
    const directory = path.resolve(process.env.CAFE24_BACKUP_DIR || 'backups/data-fixes');
    await fs.mkdir(directory, { recursive: true });
    backupPath = path.join(directory, `ingested-event-venues-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await fs.writeFile(backupPath, JSON.stringify({ plan, changes }, null, 2), { mode: 0o600, flag: 'wx' });
    for (const { before, after } of changes) {
      await saveCafe24TableRow('events', after, [], { beforeEventSave: async connection => {
        const current = (await loadCafe24TableRows('events', connection)).find(e => e.id === before.id);
        if (JSON.stringify(current) !== JSON.stringify(before)) throw new Error(`Concurrent event change: ${before.id}`);
        const currentVenues = await loadCafe24TableRows('venues', connection);
        const expected = normalizeVenueStructuredData(current, currentVenues, { strict: true });
        if (expected.venue_id !== after.venue_id || expected.location_link !== after.location_link) {
          throw new Error(`Concurrent venue change: ${before.id}`);
        }
      } });
    }
  }
  console.log(JSON.stringify({ applied: apply, changes: changes.map(({ before, after }) => ({
    eventId: before.id, title: before.title, venue: before.venue_name || before.location,
    venueId: after.venue_id, locationLink: after.location_link,
  })), backupPath }, null, 2));
} finally {
  await getMysqlPool().end();
}
