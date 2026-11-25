<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'

// 主题沿用原型：浅色 / 深色，记在 localStorage
onMounted(() => {
  const saved = localStorage.getItem('ct-theme')
  const dark = saved ? saved === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})
</script>
