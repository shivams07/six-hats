<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Plus } from 'lucide-vue-next';
import type { SessionSummary } from '@shared/protocol';
import { api, errorMessage, setToken } from '../api';
import { STATUS_LABELS } from '../labels';
import { showToast } from '../toast';

const router = useRouter();
const sessions = ref<SessionSummary[] | null>(null);
const error = ref('');
const opening = ref<string | null>(null);

onMounted(async () => {
  try {
    sessions.value = await api.listSessions();
  } catch (e) {
    error.value = errorMessage(e);
  }
});

async function open(s: SessionSummary) {
  if (opening.value) return;
  opening.value = s.code;
  try {
    const { token } = await api.facilitatorLink(s.code);
    setToken(s.code, token);
    await router.push(`/s/${s.code}/admin`);
  } catch (e) {
    showToast(errorMessage(e));
  } finally {
    opening.value = null;
  }
}
</script>

<template>
  <section class="archive">
    <div class="archive-head">
      <div class="title">
        <h1>Archive</h1>
        <p class="mute">Every session your team has run. Closed ones open as a read-only result; live ones open as facilitator.</p>
      </div>
      <RouterLink class="btn btn-primary" to="/new"><Plus aria-hidden="true" /> New session</RouterLink>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }} <a href="/archive">Enter the passcode again</a></p>
    <div v-else-if="!sessions" class="sheet loading" aria-busy="true"><div v-for="n in 3" :key="n" class="skeleton-row"></div></div>
    <div v-else-if="!sessions.length" class="sheet empty">
      <h2>No sessions yet</h2>
      <p class="mute">Your first session will be listed here once it's created.</p>
      <div><RouterLink class="btn" to="/new">Start one</RouterLink></div>
    </div>
    <table v-else class="table sheet">
      <thead>
        <tr>
          <th scope="col" class="label">Session</th>
          <th scope="col" class="label">Date</th>
          <th scope="col" class="label num">People</th>
          <th scope="col" class="label">Status</th>
          <th scope="col" class="label">Code</th>
          <th scope="col"><span class="sr-only">Open</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in sessions" :key="s.id">
          <th scope="row" class="name">{{ s.title }}</th>
          <td>{{ new Date(s.createdAt).toLocaleDateString() }}</td>
          <td class="num">{{ s.participantCount }}</td>
          <td><span class="state" :class="{ live: s.status !== 'closed' }">{{ STATUS_LABELS[s.status] }}</span></td>
          <td class="code">{{ s.code }}</td>
          <td class="go">
            <button class="btn btn-sm" :disabled="opening !== null" @click="open(s)">{{ s.status === 'closed' ? 'View result' : 'Open as facilitator' }}</button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.archive { display: flex; flex-direction: column; gap: var(--s5); }
.archive-head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--s4); flex-wrap: wrap; }
.title { display: flex; flex-direction: column; gap: var(--s2); max-width: 64ch; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { text-align: left; padding: var(--s3) var(--s4); border-bottom: 1px solid var(--rule); vertical-align: middle; }
.table thead th { border-bottom: 1px solid var(--ink); }
.table tbody tr:last-child > * { border-bottom: 0; }
.table tbody tr:hover { background: var(--hover); }
.name { font-weight: 640; overflow-wrap: anywhere; max-width: 40ch; }
.num { text-align: right; }
.code { font-weight: 650; font-stretch: 88%; letter-spacing: 0.12em; }
.go { text-align: right; }
.state { font-size: var(--t-sm); font-weight: 600; color: var(--mute); }
.state.live { color: var(--violet); }
.loading { padding: var(--s3) var(--s4); display: flex; flex-direction: column; gap: var(--s3); }
.skeleton-row { height: 28px; background: var(--hover); }
.empty { display: flex; flex-direction: column; gap: var(--s3); padding: var(--s6); }
@media (max-width: 760px) {
  .table thead { display: none; }
  .table tr { display: grid; grid-template-columns: minmax(0, 1fr) auto; padding: var(--s3) var(--s4); border-bottom: 1px solid var(--rule); }
  .table th, .table td { padding: 2px 0; border: 0; }
  .table .name { grid-column: 1 / -1; }
  .table td:nth-child(3), .table td:nth-child(5) { display: none; }
  .table .go { grid-column: 1 / -1; text-align: left; padding-top: var(--s2); }
}
</style>
