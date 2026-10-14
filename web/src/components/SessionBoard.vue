<script setup lang="ts">
import { provide, watch } from 'vue';
import type { Command } from '@shared/protocol';
import { RUN_KEY } from '../session-context';
import { useSessionSocket } from '../socket';
import { showToast } from '../toast';
import DecisionPanel from './DecisionPanel.vue';
import LobbyPanel from './LobbyPanel.vue';
import Roster from './Roster.vue';
import SessionHeader from './SessionHeader.vue';
import StepPanel from './StepPanel.vue';
import SummaryView from './SummaryView.vue';
import VotingPanel from './VotingPanel.vue';

const props = defineProps<{ code: string; token: string }>();
const emit = defineEmits<{ rejected: [reason: string] }>();

const { view, connection, rejection, clockOffset, send } = useSessionSocket(props.code, props.token);

watch(rejection, (reason) => {
  if (reason) emit('rejected', reason);
});

async function run(cmd: Command): Promise<boolean> {
  const result = await send(cmd);
  if (!result.ok) showToast(result.error);
  return result.ok;
}
provide(RUN_KEY, run);
</script>

<template>
  <div v-if="connection === 'reconnecting'" class="banner" role="status">Reconnecting…</div>
  <p v-if="!view" class="muted">Connecting…</p>
  <div v-else class="stack">
    <SessionHeader :view="view" />
    <div class="board-grid">
      <div class="board-main stack">
        <LobbyPanel v-if="view.status === 'lobby'" :view="view" />
        <StepPanel v-else-if="view.status === 'running'" :view="view" :offset="clockOffset" />
        <VotingPanel v-else-if="view.status === 'voting'" :view="view" />
        <DecisionPanel v-else-if="view.status === 'decision'" :view="view" />
        <SummaryView v-else :view="view" :token="token" />
      </div>
      <aside class="board-side"><Roster :view="view" /></aside>
    </div>
  </div>
</template>
