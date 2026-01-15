<template>
  <div class="chart-container">
    <div ref="chartDom" class="chart-main"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as echarts from 'echarts';

// --- 定义 Props ---
const props = defineProps({
  // 数据格式假设: [timestamp, open, high, low, close, volume]
  data: {
    type: Array,
    default: () => []
  },
  // 图表高度
  height: {
    type: String,
    default: '100%'
  }
});

// --- 内部变量 ---
const chartDom = ref(null);
let myChart = null;

// 配色常量 (TradingView/Binance 风格)
const COLORS = {
  up: '#0ECB81',        // 涨 (绿)
  down: '#F6465D',      // 跌 (红)
  bg: '#161A1E',        // 背景深色
  grid: '#232733',      // 网格线
  text: '#848E9C',      // 普通文本
  axisPointer: '#758696', // 十字光标线
  ma5: '#f5d52eb8',     // MA5 黄色
  ma10: '#8c42bda6',    // MA10 紫色
  ma30: '#2e7df5b8'     // MA30 蓝色
};

// --- 工具函数：计算移动平均线 (MA) ---
const calculateMA = (dayCount, data) => {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < dayCount) {
      result.push('-'); // 数据不足时不显示
      continue;
    }
    let sum = 0;
    for (let j = 0; j < dayCount; j++) {
      // data[i][1] 是 Close 收盘价 (ECharts data 格式化后: [Open, Close, Low, High])
      sum += +data[i - j][1];
    }
    result.push((sum / dayCount).toFixed(2));
  }
  return result;
};

// --- 核心绘图逻辑 ---
const initChart = () => {
  if (!chartDom.value) return;

  // 初始化实例
  myChart = echarts.init(chartDom.value);

  // 基础配置骨架
  const option = {
    backgroundColor: 'transparent', // 透明背景，适应父容器
    animation: false, // 禁用动画以提高大数据量下的性能

    // 布局：主图(K线)占大头，副图(成交量)占底部
    grid: [
      {
        left: '10px', right: '60px', top: '20px', height: '65%', // 主图
        containLabel: false
      },
      {
        left: '10px', right: '60px', top: '78%', height: '15%', // 副图
        containLabel: false
      }
    ],

    // 交互：十字光标
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        lineStyle: { color: COLORS.axisPointer, width: 1, type: 'dashed' }, // 十字线样式
        label: { backgroundColor: '#2d323e', color: '#fff' } // 轴标签背景
      },
      backgroundColor: 'rgba(22, 26, 30, 0.9)',
      borderColor: '#2c3038',
      padding: 10,
      textStyle: { color: '#dfe2e5' },
      // 自定义悬浮层
      formatter: function (params) {
        let kLine = params.find(p => p.seriesName === 'KLine');
        let ma5 = params.find(p => p.seriesName === 'MA5');
        let ma10 = params.find(p => p.seriesName === 'MA10');
        let ma30 = params.find(p => p.seriesName === 'MA30');

        if (!kLine) return '';

        // 数据解构：ECharts传入的数值 [open, close, low, high]
        const [open, close, low, high] = kLine.data.slice(1);
        const vol = params.find(p => p.seriesName === 'Volume')?.value;

        // 计算涨跌幅
        const change = ((close - open) / open * 100).toFixed(2);
        const color = change >= 0 ? COLORS.up : COLORS.down;

        // 构建 HTML
        let html = `<div style="font-size: 12px; font-family: 'Roboto Mono', monospace;">`;
        html += `<div><span style="color: #666">时间:</span> ${kLine.name}</div>`;
        html += `<div style="margin-top: 4px">
          <span style="margin-right: 8px">开: <span style="color:${color}">${open}</span></span>
          <span style="margin-right: 8px">高: <span style="color:${color}">${high}</span></span>
          <span style="margin-right: 8px">低: <span style="color:${color}">${low}</span></span>
          <span style="margin-right: 8px">收: <span style="color:${color}">${close}</span></span>
        </div>`;
        html += `<div style="margin-top: 4px">
          <span style="margin-right: 8px">涨跌: <span style="color:${color}">${change}%</span></span>
          <span>量: ${parseInt(vol)}</span>
        </div>`;

        // MA 数值显示
        if (ma5 || ma10 || ma30) {
          html += `<div style="margin-top: 8px; padding-top:4px; border-top:1px solid #333;">`;
          if(ma5) html += `<span style="color:${COLORS.ma5}; margin-right:10px">MA5: ${ma5.value}</span>`;
          if(ma10) html += `<span style="color:${COLORS.ma10}; margin-right:10px">MA10: ${ma10.value}</span>`;
          if(ma30) html += `<span style="color:${COLORS.ma30}">MA30: ${ma30.value}</span>`;
          html += `</div>`;
        }

        html += `</div>`;
        return html;
      }
    },

    axisPointer: {
      link: { xAxisIndex: 'all' }, // 上下轴同步
      label: { backgroundColor: '#777' }
    },

    // --- 关键修改：xAxis ---
    // 移除了 min/max 设置，让 dataZoom 完全控制可视范围
    xAxis: [
      {
        type: 'category',
        data: [],
        boundaryGap: true,
        axisLine: { onZero: false, show: false },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: COLORS.grid, width: 0.5 } },
        axisLabel: { show: false }
        // REMOVED: min: 'dataMin', max: 'dataMax' (这会阻止平移)
        // REMOVED: scale: true (对 category 轴无效)
      },
      {
        type: 'category',
        gridIndex: 1, // 对应副图
        data: [],
        boundaryGap: true,
        axisLine: { lineStyle: { color: COLORS.grid } },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: COLORS.grid, width: 0.5 } },
        axisLabel: { color: COLORS.text, fontSize: 10, padding: [0, 0, 0, 0] }
        // REMOVED: min: 'dataMin', max: 'dataMax'
      }
    ],

    // 两个 Y 轴
    yAxis: [
      {
        scale: true,
        position: 'right', // 价格轴在右侧
        splitLine: { show: true, lineStyle: { color: COLORS.grid, width: 0.5 } },
        axisLine: { show: false },
        axisLabel: {
          color: COLORS.text,
          fontSize: 11,
          fontFamily: 'Arial',
          formatter: (value) => value.toFixed(2)
        }
      },
      {
        scale: true,
        gridIndex: 1, // 成交量轴
        position: 'right',
        splitNumber: 2,
        axisLabel: { show: false },
        axisLine: { show: false },
        splitLine: { show: false }
      }
    ],

    // --- 关键修改：dataZoom ---
    // 增强交互配置，确保鼠标拖拽被识别为平移
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        start: 50, // 默认显示后 50%
        end: 100,
        throttle: 20,
        // 显式开启行为
        zoomOnMouseWheel: true, // 滚轮缩放
        moveOnMouseMove: true,  // 鼠标拖拽平移 (解决无法平移的核心)
        preventDefaultMouseMove: false // 允许事件穿透，防止部分浏览器阻塞
      },
      {
        type: 'slider',
        xAxisIndex: [0, 1],
        height: 14,
        bottom: 0,
        borderColor: COLORS.bg,
        fillerColor: '#303642',
        handleStyle: { color: '#596275' },
        showDetail: false,
        dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
        brushSelect: false
      }
    ],

    // 系列数据占位
    series: [
      {
        name: 'KLine',
        type: 'candlestick',
        data: [],
        itemStyle: {
          color: COLORS.up,
          color0: COLORS.down,
          borderColor: COLORS.up,
          borderColor0: COLORS.down
        },
        large: true
      },
      {
        name: 'MA5',
        type: 'line',
        data: [],
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1, color: COLORS.ma5 }
      },
      {
        name: 'MA10',
        type: 'line',
        data: [],
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1, color: COLORS.ma10 }
      },
      {
        name: 'MA30',
        type: 'line',
        data: [],
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1, color: COLORS.ma30 }
      },
      {
        name: 'Volume',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: [],
        itemStyle: {
          color: (params) => params.value[2] === 1 ? COLORS.up : COLORS.down
        }
      }
    ]
  };

  myChart.setOption(option);
  window.addEventListener('resize', resizeChart);
};

// --- 数据更新逻辑 ---
const updateChart = () => {
  if (!myChart || !props.data || props.data.length === 0) return;

  const rawData = props.data;
  const dates = rawData.map(item => item[0]);
  const klineData = rawData.map(item => [item[1], item[4], item[3], item[2]]);

  const volumeData = rawData.map((item, i) => [
    i,
    item[5],
    item[4] >= item[1] ? 1 : -1
  ]);

  const ma5 = calculateMA(5, klineData);
  const ma10 = calculateMA(10, klineData);
  const ma30 = calculateMA(30, klineData);

  myChart.setOption({
    xAxis: [
      { data: dates },
      { data: dates }
    ],
    series: [
      { data: klineData },
      { data: ma5 },
      { data: ma10 },
      { data: ma30 },
      { data: volumeData }
    ]
  });
};

const resizeChart = () => {
  if (myChart) myChart.resize();
};

// --- 生命周期与监听 ---
onMounted(() => {
  initChart();
  if (props.data.length > 0) {
    updateChart();
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', resizeChart);
  if (myChart) myChart.dispose();
});

watch(() => props.data, () => {
  nextTick(() => updateChart());
}, { deep: false });

</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 100%;
  background-color: #161A1E;
  position: relative;
  overflow: hidden;
}

.chart-main {
  width: 100%;
  height: 100%;
}
</style>