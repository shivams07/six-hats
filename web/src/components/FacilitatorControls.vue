<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { Command, View } from '@shared/protocol';
import { canWrite } from '@shared/rules';
import { useRun } from '../session-context';

const COOLDOWN_MS = 500;

const props = defineProps<{ view: View }>();
const run = useRun();
const writable = computed(() => canWrite(props.view));
const isLast = computed(() => props.view.currentStep >= props.view.steps.length - 1);
const pending = ref(false);
let cooldown: ReturnType<typeof setTimeout> | undefined;

async function act(cmd: Command) {
  if (pending.value) return;
  pending.value = true;
  try {
    await run(cmd);
  } finally {
    cooldown = setTimeout(() => {
      pending.value = false;
    }, COOLDOWN_MS);
  }
}

onBeforeUnmount(() => clearTimeout(cooldown));
</script>

<template>
  <div class="row wrap" role="group" aria-label="Facilitator controls">
    <template v-if="writable">
      <button v-if="view.phase === 'writing'" class="btn" :disabled="pending" @click="act({ type: 'pause' })">Pause</button>
      <button v-else class="btn" :disabled="pending" @click="act({ type: 'resume' })">Resume</button>
      <button class="btn" :disabled="pending" @click="act({ type: 'addTime' })">+1 min</button>
      <button class="btn btn-primary" :disabled="pending" @click="act({ type: 'revealNow' })">Reveal now</button>
      <button class="btn btn-ghost" :disabled="pending" @click="act({ type: 'skipStep' })">Skip step</button>
    </template>
    <button v-else class="btn btn-primary" :disabled="pending" @click="act({ type: 'nextStep' })">{{ isLast ? 'Go to voting' : 'Next step' }}</button>
  </div>
</template>
