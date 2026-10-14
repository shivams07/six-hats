<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Copy, Download, RotateCw } from 'lucide-vue-next';
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
const ranked = computed(() => topVoted(props.view));

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
  showToast(ok ? 'Summary copied as Markdown' : 'Could not copy. Download it instead.', ok ? 'info' : 'error');
}

function download() {
  if (markdown.value) downloadText(`six-hats-${props.view.code}.md`, markdown.value);
}
</script>

<template>
  <section class="result frame">
    <div class="result-head">
      <div class="title">
        <h2>Result</h2>
        <p class="mute small">Closed {{ new Date(view.closedAt ?? view.createdAt).toLocaleString() }} · {{ view.participants.length }} people</p>
      </div>
      <div class="row wrap">
        <button class="btn btn-sm" :disabled="!markdown" @click="copy"><Copy aria-hidden="true" /> Copy Markdown</button>
        <button class="btn btn-sm btn-primary" :disabled="!markdown" @click="download"><Download aria-hidden="true" /> Download .md</button>
      </div>
    </div>
    <p v-if="loadError" class="load-error error" role="alert">
      <span>Couldn't prepare the Markdown: {{ loadError }}</span>
      <button class="btn btn-sm" :disabled="loading" @click="load"><RotateCw aria-hidden="true" /> Try again</button>
    </p>
    <div class="result-decision">
      <h3>Decision</h3>
      <p class="decision-text" :class="{ mute: !view.decision }">{{ view.decision || 'No decision was recorded.' }}</p>
    </div>
    <div class="result-actions">
      <h3>Action items</h3>
      <ActionList :actions="view.actions" />
    </div>
    <div v-if="view.votingClosed" class="result-top">
      <h3 class="top-title">Top voted</h3>
      <RankedList :points="ranked" :view="view" />
    </div>
  </section>
  <StepGroups :view="view" :indices="all" title="Every point" show-votes />
</template>

<style scoped>
.result { display: flex; flex-direction: column; }
.result-head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--s4); flex-wrap: wrap; padding: var(--s5); border-bottom: 1px solid var(--ink); }
.title { display: flex; flex-direction: column; gap: var(--s1); }
.load-error { display: flex; align-items: center; gap: var(--s3); flex-wrap: wrap; padding: var(--s3) var(--s5); background: var(--danger-wash); border-bottom: 1px solid var(--rule); }
.result-decision, .result-actions { display: flex; flex-direction: column; gap: var(--s3); padding: var(--s5); }
.result-actions { border-top: 1px solid var(--rule); }
.decision-text { font-size: var(--t-xl); font-weight: 560; line-height: 1.35; white-space: pre-wrap; max-width: 60ch; }
.result-top { border-top: 1px solid var(--rule); }
.top-title { padding: var(--s5) var(--s5) var(--s3); border-bottom: 1px solid var(--ink); }
</style>
