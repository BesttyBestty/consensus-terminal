<template>
  <div class="home">
    <header class="hero">
      <div class="brand">共识终端机 <span class="muted">Consensus Terminal</span></div>
      <h1>真正的问题不是会议太长，<br />而是决策没有生效。</h1>
      <p class="muted flow">会前准备 → 会中记录共识和分歧 → 手机扫码匿名投票（1–10 分）→ 输出行动点</p>
      <button class="ghost theme" @click="toggleTheme">切换深浅色</button>
    </header>

    <main class="grid">
      <section class="card">
        <h3>① 会前准备：新建会议</h3>
        <label class="field">会议名称 *</label>
        <input v-model="form.title" placeholder="例：产品模具评审" />
        <label class="field">本次会议需要决定</label>
        <input v-model="form.goal" placeholder="例：是否在 9 月 15 日前正式开模" />
        <label class="field">参会人员（用顿号或逗号分隔）</label>
        <input v-model="form.participants" placeholder="张伟、李娜、王强" />
        <label class="field">议题（每行一个）</label>
        <textarea v-model="form.agenda" rows="3" placeholder="产品结构是否已经冻结？"></textarea>
        <label class="field">
          会前材料 / 背景
          <button class="tiny" style="margin-left:6px" @click="fileInput.click()">从 .txt / .md 读入</button>
          <input ref="fileInput" type="file" accept=".txt,.md,.markdown" hidden @change="loadFile" />
        </label>
        <textarea v-model="form.preRead" rows="4" placeholder="报价、数据、背景，大家会前都应该看过的内容"></textarea>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="row" style="margin-top:12px">
          <button class="primary" :disabled="!form.title.trim() || busy" @click="create">开始会议 →</button>
          <button :disabled="busy" @click="loadDemo">载入示例：产品模具评审</button>
        </div>
      </section>

      <section class="card">
        <h3>历史会议</h3>
        <div v-if="!meetings.length" class="empty">还没有会议。可以先点“载入示例”看看完整流程。</div>
        <div v-for="m in meetings" :key="m.id" class="meeting-row" @click="$router.push(`/meeting/${m.id}`)">
          <div class="grow">
            <div class="t">{{ m.title }}</div>
            <div class="muted small">{{ m.goal || '未填写决策目标' }}</div>
          </div>
          <span class="tag" :class="m.status === 'ended' ? 'agree' : 'cond'">{{ m.status === 'ended' ? '已结束' : '进行中' }}</span>
          <span class="muted small">{{ m.counts.items }} 条共识/分歧 · {{ m.counts.actions }} 个行动点</span>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api, joinBaseUrl } from './api.js'

const router = useRouter()
const meetings = ref([])
const busy = ref(false)
const error = ref('')
const fileInput = ref(null)
const form = reactive({ title: '', goal: '', participants: '', agenda: '', preRead: '' })

onMounted(async () => {
  meetings.value = (await api.get('/meetings')).meetings
})

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  localStorage.setItem('ct-theme', next)
}

async function loadFile(e) {
  const f = e.target.files?.[0]
  if (!f) return
  form.preRead = (form.preRead ? form.preRead + '\n\n' : '') + (await f.text())
  e.target.value = ''
}

async function create() {
  busy.value = true
  error.value = ''
  try {
    const { meeting } = await api.post('/meetings', form)
    router.push(`/meeting/${meeting.id}`)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function loadDemo() {
  busy.value = true
  try {
    const { meeting } = await api.post('/demo', { baseUrl: await joinBaseUrl() })
    router.push(`/meeting/${meeting.id}`)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.home { max-width: 1100px; margin: 0 auto; padding: 32px 20px 60px; }
.hero { position: relative; margin-bottom: 24px; }
.brand { font-weight: 700; color: var(--primary); margin-bottom: 10px; }
.hero h1 { font-size: 30px; margin-bottom: 8px; }
.flow { font-size: 15px; }
.theme { position: absolute; top: 0; right: 0; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
@media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
.meeting-row { display: flex; gap: 10px; align-items: center; padding: 10px; border-radius: 10px; cursor: pointer; }
.meeting-row:hover { background: var(--surface-2); }
.meeting-row .t { font-weight: 600; }
</style>
