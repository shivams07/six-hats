<script setup lang="ts">
import { computed } from 'vue';
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

function setMinutes(index: number, raw: string) {
  const minutes = Number(raw);
  if (!Number.isFinite(minutes)) return;
  const durationSec = Math.min(LIMITS.maxDurationSec, Math.max(LIMITS.minDurationSec, Math.round(minutes * 60)));
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
  <div class="stack">
    <ol class="flow-list" :start="startNumber">
      <li v-for="(step, i) in modelValue" :key="i" class="flow-step">
        <div class="flow-step-main">
          <select :value="step.hat" :aria-label="`Step ${startNumber + i} hat`" @change="setHat(i, valueOf($event) as HatId)">
            <option v-for="id in HAT_IDS" :key="id" :value="id">{{ HATS[id].icon }} {{ HATS[id].name }} — {{ HATS[id].focus }}</option>
          </select>
          <label class="inline-field">
            <input
              type="number"
              min="0.5"
              max="30"
              step="0.5"
              :value="step.durationSec / 60"
              :aria-label="`Step ${startNumber + i} minutes`"
              @change="setMinutes(i, valueOf($event))"
            />
            <span class="muted small">min</span>
          </label>
          <div class="row">
            <button type="button" class="btn btn-icon btn-ghost" :disabled="i === 0" :aria-label="`Move step ${startNumber + i} up`" @click="move(i, -1)">↑</button>
            <button type="button" class="btn btn-icon btn-ghost" :disabled="i === modelValue.length - 1" :aria-label="`Move step ${startNumber + i} down`" @click="move(i, 1)">↓</button>
            <button type="button" class="btn btn-icon btn-ghost" :disabled="full" :aria-label="`Duplicate step ${startNumber + i}`" @click="duplicate(i)">⧉</button>
            <button type="button" class="btn btn-icon btn-ghost" :disabled="modelValue.length <= minSteps" :aria-label="`Remove step ${startNumber + i}`" @click="remove(i)">✕</button>
          </div>
        </div>
        <input
          :value="step.prompt ?? ''"
          :placeholder="HATS[step.hat].prompt"
          :maxlength="LIMITS.prompt"
          :aria-label="`Step ${startNumber + i} prompt`"
          @input="setPrompt(i, valueOf($event))"
        />
      </li>
    </ol>
    <p v-if="!modelValue.length" class="muted">No upcoming steps.</p>
    <div class="row between wrap">
      <button type="button" class="btn" :disabled="full" @click="add">+ Add step</button>
      <span class="muted small">{{ modelValue.length }} steps · {{ formatDuration(total) }} total</span>
    </div>
  </div>
</template>
