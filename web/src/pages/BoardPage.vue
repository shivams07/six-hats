<script setup lang="ts">
import { ref } from 'vue';
import { ArrowRight } from 'lucide-vue-next';
import { LIMITS } from '@shared/hats';
import { SOCKET_ERRORS } from '@shared/protocol';
import { api, ApiError, errorMessage, getToken, setToken } from '../api';
import SessionBoard from '../components/SessionBoard.vue';

const props = defineProps<{ code: string; admin: boolean }>();

const fromLink = new URLSearchParams(location.hash.slice(1)).get('t');
if (fromLink) {
  setToken(props.code, fromLink);
  history.replaceState(history.state, '', location.pathname);
}

const token = ref(getToken(props.code));
const name = ref('');
const error = ref('');
const busy = ref(false);
const notFound = ref(false);
const ended = ref(false);

async function join() {
  busy.value = true;
  error.value = '';
  try {
    const r = await api.join(props.code, name.value);
    setToken(props.code, r.token);
    token.value = r.token;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound.value = true;
    else if (e instanceof ApiError && e.status === 410) ended.value = true;
    else error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

function onRejected(reason: string) {
  setToken(props.code, null);
  token.value = null;
  if (reason === SOCKET_ERRORS.notFound) notFound.value = true;
  else error.value = 'Your link is no longer valid. Join again with your name.';
}
</script>

<template>
  <SessionBoard v-if="token" :key="token" :code="code" :token="token" @rejected="onRejected" />
  <section v-else-if="notFound" class="frame narrow notice">
    <h1>No session with code <span class="code">{{ code }}</span></h1>
    <p class="mute">Check the code with your facilitator. Codes are six letters and numbers.</p>
    <div><RouterLink to="/" class="btn">Try another code</RouterLink></div>
  </section>
  <section v-else-if="ended" class="frame narrow notice">
    <h1>This session is closed</h1>
    <p class="mute">Its decision and points are kept in the archive.</p>
    <div><RouterLink to="/archive" class="btn">Open the archive</RouterLink></div>
  </section>
  <section v-else-if="admin" class="frame narrow notice">
    <h1>This admin link is incomplete</h1>
    <p class="mute">It's missing its key. Open the session as facilitator from the archive instead.</p>
    <div><RouterLink to="/archive" class="btn">Open the archive</RouterLink></div>
  </section>
  <form v-else class="frame narrow notice" @submit.prevent="join">
    <h1>Join <span class="code">{{ code }}</span></h1>
    <p class="mute">No account needed. Your name is shown next to your points once they're revealed.</p>
    <label class="field">
      <span>Your name</span>
      <input v-model="name" :maxlength="LIMITS.name" autocomplete="name" required />
    </label>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div><button class="btn btn-primary" :disabled="busy || !name.trim()">Join session <ArrowRight aria-hidden="true" /></button></div>
  </form>
</template>

<style scoped>
.notice { display: flex; flex-direction: column; gap: var(--s4); padding: var(--s6); }
.code { font-stretch: 88%; letter-spacing: 0.14em; color: var(--violet); }
</style>
