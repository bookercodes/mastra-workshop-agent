import { createClient } from '@sanity/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LUMA_API_BASE = 'https://public-api.luma.com/v1';

const EXCLUDED_EVENT_TITLES = new Set([
  'MASTRA.BUILD Virtual Hackathon',
  'Building Agents with Mastra Templates',
  'MASTRA.BUILD Templates',
  'Mastra Paris meetup',
  'Mastra  London meetup featuring Layercode',
  'TypeScript AI: The first conference for TypeScript AI developers',
  'TypeScript AI Demo Day',
  "Mastra Roadmap: What's Next",
]);

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

function getLumaHeaders() {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-luma-api-key': requireEnv('LUMA_API_KEY'),
  };
}

function getSanityClient() {
  return createClient({
    projectId: requireEnv('SANITY_PROJECT_ID'),
    dataset: process.env.SANITY_DATASET || 'production',
    token: requireEnv('SANITY_API_TOKEN'),
    apiVersion: '2024-01-01',
    useCdn: false,
  });
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    afterDate: undefined,
    limit: undefined,
  };

  for (const arg of argv) {
    if (arg === '--') {
      continue;
    }

    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (arg.startsWith('--after=')) {
      args.afterDate = arg.slice('--after='.length);
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const value = Number(arg.slice('--limit='.length));
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('`--limit` must be a positive number');
      }
      args.limit = Math.floor(value);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.afterDate) {
    const date = new Date(args.afterDate);
    if (Number.isNaN(date.getTime())) {
      throw new Error('`--after` must be a valid ISO date string');
    }
  }

  return args;
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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

function toShortDescription(markdown) {
  const cleaned = (markdown || '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_`>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return '';
  }

  return cleaned.length <= 180 ? cleaned : `${cleaned.slice(0, 177).trimEnd()}...`;
}

function getDurationMinutes(startAt, endAt) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return undefined;
  }

  return Math.round((end - start) / 60000);
}

function buildCreateSlug(event) {
  const titleSlug = slugify(event.name || 'workshop');
  const datePrefix = event.start_at ? new Date(event.start_at).toISOString().slice(0, 10) : undefined;
  const composed = [titleSlug, datePrefix].filter(Boolean).join('-');
  return composed || `workshop-${event.api_id}`;
}

function shouldSyncAsWorkshop(event) {
  const title = event.name || '';
  return !EXCLUDED_EVENT_TITLES.has(title);
}

function isDraftDocument(id) {
  return typeof id === 'string' && id.startsWith('drafts.');
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText} - ${text}`);
  }
  return response.json();
}

async function listLumaEventIds({ afterDate, limit }) {
  const ids = [];
  let cursor;
  const params = new URLSearchParams();

  if (afterDate) {
    params.set('after', afterDate);
  }

  while (!limit || ids.length < limit) {
    const url = cursor
      ? `${LUMA_API_BASE}/calendar/list-events?pagination_cursor=${encodeURIComponent(cursor)}`
      : `${LUMA_API_BASE}/calendar/list-events${params.toString() ? `?${params.toString()}` : ''}`;

    const data = await fetchJson(url, {
      method: 'GET',
      headers: getLumaHeaders(),
    });

    for (const entry of data.entries || []) {
      if (limit && ids.length >= limit) {
        break;
      }
      ids.push(entry.event.api_id);
    }

    if (!data.has_more || !data.next_cursor) {
      break;
    }

    cursor = data.next_cursor;
  }

  return ids;
}

async function getLumaEventDetails(eventId) {
  const data = await fetchJson(`${LUMA_API_BASE}/event/get?id=${encodeURIComponent(eventId)}`, {
    method: 'GET',
    headers: getLumaHeaders(),
  });

  return data.event;
}

function mapLumaEventToSanityFields(event) {
  const description = event.description_md || '';
  const duration = getDurationMinutes(event.start_at, event.end_at);

  const fields = {
    title: event.name,
    description,
    shortDescription: toShortDescription(description),
    eventDate: event.start_at,
    lumaUrl: event.url,
  };

  if (duration !== undefined) {
    fields.duration = `${duration} minutes`;
  }

  return fields;
}

function getFileNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const lastPart = parts.at(-1);
    return lastPart || undefined;
  } catch {
    return undefined;
  }
}

function computeImagePlan(existingDoc, event) {
  if (!event.cover_url) {
    return {
      shouldSet: false,
    };
  }

  const nextFilename = getFileNameFromUrl(event.cover_url);
  const currentFilename = existingDoc?.image?.asset?.originalFilename;
  const currentUrl = existingDoc?.image?.asset?.url;

  if (currentFilename && nextFilename && currentFilename === nextFilename) {
    return {
      shouldSet: false,
    };
  }

  return {
    shouldSet: true,
    currentValue: currentUrl || '(none)',
    nextValue: event.cover_url,
    filename: nextFilename || `luma-cover-${event.api_id}.png`,
  };
}

async function uploadLumaCoverImage(client, event) {
  if (!event.cover_url) {
    return undefined;
  }

  const response = await fetch(event.cover_url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to download Luma cover image: ${response.status} ${response.statusText} - ${text}`);
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  const imageBuffer = Buffer.from(await response.arrayBuffer());
  const filename = getFileNameFromUrl(event.cover_url) || `luma-cover-${event.api_id}.png`;

  const asset = await client.assets.upload('image', imageBuffer, {
    filename,
    contentType,
    source: {
      id: event.api_id,
      name: 'luma-sync',
      url: event.url,
    },
  });

  return {
    _type: 'image',
    asset: {
      _type: 'reference',
      _ref: asset._id,
    },
  };
}

function computeFieldDiff(existingDoc, nextFields) {
  const changed = [];

  for (const [field, nextValue] of Object.entries(nextFields)) {
    const currentValue = existingDoc[field];
    if (currentValue !== nextValue) {
      changed.push({
        field,
        currentValue,
        nextValue,
      });
    }
  }

  return changed;
}

function formatValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined) {
    return '(undefined)';
  }

  if (value === null) {
    return '(null)';
  }

  return JSON.stringify(value);
}

async function run() {
  loadDotEnvFile();

  const { dryRun, afterDate, limit } = parseArgs(process.argv.slice(2));
  const sanityDocType = process.env.SANITY_WORKSHOP_DOC_TYPE || 'workshop';

  const client = getSanityClient();

  console.log(`Starting Luma -> Sanity sync (${dryRun ? 'dry run' : 'write mode'})...`);

  const eventIds = await listLumaEventIds({ afterDate, limit });
  const orderedEventIds = [...eventIds].reverse();
  console.log(`Found ${eventIds.length} event(s) in Luma list.`);

  if (eventIds.length === 0) {
    console.log('No events to sync.');
    return;
  }

  const existingDocs = await client.fetch(
    `*[_type == $docType && defined(lumaUrl)]{
      _id,
      lumaUrl,
      title,
      description,
      shortDescription,
      eventDate,
      duration,
      image {
        asset-> {
          _id,
          url,
          originalFilename
        }
      }
    }`,
    { docType: sanityDocType },
  );

  const existingDocByLumaUrl = new Map();
  for (const doc of existingDocs) {
    const normalizedLumaUrl = normalizeLumaUrl(doc.lumaUrl);
    if (!normalizedLumaUrl) {
      continue;
    }

    const currentDoc = existingDocByLumaUrl.get(normalizedLumaUrl);
    if (!currentDoc) {
      existingDocByLumaUrl.set(normalizedLumaUrl, doc);
      continue;
    }

    if (isDraftDocument(currentDoc._id) && !isDraftDocument(doc._id)) {
      existingDocByLumaUrl.set(normalizedLumaUrl, doc);
    }
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  let dryRunDetailedDiffShown = false;

  for (const eventId of orderedEventIds) {
    const event = await getLumaEventDetails(eventId);

    if (!shouldSyncAsWorkshop(event)) {
      skipped += 1;
      console.log(`[SKIP] Non-workshop event <- ${event.name}`);
      continue;
    }

    const normalizedEventUrl = normalizeLumaUrl(event.url);
    const mappedFields = mapLumaEventToSanityFields(event);

    if (!normalizedEventUrl) {
      console.warn(`Skipping event with invalid URL: ${event.name} (${event.url})`);
      continue;
    }

    const existingDoc = existingDocByLumaUrl.get(normalizedEventUrl);
    const existingDocId = existingDoc?._id;
    const fieldDiff = existingDoc ? computeFieldDiff(existingDoc, mappedFields) : [];
    const imagePlan = computeImagePlan(existingDoc, event);
    const totalChanges = fieldDiff.length + (imagePlan.shouldSet ? 1 : 0);

    if (dryRun) {
      if (!existingDocId) {
        created += 1;
        console.log(`[DRY RUN] Create (new doc) <- ${event.name}`);
      } else if (totalChanges === 0) {
        console.log(`[DRY RUN] No change ${existingDocId} <- ${event.name}`);
      } else {
        updated += 1;
        console.log(`[DRY RUN] Update ${existingDocId} <- ${event.name} (${totalChanges} field changes)`);
        if (!dryRunDetailedDiffShown) {
          for (const diff of fieldDiff) {
            console.log(`  - ${diff.field}: ${formatValue(diff.currentValue)} -> ${formatValue(diff.nextValue)}`);
          }
          if (imagePlan.shouldSet) {
            console.log(`  - image: ${formatValue(imagePlan.currentValue)} -> ${formatValue(imagePlan.nextValue)}`);
          }
          dryRunDetailedDiffShown = true;
        }
      }

      continue;
    }

    if (existingDocId) {
      if (totalChanges === 0) {
        console.log(`No change ${existingDocId} <- ${event.name}`);
        continue;
      }

      const setFields = { ...mappedFields };
      if (imagePlan.shouldSet) {
        setFields.image = await uploadLumaCoverImage(client, event);
      }

      await client.patch(existingDocId).set(setFields).commit();
      console.log(`Updated ${existingDocId} <- ${event.name} (${totalChanges} field changes)`);
      updated += 1;
      continue;
    }

    const createFields = {
      ...mappedFields,
    };
    if (imagePlan.shouldSet) {
      createFields.image = await uploadLumaCoverImage(client, event);
    }

    const createdDoc = await client.create({
      _type: sanityDocType,
      ...createFields,
      slug: { _type: 'slug', current: buildCreateSlug(event) },
    });

    existingDocByLumaUrl.set(normalizedEventUrl, {
      ...createFields,
      _id: createdDoc._id,
      lumaUrl: mappedFields.lumaUrl,
      image: createFields.image,
    });
    console.log(`Created ${createdDoc._id} <- ${event.name}`);
    created += 1;
  }

  console.log(`Sync complete. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}, Total: ${eventIds.length}`);
}

run().catch((error) => {
  console.error('Luma -> Sanity sync failed:', error);
  process.exitCode = 1;
});
