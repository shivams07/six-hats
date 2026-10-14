import { createRouter, createWebHistory } from 'vue-router';
import ArchivePage from './pages/ArchivePage.vue';
import HomePage from './pages/HomePage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomePage },
    { path: '/archive', component: ArchivePage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
