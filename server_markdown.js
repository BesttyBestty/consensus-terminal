// 把一场会议导出成 Markdown：议题、共识/分歧、每轮投票、决策卡、行动点
import { aggregate } from './server_stats.js'

const esc = (s = '') => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function meetingToMarkdown(meeting, sessions) {
  const L = []
  L.push(`# ${meeting.title}`)
  L.push('')
  L.push(`> 导出时间：${new Date().toLocaleString('zh-CN', { hour12: false })}　状态：${meeting.status === 'ended' ? '已结束' : '进行中'}`)
  L.push('')
  if (meeting.goal) L.push(`**本次会议需要决定：** ${meeting.goal}`, '')
  if (meeting.participants?.length) L.push(`**参会人员：** ${meeting.participants.join('、')}`, '')

  if (meeting.agenda?.length) {
    L.push('## 会前议题', '')
    meeting.agenda.forEach((a, i) => L.push(`${i + 1}. ${a}`))
    L.push('')
  }

  const consensus = meeting.items.filter((i) => i.type === 'consensus')
  const disputes = meeting.items.filter((i) => i.type === 'disagreement')
  L.push('## 共识', '')
  if (consensus.length) consensus.forEach((c) => L.push(`- ${c.text}`))
  else L.push('（无）')
  L.push('', '## 分歧', '')
  if (disputes.length) {
    disputes.forEach((d) => {
      L.push(`- ${d.text}${d.reason ? `（原因：${d.reason}）` : ''}`)
      ;(d.options || []).forEach((o) => L.push(`  - 观点：${o.text}`))
    })
  } else L.push('（无）')
  L.push('')

  if (sessions.length) {
    L.push('## 匿名投票（1–10 分）', '')
    L.push('| 轮次 | 问题 | 人数 | 均值 | 中位数 | 标准差 | 同意 / 有条件 / 不同意 | 共识强度 |')
    L.push('|---|---|---|---|---|---|---|---|')
    sessions.forEach((s) => {
      const r = aggregate(s)
      const st = r.stances
      L.push(
        `| ${s.round} | ${esc(s.question)} | ${r.count} | ${r.mean ?? '-'} | ${r.median ?? '-'} | ${r.stdev ?? '-'} | ${st.agree} / ${st.conditional} / ${st.disagree} | ${r.strength.label}${r.strength.index != null ? `（${r.strength.index}）` : ''} |`
      )
    })
    L.push('')
  }

  const d = meeting.decision
  if (d && (d.question || d.conclusion)) {
    L.push('## 决策卡', '')
    if (d.question) L.push(`- **决策问题：** ${d.question}`)
    if (d.conclusion) L.push(`- **最终结论：** ${d.conclusion}`)
    if (d.basis) L.push(`- **决策依据：** ${d.basis}`)
    if (d.objections) L.push(`- **主要异议：** ${d.objections}`)
    if (d.conditions?.length) {
      L.push('- **生效条件：**')
      d.conditions.forEach((c, i) => L.push(`  ${i + 1}. ${c}`))
    }
    if (d.owner) L.push(`- **责任人：** ${d.owner}`)
    if (d.reviewAt) L.push(`- **复审时间：** ${d.reviewAt}`)
    L.push('')
  }

  L.push('## 行动点', '')
  if (meeting.actions.length) {
    L.push('| # | 任务 | 负责人 | 截止时间 | 状态 |')
    L.push('|---|---|---|---|---|')
    meeting.actions.forEach((a, i) =>
      L.push(`| ${i + 1} | ${esc(a.task)} | ${esc(a.owner) || '待定'} | ${esc(a.deadline) || '待定'} | ${a.done ? '已完成' : a.accepted ? '已接受' : '待确认'} |`)
    )
    L.push('')
    L.push('### 待办清单', '')
    meeting.actions.forEach((a) =>
      L.push(`- [${a.done ? 'x' : ' '}] ${a.task} — @${a.owner || '待定'}，截止 ${a.deadline || '待定'}`)
    )
  } else L.push('（还没有行动点。决策没有落到人和时间，就等于没有生效。）')
  L.push('')
  return L.join('\n')
}
