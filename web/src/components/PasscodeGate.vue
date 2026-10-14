<script setup lang="ts">
import { ref } from 'vue';
import { Lock } from 'lucide-vue-next';
import { api, errorMessage, getPasscode } from '../api';

const unlocked = ref(getPasscode() !== null);
const value = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await api.checkPasscode(value.value);
    unlocked.value = true;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <slot v-if="unlocked" />
  <form v-else class="frame narrow gate" @submit.prevent="submit">
    <Lock class="gate-icon" :size="22" :stroke-width="1.75" aria-hidden="true" />
    <h1>Team passcode</h1>
    <p class="mute">Starting sessions, templates and the archive are for your team. Enter the passcode to continue.</p>
    <label class="field">
      <span>Passcode</span>
      <input v-model="value" type="password" autocomplete="current-password" required />
    </label>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div><button class="btn btn-primary" :disabled="busy || !value">Continue</button></div>
  </form>
</template>

<style scoped>
.gate { display: flex; flex-direction: column; gap: var(--s4); padding: var(--s6); }
.gate-icon { color: var(--violet); }
</style>
