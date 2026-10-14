<script setup lang="ts">
import { computed } from 'vue';
import { KeyRound, Link } from 'lucide-vue-next';
import type { View } from '@shared/protocol';
import { adminLink, getToken, participantLink } from '../api';
import { copyText } from '../files';
import { showToast } from '../toast';

const props = defineProps<{ view: View }>();
const token = getToken(props.view.code);

const status = computed(() => {
  const v = props.view;
  const hat = `hat ${v.currentStep + 1} of ${v.steps.length}`;
  switch (v.status) {
    case 'lobby': return { text: 'Lobby', live: false };
    case 'running':
      if (v.phase === 'paused') return { text: `Paused · ${hat}`, live: false };
      if (v.phase === 'revealed') return { text: `Revealed · ${hat}`, live: true };
      return { text: `Writing · ${hat}`, live: true };
    case 'voting': return { text: v.votingClosed ? 'Votes counted' : 'Voting', live: !v.votingClosed };
    case 'decision': return { text: 'Deciding', live: true };
    default: return { text: `Closed ${new Date(v.closedAt ?? v.createdAt).toLocaleDateString()}`, live: false };
  }
});

async function copy(text: string, what: string) {
  const ok = await copyText(text);
  showToast(ok ? `${what} copied` : 'Could not copy. Select the link instead.', ok ? 'info' : 'error');
}
</script>

<template>
  <header class="session-bar">
    <div class="session-id">
      <h1>{{ view.title }}</h1>
      <p class="focus">{{ view.focus }}</p>
    </div>
    <div class="session-meta">
      <span class="status" :class="{ live: status.live }"><span class="status-dot" aria-hidden="true"></span>{{ status.text }}</span>
      <span class="chip chip-ink">Code <b>{{ view.code }}</b></span>
      <template v-if="view.status !== 'closed'">
        <button class="btn btn-sm" @click="copy(participantLink(view.code), 'Invite link')"><Link aria-hidden="true" /> Copy invite link</button>
        <button v-if="view.me.isFacilitator && token" class="btn btn-sm btn-quiet" @click="copy(adminLink(view.code, token), 'Admin link')">
          <KeyRound aria-hidden="true" /> Copy admin link
        </button>
      </template>
    </div>
  </header>
</template>

<style scoped>
.session-bar { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--s5); flex-wrap: wrap; }
.session-id { display: flex; flex-direction: column; gap: var(--s2); min-width: 0; max-width: 72ch; }
.focus { font-size: var(--t-lg); color: var(--mute); }
.session-meta { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
.status { display: inline-flex; align-items: center; gap: var(--s2); margin-right: var(--s2); font-size: var(--t-sm); font-weight: 650; color: var(--mute); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--n5); }
.status.live { color: var(--violet); }
.status.live .status-dot { background: var(--violet); border-color: var(--violet); }
.chip b { font-weight: 760; letter-spacing: 0.14em; }
</style>
