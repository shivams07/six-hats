import { onBeforeUnmount, ref, type Ref } from 'vue';

const COOLDOWN_MS = 500;

/** Runs one action at a time and keeps `pending` set for a short cooldown after it settles, so a double-click can't fire twice. */
export function useCooldownGuard(): { pending: Ref<boolean>; guarded: <T>(fn: () => Promise<T>) => Promise<T | undefined> } {
  const pending = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unmounted = false;

  async function guarded<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (pending.value) return undefined;
    pending.value = true;
    try {
      return await fn();
    } finally {
      if (!unmounted) {
        timer = setTimeout(() => {
          pending.value = false;
        }, COOLDOWN_MS);
      }
    }
  }

  onBeforeUnmount(() => {
    unmounted = true;
    clearTimeout(timer);
  });

  return { pending, guarded };
}
