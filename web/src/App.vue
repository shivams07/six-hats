<script setup lang="ts">
import ToastHost from './components/ToastHost.vue';
</script>

<template>
  <header class="topbar"><RouterLink to="/" class="brand">🎩 Six Hats</RouterLink></header>
  <main class="container"><RouterView :key="$route.path" /></main>
  <ToastHost />
</template>
