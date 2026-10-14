import { inject, type InjectionKey } from 'vue';
import type { Command } from '@shared/protocol';

/** Sends a command; toasts and returns false when the server rejects it. */
export type Run = (cmd: Command) => Promise<boolean>;

export const RUN_KEY: InjectionKey<Run> = Symbol('run');

export function useRun(): Run {
  const run = inject(RUN_KEY);
  if (!run) throw new Error('useRun() must be used inside SessionBoard');
  return run;
}
