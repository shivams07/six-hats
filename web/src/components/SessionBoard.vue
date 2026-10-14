<script setup lang="ts">
import { provide, watch } from 'vue';
import { RotateCw } from 'lucide-vue-next';
import type { Command } from '@shared/protocol';
import { RUN_KEY } from '../session-context';
import { useSessionSocket } from '../socket';
import { showToast } from '../toast';
import DecisionPanel from './DecisionPanel.vue';
import FlowStrip from './FlowStrip.vue';
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
  <div v-if="connection === 'reconnecting' && view" class="banner" role="status"><RotateCw aria-hidden="true" /> Reconnecting…</div>
  <div v-if="!view" class="loading" aria-busy="true">
    <p class="mute">{{ connection === 'reconnecting' ? 'Trying to reach the session…' : `Opening ${code}…` }}</p>
    <div class="skeleton bar-a"></div>
    <div class="skeleton bar-b"></div>
    <div class="skeleton frame-a"></div>
  </div>
  <div v-else class="board">
    <SessionHeader :view="view" />
    <FlowStrip :view="view" />
    <div class="board-grid">
      <div class="board-main">
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

<style scoped>
.board { display: flex; flex-direction: column; gap: var(--s5); }
.board-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--s6); align-items: start; }
.board-main { display: flex; flex-direction: column; gap: var(--s5); min-width: 0; }
.board-side { position: sticky; top: var(--s5); }
.loading { display: flex; flex-direction: column; gap: var(--s4); }
.skeleton { background: var(--hover); }
.bar-a { height: 34px; width: 46%; }
.bar-b { height: 48px; }
.frame-a { height: 240px; border: 1px solid var(--rule); }
@media (max-width: 1000px) {
  .board-grid { grid-template-columns: minmax(0, 1fr); gap: var(--s5); }
  .board-side { position: static; }
}
</style>
