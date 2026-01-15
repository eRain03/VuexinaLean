<template>
  <div
      class="chart-wrapper"
      ref="wrapperRef"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
  >

    <div class="chart-block kline-block" :style="{ height: klineHeightPercent + '%' }">
      <div ref="kLineChartDom" class="chart-full"></div>
    </div>

    <div class="h-resizer" @mousedown.stop="startResizeDrag">
      <div class="h-resizer-line"></div>
    </div>

    <div class="chart-block vol-block" :style="{ height: (100 - klineHeightPercent) + '%' }">
      <div ref="volChartDom" class="chart-full"></div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as echarts from 'echarts';

const props = defineProps({
  data: { type: Array, default: () => [] },
});

// --- Refs ---
const wrapperRef = ref(null);
const kLineChartDom = ref(null);
const volChartDom = ref(null);
let kLineChart = null;
let volChart = null;

// --- 状态 ---
const klineHeightPercent = ref(72);
const isResizing = ref(false); // 是否在调节中间条
const isFirstRender = ref(true);

// --- 交互变量 (仅用于轴缩放) ---
const dragMode = ref(null); // 'y-zoom' | 'x-zoom' (注意：没有 'pan' 了，平移交给原生)
const lastMouseX = ref(0);
const lastMouseY = ref(0);
const startZoom = ref(null);

// 布局常量
const GRID_RIGHT = 60;
const GRID_BOTTOM = 25;
const GRID_CONFIG = { left: 10, right: 60 };

// 配色
const COLORS = {
  up: '#0ECB81', down: '#F6465D', bg: '#121212', grid: '#2C2C2C',
  text: '#757575', axisPointer: '#FFFFFF', crossLabel: '#2d323e',
  ma5: '#39FF14', ma10: '#00FFFF', ma30: '#D500F9', ema200: '#FF6D00'
};

// ----------------------------------------------------------------
// 1. 中间分割条调节
// ----------------------------------------------------------------
const startResizeDrag = () => {
  isResizing.value = true;
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
};

// ----------------------------------------------------------------
// 2. 鼠标交互逻辑 (原生 + 轴缩放外挂)
// ----------------------------------------------------------------

const handleMouseDown = (e) => {
  if (!wrapperRef.value || isResizing.value) return;

  const rect = wrapperRef.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const klineH = rect.height * (klineHeightPercent.value / 100);

  lastMouseX.value = e.clientX;
  lastMouseY.value = e.clientY;

  // 区域检测
  const isRightGutter = x > (rect.width - GRID_RIGHT);
  const isBottomGutter = y > (klineH - GRID_BOTTOM) && y < klineH;
  const isKLineArea = y < klineH;

  if (isRightGutter && isKLineArea) {
    // 【Y轴缩放】拦截！
    dragMode.value = 'y-zoom';
    document.body.style.cursor = 'ns-resize';
    const opt = kLineChart.getOption();
    if (opt.dataZoom && opt.dataZoom[1]) {
      startZoom.value = { start: opt.dataZoom[1].start, end: opt.dataZoom[1].end };
    }
    e.preventDefault();
    e.stopPropagation();
  } else if (isBottomGutter && !isRightGutter) {
    // 【X轴缩放】拦截！
    dragMode.value = 'x-zoom';
    document.body.style.cursor = 'ew-resize';
    const opt = kLineChart.getOption();
    if (opt.dataZoom && opt.dataZoom[0]) {
      startZoom.value = { start: opt.dataZoom[0].start, end: opt.dataZoom[0].end };
    }
    e.preventDefault();
    e.stopPropagation();
  } else {
    // 【中间区域】什么都不做！
    // 不拦截，不 preventDefault，让 ECharts 原生逻辑接管平移和滚轮
    dragMode.value = null;
  }
};

const handleMouseMove = (e) => {
  // A. 中间条调节
  if (isResizing.value && wrapperRef.value) {
    const rect = wrapperRef.value.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    let percent = (offsetY / rect.height) * 100;
    if (percent < 20) percent = 20; if (percent > 85) percent = 85;
    klineHeightPercent.value = percent;
    nextTick(() => resizeCharts());
    return;
  }

  if (!dragMode.value) return;

  const dx = e.clientX - lastMouseX.value;
  const dy = e.clientY - lastMouseY.value;

  // B. Y轴缩放
  if (dragMode.value === 'y-zoom' && startZoom.value) {
    applyYZoom(dy);
  }
  // C. X轴缩放
  else if (dragMode.value === 'x-zoom' && startZoom.value) {
    applyXZoom(dx);
  }

  // (没有 D 了，平移由 ECharts 自己搞定)

  lastMouseX.value = e.clientX;
  lastMouseY.value = e.clientY;
};

const handleMouseUp = () => {
  if (isResizing.value) {
    isResizing.value = false;
    document.body.style.cursor = '';
    return;
  }
  dragMode.value = null;
  startZoom.value = null;
  document.body.style.cursor = '';
};

// --- 缩放逻辑 ---
const applyYZoom = (dy) => {
  const scale = Math.exp((dy * 0.2) / 100);
  const { start, end } = startZoom.value;
  const range = end - start;
  const newRange = range * scale;
  if (newRange > 100 || newRange < 2) return;
  const center = (start + end) / 2;
  kLineChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: center - newRange/2, end: center + newRange/2 });
};

const applyXZoom = (dx) => {
  const scale = Math.exp((dx * 0.2) / 100);
  const { start, end } = startZoom.value;
  const range = end - start;
  const newRange = range * (1/scale);
  if (newRange > 100 || newRange < 0.5) return;
  const center = (start + end) / 2;
  let ns = center - newRange/2; let ne = center + newRange/2;
  if (ns < 0) { ns=0; ne=newRange; } if (ne > 100) { ne=100; ns=100-newRange; }
  kLineChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: ns, end: ne });
};

// ----------------------------------------------------------------
// 3. ECharts 初始化
// ----------------------------------------------------------------

const formatTime = (ts, format = 'full') => {
  if (!ts) return ''; const d = new Date(Number(ts));
  const M = (d.getMonth()+1).toString().padStart(2,'0'); const D = d.getDate().toString().padStart(2,'0');
  const h = d.getHours().toString().padStart(2,'0'); const m = d.getMinutes().toString().padStart(2,'0');
  return format==='short'?`${h}:${m}`:`${M}-${D} ${h}:${m}`;
};

const calculateMA = (days, data) => {
  const res = [];
  for (let i = 0; i < data.length; i++) {
    if (i < days) { res.push('-'); continue; }
    let sum = 0; for (let j = 0; j < days; j++) sum += +data[i - j][1];
    res.push((sum / days).toFixed(2));
  }
  return res;
};

const calculateEMA = (days, data) => {
  const res = [];
  const k = 2 / (days + 1);
  let ema = 0;
  for (let i = 0; i < data.length; i++) {
    const close = +data[i][1];
    if (i < days - 1) { res.push('-'); continue; }
    if (i === days - 1) {
      let sum = 0; for (let j = 0; j < days; j++) sum += +data[i - j][1];
      ema = sum / days;
    } else {
      ema = (close - ema) * k + ema;
    }
    res.push(ema.toFixed(2));
  }
  return res;
};

const initCharts = () => {
  if (!kLineChartDom.value || !volChartDom.value) return;

  kLineChart = echarts.init(kLineChartDom.value);
  volChart = echarts.init(volChartDom.value);
  echarts.connect([kLineChart, volChart]);

  // 【核心恢复】
  // 恢复 zoomOnMouseWheel 和 moveOnMouseMove 为 true
  // 这意味着：只要 dragMode 是 null，ECharts 就会接管，提供最完美的平移和缩放体验
  const baseDataZoom = [
    {
      type: 'inside', xAxisIndex: [0],
      zoomOnMouseWheel: true, // 滚轮缩放时间：开启
      moveOnMouseMove: true,  // 拖拽平移：开启 (原生手感)
      moveOnMouseWheel: true
    },
    {
      type: 'inside', yAxisIndex: [0],
      zoomOnMouseWheel: false,
      moveOnMouseMove: false // Y轴平移我们自己管
    }
  ];

  const kLineOption = {
    backgroundColor: 'transparent', animation: false,
    grid: { left: 10, right: GRID_RIGHT, top: 20, bottom: GRID_BOTTOM },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', lineStyle: { color: COLORS.axisPointer, type: 'dashed', opacity: 0.5 }, label: { backgroundColor: COLORS.crossLabel, formatter: p=>p.axisDimension==='x'?formatTime(p.value,'full'):p.value.toFixed(2) } },
      backgroundColor: 'rgba(18,18,18,0.95)', borderColor: '#333', borderWidth: 1, textStyle: { color: '#E0E0E0', fontSize: 12 },
      formatter: p => {
        let k = p.find(i=>i.seriesName==='KLine'); if(!k)return'';
        const [o,c,l,h] = k.data.slice(1);
        const chg = ((c-o)/o*100).toFixed(2); const clr = chg>=0 ? COLORS.up : COLORS.down;
        let emaVal = ''; const emaObj = p.find(i=>i.seriesName==='EMA200');
        if (emaObj && emaObj.value !== '-') emaVal = `<span style="color:${COLORS.ema200}; font-weight:bold">EMA200: ${emaObj.value}</span>`;

        let ma5=p.find(i=>i.seriesName==='MA5'), ma10=p.find(i=>i.seriesName==='MA10'), ma30=p.find(i=>i.seriesName==='MA30');
        let tag = '';
        if (ma5&&ma10&&ma30 && ma5.value!=='-' && ma30.value!=='-') {
          const P=parseFloat(c), M5=parseFloat(ma5.value), M10=parseFloat(ma10.value), M30=parseFloat(ma30.value);
          if (P>M5 && M5>M10 && M10>M30) tag = `<div style="margin-top:6px; color:${COLORS.up}; font-weight:bold; border:1px solid ${COLORS.up}; padding:2px; text-align:center; border-radius:4px; background:rgba(14,203,129,0.1)">🚀 多头排列</div>`;
          else if (P<M5 && M5<M10 && M10<M30) tag = `<div style="margin-top:6px; color:${COLORS.down}; font-weight:bold; border:1px solid ${COLORS.down}; padding:2px; text-align:center; border-radius:4px; background:rgba(246,70,93,0.1)">💥 空头排列</div>`;
        }

        return `<div style="font-family:'Roboto Mono'; min-width:140px;">
          <div style="color:#777;font-size:11px;margin-bottom:4px">${formatTime(k.name)}</div>
          <div style="display:flex;justify-content:space-between"><span>O:</span><span style="color:${clr}">${o}</span></div>
          <div style="display:flex;justify-content:space-between"><span>H:</span><span style="color:${clr}">${h}</span></div>
          <div style="display:flex;justify-content:space-between"><span>L:</span><span style="color:${clr}">${l}</span></div>
          <div style="display:flex;justify-content:space-between"><span>C:</span><span style="color:${clr}">${c}</span></div>
          <div style="display:flex;justify-content:space-between;border-top:1px solid #333;margin-top:4px;padding-top:4px"><span>Chg:</span><span style="color:${clr}">${chg}%</span></div>
          <div style="margin-top:4px;font-size:11px">${emaVal}</div>
          ${tag}
        </div>`;
      }
    },
    xAxis: { type: 'category', data: [], boundaryGap: true, axisLine: { show: true, lineStyle: { color: COLORS.grid } }, axisLabel: { show: true, color: COLORS.text, fontSize: 11, margin: 8, formatter: v=>formatTime(v,'short') }, axisTick: {show:false}, splitLine: {show:true, lineStyle:{color:COLORS.grid, width:0.5}} },
    yAxis: { scale: true, position: 'right', splitLine: { show: true, lineStyle: { color: COLORS.grid, width: 0.5 } }, axisLabel: { color: COLORS.text, fontSize: 11, formatter: v=>v.toFixed(2) } },
    dataZoom: baseDataZoom,
    series: [
      { name: 'KLine', type: 'candlestick', data: [], itemStyle: { color: COLORS.up, color0: COLORS.down, borderColor: COLORS.up, borderColor0: COLORS.down }, markLine: { symbol: ['none','none'], silent: true, data: [] } },
      { name: 'MA5', type: 'line', data: [], smooth: true, showSymbol: false, lineStyle: { width: 1, color: COLORS.ma5 } },
      { name: 'MA10', type: 'line', data: [], smooth: true, showSymbol: false, lineStyle: { width: 1, color: COLORS.ma10 } },
      { name: 'MA30', type: 'line', data: [], smooth: true, showSymbol: false, lineStyle: { width: 1, color: COLORS.ma30 } },
      { name: 'EMA200', type: 'line', data: [], smooth: true, showSymbol: false, lineStyle: { width: 3, color: COLORS.ema200 } }
    ]
  };

  const volOption = {
    backgroundColor: 'transparent', animation: false,
    grid: { left: 10, right: GRID_RIGHT, top: 5, bottom: 5 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross', lineStyle: { color: COLORS.axisPointer, type: 'dashed', opacity: 0.5 }, label: { backgroundColor: COLORS.crossLabel, formatter: p=>p.axisDimension==='x'?formatTime(p.value,'full'):parseInt(p.value) } }, backgroundColor: 'rgba(18,18,18,0.9)', borderColor: '#333', textStyle: { color: '#E0E0E0' }, formatter: p=>{ let v=p.find(i=>i.seriesName==='Volume'); return v?`Vol: ${parseInt(v.value)}`:'' } },
    xAxis: { type: 'category', data: [], boundaryGap: true, axisLine: {show:false}, axisTick: {show:false}, axisLabel: {show:false}, splitLine: {show:true, lineStyle:{color:COLORS.grid, width:0.5}} },
    yAxis: { scale: true, position: 'right', splitNumber: 2, splitLine: {show:false}, axisLine: {show:false}, axisLabel: {show:false} },
    dataZoom: [{ type: 'inside', xAxisIndex: [0], moveOnMouseMove: true }], // 成交量跟随移动
    series: [{ name: 'Volume', type: 'bar', data: [], itemStyle: { color: p=>p.value[2]===1?COLORS.up:COLORS.down } }]
  };

  kLineChart.setOption(kLineOption);
  volChart.setOption(volOption);
  window.addEventListener('resize', resizeCharts);
};

// --- 更新数据 ---
const updateCharts = () => {
  if (!kLineChart || !volChart || !props.data || props.data.length === 0) return;
  const rawData = props.data;
  const realDates = rawData.map(item => item[0]);
  let interval = 60000;
  if (realDates.length > 1) interval = realDates[realDates.length-1] - realDates[realDates.length-2];
  const lastTime = realDates[realDates.length-1];
  const futureDates = [];
  for(let i=1;i<=40;i++) futureDates.push(lastTime + interval*i);
  const fullXAxisData = [...realDates, ...futureDates];
  const klineData = rawData.map(item => [item[1], item[4], item[3], item[2]]);
  const volData = rawData.map((item, i) => [i, item[5], item[4] >= item[1] ? 1 : -1]);

  const ma5 = calculateMA(5, klineData);
  const ma10 = calculateMA(10, klineData);
  const ma30 = calculateMA(30, klineData);
  const ema200 = calculateEMA(200, klineData);

  const lastCandle = klineData[klineData.length-1];
  const curPrice = lastCandle ? lastCandle[1] : 0;
  const clr = (lastCandle && lastCandle[1] >= lastCandle[0]) ? COLORS.up : COLORS.down;

  kLineChart.setOption({
    xAxis: { data: fullXAxisData },
    series: [
      { data: klineData, markLine: { data: [{ yAxis: curPrice, label: { show: true, position: 'end', formatter: '{c}', color: '#fff', backgroundColor: clr, padding: [2, 4], borderRadius: 2 }, lineStyle: { type: 'dashed', color: clr, width: 1, opacity: 0.8 } }] } },
      { data: ma5 }, { data: ma10 }, { data: ma30 }, { data: ema200 }
    ]
  });
  volChart.setOption({ xAxis: { data: fullXAxisData }, series: [ { data: volData } ] });

  if (isFirstRender.value) {
    const s = Math.max(0, realDates.length - 60);
    const e = Math.min(fullXAxisData.length - 1, realDates.length + 5);
    kLineChart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, startValue: s, endValue: e });
    isFirstRender.value = false;
  }
};

const resizeCharts = () => { if (kLineChart) kLineChart.resize(); if (volChart) volChart.resize(); };

onMounted(() => { initCharts(); if (props.data.length > 0) updateCharts(); });
onUnmounted(() => { window.removeEventListener('resize', resizeCharts); if (kLineChart) kLineChart.dispose(); if (volChart) volChart.dispose(); });
watch(() => props.data, () => { nextTick(() => updateCharts()); }, { deep: false });
</script>

<style scoped>
.chart-wrapper { width: 100%; height: 100%; display: flex; flex-direction: column; background-color: #121212; position: relative; overflow: hidden; }
.chart-block { width: 100%; position: relative; overflow: hidden; }
.chart-full { width: 100%; height: 100%; }
.h-resizer { height: 6px; background: #121212; cursor: row-resize; display: flex; align-items: center; justify-content: center; z-index: 20; flex-shrink: 0; }
.h-resizer-line { width: 100%; height: 1px; background-color: #2C2C2C; transition: all 0.2s; }
.h-resizer:hover .h-resizer-line, .h-resizer:active .h-resizer-line { background-color: #FF6D00; height: 2px; }
</style>