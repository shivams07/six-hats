<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDown, ArrowUp, Copy, Plus, X } from 'lucide-vue-next';
import { HAT_IDS, HATS, LIMITS, formatDuration, type FlowStep, type HatId } from '@shared/hats';

const props = withDefaults(
  defineProps<{ modelValue: FlowStep[]; startNumber?: number; minSteps?: number; maxSteps?: number }>(),
  { startNumber: 1, minSteps: LIMITS.minSteps, maxSteps: LIMITS.maxSteps },
);
const emit = defineEmits<{ 'update:modelValue': [steps: FlowStep[]] }>();

const total = computed(() => props.modelValue.reduce((sum, s) => sum + s.durationSec, 0));
const full = computed(() => props.modelValue.length >= props.maxSteps);

const update = (steps: FlowStep[]) => emit('update:modelValue', steps);
const replace = (index: number, step: FlowStep) => update(props.modelValue.map((s, i) => (i === index ? step : s)));

function setHat(index: number, hat: HatId) {
  const { prompt } = props.modelValue[index]!;
  replace(index, { hat, durationSec: HATS[hat].defaultDurationSec, ...(prompt ? { prompt } : {}) });
}

function setMinutes(index: number, event: Event) {
  const input = event.target as HTMLInputElement;
  const minutes = Number(input.value);
  if (input.value.trim() === '' || !Number.isFinite(minutes)) {
    input.value = String(props.modelValue[index]!.durationSec / 60);
    return;
  }
  const durationSec = Math.min(LIMITS.maxDurationSec, Math.max(LIMITS.minDurationSec, Math.round(minutes * 2) * 30));
  input.value = String(durationSec / 60);
  replace(index, { ...props.modelValue[index]!, durationSec });
}

function setPrompt(index: number, value: string) {
  const { hat, durationSec } = props.modelValue[index]!;
  replace(index, value.trim() ? { hat, durationSec, prompt: value } : { hat, durationSec });
}

function move(index: number, delta: number) {
  const next = [...props.modelValue];
  const [step] = next.splice(index, 1);
  next.splice(index + delta, 0, step!);
  update(next);
}

function duplicate(index: number) {
  const next = [...props.modelValue];
  next.splice(index + 1, 0, { ...next[index]! });
  update(next);
}

const remove = (index: number) => update(props.modelValue.filter((_, i) => i !== index));
const add = () => update([...props.modelValue, { hat: 'green', durationSec: HATS.green.defaultDurationSec }]);
const valueOf = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;
</script>

<template>
  <div class="builder">
    <div class="head" aria-hidden="true">
      <span class="label">#</span><span class="label">Hat</span><span class="label">Minutes</span><span class="label">Prompt (optional)</span><span></span>
    </div>
    <ol>
      <li v-for="(step, i) in modelValue" :key="i" class="step">
        <span class="n">{{ startNumber + i }}</span>
        <span class="hat-cell">
          <span class="swatch" :class="`hat-${step.hat}`" aria-hidden="true"></span>
          <select :value="step.hat" :aria-label="`Hat for step ${startNumber + i}`" @change="setHat(i, valueOf($event) as HatId)">
            <option v-for="id in HAT_IDS" :key="id" :value="id">{{ HATS[id].label }} · {{ HATS[id].focus }}</option>
          </select>
        </span>
        <input
          class="minutes"
          type="number"
          :min="LIMITS.minDurationSec / 60"
          :max="LIMITS.maxDurationSec / 60"
          step="0.5"
          :value="step.durationSec / 60"
          :aria-label="`Minutes for step ${startNumber + i}`"
          @change="setMinutes(i, $event)"
          @keydown.enter.prevent="setMinutes(i, $event)"
        />
        <input
          class="prompt"
          :value="step.prompt ?? ''"
          :placeholder="HATS[step.hat].prompt"
          :maxlength="LIMITS.prompt"
          :aria-label="`Prompt for step ${startNumber + i}`"
          @input="setPrompt(i, valueOf($event))"
          @keydown.enter.prevent
        />
        <span class="tools">
          <button type="button" class="btn btn-sm btn-quiet btn-icon" :disabled="i === 0" :aria-label="`Move step ${startNumber + i} up`" @click="move(i, -1)"><ArrowUp aria-hidden="true" /></button>
          <button type="button" class="btn btn-sm btn-quiet btn-icon" :disabled="i === modelValue.length - 1" :aria-label="`Move step ${startNumber + i} down`" @click="move(i, 1)"><ArrowDown aria-hidden="true" /></button>
          <button type="button" class="btn btn-sm btn-quiet btn-icon" :disabled="full" :aria-label="`Duplicate step ${startNumber + i}`" @click="duplicate(i)"><Copy aria-hidden="true" /></button>
          <button type="button" class="btn btn-sm btn-quiet btn-icon" :disabled="modelValue.length <= minSteps" :aria-label="`Remove step ${startNumber + i}`" @click="remove(i)"><X aria-hidden="true" /></button>
        </span>
      </li>
    </ol>
    <p v-if="!modelValue.length" class="none mute">No hats after this one. Add one, or finish with voting.</p>
    <div class="foot">
      <button type="button" class="btn btn-sm" :disabled="full" @click="add"><Plus aria-hidden="true" /> Add hat</button>
      <span class="mute small">{{ modelValue.length }} {{ modelValue.length === 1 ? 'hat' : 'hats' }} · {{ formatDuration(total) }}{{ full ? ` · ${maxSteps} max` : '' }}</span>
    </div>
  </div>
</template>

<style scoped>
.builder { border: 1px solid var(--rule); background: var(--sheet); }
.head, .step { display: grid; grid-template-columns: 2.5ch minmax(180px, 240px) 96px minmax(0, 1fr) auto; gap: var(--s3); align-items: center; padding: var(--s2) var(--s3); }
.head { border-bottom: 1px solid var(--ink); padding-top: var(--s3); padding-bottom: var(--s3); }
.step { border-bottom: 1px solid var(--rule); }
.n { font-size: var(--t-sm); font-weight: 700; font-stretch: 80%; color: var(--mute); text-align: right; }
.hat-cell { display: flex; align-items: center; gap: var(--s2); }
.hat-cell .swatch { width: 14px; height: 14px; }
.tools { display: inline-flex; gap: 2px; }
.none { padding: var(--s4); }
.foot { display: flex; align-items: center; justify-content: space-between; gap: var(--s3); flex-wrap: wrap; padding: var(--s3); }
@media (max-width: 860px) {
  .head { display: none; }
  .step { grid-template-columns: 2.5ch minmax(0, 1fr) 88px; grid-template-areas: 'n hat min' '. prompt prompt' '. tools tools'; }
  .n { grid-area: n; }
  .hat-cell { grid-area: hat; }
  .minutes { grid-area: min; }
  .prompt { grid-area: prompt; }
  .tools { grid-area: tools; justify-content: flex-end; }
}
</style>
