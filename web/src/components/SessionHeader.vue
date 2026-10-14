<script setup lang="ts">
import type { View } from '@shared/protocol';
import { adminLink, getToken, participantLink } from '../api';
import { copyText } from '../files';
import { STATUS_LABELS } from '../labels';
import { showToast } from '../toast';

const props = defineProps<{ view: View }>();
const token = getToken(props.view.code);

async function copy(text: string, what: string) {
  const ok = await copyText(text);
  showToast(ok ? `${what} copied` : 'Could not copy', ok ? 'info' : 'error');
}
</script>

<template>
  <header class="stack tight">
    <div class="row between wrap">
      <h1>{{ view.title }}</h1>
      <div class="row">
        <span class="tag">{{ STATUS_LABELS[view.status] }}</span>
        <span class="tag">Code {{ view.code }}</span>
      </div>
    </div>
    <p class="focus">{{ view.focus }}</p>
    <div v-if="view.status !== 'closed'" class="row wrap">
      <button class="btn btn-small" @click="copy(participantLink(view.code), 'Invite link')">Copy invite link</button>
      <button v-if="view.me.isFacilitator && token" class="btn btn-small btn-ghost" @click="copy(adminLink(view.code, token), 'Admin link')">
        Copy admin link
      </button>
    </div>
  </header>
</template>
