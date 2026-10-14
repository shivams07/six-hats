<script setup lang="ts">
import { computed } from 'vue';
import { HATS, LIMITS, formatDuration } from '@shared/hats';
import type { View } from '@shared/protocol';
import { canWrite } from '@shared/rules';
import { pointsForStep, scribeName } from '../points';
import Countdown from './Countdown.vue';
import FacilitatorControls from './FacilitatorControls.vue';
import FlowEditor from './FlowEditor.vue';
import HatIcon from './HatIcon.vue';
import PointComposer from './PointComposer.vue';
import PointList from './PointList.vue';
import ScribePicker from './ScribePicker.vue';
import StepGroups from './StepGroups.vue';

const props = defineProps<{ view: View; offset: number }>();

const step = computed(() => props.view.steps[props.view.currentStep]!);
const hat = computed(() => HATS[step.value.hat]);
const writable = computed(() => canWrite(props.view));
const revealed = computed(() => props.view.phase === 'revealed');
const scribeMode = computed(() => props.view.mode === 'scribe');
const isScribe = computed(() => scribeMode.value && props.view.scribeId === props.view.me.id);
const canCompose = computed(() => !scribeMode.value || isScribe.value);
const current = computed(() => pointsForStep(props.view, props.view.currentStep));
const upcoming = computed(() => props.view.steps.slice(props.view.currentStep + 1));
const earlier = computed(() => props.view.steps.map((_, i) => i).filter((i) => i < props.view.currentStep));
const authors = computed(() => new Set(current.value.map((p) => p.authorId)).size);

const instruction = computed(() => {
  if (scribeMode.value) {
    if (isScribe.value) return "You're the scribe. Each note appears for everyone as soon as you add it.";
    return `${scribeName(props.view) ?? 'The scribe'} is taking notes. They appear here as they're written.`;
  }
  if (revealed.value) return 'Every point is open. Talk it through, then move to the next hat.';
  return 'Write privately. Your points stay sealed until the clock runs out.';
});

const heading = computed(() => {
  const n = current.value.length;
  if (scribeMode.value) return { title: 'Notes', sub: n ? `${n} so far` : '' };
  if (revealed.value) return { title: 'Revealed', sub: n ? `${n} point${n === 1 ? '' : 's'} from ${authors.value} ${authors.value === 1 ? 'person' : 'people'}` : '' };
  return { title: 'Your points', sub: n ? `${n} sealed · only you can read them` : '' };
});

const emptyText = computed(() => {
  if (scribeMode.value) return isScribe.value ? 'No notes yet. Capture what people say as they say it.' : 'No notes yet.';
  if (revealed.value) return 'Nobody wrote a point under this hat.';
  return 'Nothing sealed yet. Write your first point above.';
});
</script>

<template>
  <section class="ballot frame" :aria-label="`${hat.name}: ${step.prompt ?? hat.prompt}`">
    <div class="ballot-hat" :class="`hat-${step.hat}`">
      <HatIcon :hat="step.hat" :size="28" />
      <div class="ballot-hat-name">
        <p class="name">{{ hat.name }}</p>
        <p class="focus">{{ hat.focus }}</p>
      </div>
      <p class="meta">Hat {{ view.currentStep + 1 }} of {{ view.steps.length }} · {{ formatDuration(step.durationSec) }}</p>
    </div>
    <div class="ballot-prompt">
      <h2 class="prompt">{{ step.prompt ?? hat.prompt }}</h2>
      <p class="mute">{{ instruction }}</p>
    </div>
    <div class="ballot-clock">
      <Countdown :ends-at="view.endsAt" :remaining-ms="view.remainingMs" :duration-ms="step.durationSec * 1000" :phase="view.phase" :offset="offset" />
    </div>
    <div v-if="view.me.isFacilitator" class="ballot-foot">
      <FacilitatorControls :view="view" />
      <ScribePicker v-if="scribeMode" :view="view" />
    </div>
  </section>

  <PointComposer v-if="canCompose" :locked="!writable" :speakers="scribeMode ? view.participants : undefined" />

  <section class="points-section" aria-live="polite">
    <div class="section-head">
      <h2>{{ heading.title }}</h2>
      <span v-if="heading.sub" class="mute small">{{ heading.sub }}</span>
    </div>
    <PointList :points="current" :view="view" :editable="writable && canCompose" :empty-text="emptyText" />
  </section>

  <p v-if="upcoming.length" class="next mute small">
    Next: <strong>{{ HATS[upcoming[0]!.hat].name }}</strong> · {{ HATS[upcoming[0]!.hat].focus.toLowerCase() }}
  </p>

  <StepGroups :view="view" :indices="earlier" title="Earlier hats" />

  <details v-if="view.me.isFacilitator && view.currentStep < LIMITS.maxSteps - 1" class="upcoming panel">
    <summary><h2>Edit upcoming hats</h2><span class="mute small">{{ upcoming.length }} left</span></summary>
    <FlowEditor
      :key="view.currentStep"
      :steps="upcoming"
      :start-number="view.currentStep + 2"
      :min-steps="0"
      :max-steps="LIMITS.maxSteps - view.currentStep - 1"
    />
  </details>
</template>

<style scoped>
.ballot { display: grid; grid-template-columns: 232px minmax(0, 1fr) auto; }
.ballot-hat { display: flex; flex-direction: column; gap: var(--s3); padding: var(--s5); border-right: 1px solid var(--ink); }
.ballot-hat.hat-white { border-right-color: var(--ink); }
.ballot-hat-name .name { font-size: var(--t-2xl); font-weight: 820; font-stretch: 108%; line-height: 1.05; letter-spacing: -0.01em; }
.ballot-hat-name .focus { font-size: var(--t-sm); font-weight: 560; opacity: 0.9; }
.ballot-hat .meta { margin-top: auto; font-size: var(--t-xs); font-weight: 650; font-stretch: 85%; letter-spacing: 0.06em; opacity: 0.85; }
.ballot-prompt { display: flex; flex-direction: column; gap: var(--s3); padding: var(--s5) var(--s6); }
.prompt { font-size: var(--t-3xl); font-weight: 640; font-stretch: 96%; line-height: 1.15; letter-spacing: -0.012em; max-width: 26ch; }
.ballot-clock { padding: var(--s5) var(--s6) var(--s5) var(--s4); min-width: 232px; }
.ballot-foot { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: var(--s3); flex-wrap: wrap; padding: var(--s3) var(--s4); border-top: 1px solid var(--ink); background: var(--paper); }
.points-section { display: flex; flex-direction: column; gap: var(--s3); }
.next strong { color: var(--ink); }
.upcoming { padding: 0; }
.upcoming summary { display: flex; align-items: baseline; gap: var(--s3); padding: var(--s4) var(--s5); cursor: pointer; list-style: none; }
.upcoming summary::-webkit-details-marker { display: none; }
.upcoming summary::before { content: ''; align-self: center; width: 8px; height: 8px; border-right: 2px solid var(--ink); border-bottom: 2px solid var(--ink); transform: rotate(-45deg); transition: transform 150ms; }
.upcoming[open] summary::before { transform: rotate(45deg); }
.upcoming[open] > :not(summary) { padding: 0 var(--s5) var(--s5); }
@media (max-width: 1100px) {
  .ballot { grid-template-columns: 208px minmax(0, 1fr); }
  .ballot-clock { grid-column: 1 / -1; border-top: 1px solid var(--rule); padding: var(--s4) var(--s5); min-width: 0; }
}
@media (max-width: 720px) {
  .ballot { grid-template-columns: minmax(0, 1fr); }
  .ballot-hat { flex-direction: row; align-items: center; border-right: 0; border-bottom: 1px solid var(--ink); padding: var(--s3) var(--s4); }
  .ballot-hat .meta { margin: 0 0 0 auto; }
  .ballot-prompt { padding: var(--s4); }
  .prompt { font-size: var(--t-xl); }
  .ballot-clock { padding: var(--s3) var(--s4); }
}
</style>
