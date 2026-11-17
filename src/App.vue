<template>
  <div class="app-shell" :class="{ 'is-immersive': isImmersive }">
    <RouterView v-slot="{ Component }">
      <Transition :name="pageTransition" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>

    <nav v-if="!isImmersive" class="tabbar" aria-label="主导航">
      <button
        v-for="tab in tabs"
        :key="tab.name"
        class="tabbar-item"
        :class="{ 'is-active': isActive(tab) }"
        type="button"
        :aria-current="isActive(tab) ? 'page' : undefined"
        :aria-label="tab.label"
        @click="go(tab)"
      >
        <span v-html="tab.icon" aria-hidden="true"></span>
        <span>{{ tab.label }}</span>
      </button>
    </nav>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { requestPersistence } from './lib/storage';
import { useLibrary } from './composables/useLibrary';

const route = useRoute();
const router = useRouter();
const library = useLibrary();

const isImmersive = computed(() => Boolean(route.meta.immersive));
const pageTransition = computed(() => route.meta.transition || 'page-fade');

const TABS = [
  {
    name: 'today',
    label: '今天',
    path: '/',
    match: ['today'],
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 2"/></svg>'
  },
  {
    name: 'capture',
    label: '收词',
    path: '/capture',
    match: ['capture', 'reader'],
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 5.6A1.1 1.1 0 0 1 5.6 4.5H18.4a1.1 1.1 0 0 1 1.1 1.1v12.8a1.1 1.1 0 0 1-1.1 1.1H5.6a1.1 1.1 0 0 1-1.1-1.1z"/><path d="M8.2 9h7.6"/><path d="M8.2 13h4.6"/></svg>'
  },
  {
    name: 'library',
    label: '词库',
    path: '/library',
    match: ['library', 'word'],
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.6 5A1.4 1.4 0 0 1 6 3.6h1.6v16.8H6A1.4 1.4 0 0 1 4.6 19z"/><path d="M7.6 3.6h2.8v16.8H7.6z"/><path d="m13.2 4.2 2.5-.7 3.7 14.9-2.5.7z"/></svg>'
  },
  {
    name: 'settings',
    label: '我的',
    path: '/settings',
    match: ['settings', 'stats'],
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.2" r="3.3"/><path d="M5 19.4c0-3.4 3.1-5.6 7-5.6s7 2.2 7 5.6"/></svg>'
  }
];

const tabs = TABS;

function isActive(tab) {
  return tab.match.includes(route.name);
}

function go(tab) {
  if (route.path !== tab.path) router.push(tab.path);
}

onMounted(() => {
  requestPersistence().catch(() => {});
  library.reload().catch((err) => console.error('加载词库失败', err));
});
</script>
