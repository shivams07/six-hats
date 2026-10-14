<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { HAT_IDS, HATS } from '@shared/hats';
import HatBadge from '../components/HatBadge.vue';

const router = useRouter();
const code = ref('');

function join() {
  const c = code.value.trim().toUpperCase();
  if (c) void router.push(`/s/${c}`);
}
</script>

<template>
  <section class="hero stack">
    <h1>Six Thinking Hats</h1>
    <p class="muted">Look at one thing from one angle at a time, together. Everyone writes privately under each hat, then the points are revealed together.</p>
    <form class="card row wrap" @submit.prevent="join">
      <label class="field grow">
        <span>Session code</span>
        <input v-model="code" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="ABC234" required />
      </label>
      <button class="btn btn-primary">Join</button>
    </form>
    <div class="row wrap">
      <RouterLink class="btn" to="/new">Create a session</RouterLink>
      <RouterLink class="btn btn-ghost" to="/archive">Archive</RouterLink>
    </div>
    <ul class="hat-grid">
      <li v-for="id in HAT_IDS" :key="id" class="card">
        <HatBadge :hat="id" />
        <span class="muted small">{{ HATS[id].focus }}</span>
      </li>
    </ul>
  </section>
</template>
