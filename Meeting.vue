<template>
  <div v-if="error" class="center error">{{ error }} · <router-link to="/">返回首页</router-link></div>
  <div v-else-if="!meeting" class="center muted">加载中…</div>
  <div v-else class="room">
    <!-- 顶栏 -->
    <header class="top">
      <router-link to="/" class="back">← 会议列表</router-link>
      <div class="grow">
        <h2>{{ meeting.title }} <span class="tag" :class="meeting.status === 'ended' ? 'agree' : 'cond'">{{ meeting.status === 'ended' ? '已结束' : '进行中' }}</span></h2>
        <div class="muted small">需要决定：{{ meeting.goal || '（未填写）' }}　<span :class="connected ? '' : 'error'">● {{ connected ? '实时同步中' : '连接中断，自动重连…' }}</span></div>
      </div>
      <button @click="openPresent">投影模式 ↗</button>
      <a :href="`/api/meetings/${id}/export.md`"><button>导出 Markdown</button></a>
      <button v-if="meeting.status !== 'ended'" class="primary" @click="endMeeting">结束会议</button>
      <button v-else @click="reopen">重新打开</button>
    </header>

    <div class="cols">
      <!-- 左：会前 + 记录 -->
      <section class="col">
        <div class="card">
          <h3>会前准备 <button class="ghost tiny" @click="editPrep = !editPrep">{{ editPrep ? '收起' : '编辑' }}</button></h3>
          <template v-if="!editPrep">
            <div v-if="meeting.participants.length" class="small"><span class="muted">参会：</span>{{ meeting.participants.join('、') }}</div>
            <ol v-if="meeting.agenda.length" class="agenda"><li v-for="a in meeting.agenda" :key="a">{{ a }}</li></ol>
            <details v-if="meeting.preRead" class="small"><summary class="muted">会前材料</summary><p class="pre">{{ meeting.preRead }}</p></details>
            <div v-if="!meeting.agenda.length && !meeting.preRead" class="empty">还没有议题和材料。</div>
          </template>
          <template v-else>
            <label class="field">需要决定</label><input v-model="prep.goal" />
            <label class="field">参会人员</label><input v-model="prep.participants" />
            <label class="field">议题（每行一个）</label><textarea v-model="prep.agenda" rows="3"></textarea>
            <label class="field">会前材料</label><textarea v-model="prep.preRead" rows="4"></textarea>
            <button class="primary" style="margin-top:8px" @click="savePrep">保存</button>
          </template>
        </div>

        <div class="card notes-card">
          <h3>会中记录 <span class="tag">{{ meeting.notes.length }}</span></h3>
          <div class="notes" ref="notesBox">
            <div v-for="n in meeting.notes" :key="n.id" class="note">
              <b>{{ n.speaker }}</b>：{{ n.text }}
              <span class="note-actions">
                <button class="tiny" title="记为共识" @click="promote(n, 'consensus')">→共识</button>
                <button class="tiny" title="记为分歧" @click="promote(n, 'disagreement')">→分歧</button>
                <button class="tiny ghost" @click="api.del(`/meetings/${id}/notes/${n.id}`)">✕</button>
              </span>
            </div>
            <div v-if="!meeting.notes.length" class="empty">谁说了什么，随手记下来。</div>
          </div>
          <div class="row">
            <input v-model="note.speaker" list="people" placeholder="发言人" style="width:90px" />
            <datalist id="people"><option v-for="p in people" :key="p" :value="p" /></datalist>
            <input v-model="note.text" class="grow" placeholder="记录内容，回车添加" @keyup.enter="addNote" />
          </div>
        </div>
      </section>

      <!-- 中：共识 / 分歧 -->
      <section class="col">
        <div class="card">
          <h3>
            <span class="tag agree">共识</span>
            <span class="grow"></span>
            <button class="tiny" :disabled="aiBusy" @click="runAI">{{ aiBusy ? '提取中…' : `AI 提取候选（${aiModeLabel}）` }}</button>
          </h3>
          <div v-for="it in consensus" :key="it.id" class="item">
            <div class="grow">{{ it.text }}</div>
            <button class="tiny" @click="startVote({ itemId: it.id })">投票</button>
            <button class="tiny ghost" title="改为分歧" @click="api.patch(`/meetings/${id}/items/${it.id}`, { type: 'disagreement' })">⇄</button>
            <button class="tiny ghost" @click="api.del(`/meetings/${id}/items/${it.id}`)">✕</button>
          </div>
          <div v-if="!consensus.length" class="empty">大家已经一致的点。</div>
        </div>

        <div class="card">
          <h3><span class="tag disagree">分歧</span></h3>
          <div v-for="it in disputes" :key="it.id" class="item">
            <div class="grow">
              {{ it.text }}
              <div v-if="it.reason" class="muted small">原因：{{ it.reason }}</div>
              <div v-for="o in it.options" :key="o.id" class="small opt">· {{ o.text }}</div>
            </div>
            <button class="tiny" @click="startVote({ itemId: it.id })">投票</button>
            <button class="tiny ghost" title="改为共识" @click="api.patch(`/meetings/${id}/items/${it.id}`, { type: 'consensus' })">⇄</button>
            <button class="tiny ghost" @click="api.del(`/meetings/${id}/items/${it.id}`)">✕</button>
          </div>
          <div v-if="!disputes.length" class="empty">还没对齐的点，以及为什么。</div>
        </div>

        <div class="card">
          <div class="row">
            <select v-model="draft.type" style="width:90px">
              <option value="consensus">共识</option>
              <option value="disagreement">分歧</option>
            </select>
            <input v-model="draft.text" class="grow" placeholder="新增一条" @keyup.enter="addItem" />
            <button @click="addItem">添加</button>
          </div>
          <template v-if="draft.type === 'disagreement'">
            <input v-model="draft.reason" placeholder="分歧原因（可选），例：成本风险" style="margin-top:8px" />
            <textarea v-model="draft.options" rows="2" placeholder="可选观点，每行一个（手机投票时可以选）" style="margin-top:8px"></textarea>
          </template>
        </div>

        <div v-if="ai" class="card ai">
          <h3>AI 候选 <span class="tag">{{ ai.mode === 'mock' ? '本地规则 mock' : '模型' }}</span><span class="grow"></span><button class="ghost tiny" @click="ai = null">✕</button></h3>
          <p class="small muted">{{ ai.summary }}</p>
          <div v-for="(c, i) in ai.consensus" :key="'c' + i" class="item small"><span class="grow">{{ c.text }}</span><button class="tiny" @click="adopt('consensus', c)">采纳为共识</button></div>
          <div v-for="(d, i) in ai.disagreements" :key="'d' + i" class="item small"><span class="grow">{{ d.text }}</span><button class="tiny" @click="adopt('disagreement', d)">采纳为分歧</button></div>
          <div v-for="(a, i) in ai.actions" :key="'a' + i" class="item small"><span class="grow">{{ a.task }} — {{ a.owner || '待定' }} {{ a.deadline }}</span><button class="tiny" @click="api.post(`/meetings/${id}/actions`, a)">加入行动点</button></div>
          <div v-if="ai.candidateDecision" class="item small"><span class="grow">候选决策：{{ ai.candidateDecision }}</span><button class="tiny" @click="voteQuestion = ai.candidateDecision">用来投票</button></div>
        </div>
      </section>

      <!-- 右：投票 -->
      <section class="col">
        <div class="card">
          <h3>扫码匿名投票（1–10）</h3>
          <div class="row">
            <input v-model="voteQuestion" class="grow" placeholder="要确认的问题，例：是否同意选择 B 厂…" @keyup.enter="startVote({ question: voteQuestion })" />
            <button class="primary" :disabled="!voteQuestion.trim()" @click="startVote({ question: voteQuestion })">发起</button>
          </div>
          <p v-if="voteError" class="error">{{ voteError }}</p>
        </div>

        <div v-if="current" class="card">
          <div class="row">
            <span class="tag">第 {{ current.round }} 轮</span>
            <span class="tag" :class="current.open ? 'agree' : ''">{{ current.open ? '投票中' : '已结束' }}</span>
            <span class="grow"></span>
            <button v-if="current.open" class="tiny" @click="api.post(`/sessions/${current.id}/close`)">结束本轮</button>
            <button v-else class="tiny" @click="api.post(`/sessions/${current.id}/reopen`)">重新开放</button>
          </div>
          <p class="question">{{ current.question }}</p>
          <div v-if="current.open && qr[current.id]" class="qr">
            <img :src="qr[current.id].qrDataUrl" alt="投票二维码" />
            <a :href="qr[current.id].joinUrl" target="_blank" class="small">{{ qr[current.id].joinUrl }}</a>
          </div>
          <div class="row" style="margin:6px 0 10px">
            <span class="badge-strength" :class="current.results.strength.level">{{ current.results.strength.label }}</span>
          </div>
          <ScoreChart :results="current.results" />
          <div v-if="current.results.comments.length" class="small" style="margin-top:10px">
            <div class="muted">匿名补充：</div>
            <div v-for="(c, i) in current.results.comments" :key="i">“{{ c }}”</div>
          </div>
        </div>

        <div v-if="sessions.length > 1" class="card">
          <h3>轮次对比</h3>
          <table class="rounds">
            <tr><th>轮</th><th>问题</th><th>人数</th><th>均值</th><th>同意/有条件/不同意</th><th>强度</th></tr>
            <tr v-for="s in sessions" :key="s.id" :class="{ on: s.id === current?.id }" @click="focusId = s.id">
              <td>{{ s.round }}</td>
              <td class="q">{{ s.question }}</td>
              <td>{{ s.results.count }}</td>
              <td>{{ s.results.mean ?? '–' }}</td>
              <td>{{ s.results.stances.agree }}/{{ s.results.stances.conditional }}/{{ s.results.stances.disagree }}</td>
              <td><span class="badge-strength tiny-badge" :class="s.results.strength.level">{{ s.results.strength.label }}</span></td>
            </tr>
          </table>
        </div>
      </section>
    </div>

    <!-- 底部：决策卡 + 行动点 -->
    <div class="bottom">
      <section class="card">
        <h3>决策卡</h3>
        <div class="two">
          <div><label class="field">决策问题</label><input v-model="decision.question" /></div>
          <div><label class="field">责任人</label><input v-model="decision.owner" /></div>
        </div>
        <label class="field">最终结论</label><textarea v-model="decision.conclusion" rows="2"></textarea>
        <div class="two">
          <div><label class="field">决策依据</label><textarea v-model="decision.basis" rows="2"></textarea></div>
          <div><label class="field">主要异议</label><textarea v-model="decision.objections" rows="2"></textarea></div>
        </div>
        <div class="two">
          <div><label class="field">生效条件（每行一个）</label><textarea v-model="decision.conditions" rows="3"></textarea></div>
          <div><label class="field">复审时间</label><input v-model="decision.reviewAt" /></div>
        </div>
        <button class="primary" style="margin-top:10px" @click="saveDecision">{{ savedHint || '保存决策卡' }}</button>
      </section>

      <section class="card">
        <h3>行动点 <span class="tag">{{ meeting.actions.length }}</span><span class="muted small">决策没有落到人和时间，就等于没有生效</span></h3>
        <table class="actions">
          <tr><th>任务</th><th>负责人</th><th>截止</th><th>已接受</th><th>完成</th><th></th></tr>
          <tr v-for="a in meeting.actions" :key="a.id" :class="{ done: a.done }">
            <td>{{ a.task }}</td>
            <td>{{ a.owner || '待定' }}</td>
            <td>{{ a.deadline || '待定' }}</td>
            <td><input type="checkbox" :checked="a.accepted" @change="patchAction(a, { accepted: $event.target.checked })" /></td>
            <td><input type="checkbox" :checked="a.done" @change="patchAction(a, { done: $event.target.checked })" /></td>
            <td><button class="tiny ghost" @click="api.del(`/meetings/${id}/actions/${a.id}`)">✕</button></td>
          </tr>
        </table>
        <div class="row" style="margin-top:8px">
          <input v-model="action.task" class="grow" placeholder="任务" @keyup.enter="addAction" />
          <input v-model="action.owner" list="people" placeholder="负责人" style="width:100px" />
          <input v-model="action.deadline" placeholder="截止时间" style="width:110px" />
          <button @click="addAction">添加</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api, useMeetingStream, joinBaseUrl } from './api.js'
import ScoreChart from './ScoreChart.vue'

const id = useRoute().params.id
const { meeting, sessions, connected, error } = useMeetingStream(id)

const consensus = computed(() => meeting.value?.items.filter((i) => i.type === 'consensus') || [])
const disputes = computed(() => meeting.value?.items.filter((i) => i.type === 'disagreement') || [])
const people = computed(() => (meeting.value?.participants || []).map((p) => p.replace(/[（(].*$/, '')))

// ── 会前 ──
const editPrep = ref(false)
const prep = reactive({ goal: '', participants: '', agenda: '', preRead: '' })
watch(editPrep, (on) => {
  if (!on) return
  const m = meeting.value
  Object.assign(prep, { goal: m.goal, participants: m.participants.join('、'), agenda: m.agenda.join('\n'), preRead: m.preRead })
})
async function savePrep() {
  await api.patch(`/meetings/${id}`, prep)
  editPrep.value = false
}

// ── 记录 ──
const note = reactive({ speaker: '', text: '' })
async function addNote() {
  if (!note.text.trim()) return
  await api.post(`/meetings/${id}/notes`, note)
  note.text = ''
}
const promote = (n, type) => api.post(`/meetings/${id}/items`, { type, text: n.text, reason: type === 'disagreement' ? `${n.speaker}提出` : '' })

// ── 共识 / 分歧 ──
const draft = reactive({ type: 'consensus', text: '', reason: '', options: '' })
async function addItem() {
  if (!draft.text.trim()) return
  await api.post(`/meetings/${id}/items`, { ...draft, options: draft.options.split('\n').filter((s) => s.trim()) })
  Object.assign(draft, { text: '', reason: '', options: '' })
}

// ── AI（可选）──
const ai = ref(null)
const aiBusy = ref(false)
const aiModeLabel = ref('')
onMounted(async () => {
  const c = await api.get('/config')
  aiModeLabel.value = c.aiMode === 'live' ? '模型' : '本地规则'
})
async function runAI() {
  aiBusy.value = true
  try {
    ai.value = await api.post(`/meetings/${id}/ai/extract`)
  } catch (e) {
    alert(e.message)
  } finally {
    aiBusy.value = false
  }
}
const adopt = (type, x) => api.post(`/meetings/${id}/items`, { type, text: x.text, reason: x.reason || '', options: x.options || [] })

// ── 投票 ──
const voteQuestion = ref('')
const voteError = ref('')
const focusId = ref(null)
const qr = reactive({})
watch(meeting, (m) => {
  if (m && !voteQuestion.value) voteQuestion.value = m.goal ? `是否同意：${m.goal.replace(/^是否/, '')}？` : ''
}, { once: true })

const current = computed(() => {
  const list = sessions.value
  return list.find((s) => s.id === focusId.value) || list.find((s) => s.open) || list[list.length - 1] || null
})
watch(current, async (s) => {
  if (s?.open && !qr[s.id]) qr[s.id] = await api.get(`/sessions/${s.id}/qr`)
}, { immediate: true })

async function startVote(body) {
  voteError.value = ''
  try {
    const res = await api.post(`/meetings/${id}/sessions`, { ...body, baseUrl: await joinBaseUrl() })
    qr[res.session.id] = { joinUrl: res.joinUrl, qrDataUrl: res.qrDataUrl }
    focusId.value = res.session.id
  } catch (e) {
    voteError.value = e.message
  }
}

function openPresent() {
  window.open(`/present/${id}`, '_blank')
}

// ── 决策卡 / 行动点 ──
const decision = reactive({ question: '', conclusion: '', basis: '', objections: '', conditions: '', owner: '', reviewAt: '' })
watch(meeting, (m) => {
  if (m?.decision) Object.assign(decision, { ...m.decision, conditions: (m.decision.conditions || []).join('\n') })
}, { once: true })
const savedHint = ref('')
async function saveDecision() {
  await api.patch(`/meetings/${id}`, { decision })
  savedHint.value = '已保存 ✓'
  setTimeout(() => (savedHint.value = ''), 1500)
}
const action = reactive({ task: '', owner: '', deadline: '' })
async function addAction() {
  if (!action.task.trim()) return
  await api.post(`/meetings/${id}/actions`, action)
  Object.assign(action, { task: '', owner: '', deadline: '' })
}
const patchAction = (a, patch) => api.patch(`/meetings/${id}/actions/${a.id}`, patch)

const endMeeting = () => api.post(`/meetings/${id}/end`)
const reopen = () => api.patch(`/meetings/${id}`, { status: 'active' })
</script>

<style scoped>
.center { padding: 80px; text-align: center; }
.room { padding: 12px 16px 40px; max-width: 1600px; margin: 0 auto; }
.top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.top h2 { font-size: 20px; display: flex; gap: 8px; align-items: center; }
.back { text-decoration: none; font-size: 13px; }
.cols { display: grid; grid-template-columns: 1fr 1.1fr 1fr; gap: 12px; align-items: start; }
@media (max-width: 1100px) { .cols { grid-template-columns: 1fr; } }
.col > .card + .card { margin-top: 12px; }
.agenda { padding-left: 20px; margin: 6px 0; }
.pre { white-space: pre-wrap; margin-top: 6px; }
.notes { max-height: 380px; overflow: auto; margin-bottom: 8px; }
.note { padding: 6px 4px; border-bottom: 1px dashed var(--line); font-size: 13px; position: relative; }
.note-actions { display: none; float: right; gap: 4px; }
.note:hover .note-actions { display: inline-flex; }
.item { display: flex; gap: 6px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid var(--line); }
.item:last-child { border-bottom: none; }
.opt { color: var(--muted); }
.question { font-size: 15px; font-weight: 600; margin: 10px 0; }
.qr { text-align: center; margin: 8px 0; }
.qr img { width: 200px; height: 200px; border-radius: 8px; background: #fff; padding: 6px; }
.qr a { display: block; word-break: break-all; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; color: var(--muted); font-weight: 500; padding: 4px; border-bottom: 1px solid var(--line); }
td { padding: 6px 4px; border-bottom: 1px solid var(--line); vertical-align: top; }
.rounds tr { cursor: pointer; }
.rounds tr.on td { background: var(--surface-2); }
.rounds .q { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tiny-badge { font-size: 11px; padding: 1px 8px; }
.actions tr.done td { text-decoration: line-through; color: var(--muted); }
.actions input[type='checkbox'] { width: auto; }
.bottom { display: grid; grid-template-columns: 1fr 1.2fr; gap: 12px; margin-top: 12px; align-items: start; }
@media (max-width: 1100px) { .bottom { grid-template-columns: 1fr; } }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ai { border-style: dashed; }
</style>
