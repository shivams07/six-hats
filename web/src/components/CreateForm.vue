<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight, Copy, Save, Trash2 } from 'lucide-vue-next';
import { HATS, LIMITS, PRESETS, presetSteps, type FlowStep } from '@shared/hats';
import type { Template, WritingMode } from '@shared/protocol';
import { adminLink, api, errorMessage, participantLink, setToken } from '../api';
import { copyText } from '../files';
import { showToast } from '../toast';
import FlowBuilder from './FlowBuilder.vue';

const DEFAULT_PRESET = PRESETS[2]!;

const router = useRouter();
const title = ref('');
const focus = ref('');
const name = ref('');
const votes = ref(3);
const mode = ref<WritingMode>('everyone');
const steps = ref<FlowStep[]>(presetSteps(DEFAULT_PRESET.hats));
const startFrom = ref(`preset:${DEFAULT_PRESET.id}`);
const templates = ref<Template[]>([]);
const templateName = ref('');
const busy = ref(false);
const savingTemplate = ref(false);
const error = ref('');
const created = ref<{ code: string; token: string } | null>(null);

onMounted(async () => {
  try {
    templates.value = await api.listTemplates();
  } catch {
    // Templates are optional; the presets still work.
  }
});

function applyStart() {
  const [kind, id] = startFrom.value.split(':');
  if (kind === 'blank') steps.value = [{ hat: 'blue', durationSec: HATS.blue.defaultDurationSec }];
  if (kind === 'preset') {
    const preset = PRESETS.find((p) => p.id === id);
    if (preset) steps.value = presetSteps(preset.hats);
  }
  if (kind === 'template') {
    const template = templates.value.find((t) => t.id === id);
    if (template) steps.value = template.steps.map((s) => ({ ...s }));
  }
}

async function saveTemplate() {
  if (savingTemplate.value) return;
  savingTemplate.value = true;
  try {
    const template = await api.saveTemplate(templateName.value, steps.value);
    templates.value = [...templates.value, template].sort((a, b) => a.name.localeCompare(b.name));
    templateName.value = '';
    showToast(`Saved “${template.name}” for your team`, 'info');
  } catch (e) {
    showToast(errorMessage(e));
  } finally {
    savingTemplate.value = false;
  }
}

async function deleteSelectedTemplate() {
  const id = startFrom.value.slice('template:'.length);
  const template = templates.value.find((t) => t.id === id);
  if (!template || !confirm(`Delete the team template “${template.name}”? The flow below resets to ${DEFAULT_PRESET.name}.`)) return;
  try {
    await api.deleteTemplate(id);
    templates.value = templates.value.filter((t) => t.id !== id);
    startFrom.value = `preset:${DEFAULT_PRESET.id}`;
    applyStart();
  } catch (e) {
    showToast(errorMessage(e));
  }
}

async function create() {
  busy.value = true;
  error.value = '';
  try {
    const r = await api.createSession({
      title: title.value,
      focus: focus.value,
      facilitatorName: name.value,
      votesPerPerson: votes.value,
      mode: mode.value,
      steps: steps.value,
    });
    setToken(r.code, r.facilitatorToken);
    created.value = { code: r.code, token: r.facilitatorToken };
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

async function copy(text: string, what: string) {
  const ok = await copyText(text);
  showToast(ok ? `${what} copied` : 'Could not copy. Select the link instead.', ok ? 'info' : 'error');
}
</script>

<template>
  <section v-if="created" class="ready frame">
    <div class="ready-head">
      <h1>Session ready</h1>
      <p class="mute">Share the code or the invite link with your team. Keep the admin link to yourself.</p>
    </div>
    <div class="ready-code">
      <span class="label">Session code</span>
      <span class="code">{{ created.code }}</span>
    </div>
    <div class="links">
      <div class="link">
        <span class="label">Invite link</span>
        <span class="link-box">{{ participantLink(created.code) }}</span>
        <button class="btn btn-sm" @click="copy(participantLink(created.code), 'Invite link')"><Copy aria-hidden="true" /> Copy</button>
      </div>
      <div class="link">
        <span class="label">Admin link · private</span>
        <span class="link-box">{{ adminLink(created.code, created.token) }}</span>
        <button class="btn btn-sm" @click="copy(adminLink(created.code, created.token), 'Admin link')"><Copy aria-hidden="true" /> Copy</button>
      </div>
      <p class="mute small">This browser remembers the admin link. Anyone with the team passcode can also reopen the session from the archive.</p>
    </div>
    <div class="ready-foot"><button class="btn btn-primary" @click="router.push(`/s/${created.code}/admin`)">Open the board <ArrowRight aria-hidden="true" /></button></div>
  </section>

  <form v-else class="create" @submit.prevent="create">
    <div class="create-head">
      <h1>New session</h1>
      <p class="mute">Set the question, choose who writes, then lay out the hats in the order your team should wear them.</p>
    </div>

    <section class="block">
      <h2>The question</h2>
      <div class="grid">
        <label class="field span-2">
          <span>Title</span>
          <input v-model="title" :maxlength="LIMITS.title" required placeholder="e.g. Q4 pricing change" />
        </label>
        <label class="field span-2">
          <span>Focus question</span>
          <textarea v-model="focus" :maxlength="LIMITS.focus" rows="2" required placeholder="e.g. Should we move the Pro plan to annual billing only?" />
          <span class="hint">Everyone sees this under every hat. Phrase it as one question.</span>
        </label>
        <label class="field">
          <span>Your name</span>
          <input v-model="name" :maxlength="LIMITS.name" required autocomplete="name" />
        </label>
        <label class="field">
          <span>Votes per person</span>
          <input v-model.number="votes" type="number" :min="LIMITS.minVotes" :max="LIMITS.maxVotes" required />
        </label>
      </div>
    </section>

    <section class="block">
      <h2>Who writes</h2>
      <fieldset class="modes">
        <legend class="sr-only">Writing mode</legend>
        <label class="mode">
          <input v-model="mode" type="radio" name="mode" value="everyone" />
          <span><strong>Everyone writes</strong><span class="mute">Each person writes privately. Points stay sealed until the hat's clock runs out, then everyone's open together.</span></span>
        </label>
        <label class="mode">
          <input v-model="mode" type="radio" name="mode" value="scribe" />
          <span><strong>A scribe takes notes</strong><span class="mute">The team talks; one person captures each point for everyone, visible as it's typed. You pick the scribe in the lobby.</span></span>
        </label>
      </fieldset>
    </section>

    <section class="block">
      <div class="section-head">
        <h2>Hat flow</h2>
        <div class="row wrap">
          <label class="label" for="start-from">Start from</label>
          <select id="start-from" v-model="startFrom" class="start-from" @change="applyStart">
            <option value="blank">Blank</option>
            <optgroup label="Presets">
              <option v-for="p in PRESETS" :key="p.id" :value="`preset:${p.id}`">{{ p.name }}</option>
            </optgroup>
            <optgroup v-if="templates.length" label="Team templates">
              <option v-for="t in templates" :key="t.id" :value="`template:${t.id}`">{{ t.name }}</option>
            </optgroup>
          </select>
          <button v-if="startFrom.startsWith('template:')" type="button" class="btn btn-sm btn-quiet" @click="deleteSelectedTemplate">
            <Trash2 aria-hidden="true" /> Delete template
          </button>
        </div>
      </div>
      <FlowBuilder v-model="steps" />
      <div class="save-template">
        <label class="sr-only" for="template-name">Template name</label>
        <input
          id="template-name"
          v-model="templateName"
          :maxlength="LIMITS.templateName"
          placeholder="Name this flow to reuse it, e.g. Quarterly bet review"
          @keydown.enter.prevent="templateName.trim() && saveTemplate()"
        />
        <button type="button" class="btn" :disabled="!templateName.trim() || savingTemplate" @click="saveTemplate"><Save aria-hidden="true" /> Save as team template</button>
      </div>
    </section>

    <div class="submit">
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="btn btn-primary submit-btn" :disabled="busy">Create session <ArrowRight aria-hidden="true" /></button>
    </div>
  </form>
</template>

<style scoped>
.create { display: flex; flex-direction: column; gap: var(--s6); max-width: 1040px; }
.create-head { display: flex; flex-direction: column; gap: var(--s2); max-width: 64ch; }
.block { display: flex; flex-direction: column; gap: var(--s4); padding-top: var(--s5); border-top: 1px solid var(--ink); }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s4) var(--s5); }
.span-2 { grid-column: 1 / -1; }
.modes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s3); }
.mode { display: flex; gap: var(--s3); padding: var(--s4); background: var(--sheet); border: 1px solid var(--rule-strong); cursor: pointer; transition: border-color 150ms, background-color 150ms; }
.mode:hover { border-color: var(--n6); }
.mode:has(input:checked) { border-color: var(--violet); background: var(--violet-wash); box-shadow: inset 0 0 0 1px var(--violet); }
.mode > span { display: flex; flex-direction: column; gap: var(--s1); font-size: var(--t-sm); }
.mode strong { font-size: var(--t-md); }
.start-from { width: auto; min-width: 200px; height: 36px; padding-top: 4px; padding-bottom: 4px; font-size: var(--t-sm); }
.save-template { display: flex; gap: var(--s2); }
.save-template input { max-width: 520px; }
.submit { display: flex; align-items: center; justify-content: flex-end; gap: var(--s4); padding-top: var(--s5); border-top: 1px solid var(--ink); flex-wrap: wrap; }
.submit-btn { height: 48px; padding: 0 var(--s5); font-size: var(--t-md); }

.ready { max-width: 720px; margin: var(--s5) auto; display: flex; flex-direction: column; }
.ready-head { display: flex; flex-direction: column; gap: var(--s2); padding: var(--s6) var(--s6) var(--s5); }
.ready-code { display: flex; flex-direction: column; gap: var(--s1); padding: var(--s5) var(--s6); border-top: 1px solid var(--ink); border-bottom: 1px solid var(--rule); }
.code { font-size: 3.5rem; font-weight: 780; font-stretch: 84%; letter-spacing: 0.16em; line-height: 1; color: var(--violet); }
.links { display: flex; flex-direction: column; gap: var(--s4); padding: var(--s5) var(--s6); }
.link { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--s2) var(--s3); align-items: center; }
.link .label { grid-column: 1 / -1; }
.link-box { padding: 7px 12px; background: var(--paper); border: 1px solid var(--rule); font-size: var(--t-sm); overflow-wrap: anywhere; }
.ready-foot { padding: var(--s4) var(--s6); border-top: 1px solid var(--ink); background: var(--paper); display: flex; justify-content: flex-end; }
@media (max-width: 760px) {
  .grid, .modes { grid-template-columns: minmax(0, 1fr); }
  .save-template { flex-direction: column; }
  .submit-btn { width: 100%; }
  .ready-head, .ready-code, .links { padding-left: var(--s4); padding-right: var(--s4); }
  .code { font-size: 2.5rem; }
}
</style>
