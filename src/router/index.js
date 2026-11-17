import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'today',
    component: () => import('../views/TodayView.vue')
  },
  {
    path: '/review',
    name: 'review',
    meta: { immersive: true },
    component: () => import('../views/ReviewView.vue')
  },
  {
    path: '/capture',
    name: 'capture',
    component: () => import('../views/CaptureView.vue')
  },
  {
    path: '/library',
    name: 'library',
    component: () => import('../views/LibraryView.vue')
  },
  {
    path: '/library/:noteId',
    name: 'word',
    component: () => import('../views/WordDetailView.vue')
  },
  {
    path: '/read/:articleId',
    name: 'reader',
    meta: { immersive: true },
    component: () => import('../views/ReaderView.vue')
  },
  {
    path: '/stats',
    name: 'stats',
    component: () => import('../views/StatsView.vue')
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/SettingsView.vue')
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  }
});

export default router;
