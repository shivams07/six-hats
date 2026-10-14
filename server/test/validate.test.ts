import { describe, expect, it } from 'vitest';
import { cleanText, validateDue, validateMode, validateSteps, validateVotes } from '../src/validate.js';

describe('cleanText', () => {
  it('trims and accepts text within the limit', () => {
    expect(cleanText('  hello ', 'Title', 10)).toEqual({ ok: true, value: 'hello' });
  });
  it('rejects missing, empty, non-string and oversized text', () => {
    expect(cleanText(undefined, 'Title', 10)).toEqual({ ok: false, error: 'Title is required' });
    expect(cleanText('   ', 'Title', 10)).toEqual({ ok: false, error: "Title can't be empty" });
    expect(cleanText(42, 'Title', 10)).toEqual({ ok: false, error: 'Title must be text' });
    expect(cleanText('x'.repeat(11), 'Title', 10)).toEqual({ ok: false, error: 'Title must be at most 10 characters' });
  });
  it('normalises line endings to LF', () => {
    expect(cleanText('a\rb', 'Title', 10)).toEqual({ ok: true, value: 'a\nb' });
    expect(cleanText('a\r\nb\r\rc', 'Title', 10)).toEqual({ ok: true, value: 'a\nb\n\nc' });
  });
  it('strips control characters but keeps newlines and tabs', () => {
    expect(cleanText('a\u0000b\u0007c\u001bd\u007fe\u000bf\u000cg', 'Title', 20)).toEqual({ ok: true, value: 'abcdefg' });
    expect(cleanText('a\tb\nc', 'Title', 10)).toEqual({ ok: true, value: 'a\tb\nc' });
  });
  it('allows empty text when asked', () => {
    expect(cleanText(undefined, 'Owner', 10, true)).toEqual({ ok: true, value: '' });
    expect(cleanText(' ', 'Owner', 10, true)).toEqual({ ok: true, value: '' });
  });
});

describe('validateSteps', () => {
  it('accepts a valid flow and drops empty prompts', () => {
    expect(validateSteps([{ hat: 'red', durationSec: 60, prompt: '  ' }, { hat: 'green', durationSec: 300, prompt: ' Ideas? ' }])).toEqual({
      ok: true,
      value: [{ hat: 'red', durationSec: 60 }, { hat: 'green', durationSec: 300, prompt: 'Ideas?' }],
    });
  });
  it('enforces the step count', () => {
    expect(validateSteps('nope')).toEqual({ ok: false, error: 'Steps are invalid' });
    expect(validateSteps([])).toEqual({ ok: false, error: 'A flow needs at least 1 step' });
    const many = Array.from({ length: 21 }, () => ({ hat: 'white', durationSec: 60 }));
    expect(validateSteps(many)).toEqual({ ok: false, error: 'A flow can have at most 20 steps' });
    expect(validateSteps([], 0, 3)).toEqual({ ok: true, value: [] });
  });
  it('rejects unknown hats, bad durations and long prompts', () => {
    expect(validateSteps([{ hat: 'purple', durationSec: 60 }])).toEqual({ ok: false, error: 'Step 1 has an unknown hat' });
    expect(validateSteps([{ hat: 'red', durationSec: 29 }])).toEqual({ ok: false, error: 'Step 1 must last between 0:30 and 30:00' });
    expect(validateSteps([{ hat: 'red', durationSec: 60.5 }])).toEqual({ ok: false, error: 'Step 1 must last between 0:30 and 30:00' });
    expect(validateSteps([{ hat: 'red', durationSec: 1801 }])).toEqual({ ok: false, error: 'Step 1 must last between 0:30 and 30:00' });
    expect(validateSteps([{ hat: 'red', durationSec: 60, prompt: 'x'.repeat(301) }])).toEqual({ ok: false, error: 'Step 1 prompt must be at most 300 characters' });
  });
});

describe('validateVotes', () => {
  it('accepts 1 to 10', () => {
    expect(validateVotes(3)).toEqual({ ok: true, value: 3 });
    expect(validateVotes(0)).toEqual({ ok: false, error: 'Votes per person must be between 1 and 10' });
    expect(validateVotes(11)).toEqual({ ok: false, error: 'Votes per person must be between 1 and 10' });
    expect(validateVotes('3')).toEqual({ ok: false, error: 'Votes per person must be between 1 and 10' });
  });
});

describe('validateMode', () => {
  it('defaults to everyone and accepts scribe', () => {
    expect(validateMode(undefined)).toEqual({ ok: true, value: 'everyone' });
    expect(validateMode('everyone')).toEqual({ ok: true, value: 'everyone' });
    expect(validateMode('scribe')).toEqual({ ok: true, value: 'scribe' });
    expect(validateMode('chaos')).toEqual({ ok: false, error: 'Mode must be "everyone" or "scribe"' });
  });
});

describe('validateDue', () => {
  it('accepts an absent or real calendar date', () => {
    expect(validateDue(undefined)).toEqual({ ok: true, value: undefined });
    expect(validateDue('')).toEqual({ ok: true, value: undefined });
    expect(validateDue('2026-10-21')).toEqual({ ok: true, value: '2026-10-21' });
  });
  it('rejects anything else', () => {
    for (const bad of ['2026-13-01', '2026-02-30', 'tomorrow', 20261021]) {
      expect(validateDue(bad)).toEqual({ ok: false, error: 'Due date must be YYYY-MM-DD' });
    }
  });
});
