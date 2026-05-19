import { createClient } from '@sanity/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function stripWrappingQuotes(value) {
  if (value.length < 2) {
    return value;
  }

  const startsWithDouble = value.startsWith('"') && value.endsWith('"');
  const startsWithSingle = value.startsWith("'") && value.endsWith("'");

  if (startsWithDouble || startsWithSingle) {
    return value.slice(1, -1);
  }

  return value;
}

function loadDotEnvFile() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const contents = readFileSync(envPath, 'utf8');
  const lines = contents.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const value = stripWrappingQuotes(line.slice(equalsIndex + 1).trim());
    process.env[key] = value;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is not set`);
  }
  return value;
}

async function run() {
  loadDotEnvFile();

  const client = createClient({
    projectId: requireEnv('SANITY_PROJECT_ID'),
    dataset: process.env.SANITY_DATASET || 'production',
    token: requireEnv('SANITY_API_TOKEN'),
    apiVersion: '2024-01-01',
    useCdn: false,
  });

  const mapPath = resolve(process.cwd(), 'scripts/data/sanity-workshop-youtube-map.date-matched.json');
  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  const mappings = (Array.isArray(map?.mappings) ? map.mappings : []).filter(
    (entry) => entry?.sanityId && entry?.youtubeUrl,
  );

  const docIds = mappings.map((entry) => entry.sanityId);
  const existingDocs = await client.fetch('*[_id in $ids]{_id, youtubeUrl}', { ids: docIds });
  const byId = new Map(existingDocs.map((doc) => [doc._id, doc]));

  let updated = 0;
  let unchanged = 0;
  let missing = 0;

  for (const entry of mappings) {
    const existing = byId.get(entry.sanityId);
    if (!existing) {
      missing += 1;
      console.log(`[MISSING] ${entry.sanityId} <- ${entry.title}`);
      continue;
    }

    if (existing.youtubeUrl === entry.youtubeUrl) {
      unchanged += 1;
      continue;
    }

    await client.patch(entry.sanityId).set({ youtubeUrl: entry.youtubeUrl }).commit();
    updated += 1;
    console.log(`[UPDATED] ${entry.sanityId} <- ${entry.youtubeUrl}`);
  }

  console.log(`Done. Updated: ${updated}, Unchanged: ${unchanged}, Missing: ${missing}, Considered: ${mappings.length}`);
}

run().catch((error) => {
  console.error('Failed to apply YouTube map to Sanity:', error);
  process.exitCode = 1;
});
