import { describe, it, expect } from 'vitest'
import { median, stdev, stanceOf, consensusStrength, aggregate } from './server_stats.js'

describe('stats', () => {
  it('median / stdev', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBe(null)
    expect(stdev([5, 5, 5])).toBe(0)
    expect(stdev([1, 10])).toBe(4.5)
  })

  it('三档表态', () => {
    expect([1, 4, 5, 7, 8, 10].map(stanceOf)).toEqual(['disagree', 'disagree', 'conditional', 'conditional', 'agree', 'agree'])
  })

  it('共识强度分级', () => {
    expect(consensusStrength([]).level).toBe('none')
    expect(consensusStrength([9, 9, 8, 9, 8]).level).toBe('strong')
    expect(consensusStrength([9, 9, 9, 9, 3]).level).toBe('conditional') // 有人不同意就不算“已达成”
    expect(consensusStrength([1, 10, 1, 10]).level).toBe('split')
    expect(consensusStrength([5, 5, 6, 5]).level).toBe('weak')
    expect(consensusStrength([10, 10, 10]).index).toBe(100)
    expect(consensusStrength([1, 10]).index).toBe(0)
  })

  it('aggregate 空投票', () => {
    const r = aggregate({ votes: [], options: [] })
    expect(r.count).toBe(0)
    expect(r.mean).toBe(null)
    expect(r.strength.label).toBe('暂无投票')
  })
})
