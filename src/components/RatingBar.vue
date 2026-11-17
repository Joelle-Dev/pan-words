<template>
  <div class="rating-bar" role="group" aria-label="复习评分">
    <button
      v-for="item in buttons"
      :key="item.rating"
      class="rating-btn"
      type="button"
      :data-rating="item.rating"
      :aria-label="item.label"
      @click="emit('rate', item.rating)"
    >
      <span>{{ item.label }}</span>
      <small v-if="showPreview && preview">{{ preview[item.rating]?.label }}</small>
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  preview: { type: Object, default: null },
  showPreview: { type: Boolean, default: false }
});

const emit = defineEmits(['rate']);

const buttons = [
  { rating: 1, label: '忘记' },
  { rating: 2, label: '模糊' },
  { rating: 3, label: '记得' },
  { rating: 4, label: '太简单' }
];
</script>
