import { reactive } from 'vue';

export interface Toast {
  id: number;
  message: string;
  kind: 'error' | 'info';
}

export const toasts = reactive<Toast[]>([]);
let nextId = 0;

export function showToast(message: string, kind: Toast['kind'] = 'error'): void {
  const id = ++nextId;
  toasts.push({ id, message, kind });
  setTimeout(() => {
    const index = toasts.findIndex((t) => t.id === id);
    if (index >= 0) toasts.splice(index, 1);
  }, 4_000);
}
