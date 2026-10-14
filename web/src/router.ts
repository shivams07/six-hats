import { createRouter, createWebHistory } from 'vue-router';
import ArchivePage from './pages/ArchivePage.vue';
import CreatePage from './pages/CreatePage.vue';
import HomePage from './pages/HomePage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomePage },
    { path: '/new', component: CreatePage },
    { path: '/archive', component: ArchivePage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
