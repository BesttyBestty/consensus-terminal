<template>
  <div class="chart" :class="{ big }">
    <div class="bars">
      <div v-for="(n, i) in results.distribution" :key="i" class="col">
        <span class="count">{{ n || '' }}</span>
        <div class="bar" :style="{ height: barHeight(n), background: color(i + 1) }"></div>
        <span class="tick">{{ i + 1 }}</span>
      </div>
    </div>
    <div class="legend">
      <span><i :style="{ background: 'var(--disagree)' }"></i>不同意 1–4 · {{ results.stances.disagree }}</span>
      <span><i :style="{ background: 'var(--cond)' }"></i>有条件 5–7 · {{ results.stances.conditional }}</span>
      <span><i :style="{ background: 'var(--agree)' }"></i>同意 8–10 · {{ results.stances.agree }}</span>
    </div>
    <div class="stats">
      <div><b>{{ results.count }}</b><span>人投票</span></div>
      <div><b>{{ results.mean ?? '–' }}</b><span>均值</span></div>
      <div><b>{{ results.median ?? '–' }}</b><span>中位数</span></div>
      <div><b>{{ results.stdev ?? '–' }}</b><span>标准差</span></div>
      <div><b>{{ results.strength.index ?? '–' }}</b><span>共识指数</span></div>
    </div>
    <div v-if="results.options?.length" class="options">
      <div v-for="o in results.options" :key="o.id" class="opt">
        <span class="grow">{{ o.text }}</span>
        <div class="optbar"><div :style="{ width: optWidth(o.count) }"></div></div>
        <b>{{ o.count }}</b>
      </div>
    </div>
  </div>
</template>

<script setup>
import { STANCE_COLOR, stanceOf } from './api.js'

const props = defineProps({ results: { type: Object, required: true }, big: Boolean })
const max = () => Math.max(1, ...props.results.distribution)
const barHeight = (n) => (n ? `${(n / max()) * 100}%` : '2px')
const color = (s) => STANCE_COLOR[stanceOf(s)]
const optWidth = (c) => `${props.results.count ? (c / props.results.count) * 100 : 0}%`
</script>

<style scoped>
.bars { display: grid; grid-template-columns: repeat(10, 1fr); gap: 6px; height: 140px; align-items: end; }
.big .bars { height: 34vh; gap: 12px; }
.col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
.bar { width: 100%; border-radius: 6px 6px 2px 2px; min-height: 2px; transition: height .4s ease; }
.count { font-size: 12px; font-weight: 600; min-height: 18px; }
.tick { font-size: 12px; color: var(--muted); margin-top: 4px; }
.big .count, .big .tick { font-size: 22px; }
.legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--muted); margin-top: 10px; }
.big .legend { font-size: 18px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; }
.stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 12px; text-align: center; }
.stats b { display: block; font-size: 20px; }
.big .stats b { font-size: 44px; }
.stats span { font-size: 12px; color: var(--muted); }
.big .stats span { font-size: 18px; }
.options { margin-top: 12px; }
.opt { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-top: 6px; }
.optbar { width: 35%; height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
.optbar div { height: 100%; background: var(--primary); }
</style>
