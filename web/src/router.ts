import { createRouter, createWebHistory } from 'vue-router';
import ArchivePage from './pages/ArchivePage.vue';
import BoardPage from './pages/BoardPage.vue';
import CreatePage from './pages/CreatePage.vue';
import HomePage from './pages/HomePage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomePage },
    { path: '/new', component: CreatePage },
    { path: '/archive', component: ArchivePage },
    { path: '/s/:code', component: BoardPage, props: (r) => ({ code: String(r.params.code).toUpperCase(), admin: false }) },
    { path: '/s/:code/admin', component: BoardPage, props: (r) => ({ code: String(r.params.code).toUpperCase(), admin: true }) },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
