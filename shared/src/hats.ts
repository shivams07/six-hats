export const HAT_IDS = ['white', 'red', 'black', 'yellow', 'green', 'blue'] as const;
export type HatId = (typeof HAT_IDS)[number];

export interface HatDef {
  id: HatId;
  name: string;
  label: string;
  focus: string;
  prompt: string;
  defaultDurationSec: number;
  icon: string;
}

export const HATS: Record<HatId, HatDef> = {
  white: { id: 'white', name: 'White hat', label: 'White', focus: 'Facts & information', prompt: "What do we know? What's missing? What would we need to find out?", defaultDurationSec: 240, icon: '📊' },
  red: { id: 'red', name: 'Red hat', label: 'Red', focus: 'Feelings & intuition', prompt: "What's your gut reaction? No justification needed.", defaultDurationSec: 60, icon: '❤️' },
  black: { id: 'black', name: 'Black hat', label: 'Black', focus: 'Caution & risks', prompt: 'What could go wrong? Why might this not work?', defaultDurationSec: 240, icon: '⚠️' },
  yellow: { id: 'yellow', name: 'Yellow hat', label: 'Yellow', focus: 'Benefits & value', prompt: 'What are the benefits? Why could this work?', defaultDurationSec: 240, icon: '☀️' },
  green: { id: 'green', name: 'Green hat', label: 'Green', focus: 'Creativity & alternatives', prompt: 'What new ideas, alternatives or possibilities are there?', defaultDurationSec: 300, icon: '🌱' },
  blue: { id: 'blue', name: 'Blue hat', label: 'Blue', focus: 'Process & control', prompt: 'Where are we? What should we focus on? What have we concluded?', defaultDurationSec: 120, icon: '🧭' },
};

export interface FlowStep {
  hat: HatId;
  durationSec: number;
  prompt?: string;
}

export interface Preset {
  id: string;
  name: string;
  hats: HatId[];
}

export const PRESETS: Preset[] = [
  { id: 'quick-feedback', name: 'Quick feedback', hats: ['black', 'green'] },
  { id: 'initial-ideas', name: 'Initial ideas', hats: ['blue', 'white', 'green', 'blue'] },
  { id: 'evaluate-idea', name: 'Evaluate an idea', hats: ['blue', 'white', 'yellow', 'black', 'red', 'green', 'blue'] },
  { id: 'solve-problem', name: 'Solve a problem', hats: ['blue', 'white', 'green', 'red', 'yellow', 'black', 'green', 'blue'] },
];

export function presetSteps(hats: HatId[]): FlowStep[] {
  return hats.map((hat) => ({ hat, durationSec: HATS[hat].defaultDurationSec }));
}

export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export const LIMITS = {
  title: 120,
  focus: 500,
  name: 40,
  prompt: 300,
  point: 500,
  decision: 4000,
  actionText: 300,
  actionOwner: 60,
  templateName: 60,
  minSteps: 1,
  maxSteps: 20,
  minDurationSec: 30,
  maxDurationSec: 1800,
  minVotes: 1,
  maxVotes: 10,
  maxParticipants: 50,
  maxPointsPerStep: 30,
  maxScribeNotesPerStep: 200,
  maxActions: 50,
} as const;
