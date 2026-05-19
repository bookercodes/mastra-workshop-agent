import { createClient } from '@sanity/client';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

function normalizeLumaUrl(value) {
  if (!value) {
    return undefined;
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^lu\.ma$/, 'luma.com');
    const path = parsed.pathname.replace(/\/$/, '');
    return `${host}${path}`;
  } catch {
    return undefined;
  }
}

function isDraftDocument(id) {
  return typeof id === 'string' && id.startsWith('drafts.');
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

  const docs = await client.fetch(
    `*[_type == "workshop" && defined(lumaUrl)]{_id, title, eventDate, lumaUrl, youtubeUrl}`,
  );

  const byLumaUrl = new Map();
  for (const doc of docs) {
    const normalized = normalizeLumaUrl(doc.lumaUrl) || `id:${doc._id}`;
    const current = byLumaUrl.get(normalized);

    if (!current) {
      byLumaUrl.set(normalized, doc);
      continue;
    }

    if (isDraftDocument(current._id) && !isDraftDocument(doc._id)) {
      byLumaUrl.set(normalized, doc);
    }
  }

  const mappings = [...byLumaUrl.values()]
    .sort((a, b) => {
      const aTime = a.eventDate ? new Date(a.eventDate).getTime() : 0;
      const bTime = b.eventDate ? new Date(b.eventDate).getTime() : 0;
      return bTime - aTime;
    })
    .map((doc) => ({
      sanityId: doc._id,
      title: doc.title || '',
      eventDate: doc.eventDate || null,
      lumaUrl: doc.lumaUrl || null,
      youtubeUrl: doc.youtubeUrl || null,
    }));

  const output = {
    generatedAt: new Date().toISOString(),
    total: mappings.length,
    mappings,
  };

  const outputPath = resolve(process.cwd(), 'scripts/data/sanity-workshop-youtube-map.json');
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${mappings.length} workshop mappings to ${outputPath}`);
}

run().catch((error) => {
  console.error('Failed to build Sanity workshop YouTube map:', error);
  process.exitCode = 1;
});
