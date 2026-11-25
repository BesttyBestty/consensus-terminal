// 投票结果聚合：均值、中位数、离散度、共识强度
// 打分 1–10：8–10 记为“同意”，5–7 记为“有条件同意”，1–4 记为“不同意”
// （与测试案例《产品模具评审》中的三档表态一一对应）

export const STANCES = {
  agree: { label: '同意', min: 8, max: 10 },
  conditional: { label: '有条件同意', min: 5, max: 7 },
  disagree: { label: '不同意', min: 1, max: 4 }
}

export function stanceOf(score) {
  if (score >= 8) return 'agree'
  if (score >= 5) return 'conditional'
  return 'disagree'
}

const round1 = (x) => Math.round(x * 10) / 10

export function median(values) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function stdev(values) {
  if (!values.length) return null
  const m = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / values.length)
}

/**
 * 共识强度
 *  - index 0–100：均值越高、分歧（标准差）越小，指数越高。
 *    index = (mean-1)/9 × (1 - sd/4.5) × 100；4.5 是 1–10 分制下标准差的理论最大值。
 *  - level：
 *    strong      已达成共识：均值 ≥ 7.5、标准差 ≤ 1.5，且没有人打 4 分及以下
 *    split       明显分歧：标准差 > 2.5，或 ≥ 1/3 的人不同意
 *    conditional 存在条件性分歧：均值 ≥ 6
 *    weak        共识不足：其余情况
 */
export function consensusStrength(scores) {
  if (!scores.length) return { index: null, level: 'none', label: '暂无投票' }
  const m = scores.reduce((a, b) => a + b, 0) / scores.length
  const sd = stdev(scores)
  const disagreeShare = scores.filter((s) => s <= 4).length / scores.length
  const index = Math.round(((m - 1) / 9) * (1 - Math.min(sd / 4.5, 1)) * 100)

  let level
  if (m >= 7.5 && sd <= 1.5 && disagreeShare === 0) level = 'strong'
  else if (sd > 2.5 || disagreeShare >= 1 / 3) level = 'split'
  else if (m >= 6) level = 'conditional'
  else level = 'weak'

  const labels = {
    strong: '已达成共识',
    conditional: '存在条件性分歧',
    split: '明显分歧',
    weak: '共识不足'
  }
  return { index, level, label: labels[level] }
}

export function aggregate(session) {
  const scores = session.votes.map((v) => v.score)
  const n = scores.length
  const distribution = Array.from({ length: 10 }, (_, i) => scores.filter((s) => s === i + 1).length)
  const stances = { agree: 0, conditional: 0, disagree: 0 }
  for (const s of scores) stances[stanceOf(s)]++

  const options = (session.options || []).map((o) => ({
    ...o,
    count: session.votes.filter((v) => v.choice === o.id).length
  }))

  const mean = n ? scores.reduce((a, b) => a + b, 0) / n : null
  const sd = stdev(scores)
  return {
    count: n,
    mean: n ? round1(mean) : null,
    median: median(scores),
    stdev: n ? round1(sd) : null,
    min: n ? Math.min(...scores) : null,
    max: n ? Math.max(...scores) : null,
    spread: n ? Math.max(...scores) - Math.min(...scores) : null,
    distribution,
    stances,
    options,
    comments: session.votes.map((v) => v.comment).filter(Boolean),
    strength: consensusStrength(scores)
  }
}
