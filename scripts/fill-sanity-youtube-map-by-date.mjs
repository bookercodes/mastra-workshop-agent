import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const INPUT_PATH = resolve(process.cwd(), 'scripts/data/sanity-workshop-youtube-map.json');
const OUTPUT_PATH = resolve(process.cwd(), 'scripts/data/sanity-workshop-youtube-map.date-matched.json');
const STREAMS_URL = 'https://www.youtube.com/@mastra-ai/streams';
const MAX_DAYS_DIFF = 10;

function parseArgs(argv) {
  const args = {
    maxDaysDiff: MAX_DAYS_DIFF,
  };

  for (const arg of argv) {
    if (arg === '--') {
      continue;
    }

    if (arg.startsWith('--max-days=')) {
      const value = Number(arg.slice('--max-days='.length));
      if (!Number.isFinite(value) || value < 0) {
        throw new Error('`--max-days` must be a non-negative number');
      }
      args.maxDaysDiff = value;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function workshopHintScore(title) {
  const normalized = (title || '').toLowerCase();
  const hints = ['workshop', 'build', 'agent', 'mastra'];
  return hints.reduce((acc, hint) => acc + (normalized.includes(hint) ? 1 : 0), 0);
}

async function fetchStreams() {
  const { stdout } = await execFileAsync('yt-dlp', [
    '--skip-download',
    '--ignore-errors',
    '--print',
    '%(id)s\t%(title)s\t%(release_timestamp)s\t%(timestamp)s',
    STREAMS_URL,
  ], {
    maxBuffer: 1024 * 1024 * 5,
  });

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      if (parts.length < 2) {
        return null;
      }

      const [id, title, releaseTimestampRaw, timestampRaw] = parts;
      const releaseTimestamp = Number(releaseTimestampRaw);
      const timestamp = Number(timestampRaw);

      return {
        id,
        title,
        release_timestamp: Number.isFinite(releaseTimestamp) && releaseTimestamp > 0 ? releaseTimestamp : null,
        timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null,
      };
    })
    .filter((entry) => entry?.id && (entry?.release_timestamp || entry?.timestamp))
    .map((entry) => ({
      videoId: entry.id,
      youtubeUrl: `https://www.youtube.com/watch?v=${entry.id}`,
      title: entry.title || '',
      ts: (entry.release_timestamp || entry.timestamp) * 1000,
      workshopHint: workshopHintScore(entry.title),
    }));
}

function daysDiff(aMs, bMs) {
  return Math.abs(aMs - bMs) / (1000 * 60 * 60 * 24);
}

function pickBestStream(eventMs, candidates) {
  return candidates
    .slice()
    .sort((a, b) => {
      const aDiff = daysDiff(eventMs, a.ts);
      const bDiff = daysDiff(eventMs, b.ts);
      if (aDiff !== bDiff) {
        return aDiff - bDiff;
      }
      if (a.workshopHint !== b.workshopHint) {
        return b.workshopHint - a.workshopHint;
      }
      return b.ts - a.ts;
    })[0];
}

async function run() {
  const { maxDaysDiff } = parseArgs(process.argv.slice(2));
  const input = JSON.parse(readFileSync(INPUT_PATH, 'utf8'));
  const mappings = Array.isArray(input?.mappings) ? input.mappings : [];
  const streams = await fetchStreams();

  const usedVideoUrls = new Set(
    mappings
      .map((m) => m.youtubeUrl)
      .filter(Boolean)
      .map((url) => String(url).trim()),
  );

  let autoFilled = 0;
  let stillEmpty = 0;

  const nextMappings = mappings.map((mapping) => {
    if (mapping.youtubeUrl || !mapping.eventDate) {
      return mapping;
    }

    const eventMs = new Date(mapping.eventDate).getTime();
    if (!Number.isFinite(eventMs)) {
      stillEmpty += 1;
      return mapping;
    }

    const candidates = streams.filter((stream) => !usedVideoUrls.has(stream.youtubeUrl));
    const best = pickBestStream(eventMs, candidates);

    if (!best) {
      stillEmpty += 1;
      return mapping;
    }

    const diff = daysDiff(eventMs, best.ts);
    if (diff > maxDaysDiff) {
      stillEmpty += 1;
      return mapping;
    }

    usedVideoUrls.add(best.youtubeUrl);
    autoFilled += 1;

    return {
      ...mapping,
      youtubeUrl: best.youtubeUrl,
      youtubeTitleGuess: best.title,
      dateMatchDaysDiff: Number(diff.toFixed(2)),
      dateMatchedAt: new Date().toISOString(),
    };
  });

  const output = {
    ...input,
    generatedAt: new Date().toISOString(),
    dateMatching: {
      strategy: 'closest stream by date, one-to-one',
      maxDaysDiff,
      autoFilled,
      stillEmpty,
    },
    mappings: nextMappings,
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote date-matched map to ${OUTPUT_PATH}`);
  console.log(`Auto-filled: ${autoFilled}, Still empty: ${stillEmpty}`);
}

run().catch((error) => {
  console.error('Failed to fill map by date:', error);
  process.exitCode = 1;
});
