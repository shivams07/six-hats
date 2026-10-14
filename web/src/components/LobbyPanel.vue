<script setup lang="ts">
import { computed, ref } from 'vue';
import { Link, Play } from 'lucide-vue-next';
import { LIMITS, formatDuration } from '@shared/hats';
import type { View } from '@shared/protocol';
import { participantLink } from '../api';
import { copyText } from '../files';
import { scribeName } from '../points';
import { useRun } from '../session-context';
import { showToast } from '../toast';
import FlowEditor from './FlowEditor.vue';
import FlowOutline from './FlowOutline.vue';
import ScribePicker from './ScribePicker.vue';

const props = defineProps<{ view: View }>();
const run = useRun();
const needsScribe = computed(() => props.view.mode === 'scribe' && !props.view.scribeId);
const flowDirty = ref(false);
const host = computed(() => props.view.participants.find((p) => p.isFacilitator)?.name ?? 'the host');
const total = computed(() => formatDuration(props.view.steps.reduce((sum, s) => sum + s.durationSec, 0)));
const others = computed(() => props.view.participants.filter((p) => !p.isFacilitator).length);

async function copyInvite() {
  const ok = await copyText(participantLink(props.view.code));
  showToast(ok ? 'Invite link copied' : 'Could not copy. Share the code instead.', ok ? 'info' : 'error');
}
</script>

<template>
  <section v-if="view.me.isFacilitator" class="lobby frame">
    <div class="lobby-share">
      <div class="share-code">
        <span class="label">Session code</span>
        <span class="code">{{ view.code }}</span>
      </div>
      <div class="share-text">
        <h2>Get everyone in, then start</h2>
        <p class="mute">{{ others ? `${others} joined so far.` : 'Nobody has joined yet.' }} Share the code or the invite link; the flow can still change until you start.</p>
        <div class="row wrap">
          <button class="btn btn-sm" @click="copyInvite"><Link aria-hidden="true" /> Copy invite link</button>
        </div>
      </div>
      <div class="share-start">
        <button class="btn btn-primary start" :disabled="needsScribe || flowDirty" aria-describedby="start-hint" @click="run({ type: 'start' })">
          <Play aria-hidden="true" /> Start session
        </button>
        <p id="start-hint" class="mute small">
          <template v-if="needsScribe">Choose a scribe first.</template>
          <template v-else-if="flowDirty">Save or discard your flow changes first.</template>
          <template v-else>Opens hat 1 for everyone.</template>
        </p>
      </div>
    </div>
    <div v-if="view.mode === 'scribe'" class="lobby-scribe">
      <ScribePicker :view="view" />
      <span class="mute small">The scribe captures notes for everyone. You can hand the role over later.</span>
    </div>
    <div class="lobby-flow">
      <div class="section-head"><h2>Flow</h2><span class="mute small">{{ view.steps.length }} hats · {{ total }}</span></div>
      <FlowEditor :steps="view.steps" :start-number="1" :min-steps="LIMITS.minSteps" :max-steps="LIMITS.maxSteps" @dirty="flowDirty = $event" />
    </div>
  </section>

  <section v-else class="lobby frame">
    <div class="wait">
      <h2>Waiting for {{ host }} to start</h2>
      <p class="mute">
        {{ view.steps.length }} hats, about {{ total }}.
        <template v-if="view.mode === 'scribe'">
          {{ scribeName(view) ? `${scribeName(view)} will take notes for everyone.` : 'A scribe will take notes for everyone.' }}
        </template>
        <template v-else>You'll write privately under each hat; everyone's points open together at the end of its clock.</template>
      </p>
    </div>
    <FlowOutline :steps="view.steps" />
  </section>
</template>

<style scoped>
.lobby { display: flex; flex-direction: column; }
.lobby-share { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--s5); padding: var(--s5); align-items: center; border-bottom: 1px solid var(--ink); }
.share-code { display: flex; flex-direction: column; gap: var(--s1); padding-right: var(--s5); border-right: 1px solid var(--rule); }
.code { font-size: 2.5rem; font-weight: 760; font-stretch: 84%; letter-spacing: 0.14em; line-height: 1; color: var(--violet); }
.share-text { display: flex; flex-direction: column; gap: var(--s2); }
.share-start { display: flex; flex-direction: column; align-items: flex-end; gap: var(--s2); text-align: right; }
.start { height: 48px; padding: 0 var(--s5); font-size: var(--t-md); }
.lobby-scribe { display: flex; align-items: center; gap: var(--s4); flex-wrap: wrap; padding: var(--s3) var(--s5); border-bottom: 1px solid var(--rule); background: var(--paper); }
.lobby-flow { display: flex; flex-direction: column; gap: var(--s3); padding: var(--s5); }
.wait { display: flex; flex-direction: column; gap: var(--s2); padding: var(--s5); border-bottom: 1px solid var(--ink); }
.wait p { max-width: 70ch; }
@media (max-width: 860px) {
  .lobby-share { grid-template-columns: minmax(0, 1fr); }
  .share-code { border-right: 0; padding-right: 0; }
  .share-start { align-items: stretch; text-align: left; }
}
</style>
