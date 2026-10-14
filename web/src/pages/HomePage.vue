<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight } from 'lucide-vue-next';
import { HAT_IDS, HATS, formatDuration } from '@shared/hats';
import HatBadge from '../components/HatBadge.vue';

const router = useRouter();
const code = ref('');

function join() {
  const c = code.value.trim().toUpperCase();
  if (c) void router.push(`/s/${encodeURIComponent(c)}`);
}
</script>

<template>
  <div class="home">
    <section class="home-lead">
      <h1 class="home-title">One hat at a time.</h1>
      <p class="home-sub">Run Six Thinking Hats with your team. Everyone writes in private, and at 0:00 the room reads every point together.</p>
      <form class="join frame" @submit.prevent="join">
        <label class="field grow">
          <span>Session code</span>
          <input v-model="code" class="code-input" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7M2QX" required />
        </label>
        <button class="btn btn-primary join-btn">Join <ArrowRight aria-hidden="true" /></button>
      </form>
      <p class="home-alt mute">
        Facilitating? <RouterLink to="/new">Start a session</RouterLink> or <RouterLink to="/archive">open the archive</RouterLink>.
      </p>
    </section>

    <section class="hats" aria-labelledby="hats-title">
      <h2 id="hats-title">The six hats</h2>
      <table class="hat-table">
        <thead>
          <tr><th scope="col" class="label">Hat</th><th scope="col" class="label">Thinks about</th><th scope="col" class="label num">Default</th></tr>
        </thead>
        <tbody>
          <tr v-for="id in HAT_IDS" :key="id">
            <td><HatBadge :hat="id" size="sm" /></td>
            <td>
              <strong>{{ HATS[id].focus }}</strong>
              <span class="mute">{{ HATS[id].prompt }}</span>
            </td>
            <td class="num">{{ formatDuration(HATS[id].defaultDurationSec) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.home { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: var(--s7); align-items: start; padding-top: var(--s5); }
.home-lead { display: flex; flex-direction: column; gap: var(--s5); padding-top: var(--s5); }
.home-title { font-size: 2.75rem; font-weight: 800; font-stretch: 108%; letter-spacing: -0.02em; line-height: 1.05; }
.home-sub { font-size: var(--t-lg); color: var(--mute); max-width: 34ch; }
.join { display: flex; align-items: flex-end; gap: var(--s3); padding: var(--s5); }
.code-input { font-size: var(--t-2xl); font-weight: 720; font-stretch: 90%; letter-spacing: 0.24em; text-transform: uppercase; padding: 8px 14px; height: 56px; }
.code-input::placeholder { letter-spacing: 0.24em; color: var(--n4); }
.join-btn { height: 56px; padding: 0 var(--s5); font-size: var(--t-md); }
.home-alt { font-size: var(--t-sm); }
.hats { display: flex; flex-direction: column; gap: var(--s3); }
.hat-table { width: 100%; border-collapse: collapse; background: var(--sheet); border: 1px solid var(--rule); }
.hat-table th { text-align: left; padding: var(--s3) var(--s4); border-bottom: 1px solid var(--ink); }
.hat-table td { padding: var(--s3) var(--s4); border-bottom: 1px solid var(--rule); vertical-align: top; }
.hat-table tr:last-child td { border-bottom: 0; }
.hat-table td:nth-child(2) { display: flex; flex-direction: column; gap: 2px; font-size: var(--t-sm); }
.hat-table td:nth-child(2) strong { font-size: var(--t-md); font-weight: 650; }
.num { text-align: right; white-space: nowrap; }
td.num { font-weight: 650; font-stretch: 85%; }
@media (max-width: 900px) {
  .home { grid-template-columns: minmax(0, 1fr); gap: var(--s6); padding-top: 0; }
  .home-lead { padding-top: 0; }
  .home-title { font-size: 2.25rem; }
}
@media (max-width: 480px) {
  .join { flex-direction: column; align-items: stretch; padding: var(--s4); }
  .hat-table th, .hat-table td { padding: var(--s3); }
}
</style>
