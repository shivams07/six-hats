import { HAT_IDS, LIMITS, type FlowStep, type HatId } from '../../shared/src/hats.js';
import type { WritingMode } from '../../shared/src/protocol.js';

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

// C0 controls and DEL, except tab and newline.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(raw: unknown, label: string, max: number, allowEmpty = false): Check<string> {
  if (raw === undefined || raw === null) {
    return allowEmpty ? { ok: true, value: '' } : { ok: false, error: `${label} is required` };
  }
  if (typeof raw !== 'string') return { ok: false, error: `${label} must be text` };
  const value = raw.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').trim();
  if (!allowEmpty && value.length === 0) return { ok: false, error: `${label} can't be empty` };
  if (value.length > max) return { ok: false, error: `${label} must be at most ${max} characters` };
  return { ok: true, value };
}

export function validateSteps(raw: unknown, min: number = LIMITS.minSteps, max: number = LIMITS.maxSteps): Check<FlowStep[]> {
  if (!Array.isArray(raw)) return { ok: false, error: 'Steps are invalid' };
  if (raw.length < min) return { ok: false, error: `A flow needs at least ${LIMITS.minSteps} step` };
  if (raw.length > max) return { ok: false, error: `A flow can have at most ${LIMITS.maxSteps} steps` };
  const steps: FlowStep[] = [];
  for (const [index, item] of raw.entries()) {
    const n = index + 1;
    if (typeof item !== 'object' || item === null) return { ok: false, error: `Step ${n} is invalid` };
    const { hat, durationSec, prompt } = item as Record<string, unknown>;
    if (typeof hat !== 'string' || !(HAT_IDS as readonly string[]).includes(hat)) {
      return { ok: false, error: `Step ${n} has an unknown hat` };
    }
    if (
      typeof durationSec !== 'number' ||
      !Number.isInteger(durationSec) ||
      durationSec < LIMITS.minDurationSec ||
      durationSec > LIMITS.maxDurationSec
    ) {
      return { ok: false, error: `Step ${n} must last between 0:30 and 30:00` };
    }
    const cleanPrompt = cleanText(prompt, `Step ${n} prompt`, LIMITS.prompt, true);
    if (!cleanPrompt.ok) return cleanPrompt;
    const step: FlowStep = { hat: hat as HatId, durationSec };
    if (cleanPrompt.value) step.prompt = cleanPrompt.value;
    steps.push(step);
  }
  return { ok: true, value: steps };
}

export function validateVotes(raw: unknown): Check<number> {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < LIMITS.minVotes || raw > LIMITS.maxVotes) {
    return { ok: false, error: `Votes per person must be between ${LIMITS.minVotes} and ${LIMITS.maxVotes}` };
  }
  return { ok: true, value: raw };
}

export function validateMode(raw: unknown): Check<WritingMode> {
  if (raw === undefined || raw === null) return { ok: true, value: 'everyone' };
  if (raw === 'everyone' || raw === 'scribe') return { ok: true, value: raw };
  return { ok: false, error: 'Mode must be "everyone" or "scribe"' };
}

export function validateDue(raw: unknown): Check<string | undefined> {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: undefined };
  const invalid = { ok: false as const, error: 'Due date must be YYYY-MM-DD' };
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return invalid;
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) return invalid;
  return { ok: true, value: raw };
}
