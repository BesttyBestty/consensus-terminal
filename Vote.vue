<template>
  <!-- 手机投票页：匿名，不登录，不显示其他人的分数 -->
  <div class="vote">
    <div class="brand">共识终端机 · 匿名投票</div>
    <div v-if="loading" class="state muted">加载中…</div>
    <div v-else-if="loadError" class="state"><h2>链接失效</h2><p class="muted">{{ loadError }}</p></div>
    <template v-else>
      <p class="muted small">{{ s.meetingTitle }} · 第 {{ s.round }} 轮</p>
      <h1>{{ s.question }}</h1>

      <div v-if="!s.open" class="state"><h2>本轮投票已结束</h2><p class="muted">请看投影屏上的结果。</p></div>

      <div v-else-if="submitted" class="state">
        <div class="big-score" :style="{ color: colorOf(score) }">{{ score }}</div>
        <h2>已匿名提交</h2>
        <p class="muted">主持人只能看到汇总结果。想改主意，可以重新打分。</p>
        <button style="margin-top:16px" @click="submitted = false">修改我的分数</button>
      </div>

      <template v-else>
        <p class="hint">你有多认同？<span class="muted">1 完全不同意 · 10 完全同意</span></p>
        <div class="scores">
          <button v-for="n in 10" :key="n" :class="{ on: score === n }"
            :style="score === n ? { background: colorOf(n), borderColor: colorOf(n), color: '#fff' } : {}"
            @click="score = n">{{ n }}</button>
        </div>
        <p class="stance" :style="{ color: score ? colorOf(score) : 'var(--muted)' }">{{ score ? stanceLabel(score) : '点一个分数' }}</p>

        <div v-if="s.options?.length" class="opts">
          <p class="hint">你更倾向哪个方向？（可选）</p>
          <label v-for="o in s.options" :key="o.id" class="opt" :class="{ on: choice === o.id }">
            <input type="radio" :value="o.id" v-model="choice" /> {{ o.text }}
          </label>
        </div>

        <textarea v-model="comment" rows="2" maxlength="280" placeholder="想补充的条件或顾虑（可选，匿名）"></textarea>
        <p v-if="submitError" class="error">{{ submitError }}</p>
        <button class="primary submit" :disabled="!score || busy" @click="submit">{{ busy ? '提交中…' : '匿名提交' }}</button>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api, STANCE_COLOR, stanceOf } from './api.js'

const sid = useRoute().params.sid
const s = ref(null)
const loading = ref(true)
const loadError = ref('')
const score = ref(null)
const choice = ref(null)
const comment = ref('')
const busy = ref(false)
const submitted = ref(false)
const submitError = ref('')

// 每台设备一个随机 token：服务端只保存哈希，用来让同一台手机“改票”而不是“多投”
function voterToken() {
  let t = localStorage.getItem('ct-voter-token')
  if (!t) {
    t = crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()
    localStorage.setItem('ct-voter-token', t)
  }
  return t
}

const colorOf = (n) => STANCE_COLOR[stanceOf(n)]
const stanceLabel = (n) => ({ agree: '同意', conditional: '有条件同意', disagree: '不同意' })[stanceOf(n)]

onMounted(async () => {
  try {
    s.value = await api.get(`/sessions/${sid}`)
  } catch (e) {
    loadError.value = e.message
  } finally {
    loading.value = false
  }
})

async function submit() {
  busy.value = true
  submitError.value = ''
  try {
    await api.post(`/sessions/${sid}/votes`, { score: score.value, choice: choice.value, comment: comment.value, voterToken: voterToken() })
    submitted.value = true
  } catch (e) {
    submitError.value = e.message
    if (/结束/.test(e.message)) s.value.open = false
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.vote { max-width: 480px; margin: 0 auto; padding: 20px 18px 40px; min-height: 100vh; }
.brand { color: var(--primary); font-weight: 700; margin-bottom: 14px; }
h1 { font-size: 20px; margin: 6px 0 18px; }
.hint { font-size: 14px; margin: 10px 0 8px; }
.hint span { font-size: 12px; margin-left: 6px; }
.scores { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.scores button { border-radius: 12px; height: 54px; font-size: 20px; font-weight: 600; padding: 0; }
.stance { text-align: center; font-weight: 600; margin: 10px 0; min-height: 22px; }
.opts { margin: 8px 0; }
.opt { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; margin-top: 6px; }
.opt.on { border-color: var(--primary); }
.opt input { width: auto; }
textarea { margin-top: 10px; }
.submit { width: 100%; height: 48px; font-size: 16px; margin-top: 14px; }
.state { text-align: center; padding: 40px 0; }
.big-score { font-size: 72px; font-weight: 800; }
</style>
