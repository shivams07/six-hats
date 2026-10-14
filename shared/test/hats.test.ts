import { describe, expect, it } from 'vitest';
import { HAT_IDS, HATS, PRESETS, formatDuration, presetSteps } from '../src/hats.js';

describe('hats', () => {
  it('defines the six hats with the spec timer defaults', () => {
    expect(HAT_IDS).toEqual(['white', 'red', 'black', 'yellow', 'green', 'blue']);
    expect(Object.fromEntries(HAT_IDS.map((id) => [id, HATS[id].defaultDurationSec]))).toEqual({
      white: 240, red: 60, black: 240, yellow: 240, green: 300, blue: 120,
    });
  });

  it('ships the four presets from the spec', () => {
    expect(PRESETS.map((p) => [p.name, p.hats.join(',')])).toEqual([
      ['Quick feedback', 'black,green'],
      ['Initial ideas', 'blue,white,green,blue'],
      ['Evaluate an idea', 'blue,white,yellow,black,red,green,blue'],
      ['Solve a problem', 'blue,white,green,red,yellow,black,green,blue'],
    ]);
  });

  it('turns hats into steps with default timers', () => {
    expect(presetSteps(['red', 'green'])).toEqual([
      { hat: 'red', durationSec: 60 },
      { hat: 'green', durationSec: 300 },
    ]);
  });

  it('formats durations as m:ss', () => {
    expect(formatDuration(240)).toBe('4:00');
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(4500)).toBe('75:00');
  });
});
