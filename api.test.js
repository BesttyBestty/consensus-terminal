import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from './server_app.js'
import { DEMO_NOTES, DEMO_QUESTION, DEMO_ROUNDS } from './server_demo.js'

// 测试绝不调用付费 AI 接口
delete process.env.AI_API_KEY

let tmpDir, dataFile, app
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-test-'))
  dataFile = path.join(tmpDir, 'db.json')
  app = createApp({ dataFile, distDir: null })
})
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

describe('完整流程：产品模具评审（test-case-1-产品模具评审.md）', () => {
  let meetingId, item1, item2, s1, s2

  it('会前：创建会议（议题、参会人、会前材料）', async () => {
    const res = await request(app).post('/api/meetings').send({
      title: '产品模具评审',
      goal: '是否在 9 月 15 日前正式开模',
      participants: '张伟、李娜、王强、陈晨、刘洋',
      agenda: '产品结构是否已经冻结？\n当前模具报价是否在预算范围内？\n是否同意在 9 月 15 日前正式开模？',
      preRead: 'A 厂 38 万 / 45 天；B 厂 42 万 / 35 天'
    })
    expect(res.status).toBe(201)
    meetingId = res.body.meeting.id
    expect(res.body.meeting.participants).toHaveLength(5)
    expect(res.body.meeting.agenda).toHaveLength(3)
  })

  it('会前：缺标题时拒绝', async () => {
    const res = await request(app).post('/api/meetings').send({ goal: 'x' })
    expect(res.status).toBe(400)
  })

  it('会中：记录发言，并把它们分到共识 / 分歧', async () => {
    for (const [speaker, text] of DEMO_NOTES.slice(0, 10)) {
      const r = await request(app).post(`/api/meetings/${meetingId}/notes`).send({ speaker, text })
      expect(r.status).toBe(201)
    }
    const c = await request(app).post(`/api/meetings/${meetingId}/items`).send({ type: 'consensus', text: 'B 厂交期最短' })
    const d = await request(app).post(`/api/meetings/${meetingId}/items`).send({
      type: 'disagreement',
      text: '跌落测试未出，结构冻结前提不成立',
      reason: '李娜、刘洋提及',
      options: ['等测试结果再开模', '先推进，测试不过启动 A 厂备选']
    })
    expect(c.status).toBe(201)
    expect(d.status).toBe(201)
    expect(d.body.item.options).toHaveLength(2)
    item1 = c.body.item
    item2 = d.body.item

    const bad = await request(app).post(`/api/meetings/${meetingId}/items`).send({ type: 'maybe', text: 'x' })
    expect(bad.status).toBe(400)

    const m = await request(app).get(`/api/meetings/${meetingId}`)
    expect(m.body.meeting.notes).toHaveLength(10)
    expect(m.body.meeting.items.map((i) => i.type)).toEqual(['consensus', 'disagreement'])
  })

  it('投票：发起第一轮，返回二维码和加入链接', async () => {
    const res = await request(app)
      .post(`/api/meetings/${meetingId}/sessions`)
      .send({ question: DEMO_QUESTION, baseUrl: 'http://192.168.1.20:5173' })
    expect(res.status).toBe(201)
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/)
    expect(res.body.joinUrl).toBe(`http://192.168.1.20:5173/vote/${res.body.session.id}`)
    expect(res.body.session.round).toBe(1)
    s1 = res.body.session.id

    const pub = await request(app).get(`/api/sessions/${s1}`)
    expect(pub.body.question).toBe(DEMO_QUESTION)
    expect(pub.body).not.toHaveProperty('votes') // 手机端看不到别人的分数
  })

  it('投票：分数必须是 1–10 的整数', async () => {
    for (const score of [0, 11, 5.5, 'abc']) {
      const r = await request(app).post(`/api/sessions/${s1}/votes`).send({ score })
      expect(r.status).toBe(400)
    }
  })

  it('投票：首轮 5 人匿名打分 → 存在条件性分歧', async () => {
    for (const [i, score] of DEMO_ROUNDS[0].entries()) {
      const r = await request(app).post(`/api/sessions/${s1}/votes`).send({ score, voterToken: `phone-${i}` })
      expect(r.status).toBe(201)
    }
    const r = await request(app).get(`/api/sessions/${s1}/results`)
    expect(r.body.count).toBe(5)
    expect(r.body.mean).toBe(6.6)
    expect(r.body.median).toBe(6)
    expect(r.body.stdev).toBe(2.2)
    expect(r.body.spread).toBe(6)
    expect(r.body.stances).toEqual({ agree: 2, conditional: 2, disagree: 1 }) // 与案例首轮表态一致
    expect(r.body.distribution[2]).toBe(1) // 一个 3 分
    expect(r.body.strength.level).toBe('conditional')
    expect(r.body.strength.label).toBe('存在条件性分歧')
  })

  it('投票：同一台手机再次提交只会修改自己的票，不会多算一票', async () => {
    const r = await request(app).post(`/api/sessions/${s1}/votes`).send({ score: 4, voterToken: 'phone-4' })
    expect(r.status).toBe(200)
    expect(r.body.updated).toBe(true)
    const res = await request(app).get(`/api/sessions/${s1}/results`)
    expect(res.body.count).toBe(5)
    expect(res.body.min).toBe(4)
  })

  it('投票：分歧选项投票会按选项计数', async () => {
    const res = await request(app).post(`/api/meetings/${meetingId}/sessions`).send({ itemId: item2.id })
    const sid = res.body.session.id
    expect(res.body.session.options).toHaveLength(2)
    const [o1, o2] = res.body.session.options
    await request(app).post(`/api/sessions/${sid}/votes`).send({ score: 7, choice: o2.id })
    await request(app).post(`/api/sessions/${sid}/votes`).send({ score: 8, choice: o2.id })
    await request(app).post(`/api/sessions/${sid}/votes`).send({ score: 5, choice: o1.id })
    const bad = await request(app).post(`/api/sessions/${sid}/votes`).send({ score: 5, choice: 'nope' })
    expect(bad.status).toBe(400)
    const r = await request(app).get(`/api/sessions/${sid}/results`)
    expect(r.body.options.map((o) => o.count)).toEqual([1, 2])
  })

  it('投票：第二轮全员同意 → 已达成共识；旧轮次自动关闭', async () => {
    const res = await request(app).post(`/api/meetings/${meetingId}/sessions`).send({ question: DEMO_QUESTION })
    s2 = res.body.session.id
    expect(res.body.session.round).toBe(2)
    for (const score of DEMO_ROUNDS[1]) await request(app).post(`/api/sessions/${s2}/votes`).send({ score })
    const r = await request(app).get(`/api/sessions/${s2}/results`)
    expect(r.body.stances).toEqual({ agree: 5, conditional: 0, disagree: 0 })
    expect(r.body.strength.level).toBe('strong')
    expect(r.body.strength.index).toBeGreaterThan(70)

    const closed = await request(app).post(`/api/sessions/${s1}/votes`).send({ score: 9 })
    expect(closed.status).toBe(409)
  })

  it('会后：录入行动点和决策卡，结束会议', async () => {
    const actions = [
      { task: '完成跌落测试并出具结论', owner: '李娜', deadline: '7 天内' },
      { task: '走完 B 厂预算快速审批', owner: '陈晨', deadline: '明日上午' }
    ]
    for (const a of actions) {
      const r = await request(app).post(`/api/meetings/${meetingId}/actions`).send(a)
      expect(r.status).toBe(201)
    }
    const m0 = await request(app).get(`/api/meetings/${meetingId}`)
    const first = m0.body.meeting.actions[0]
    await request(app).patch(`/api/meetings/${meetingId}/actions/${first.id}`).send({ accepted: true })

    await request(app).patch(`/api/meetings/${meetingId}`).send({
      decision: { question: '是否选择模具厂并确定开模时间？', conclusion: '选定 B 厂，目标 9 月 15 日前开模', conditions: '陈晨完成快速审批\n李娜 7 天内出测试结论', owner: '刘洋' }
    })
    const end = await request(app).post(`/api/meetings/${meetingId}/end`)
    expect(end.body.meeting.status).toBe('ended')
  })

  it('导出：Markdown 包含投票统计、决策卡、行动点（负责人、截止时间）', async () => {
    const res = await request(app).get(`/api/meetings/${meetingId}/export.md`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/markdown/)
    const md = res.text
    expect(md).toContain('# 产品模具评审')
    expect(md).toContain('## 共识')
    expect(md).toContain('B 厂交期最短')
    expect(md).toContain('## 分歧')
    expect(md).toContain('存在条件性分歧')
    expect(md).toContain('已达成共识')
    expect(md).toContain('## 决策卡')
    expect(md).toContain('1. 陈晨完成快速审批')
    expect(md).toContain('| 1 | 完成跌落测试并出具结论 | 李娜 | 7 天内 | 已接受 |')
    expect(md).toContain('- [ ] 走完 B 厂预算快速审批 — @陈晨，截止 明日上午')
  })

  it('持久化：数据写进 JSON 文件，重启后还在', () => {
    const raw = JSON.parse(fs.readFileSync(dataFile, 'utf-8'))
    expect(raw.meetings[meetingId].title).toBe('产品模具评审')
    const app2 = createApp({ dataFile, distDir: null })
    return request(app2).get(`/api/sessions/${s2}/results`).then((r) => expect(r.body.count).toBe(5))
  })
})

describe('其它接口', () => {
  it('AI 提取：未配置密钥时走本地 mock', async () => {
    const m = await request(app).post('/api/demo').send({})
    expect(m.status).toBe(201)
    const r = await request(app).post(`/api/meetings/${m.body.meeting.id}/ai/extract`)
    expect(r.status).toBe(200)
    expect(r.body.mode).toBe('mock')
    expect(r.body.disagreements.length).toBeGreaterThan(0)
    expect(r.body.consensus.length).toBeGreaterThan(0)
  })

  it('示例会议带两轮投票', async () => {
    const m = await request(app).post('/api/demo').send({})
    const snap = await request(app).get(`/api/meetings/${m.body.meeting.id}`)
    expect(snap.body.sessions.map((s) => s.results.strength.level)).toEqual(['conditional', 'strong'])
    expect(snap.body.sessions[0]).not.toHaveProperty('votes')
    expect(snap.body.sessions[0]).not.toHaveProperty('voterKeys')
  })

  it('SSE：连上即收到快照', async () => {
    const m = await request(app).post('/api/meetings').send({ title: 'SSE' })
    const server = app.listen(0)
    const port = server.address().port
    const ctrl = new AbortController()
    const res = await fetch(`http://127.0.0.1:${port}/api/meetings/${m.body.meeting.id}/events`, { signal: ctrl.signal })
    const reader = res.body.getReader()
    const { value } = await reader.read()
    const text = new TextDecoder().decode(value)
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/)
    expect(text).toContain('event: snapshot')
    expect(text).toContain('"title":"SSE"')
    ctrl.abort()
    await new Promise((r) => server.close(r))
  })

  it('404', async () => {
    expect((await request(app).get('/api/meetings/nope')).status).toBe(404)
    expect((await request(app).get('/api/sessions/nope')).status).toBe(404)
  })
})
