<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ count: number; max?: number; label?: string }>(), { max: 20 });

/** Groups of five marks, the fifth struck through; beyond `max` only the numeral grows. */
const groups = computed(() => {
  const shown = Math.min(props.count, props.max);
  const out: number[] = [];
  for (let left = shown; left > 0; left -= 5) out.push(Math.min(5, left));
  return out;
});
</script>

<template>
  <span class="tally" :class="{ zero: count === 0 }">
    <span class="tally-marks" aria-hidden="true">
      <span v-for="(n, g) in groups" :key="g" class="tally-group" :class="{ full: n === 5 }">
        <i v-for="m in Math.min(n, 4)" :key="m"></i>
      </span>
    </span>
    <span class="tally-n">{{ count }}</span>
    <span v-if="label" class="sr-only">{{ label }}</span>
  </span>
</template>
