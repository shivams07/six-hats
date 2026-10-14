<script setup lang="ts">
import { computed } from 'vue';
import type { View } from '@shared/protocol';
import { canWrite } from '@shared/rules';
import { useRun } from '../session-context';

const props = defineProps<{ view: View }>();
const run = useRun();
const writable = computed(() => canWrite(props.view));
const isLast = computed(() => props.view.currentStep >= props.view.steps.length - 1);
</script>

<template>
  <div class="row wrap" role="group" aria-label="Facilitator controls">
    <template v-if="writable">
      <button v-if="view.phase === 'writing'" class="btn" @click="run({ type: 'pause' })">Pause</button>
      <button v-else class="btn" @click="run({ type: 'resume' })">Resume</button>
      <button class="btn" @click="run({ type: 'addTime' })">+1 min</button>
      <button class="btn btn-primary" @click="run({ type: 'revealNow' })">Reveal now</button>
      <button class="btn btn-ghost" @click="run({ type: 'skipStep' })">Skip step</button>
    </template>
    <button v-else class="btn btn-primary" @click="run({ type: 'nextStep' })">{{ isLast ? 'Go to voting' : 'Next step' }}</button>
  </div>
</template>
