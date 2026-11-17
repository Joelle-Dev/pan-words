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
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>'
  },
  {
    name: 'capture',
    label: '收词',
    path: '/capture',
    match: ['capture', 'reader'],
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M8 9h8"/><path d="M8 13h5"/></svg>'
  },
  {
    name: 'library',
    label: '词库',
    path: '/library',
    match: ['library', 'word'],
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H7v18H5.5A1.5 1.5 0 0 1 4 19.5z"/><path d="M7 3h3v18H7z"/><path d="m13 3.7 2.6-.7 4 15.4-2.6.7z"/></svg>'
  },
  {
    name: 'settings',
    label: '我的',
    path: '/settings',
    match: ['settings', 'stats'],
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"/></svg>'
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
