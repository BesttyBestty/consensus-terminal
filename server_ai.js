// 可选的 AI 辅助：从发言记录里提取候选共识 / 分歧 / 行动点
// - 设置 AI_API_KEY（OpenAI 兼容接口，原型用的是 DeepSeek）时调用真实模型
// - 未设置时使用本地规则的 mock，零成本、可离线，测试也走这条路
// 密钥只从环境变量读取，绝不写进代码、前端或数据文件。

const EXTRACT_PROMPT = `你是一个会议分析助手。根据会议目标和发言记录，提取候选共识、分歧和行动点。严格输出 JSON：
{
  "summary": "3-5 句会议摘要",
  "consensus": [{ "text": "已基本达成一致的点" }],
  "disagreements": [{ "text": "分歧主题", "reason": "分歧原因", "options": ["观点A", "观点B"] }],
  "candidateDecision": "一句可以拿去投票确认的候选决策（问句）",
  "actions": [{ "task": "具体可执行的任务", "owner": "负责人，未知留空", "deadline": "时间节点，未知留空" }]
}
要求：只基于记录，不要臆造；全部中文。`

export function aiMode() {
  return process.env.AI_API_KEY ? 'live' : 'mock'
}

async function callLLM(system, user) {
  const base = (process.env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '')
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'deepseek-chat',
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  })
  if (!res.ok) throw new Error(`AI 接口错误 ${res.status}`)
  const data = await res.json()
  return JSON.parse(data.choices[0].message.content)
}

// ── Mock：关键词规则 ───────────────────────────────────────────
const AGREE = /(没问题|可以|同意|合理|就按|确认)/
const DOUBT = /(但是|不过|担心|风险|不敢|超了|超预算|万一|不同意|有点快|还没)/
const ACTION = /^(.{2,4})[：:].*?(我会|我先|我去|我这边|尽快|明天|一周内|\d+\s*天内)/

function mockExtract(meeting) {
  const notes = meeting.notes || []
  const consensus = []
  const disagreements = []
  const actions = []
  for (const n of notes) {
    const line = `${n.speaker}：${n.text}`
    const firstSentence = n.text.split(/[。！？]/)[0]
    if (DOUBT.test(n.text)) {
      disagreements.push({ text: firstSentence, reason: `${n.speaker}提出`, options: [] })
    } else if (AGREE.test(n.text)) {
      consensus.push({ text: `${n.speaker}：${firstSentence}` })
    }
    const m = line.match(ACTION)
    if (m) {
      const deadline = (n.text.match(/(明天[上下]?午?|一周内|\d+\s*天内)/) || [])[0] || ''
      actions.push({ task: firstSentence, owner: n.speaker, deadline })
    }
  }
  return {
    summary: `（本地规则摘要，未调用 AI）共 ${notes.length} 条发言；识别到 ${consensus.length} 条倾向一致的发言、${disagreements.length} 条带有疑虑或条件的发言。会议目标：${meeting.goal || '未填写'}。`,
    consensus: consensus.slice(0, 5),
    disagreements: disagreements.slice(0, 4),
    candidateDecision: meeting.goal ? `是否同意：${meeting.goal.replace(/^是否/, '')}？` : '',
    actions: actions.slice(0, 6)
  }
}

export async function extract(meeting) {
  if (aiMode() === 'mock') return { mode: 'mock', ...mockExtract(meeting) }
  const user = `【会议目标】${meeting.goal || ''}
【会前议题】\n${(meeting.agenda || []).join('\n')}
【会前材料】\n${meeting.preRead || '（无）'}
【发言记录】\n${(meeting.notes || []).map((n) => `${n.speaker}：${n.text}`).join('\n') || '（暂无）'}`
  return { mode: 'live', ...(await callLLM(EXTRACT_PROMPT, user)) }
}
