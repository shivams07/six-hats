<script setup lang="ts">
import { ref } from 'vue';
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
  <section v-else-if="notFound" class="card stack narrow">
    <h1>Session not found</h1>
    <p>No session has the code <strong>{{ code }}</strong>. Check it and try again.</p>
    <div><RouterLink to="/" class="btn">Back home</RouterLink></div>
  </section>
  <section v-else-if="ended" class="card stack narrow">
    <h1>This session has ended</h1>
    <p class="muted">Its summary is in the archive.</p>
    <div><RouterLink to="/archive" class="btn">Open the archive</RouterLink></div>
  </section>
  <section v-else-if="admin" class="card stack narrow">
    <h1>Admin link incomplete</h1>
    <p class="muted">This link is missing its key. Open the session as facilitator from the archive.</p>
    <div><RouterLink to="/archive" class="btn">Open the archive</RouterLink></div>
  </section>
  <form v-else class="card stack narrow" @submit.prevent="join">
    <h1>Join session {{ code }}</h1>
    <label class="field">
      <span>Your name</span>
      <input v-model="name" :maxlength="LIMITS.name" autocomplete="name" required />
    </label>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div><button class="btn btn-primary" :disabled="busy || !name.trim()">Join</button></div>
  </form>
</template>
