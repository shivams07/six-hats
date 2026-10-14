<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { SessionSummary } from '@shared/protocol';
import { api, errorMessage, setToken } from '../api';
import { STATUS_LABELS } from '../labels';
import { showToast } from '../toast';

const router = useRouter();
const sessions = ref<SessionSummary[] | null>(null);
const error = ref('');

onMounted(async () => {
  try {
    sessions.value = await api.listSessions();
  } catch (e) {
    error.value = errorMessage(e);
  }
});

async function open(s: SessionSummary) {
  try {
    const { token } = await api.facilitatorLink(s.code);
    setToken(s.code, token);
    await router.push(`/s/${s.code}/admin`);
  } catch (e) {
    showToast(errorMessage(e));
  }
}
</script>

<template>
  <section class="stack">
    <div class="row between wrap">
      <h1>Archive</h1>
      <RouterLink class="btn btn-primary" to="/new">New session</RouterLink>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }} <a href="/archive">Re-enter passcode</a></p>
    <p v-else-if="!sessions" class="muted">Loading…</p>
    <p v-else-if="!sessions.length" class="muted">No sessions yet.</p>
    <ul v-else class="archive">
      <li v-for="s in sessions" :key="s.id" class="card row between wrap">
        <div class="stack tight">
          <strong>{{ s.title }}</strong>
          <span class="muted small">
            {{ new Date(s.createdAt).toLocaleDateString() }} · {{ s.participantCount }} people · {{ STATUS_LABELS[s.status] }} · {{ s.code }}
          </span>
        </div>
        <button class="btn" @click="open(s)">{{ s.status === 'closed' ? 'View summary' : 'Open as facilitator' }}</button>
      </li>
    </ul>
  </section>
</template>
