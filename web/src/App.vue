<script setup lang="ts">
import ToastHost from './components/ToastHost.vue';
</script>

<template>
  <header class="appbar">
    <div class="appbar-inner">
      <RouterLink to="/" class="wordmark" aria-label="Six Hats home">
        <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">
          <g fill="currentColor"><rect x="2" y="1" width="2" height="16" /><rect x="7" y="1" width="2" height="16" /><rect x="12" y="1" width="2" height="16" /><rect x="17" y="1" width="2" height="16" /></g>
          <rect x="-1" y="8" width="24" height="2" fill="var(--violet)" transform="rotate(-28 11 9)" />
        </svg>
        <span class="wordmark-text">Six Hats</span>
      </RouterLink>
      <nav class="appnav" aria-label="Main">
        <RouterLink to="/">Join</RouterLink>
        <RouterLink to="/new">New session</RouterLink>
        <RouterLink to="/archive">Archive</RouterLink>
      </nav>
    </div>
  </header>
  <main class="page"><RouterView :key="$route.path" /></main>
  <ToastHost />
</template>
