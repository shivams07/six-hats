<script setup lang="ts">
import { computed } from 'vue';
import type { View } from '@shared/protocol';

const props = defineProps<{ view: View }>();
const onlineCount = computed(() => props.view.participants.filter((p) => p.online).length);
</script>

<template>
  <section class="card stack">
    <h2 class="h3">People · {{ onlineCount }}/{{ view.participants.length }} online</h2>
    <p v-if="view.currentStepCounts" class="muted small">Points written this step (text stays hidden until the reveal).</p>
    <ul class="roster">
      <li v-for="p in view.participants" :key="p.id">
        <span class="dot" :class="{ online: p.online }" aria-hidden="true"></span>
        <span class="sr-only">{{ p.online ? 'Online' : 'Offline' }}</span>
        <span>{{ p.name }}<span v-if="p.id === view.me.id" class="muted"> (you)</span></span>
        <span v-if="p.isFacilitator" class="tag">Facilitator</span>
        <span v-if="p.id === view.scribeId" class="tag">Scribe</span>
        <span v-if="view.currentStepCounts" class="count">{{ view.currentStepCounts[p.id] ?? 0 }}</span>
      </li>
    </ul>
  </section>
</template>
