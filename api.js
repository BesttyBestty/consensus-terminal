import { ref, onBeforeUnmount } from 'vue'

async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`)
  return data
}

export const api = {
  get: (u) => req('GET', `/api${u}`),
  post: (u, b = {}) => req('POST', `/api${u}`, b),
  patch: (u, b) => req('PATCH', `/api${u}`, b),
  del: (u) => req('DELETE', `/api${u}`)
}

// 手机扫码要用局域网地址：在 localhost 上打开时，自动换成本机局域网 IP
let configCache
export async function joinBaseUrl() {
  configCache ||= await api.get('/config')
  if (configCache.publicUrl) return configCache.publicUrl
  const { protocol, hostname, port } = window.location
  const local = ['localhost', '127.0.0.1', '::1'].includes(hostname)
  if (local && configCache.lanAddresses?.length) return `${protocol}//${configCache.lanAddresses[0]}${port ? `:${port}` : ''}`
  return window.location.origin
}

// 订阅会议快照（SSE），断线自动重连
export function useMeetingStream(id) {
  const meeting = ref(null)
  const sessions = ref([])
  const connected = ref(false)
  const error = ref('')
  const es = new EventSource(`/api/meetings/${id}/events`)
  es.addEventListener('snapshot', (e) => {
    const data = JSON.parse(e.data)
    meeting.value = data.meeting
    sessions.value = data.sessions
    connected.value = true
    error.value = ''
  })
  es.onerror = () => {
    connected.value = false
    if (!meeting.value) error.value = '连接不上服务器，或会议不存在'
  }
  onBeforeUnmount(() => es.close())
  return { meeting, sessions, connected, error }
}

export const STANCE_COLOR = { agree: 'var(--agree)', conditional: 'var(--cond)', disagree: 'var(--disagree)' }
export const stanceOf = (s) => (s >= 8 ? 'agree' : s >= 5 ? 'conditional' : 'disagree')
