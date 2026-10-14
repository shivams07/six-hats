<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { View } from '@shared/protocol';
import { api, errorMessage } from '../api';
import { copyText, downloadText } from '../files';
import { topVoted } from '../points';
import { showToast } from '../toast';
import ActionList from './ActionList.vue';
import RankedList from './RankedList.vue';
import StepGroups from './StepGroups.vue';

const props = defineProps<{ view: View; token: string }>();
const all = computed(() => props.view.steps.map((_, i) => i));
const markdown = ref<string | null>(null);
const loading = ref(false);
const loadError = ref('');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    markdown.value = await api.summaryMarkdown(props.view.code, props.token);
  } catch (e) {
    loadError.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function copy() {
  if (!markdown.value) return;
  const ok = await copyText(markdown.value);
  showToast(ok ? 'Summary copied' : 'Could not copy; use Download instead', ok ? 'info' : 'error');
}

function download() {
  if (markdown.value) downloadText(`six-hats-${props.view.code}.md`, markdown.value);
}
</script>

<template>
  <section class="card stack">
    <div class="row between wrap">
      <h2>Summary</h2>
      <div class="row">
        <button class="btn" :disabled="!markdown" @click="copy">Copy Markdown</button>
        <button class="btn btn-primary" :disabled="!markdown" @click="download">Download .md</button>
      </div>
    </div>
    <p v-if="loadError" class="error row wrap" role="alert">
      <span>Could not load the Markdown: {{ loadError }}</span>
      <button class="btn btn-small" :disabled="loading" @click="load">Retry</button>
    </p>
    <p class="muted small">Closed {{ new Date(view.closedAt ?? view.createdAt).toLocaleString() }}</p>
    <h3>Decision</h3>
    <p class="decision">{{ view.decision || 'No decision recorded.' }}</p>
    <h3>Action items</h3>
    <ActionList :actions="view.actions" />
    <template v-if="view.votingClosed">
      <h3>Top voted</h3>
      <RankedList :points="topVoted(view)" :view="view" />
    </template>
  </section>
  <StepGroups :view="view" :indices="all" title="All points" open show-votes />
</template>
