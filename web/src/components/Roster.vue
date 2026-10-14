<script setup lang="ts">
import { computed } from 'vue';
import type { View } from '@shared/protocol';
import Tally from './Tally.vue';

const props = defineProps<{ view: View }>();
const onlineCount = computed(() => props.view.participants.filter((p) => p.online).length);
const counts = computed(() => props.view.currentStepCounts);
</script>

<template>
  <section class="register sheet" aria-labelledby="register-title">
    <div class="section-head head">
      <h2 id="register-title">Register</h2>
      <span class="mute small">{{ onlineCount }} of {{ view.participants.length }} here</span>
    </div>
    <ul>
      <li v-for="p in view.participants" :key="p.id" :class="{ away: !p.online }">
        <span class="presence" :class="{ on: p.online }" aria-hidden="true"></span>
        <span class="who">
          {{ p.name }}<span v-if="p.id === view.me.id" class="mute"> (you)</span>
          <span class="sr-only">, {{ p.online ? 'online' : 'offline' }}</span>
        </span>
        <span v-if="p.isFacilitator" class="chip">Host</span>
        <span v-if="p.id === view.scribeId" class="chip chip-violet">Scribe</span>
        <Tally v-if="counts" class="count" :count="counts[p.id] ?? 0" :label="`${counts[p.id] ?? 0} sealed points`" />
      </li>
    </ul>
    <p v-if="counts && view.phase !== 'revealed'" class="foot mute small">Sealed counts only. Nobody reads a word until the reveal.</p>
  </section>
</template>

<style scoped>
.register { display: flex; flex-direction: column; }
.head { padding: var(--s4) var(--s4) var(--s3); border-bottom: 1px solid var(--ink); }
li { display: flex; align-items: center; gap: var(--s2); min-height: 48px; padding: var(--s2) var(--s4); border-bottom: 1px solid var(--rule); }
li:last-child { border-bottom: 0; }
.presence { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid var(--n5); flex: none; margin-right: 2px; }
.presence.on { background: var(--live); border-color: var(--live); }
.who { font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.away .who { color: var(--mute); font-weight: 500; }
.count { margin-left: auto; }
.foot { padding: var(--s3) var(--s4); border-top: 1px solid var(--rule); background: var(--paper); }
</style>
