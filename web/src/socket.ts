import { io } from 'socket.io-client';
import { onBeforeUnmount, ref, shallowRef } from 'vue';
import type { Command, CommandAck, View } from '@shared/protocol';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'rejected';

/** Must be called from a component's setup; disconnects when the component unmounts. */
export function useSessionSocket(code: string, token: string) {
  const view = shallowRef<View | null>(null);
  const connection = ref<ConnectionState>('connecting');
  const rejection = ref<string | null>(null);
  const clockOffset = ref(0);

  const socket = io({ auth: { code, token } });
  socket.on('connect', () => {
    connection.value = 'connected';
  });
  socket.on('disconnect', () => {
    connection.value = 'reconnecting';
  });
  socket.on('connect_error', (err) => {
    if (socket.active) {
      connection.value = 'reconnecting';
    } else {
      connection.value = 'rejected';
      rejection.value = err.message;
    }
  });
  socket.on('state', (v: View) => {
    clockOffset.value = v.serverNow - Date.now();
    view.value = v;
  });

  async function send(cmd: Command): Promise<CommandAck> {
    try {
      return await socket.timeout(5_000).emitWithAck('command', cmd);
    } catch {
      return { ok: false, error: 'No response from the server' };
    }
  }

  onBeforeUnmount(() => {
    socket.disconnect();
  });

  return { view, connection, rejection, clockOffset, send };
}
