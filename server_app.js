import express from 'express'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { createStore, newId, now } from './server_store.js'
import { aggregate } from './server_stats.js'
import { meetingToMarkdown } from './server_markdown.js'
import { extract, aiMode } from './server_ai.js'
import * as demo from './server_demo.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const toList = (v) =>
  Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean)
  : typeof v === 'string' ? v.split(/\n|[,，、]/).map((s) => s.trim()).filter(Boolean)
  : []

// 议题按行拆（议题里可能有逗号）
const toLines = (v) =>
  Array.isArray(v) ? toList(v) : String(v ?? '').split('\n').map((s) => s.trim()).filter(Boolean)

export function lanAddresses() {
  const out = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address)
  }
  return out
}

export function createApp({ dataFile = null, distDir = path.join(__dirname, 'dist') } = {}) {
  const store = createStore(dataFile)
  const app = express()
  app.use(express.json({ limit: '2mb' }))

  // ── 实时推送（SSE）：每个会议一组订阅者 ─────────────────────
  const subscribers = new Map() // meetingId -> Set<res>

  function snapshot(meeting) {
    const sessions = store.sessionsOf(meeting.id).map(({ votes, voterKeys, ...s }) => ({
      ...s,
      results: aggregate({ ...s, votes })
    }))
    return { meeting, sessions }
  }
  function broadcast(meetingId) {
    const subs = subscribers.get(meetingId)
    if (!subs?.size) return
    const m = store.getMeeting(meetingId)
    if (!m) return
    const payload = `event: snapshot\ndata: ${JSON.stringify(snapshot(m))}\n\n`
    for (const res of subs) res.write(payload)
  }
  function touch(meeting) {
    meeting.updatedAt = now()
    store.putMeeting(meeting)
    broadcast(meeting.id)
    return meeting
  }

  // ── helpers ──────────────────────────────────────────────────
  const api = express.Router()
  const loadMeeting = (req, res, next) => {
    const m = store.getMeeting(req.params.id)
    if (!m) return res.status(404).json({ error: '会议不存在' })
    req.meeting = m
    next()
  }
  const loadSession = (req, res, next) => {
    const s = store.getSession(req.params.sid)
    if (!s) return res.status(404).json({ error: '投票不存在或已失效' })
    req.session = s
    next()
  }

  function buildMeeting(body) {
    const title = String(body.title || '').trim()
    if (!title) return null
    return {
      id: newId(),
      title,
      goal: String(body.goal || '').trim(),
      participants: toList(body.participants),
      agenda: toLines(body.agenda),
      preRead: String(body.preRead || ''),
      status: 'active',
      notes: [],
      items: [],
      actions: [],
      decision: null,
      createdAt: now(),
      updatedAt: now()
    }
  }

  function makeItem(body) {
    const type = body.type === 'disagreement' ? 'disagreement' : body.type === 'consensus' ? 'consensus' : null
    const text = String(body.text || '').trim()
    if (!type || !text) return null
    return {
      id: newId(),
      type,
      text,
      reason: String(body.reason || '').trim(),
      options: (body.options || []).map((o) => ({ id: newId(), text: String(o.text ?? o).trim() })).filter((o) => o.text),
      createdAt: now()
    }
  }

  function makeAction(body) {
    const task = String(body.task || '').trim()
    if (!task) return null
    return {
      id: newId(),
      task,
      owner: String(body.owner || '').trim(),
      deadline: String(body.deadline || '').trim(),
      accepted: !!body.accepted,
      done: !!body.done,
      createdAt: now()
    }
  }

  function createSession(meeting, { question, itemId, baseUrl }) {
    const item = itemId ? meeting.items.find((i) => i.id === itemId) : null
    const q = String(question || item?.text || '').trim()
    if (!q) return null
    const round = store.sessionsOf(meeting.id).filter((s) => s.question === q).length + 1
    const s = {
      id: newId(),
      meetingId: meeting.id,
      itemId: item?.id || null,
      question: q,
      options: item?.type === 'disagreement' ? item.options : [],
      round,
      open: true,
      baseUrl: baseUrl || null,
      votes: [],
      voterKeys: {},
      createdAt: now()
    }
    // 关闭同一会议里其它仍开放的投票：投影屏一次只聚焦一个问题
    for (const other of store.sessionsOf(meeting.id)) if (other.open) store.putSession({ ...other, open: false })
    store.putSession(s)
    return s
  }

  const joinUrlOf = (s, req) => {
    const base = (s.baseUrl || process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')
    return `${base}/vote/${s.id}`
  }

  // ── 基础信息 ────────────────────────────────────────────────
  api.get('/health', (_req, res) => res.json({ ok: true, aiMode: aiMode() }))
  api.get('/config', (_req, res) =>
    res.json({ aiMode: aiMode(), lanAddresses: lanAddresses(), publicUrl: process.env.PUBLIC_URL || null })
  )

  // ── 会议 ─────────────────────────────────────────────────────
  api.get('/meetings', (_req, res) =>
    res.json({
      meetings: store.listMeetings().map((m) => ({
        id: m.id, title: m.title, goal: m.goal, status: m.status, createdAt: m.createdAt,
        counts: { notes: m.notes.length, items: m.items.length, actions: m.actions.length }
      }))
    })
  )

  api.post('/meetings', (req, res) => {
    const m = buildMeeting(req.body || {})
    if (!m) return res.status(400).json({ error: '会议标题不能为空' })
    store.putMeeting(m)
    res.status(201).json({ meeting: m })
  })

  // 一键载入测试案例《产品模具评审》（含两轮示意投票）
  api.post('/demo', (req, res) => {
    const m = buildMeeting(demo.DEMO_MEETING)
    for (const [speaker, text] of demo.DEMO_NOTES) m.notes.push({ id: newId(), speaker, text, at: now() })
    for (const it of demo.DEMO_ITEMS) m.items.push(makeItem(it))
    m.decision = { ...demo.DEMO_DECISION }
    for (const a of demo.DEMO_ACTIONS) m.actions.push(makeAction(a))
    store.putMeeting(m)
    demo.DEMO_ROUNDS.forEach((scores, i) => {
      const s = createSession(m, { question: demo.DEMO_QUESTION, baseUrl: req.body?.baseUrl })
      s.votes = scores.map((score) => ({ id: newId(), score, choice: null, comment: '', at: now() }))
      if (i < demo.DEMO_ROUNDS.length - 1) s.open = false
      store.putSession(s)
    })
    res.status(201).json({ meeting: m })
  })

  api.get('/meetings/:id', loadMeeting, (req, res) => res.json(snapshot(req.meeting)))

  api.patch('/meetings/:id', loadMeeting, (req, res) => {
    const m = req.meeting
    const b = req.body || {}
    if (b.title !== undefined) m.title = String(b.title).trim() || m.title
    if (b.goal !== undefined) m.goal = String(b.goal)
    if (b.participants !== undefined) m.participants = toList(b.participants)
    if (b.agenda !== undefined) m.agenda = toLines(b.agenda)
    if (b.preRead !== undefined) m.preRead = String(b.preRead)
    if (b.decision !== undefined) {
      const d = b.decision || {}
      m.decision = { ...d, conditions: toLines(d.conditions ?? []) }
    }
    if (b.status === 'active' || b.status === 'ended') m.status = b.status
    res.json({ meeting: touch(m) })
  })

  api.delete('/meetings/:id', loadMeeting, (req, res) => {
    store.deleteMeeting(req.meeting.id)
    res.status(204).end()
  })

  api.post('/meetings/:id/end', loadMeeting, (req, res) => {
    const m = req.meeting
    m.status = 'ended'
    m.endedAt = now()
    for (const s of store.sessionsOf(m.id)) if (s.open) store.putSession({ ...s, open: false })
    res.json({ meeting: touch(m) })
  })

  // ── 发言记录 ─────────────────────────────────────────────────
  api.post('/meetings/:id/notes', loadMeeting, (req, res) => {
    const text = String(req.body?.text || '').trim()
    if (!text) return res.status(400).json({ error: '记录内容不能为空' })
    const note = { id: newId(), speaker: String(req.body.speaker || '').trim() || '参会人', text, at: now() }
    req.meeting.notes.push(note)
    touch(req.meeting)
    res.status(201).json({ note })
  })
  api.delete('/meetings/:id/notes/:nid', loadMeeting, (req, res) => {
    req.meeting.notes = req.meeting.notes.filter((n) => n.id !== req.params.nid)
    touch(req.meeting)
    res.status(204).end()
  })

  // ── 共识 / 分歧 ──────────────────────────────────────────────
  api.post('/meetings/:id/items', loadMeeting, (req, res) => {
    const item = makeItem(req.body || {})
    if (!item) return res.status(400).json({ error: 'type 必须是 consensus 或 disagreement，且内容不能为空' })
    req.meeting.items.push(item)
    touch(req.meeting)
    res.status(201).json({ item })
  })
  api.patch('/meetings/:id/items/:iid', loadMeeting, (req, res) => {
    const item = req.meeting.items.find((i) => i.id === req.params.iid)
    if (!item) return res.status(404).json({ error: '条目不存在' })
    const b = req.body || {}
    if (b.type === 'consensus' || b.type === 'disagreement') item.type = b.type
    if (b.text !== undefined) item.text = String(b.text).trim() || item.text
    if (b.reason !== undefined) item.reason = String(b.reason)
    touch(req.meeting)
    res.json({ item })
  })
  api.delete('/meetings/:id/items/:iid', loadMeeting, (req, res) => {
    req.meeting.items = req.meeting.items.filter((i) => i.id !== req.params.iid)
    touch(req.meeting)
    res.status(204).end()
  })

  // ── 行动点 ───────────────────────────────────────────────────
  api.post('/meetings/:id/actions', loadMeeting, (req, res) => {
    const a = makeAction(req.body || {})
    if (!a) return res.status(400).json({ error: '任务内容不能为空' })
    req.meeting.actions.push(a)
    touch(req.meeting)
    res.status(201).json({ action: a })
  })
  api.patch('/meetings/:id/actions/:aid', loadMeeting, (req, res) => {
    const a = req.meeting.actions.find((x) => x.id === req.params.aid)
    if (!a) return res.status(404).json({ error: '行动点不存在' })
    for (const k of ['task', 'owner', 'deadline']) if (req.body?.[k] !== undefined) a[k] = String(req.body[k])
    for (const k of ['accepted', 'done']) if (req.body?.[k] !== undefined) a[k] = !!req.body[k]
    touch(req.meeting)
    res.json({ action: a })
  })
  api.delete('/meetings/:id/actions/:aid', loadMeeting, (req, res) => {
    req.meeting.actions = req.meeting.actions.filter((x) => x.id !== req.params.aid)
    touch(req.meeting)
    res.status(204).end()
  })

  // ── 导出 ─────────────────────────────────────────────────────
  api.get('/meetings/:id/export.md', loadMeeting, (req, res) => {
    const md = meetingToMarkdown(req.meeting, store.sessionsOf(req.meeting.id))
    const name = encodeURIComponent(`${req.meeting.title}_行动点.md`)
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${name}`)
    res.send(md)
  })

  // ── AI（可选，默认 mock）─────────────────────────────────────
  api.post('/meetings/:id/ai/extract', loadMeeting, async (req, res) => {
    try {
      res.json(await extract(req.meeting))
    } catch (e) {
      res.status(502).json({ error: e.message })
    }
  })

  // ── 投票 ─────────────────────────────────────────────────────
  api.post('/meetings/:id/sessions', loadMeeting, async (req, res) => {
    const s = createSession(req.meeting, req.body || {})
    if (!s) return res.status(400).json({ error: '投票问题不能为空' })
    const joinUrl = joinUrlOf(s, req)
    const qrDataUrl = await QRCode.toDataURL(joinUrl, { width: 480, margin: 1 })
    broadcast(req.meeting.id)
    res.status(201).json({ session: { id: s.id, question: s.question, round: s.round, options: s.options, open: s.open }, joinUrl, qrDataUrl })
  })

  api.get('/sessions/:sid/qr', loadSession, async (req, res) => {
    const joinUrl = joinUrlOf(req.session, req)
    res.json({ joinUrl, qrDataUrl: await QRCode.toDataURL(joinUrl, { width: 480, margin: 1 }) })
  })

  // 手机端读取：只给题目，不给他人的分数
  api.get('/sessions/:sid', loadSession, (req, res) => {
    const s = req.session
    const m = store.getMeeting(s.meetingId)
    res.json({ id: s.id, meetingTitle: m?.title || '', question: s.question, options: s.options, round: s.round, open: s.open })
  })

  api.post('/sessions/:sid/votes', loadSession, (req, res) => {
    const s = req.session
    if (!s.open) return res.status(409).json({ error: '本轮投票已结束' })
    const score = Number(req.body?.score)
    if (!Number.isInteger(score) || score < 1 || score > 10) return res.status(400).json({ error: '分数必须是 1–10 的整数' })
    const choice = req.body?.choice ?? null
    if (choice && !s.options.some((o) => o.id === choice)) return res.status(400).json({ error: '无效的选项' })

    const vote = { id: newId(), score, choice, comment: String(req.body?.comment || '').slice(0, 280), at: now() }
    // 匿名但防重复：手机端生成随机 token，服务端只存它的哈希；同一设备再次提交 = 修改自己的票
    const token = req.body?.voterToken ? String(req.body.voterToken) : null
    const key = token ? crypto.createHash('sha256').update(`${s.id}:${token}`).digest('hex') : null
    s.voterKeys ||= {}
    let updated = false
    if (key && s.voterKeys[key]) {
      const idx = s.votes.findIndex((v) => v.id === s.voterKeys[key])
      if (idx >= 0) { vote.id = s.votes[idx].id; s.votes[idx] = vote; updated = true }
    }
    if (!updated) s.votes.push(vote)
    if (key) s.voterKeys[key] = vote.id
    store.putSession(s)
    broadcast(s.meetingId)
    res.status(updated ? 200 : 201).json({ ok: true, updated })
  })

  api.get('/sessions/:sid/results', loadSession, (req, res) => {
    const s = req.session
    res.json({ id: s.id, question: s.question, round: s.round, open: s.open, ...aggregate(s) })
  })

  api.post('/sessions/:sid/close', loadSession, (req, res) => {
    store.putSession({ ...req.session, open: false })
    broadcast(req.session.meetingId)
    res.json({ ok: true })
  })
  api.post('/sessions/:sid/reopen', loadSession, (req, res) => {
    store.putSession({ ...req.session, open: true })
    broadcast(req.session.meetingId)
    res.json({ ok: true })
  })

  // ── SSE ──────────────────────────────────────────────────────
  api.get('/meetings/:id/events', loadMeeting, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot(req.meeting))}\n\n`)
    const id = req.meeting.id
    if (!subscribers.has(id)) subscribers.set(id, new Set())
    subscribers.get(id).add(res)
    const ping = setInterval(() => res.write(': ping\n\n'), 25000)
    req.on('close', () => {
      clearInterval(ping)
      subscribers.get(id)?.delete(res)
    })
  })

  app.use('/api', api)
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }))

  // 生产模式：直接托管前端构建产物（npm run build 之后）
  if (distDir && fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir))
    app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
  }

  app.locals.store = store
  return app
}
