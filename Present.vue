<template>
  <!-- 投影屏：只显示当前问题、二维码和实时结果 -->
  <div class="present" data-theme="dark">
    <div v-if="!meeting" class="center">{{ error || '连接中…' }}</div>
    <template v-else>
      <header>
        <span class="brand">共识终端机</span>
        <span>{{ meeting.title }}</span>
      </header>
      <div v-if="!current" class="center">
        <h1>{{ meeting.goal || meeting.title }}</h1>
        <p class="sub">等待主持人发起投票…</p>
      </div>
      <main v-else class="stage">
        <div class="left">
          <div class="round">第 {{ current.round }} 轮 · {{ current.open ? '扫码匿名打分 1–10' : '本轮已结束' }}</div>
          <h1>{{ current.question }}</h1>
          <div v-if="current.open && qr" class="qr">
            <img :src="qr.qrDataUrl" alt="投票二维码" />
            <div class="url">{{ qr.joinUrl }}</div>
          </div>
        </div>
        <div class="right">
          <div class="strength" :class="current.results.strength.level">{{ current.results.strength.label }}</div>
          <ScoreChart :results="current.results" big />
        </div>
      </main>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api, useMeetingStream } from './api.js'
import ScoreChart from './ScoreChart.vue'

const id = useRoute().params.id
const { meeting, sessions, error } = useMeetingStream(id)
const current = computed(() => sessions.value.find((s) => s.open) || sessions.value[sessions.value.length - 1] || null)
const qr = ref(null)
watch(() => current.value?.id, async (sid) => {
  qr.value = sid ? await api.get(`/sessions/${sid}/qr`) : null
}, { immediate: true })
</script>

<style scoped>
.present {
  --bg: #0f0e13; --surface-2: #26232d; --text: #f3eff7; --muted: #a9a3b2;
  --agree: #81c784; --cond: #ffb74d; --disagree: #ef9a9a; --primary: #d0bcff;
  min-height: 100vh; background: var(--bg); color: var(--text); padding: 3vh 4vw;
}
header { display: flex; justify-content: space-between; font-size: 20px; color: var(--muted); }
.brand { color: var(--primary); font-weight: 700; }
.center { text-align: center; padding-top: 25vh; }
.center h1 { font-size: 56px; }
.sub { font-size: 24px; color: var(--muted); margin-top: 16px; }
.stage { display: grid; grid-template-columns: 1fr 1.2fr; gap: 5vw; margin-top: 4vh; align-items: start; }
.round { font-size: 22px; color: var(--muted); }
h1 { font-size: clamp(28px, 3vw, 52px); margin: 12px 0 28px; }
.qr img { width: min(32vh, 30vw); background: #fff; border-radius: 16px; padding: 12px; }
.url { color: var(--muted); font-size: 16px; margin-top: 8px; word-break: break-all; }
.strength { font-size: 40px; font-weight: 700; margin-bottom: 24px; }
.strength.strong { color: var(--agree); } .strength.conditional, .strength.weak { color: var(--cond); }
.strength.split { color: var(--disagree); } .strength.none { color: var(--muted); }
</style>
