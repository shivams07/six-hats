<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { HATS, formatDuration } from '@shared/hats';
import type { View } from '@shared/protocol';

const props = defineProps<{ view: View }>();

type CellState = 'done' | 'now' | 'next';

const stepState = (i: number): CellState => {
  const v = props.view;
  if (v.status === 'lobby') return 'next';
  if (v.status !== 'running') return 'done';
  if (i < v.currentStep) return 'done';
  return i === v.currentStep ? 'now' : 'next';
};

const voteState = computed<CellState>(() => {
  const s = props.view.status;
  if (s === 'voting') return 'now';
  return s === 'decision' || s === 'closed' ? 'done' : 'next';
});
const decideState = computed<CellState>(() => {
  const s = props.view.status;
  if (s === 'decision') return 'now';
  return s === 'closed' ? 'done' : 'next';
});

// Keep the current cell in view on narrow screens without scrolling the page.
const strip = ref<HTMLElement | null>(null);
async function centreCurrent() {
  await nextTick();
  const el = strip.value;
  const cell = el?.querySelector<HTMLElement>('[aria-current="step"]');
  if (el && cell) el.scrollLeft = cell.offsetLeft - (el.clientWidth - cell.offsetWidth) / 2;
}
onMounted(centreCurrent);
watch(() => [props.view.status, props.view.currentStep], centreCurrent);
</script>

<template>
  <nav ref="strip" class="flow" aria-label="Session flow">
    <ol>
      <li v-for="(s, i) in view.steps" :key="i" :class="stepState(i)" :aria-current="stepState(i) === 'now' ? 'step' : undefined">
        <span class="n">{{ i + 1 }}</span>
        <span class="swatch" :class="`hat-${s.hat}`" aria-hidden="true"></span>
        <span class="name">{{ HATS[s.hat].label }}<span class="sr-only"> hat</span></span>
        <span class="t">{{ formatDuration(s.durationSec) }}</span>
      </li>
      <li class="end" :class="voteState" :aria-current="voteState === 'now' ? 'step' : undefined"><span class="name">Vote</span></li>
      <li class="end" :class="decideState" :aria-current="decideState === 'now' ? 'step' : undefined"><span class="name">Decision</span></li>
    </ol>
  </nav>
</template>

<style scoped>
.flow { position: relative; overflow-x: auto; scrollbar-width: thin; border-top: 1px solid var(--ink); border-bottom: 1px solid var(--rule); background: var(--sheet); }
ol { display: flex; min-width: max-content; }
li { scroll-snap-align: center; display: flex; align-items: center; gap: var(--s2); min-width: 120px; padding: var(--s3) var(--s4); border-right: 1px solid var(--rule); font-size: var(--t-sm); color: var(--mute); position: relative; flex: 1 0 auto; }
li:last-child { border-right: 0; }
.n { font-weight: 700; font-stretch: 80%; font-size: var(--t-xs); letter-spacing: 0.06em; min-width: 2ch; }
.name { font-weight: 600; }
.t { margin-left: auto; font-size: var(--t-xs); font-stretch: 85%; }
li.done { color: var(--ink); }
li.done .n { text-decoration: line-through; text-decoration-color: var(--violet); text-decoration-thickness: 2px; }
li.now { color: var(--ink); background: var(--violet-wash); }
li.now::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 3px; background: var(--violet); }
li.now .name { font-weight: 760; }
li.end { min-width: 96px; }
li.end.next { color: var(--mute); }
</style>
