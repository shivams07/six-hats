<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
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
  try {
    const template = await api.saveTemplate(templateName.value, steps.value);
    templates.value = [...templates.value, template].sort((a, b) => a.name.localeCompare(b.name));
    templateName.value = '';
    showToast(`Saved template "${template.name}"`, 'info');
  } catch (e) {
    showToast(errorMessage(e));
  }
}

async function deleteSelectedTemplate() {
  const id = startFrom.value.slice('template:'.length);
  const template = templates.value.find((t) => t.id === id);
  if (!template || !confirm(`Delete the template "${template.name}"?`)) return;
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
  showToast(ok ? `${what} copied` : 'Could not copy; select the text instead', ok ? 'info' : 'error');
}
</script>

<template>
  <section v-if="created" class="card stack narrow">
    <h1>Session ready</h1>
    <p class="muted">Share the code or the invite link with your team.</p>
    <div class="code-big">{{ created.code }}</div>
    <div class="stack tight">
      <strong>Invite link</strong>
      <div class="link-box">{{ participantLink(created.code) }}</div>
      <div><button class="btn btn-small" @click="copy(participantLink(created.code), 'Invite link')">Copy invite link</button></div>
    </div>
    <div class="stack tight">
      <strong>Your admin link (keep it private)</strong>
      <div class="link-box">{{ adminLink(created.code, created.token) }}</div>
      <div><button class="btn btn-small" @click="copy(adminLink(created.code, created.token), 'Admin link')">Copy admin link</button></div>
      <p class="muted small">This browser remembers it. Anyone with the team passcode can also reopen the session from the archive.</p>
    </div>
    <div><button class="btn btn-primary" @click="router.push(`/s/${created.code}/admin`)">Open facilitator console</button></div>
  </section>

  <form v-else class="stack" @submit.prevent="create">
    <h1>New session</h1>
    <section class="card stack">
      <label class="field">
        <span>Title</span>
        <input v-model="title" :maxlength="LIMITS.title" required placeholder="Q4 pricing change" />
      </label>
      <label class="field">
        <span>Focus question</span>
        <textarea v-model="focus" :maxlength="LIMITS.focus" rows="2" required placeholder="Should we move the Pro plan to annual billing only?" />
      </label>
      <div class="row wrap">
        <label class="field grow">
          <span>Your name</span>
          <input v-model="name" :maxlength="LIMITS.name" required autocomplete="name" />
        </label>
        <label class="field">
          <span>Votes per person</span>
          <input v-model.number="votes" type="number" :min="LIMITS.minVotes" :max="LIMITS.maxVotes" required />
        </label>
      </div>
      <fieldset class="stack tight mode-choice">
        <legend>How do people write?</legend>
        <label>
          <input v-model="mode" type="radio" name="mode" value="everyone" />
          <span><strong>Everyone writes</strong> — each person adds their own points privately; they're revealed at 0:00.</span>
        </label>
        <label>
          <input v-model="mode" type="radio" name="mode" value="scribe" />
          <span><strong>A scribe takes notes</strong> — one person captures the discussion for everyone, visible as they type. You pick the scribe in the lobby.</span>
        </label>
      </fieldset>
    </section>

    <section class="card stack">
      <div class="row between wrap">
        <h2>Flow</h2>
        <div class="row wrap">
          <label class="sr-only" for="start-from">Start from</label>
          <select id="start-from" v-model="startFrom" @change="applyStart">
            <option value="blank">Blank</option>
            <optgroup label="Presets">
              <option v-for="p in PRESETS" :key="p.id" :value="`preset:${p.id}`">{{ p.name }}</option>
            </optgroup>
            <optgroup v-if="templates.length" label="Team templates">
              <option v-for="t in templates" :key="t.id" :value="`template:${t.id}`">{{ t.name }}</option>
            </optgroup>
          </select>
          <button v-if="startFrom.startsWith('template:')" type="button" class="btn btn-small btn-ghost" @click="deleteSelectedTemplate">Delete template</button>
        </div>
      </div>
      <FlowBuilder v-model="steps" />
      <div class="row wrap">
        <label class="sr-only" for="template-name">Template name</label>
        <input
          id="template-name"
          v-model="templateName"
          class="grow"
          :maxlength="LIMITS.templateName"
          placeholder="Name this flow to reuse it"
          @keydown.enter.prevent="templateName.trim() && saveTemplate()"
        />
        <button type="button" class="btn" :disabled="!templateName.trim()" @click="saveTemplate">Save as team template</button>
      </div>
    </section>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div><button class="btn btn-primary" :disabled="busy">Create session</button></div>
  </form>
</template>
