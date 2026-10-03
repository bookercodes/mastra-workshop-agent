import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { listLumaEvents } from '../../../lib/luma/client';

const TIMEZONE = 'Europe/London';
const DEFAULT_HOUR = 17;
const WORKSHOP_WEEKDAYS = new Set([2, 4]);
const WEEKDAY_NUMBERS = { Tuesday: 2, Thursday: 4 } as const;

type WorkshopWeekday = keyof typeof WEEKDAY_NUMBERS;

interface SkippedDate {
  localDate: string;
  events: { eventId: string; title: string; startAt: string }[];
}

interface EventSlot {
  localDate: string;
  startAt: string;
  endAt: string;
  timezone: typeof TIMEZONE;
  skippedDates: SkippedDate[];
}

function getDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function getLocalDate(date: Date): string {
  const { year, month, day } = getDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getTimeZoneOffset(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const zonedTime = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return zonedTime - date.getTime();
}

function toUtcDate(year: number, month: number, day: number, hour: number): Date {
  const intendedTime = Date.UTC(year, month - 1, day, hour);
  let utcTime = intendedTime;

  // Recalculate once after applying the initial offset so DST boundaries resolve correctly.
  for (let iteration = 0; iteration < 2; iteration += 1) {
    utcTime = intendedTime - getTimeZoneOffset(new Date(utcTime));
  }

  return new Date(utcTime);
}

export async function findNextEventSlot(
  duration: number,
  now = new Date(),
  weekday?: WorkshopWeekday,
): Promise<EventSlot> {
  const events = await listLumaEvents();
  const today = getDateParts(now);
  const calendarDate = new Date(Date.UTC(today.year, today.month - 1, today.day, 12));
  const skippedDates: SkippedDate[] = [];

  for (let dayOffset = 1; dayOffset <= 104 * 7; dayOffset += 1) {
    const candidate = new Date(calendarDate);
    candidate.setUTCDate(candidate.getUTCDate() + dayOffset);
    const candidateWeekday = candidate.getUTCDay();
    if (weekday ? candidateWeekday !== WEEKDAY_NUMBERS[weekday] : !WORKSHOP_WEEKDAYS.has(candidateWeekday)) {
      continue;
    }

    const localDate = candidate.toISOString().slice(0, 10);
    const conflicts = events.filter(event => getLocalDate(new Date(event.start_at)) === localDate);

    if (conflicts.length > 0) {
      skippedDates.push({
        localDate,
        events: conflicts.map(event => ({
          eventId: event.api_id,
          title: event.name,
          startAt: event.start_at,
        })),
      });
      continue;
    }

    const startAt = toUtcDate(
      candidate.getUTCFullYear(),
      candidate.getUTCMonth() + 1,
      candidate.getUTCDate(),
      DEFAULT_HOUR,
    );
    const endAt = new Date(startAt.getTime() + (duration * 60_000));

    return {
      localDate,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      timezone: TIMEZONE,
      skippedDates,
    };
  }

  throw new Error(`No free ${weekday || 'Tuesday or Thursday'} workshop date found in the next 104 weeks.`);
}

const findNextEventSlotTool = createTool({
  id: 'find-next-event-slot',
  description: 'Deterministically find the next free workshop date at 17:00 Europe/London. Optionally restrict the search to Tuesday or Thursday; otherwise returns the earliest available day and skips occupied dates automatically.',
  inputSchema: z.object({
    duration: z.number().int().positive().default(60).describe('Event duration in minutes (default: 60)'),
    weekday: z.enum(['Tuesday', 'Thursday']).optional().describe('Restrict the result to this weekday when the user specifies one'),
  }),
  outputSchema: z.object({
    localDate: z.string().describe('Selected date in Europe/London as YYYY-MM-DD'),
    startAt: z.string().describe('Selected start time as an ISO 8601 UTC timestamp'),
    endAt: z.string().describe('Selected end time as an ISO 8601 UTC timestamp'),
    timezone: z.literal(TIMEZONE),
    skippedDates: z.array(z.object({
      localDate: z.string(),
      events: z.array(z.object({
        eventId: z.string(),
        title: z.string(),
        startAt: z.string(),
      })),
    })).describe('Candidate dates skipped because Luma already has an event on that London calendar date'),
  }),
  execute: async ({ duration, weekday }) => {
    return findNextEventSlot(duration, new Date(), weekday);
  },
});

export default findNextEventSlotTool;
