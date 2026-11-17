<template>
  <span class="brand" :class="{ 'brand--tiny': tiny }">
    <span class="brand-mark" aria-hidden="true">
      <img
        v-if="!imageFailed"
        :src="logoSrc"
        alt=""
        @error="imageFailed = true"
      >
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
        <path d="M4.5 5.2A1.2 1.2 0 0 1 5.7 4H18a.9.9 0 0 1 .9.9v14.2a.9.9 0 0 1-.9.9H5.7a1.2 1.2 0 0 1-1.2-1.2z"></path>
        <path d="M9 9h6"></path>
        <path d="M9 12.6h4.2"></path>
      </svg>
    </span>
    <span v-if="!iconOnly" class="brand-name">Pan</span>
    <span v-if="!iconOnly && $slots.default" class="brand-suffix"><slot /></span>
  </span>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
  iconOnly: { type: Boolean, default: false },
  tiny: { type: Boolean, default: false }
});

// 换 logo 时只要替换 public/logo.png（透明背景），不用改任何代码。
const logoSrc = `${import.meta.env.BASE_URL}logo.png`;
const imageFailed = ref(false);
</script>
