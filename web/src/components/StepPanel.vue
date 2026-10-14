<script setup lang="ts">
import { computed } from 'vue';
import { HATS, LIMITS } from '@shared/hats';
import type { View } from '@shared/protocol';
import { canWrite } from '@shared/rules';
import { pointsForStep, scribeName } from '../points';
import Countdown from './Countdown.vue';
import FacilitatorControls from './FacilitatorControls.vue';
import FlowEditor from './FlowEditor.vue';
import HatBadge from './HatBadge.vue';
import PointComposer from './PointComposer.vue';
import PointList from './PointList.vue';
import ScribePicker from './ScribePicker.vue';
import StepGroups from './StepGroups.vue';

const props = defineProps<{ view: View; offset: number }>();

const step = computed(() => props.view.steps[props.view.currentStep]!);
const hat = computed(() => HATS[step.value.hat]);
const writable = computed(() => canWrite(props.view));
const scribeMode = computed(() => props.view.mode === 'scribe');
const canCompose = computed(() => !scribeMode.value || props.view.scribeId === props.view.me.id);
const heading = computed(() => {
  if (scribeMode.value) return 'Notes — visible to everyone';
  return props.view.phase === 'revealed' ? "Everyone's points" : 'Your points — only you can see them until the reveal';
});
const current = computed(() => pointsForStep(props.view, props.view.currentStep));
const upcoming = computed(() => props.view.steps.slice(props.view.currentStep + 1));
const earlier = computed(() => props.view.steps.map((_, i) => i).filter((i) => i < props.view.currentStep));
</script>

<template>
  <section class="card stack step-card" :class="`hat-edge-${step.hat}`">
    <div class="row between wrap">
      <div class="stack tight">
        <span class="muted small">Step {{ view.currentStep + 1 }} of {{ view.steps.length }}</span>
        <HatBadge :hat="step.hat" size="lg" />
        <span class="muted">{{ hat.focus }}</span>
      </div>
      <Countdown :ends-at="view.endsAt" :remaining-ms="view.remainingMs" :phase="view.phase" :offset="offset" />
    </div>
    <p class="prompt">{{ step.prompt ?? hat.prompt }}</p>
    <FacilitatorControls v-if="view.me.isFacilitator" :view="view" />
    <ScribePicker v-if="view.me.isFacilitator && scribeMode" :view="view" />
    <PointComposer v-if="canCompose" :locked="!writable" :speakers="scribeMode ? view.participants : undefined" />
    <p v-else class="muted">{{ scribeName(view) ?? 'The scribe' }} is taking notes for everyone.</p>
    <h3>{{ heading }}</h3>
    <PointList :points="current" :view="view" :editable="writable && canCompose" empty-text="No points yet." />
    <p v-if="upcoming.length" class="muted small">Up next: {{ HATS[upcoming[0]!.hat].name }}</p>
  </section>

  <StepGroups :view="view" :indices="earlier" title="Earlier steps" />

  <details v-if="view.me.isFacilitator" class="card">
    <summary>Edit upcoming steps</summary>
    <FlowEditor
      :key="view.currentStep"
      :steps="upcoming"
      :start-number="view.currentStep + 2"
      :min-steps="0"
      :max-steps="LIMITS.maxSteps - view.currentStep - 1"
    />
  </details>
</template>
