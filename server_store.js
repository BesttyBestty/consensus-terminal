// 极简持久化：一个 JSON 文件，每次修改后原子写入（先写 .tmp 再 rename）
// dataFile 为 null 时只在内存中运行（测试用）
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const newId = () => crypto.randomUUID()
export const now = () => new Date().toISOString()

export function createStore(dataFile) {
  let db = { meetings: {}, sessions: {} }

  if (dataFile && fs.existsSync(dataFile)) {
    try {
      db = JSON.parse(fs.readFileSync(dataFile, 'utf-8'))
      db.meetings ||= {}
      db.sessions ||= {}
    } catch (e) {
      console.warn(`[store] 无法读取 ${dataFile}，从空库开始：${e.message}`)
    }
  }

  function save() {
    if (!dataFile) return
    fs.mkdirSync(path.dirname(dataFile), { recursive: true })
    const tmp = `${dataFile}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
    fs.renameSync(tmp, dataFile)
  }

  return {
    db,
    save,
    listMeetings() {
      return Object.values(db.meetings).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    getMeeting(id) {
      return db.meetings[id] || null
    },
    putMeeting(m) {
      db.meetings[m.id] = m
      save()
      return m
    },
    deleteMeeting(id) {
      delete db.meetings[id]
      for (const s of Object.values(db.sessions)) if (s.meetingId === id) delete db.sessions[s.id]
      save()
    },
    getSession(id) {
      return db.sessions[id] || null
    },
    putSession(s) {
      db.sessions[s.id] = s
      save()
      return s
    },
    sessionsOf(meetingId) {
      return Object.values(db.sessions)
        .filter((s) => s.meetingId === meetingId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    }
  }
}
