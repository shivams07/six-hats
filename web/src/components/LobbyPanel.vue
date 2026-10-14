<script setup lang="ts">
import { computed, ref } from 'vue';
import { LIMITS } from '@shared/hats';
import type { View } from '@shared/protocol';
import { scribeName } from '../points';
import { useRun } from '../session-context';
import FlowEditor from './FlowEditor.vue';
import FlowOutline from './FlowOutline.vue';
import ScribePicker from './ScribePicker.vue';

const props = defineProps<{ view: View }>();
const run = useRun();
const needsScribe = computed(() => props.view.mode === 'scribe' && !props.view.scribeId);
const flowDirty = ref(false);
</script>

<template>
  <section class="card stack">
    <template v-if="view.me.isFacilitator">
      <div class="row between wrap">
        <h2>Lobby</h2>
        <button class="btn btn-primary" :disabled="needsScribe || flowDirty" @click="run({ type: 'start' })">Start session</button>
      </div>
      <p class="muted">Share the code <strong>{{ view.code }}</strong> or the invite link. You can still adjust the flow.</p>
      <template v-if="view.mode === 'scribe'">
        <ScribePicker :view="view" />
        <p v-if="needsScribe" class="muted small">Choose who takes notes before you start. You can hand the role over later.</p>
      </template>
      <p v-if="flowDirty" class="muted small">Save or discard your flow changes before starting.</p>
      <FlowEditor :steps="view.steps" :start-number="1" :min-steps="LIMITS.minSteps" :max-steps="LIMITS.maxSteps" @dirty="flowDirty = $event" />
    </template>
    <template v-else>
      <h2>Waiting for the facilitator to start</h2>
      <p v-if="view.mode === 'scribe'" class="muted">
        {{ scribeName(view) ? `${scribeName(view)} will take notes for everyone.` : 'A scribe will take notes for everyone.' }}
      </p>
      <p class="muted">Here's the plan:</p>
      <FlowOutline :steps="view.steps" />
    </template>
  </section>
</template>
