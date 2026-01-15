<template>
  <div class="chart-container">
    <div ref="chartDom" class="chart-main"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as echarts from 'echarts';

// --- Props ---
const props = defineProps({
  data: {
    type: Array,
    default: () => []
  },
  height: {
    type: String,
    default: '100%'
  }
});

// --- 内部变量 ---
const chartDom = ref(null);
let myChart = null;
const isFirstRender = ref(true); // 用于控制首次加载时的视图位置

// 常量配置
const FUTURE_BARS_COUNT = 40; // 向右预留多少根空白K线的位置

// 配色常量
const COLORS = {
  up: '#0ECB81',        // 涨 (绿)
  down: '#F6465D',      // 跌 (红)
  bg: '#161A1E',        // 背景
  grid: '#232733',      // 网格
  text: '#848E9C',      // 文本
  axisPointer: '#758696',
  ma5: '#f5d52eb8',
  ma10: '#8c42bda6',
  ma30: '#2e7df5b8'
};

// --- 时间格式化 ---
const formatTime = (ts, format = 'full') => {
  if (!ts) return '';
  const date = new Date(Number(ts));
  const M = (date.getMonth() + 1).toString().padStart(2, '0');
  const D = date.getDate().toString().padStart(2, '0');
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');

  if (format === 'short') return `${h}:${m}`;
  return `${M}-${D} ${h}:${m}`;
};

// --- MA 计算 ---
const calculateMA = (dayCount, data) => {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < dayCount) {
      result.push('-');
      continue;
    }
    let sum = 0;
    for (let j = 0; j < dayCount; j++) {
      sum += +data[i - j][1];
    }
    result.push((sum / dayCount).toFixed(2));
  }
  return result;
};

// --- 初始化图表 ---
const initChart = () => {
  if (!chartDom.value) return;

  myChart = echarts.init(chartDom.value);

  const option = {
    backgroundColor: 'transparent',
    animation: false,
    grid: [
      {
        left: '10px', right: '60px', top: '20px', height: '65%',
        containLabel: false
      },
      {
        left: '10px', right: '60px', top: '78%', height: '15%',
        containLabel: false
      }
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        lineStyle: { color: COLORS.axisPointer, width: 1, type: 'dashed' },
        label: { backgroundColor: '#2d323e', color: '#fff' }
      },
      backgroundColor: 'rgba(22, 26, 30, 0.9)',
      borderColor: '#2c3038',
      padding: 10,
      textStyle: { color: '#dfe2e5' },
      formatter: function (params) {
        let kLine = params.find(p => p.seriesName === 'KLine');
        // 如果鼠标滑到了未来的空白处，这里可能找不到 KLine 数据，直接返回空
        if (!kLine || !kLine.data || kLine.data.length < 2) return '';

        const [open, close, low, high] = kLine.data.slice(1);
        const volItem = params.find(p => p.seriesName === 'Volume');
        const vol = volItem ? volItem.value : 0;

        const change = ((close - open) / open * 100).toFixed(2);
        const color = change >= 0 ? COLORS.up : COLORS.down;
        const displayTime = formatTime(kLine.name);

        let html = `<div style="font-size: 12px; font-family: 'Roboto Mono', monospace;">`;
        html += `<div><span style="color: #666">时间:</span> ${displayTime}</div>`;
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
        html += `</div>`;
        return html;
      }
    },
    axisPointer: {
      link: { xAxisIndex: 'all' },
      label: { backgroundColor: '#777' }
    },
    xAxis: [
      {
        type: 'category',
        data: [], // 稍后填充
        boundaryGap: true,
        axisLine: { onZero: false, show: false },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: COLORS.grid, width: 0.5 } },
        axisLabel: { show: false }
      },
      {
        type: 'category',
        gridIndex: 1,
        data: [],
        boundaryGap: true,
        axisLine: { lineStyle: { color: COLORS.grid } },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: COLORS.grid, width: 0.5 } },
        axisLabel: {
          color: COLORS.text,
          fontSize: 10,
          padding: [0, 0, 0, 0],
          formatter: (value) => formatTime(value, 'short')
        }
      }
    ],
    yAxis: [
      {
        scale: true,
        position: 'right',
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
        gridIndex: 1,
        position: 'right',
        splitNumber: 2,
        axisLabel: { show: false },
        axisLine: { show: false },
        splitLine: { show: false }
      }
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        // 这里不设置 start/end，在 updateChart 中动态计算
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        preventDefaultMouseMove: false
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
        large: true,
        // 现价虚线
        markLine: {
          symbol: ['none', 'none'],
          silent: true,
          animation: false,
          data: []
        }
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

// --- 更新逻辑 (核心修改) ---
const updateChart = () => {
  if (!myChart || !props.data || props.data.length === 0) return;

  const rawData = props.data;
  const realDates = rawData.map(item => item[0]);

  // 1. 计算时间间隔 (Interval)
  let interval = 60 * 1000; // 默认 1分钟
  if (realDates.length > 1) {
    interval = realDates[realDates.length - 1] - realDates[realDates.length - 2];
  }

  // 2. 生成未来空白时间戳
  const lastTime = realDates[realDates.length - 1];
  const futureDates = [];
  for (let i = 1; i <= FUTURE_BARS_COUNT; i++) {
    futureDates.push(lastTime + interval * i);
  }

  // 3. 合并时间轴：真实时间 + 未来空白时间
  // X轴有了这些数据，你就可以往右滑动了
  const fullXAxisData = [...realDates, ...futureDates];

  const klineData = rawData.map(item => [item[1], item[4], item[3], item[2]]);
  const volumeData = rawData.map((item, i) => [
    i,
    item[5],
    item[4] >= item[1] ? 1 : -1
  ]);

  const ma5 = calculateMA(5, klineData);
  const ma10 = calculateMA(10, klineData);
  const ma30 = calculateMA(30, klineData);

  // 4. 计算现价线 (只基于真实数据的最后一根)
  const lastCandle = klineData[klineData.length - 1];
  const currentPrice = lastCandle ? lastCandle[1] : 0;
  const isUp = lastCandle ? lastCandle[1] >= lastCandle[0] : true;
  const lineColor = isUp ? COLORS.up : COLORS.down;

  // 5. 准备 Option
  const option = {
    xAxis: [
      { data: fullXAxisData },
      { data: fullXAxisData }
    ],
    series: [
      {
        data: klineData, // 数据长度比 X 轴短，ECharts 会自动在后面留白
        markLine: {
          data: [
            {
              yAxis: currentPrice,
              label: {
                show: true,
                position: 'end', // 标签显示在最右侧 (空白区域的边缘)
                formatter: '{c}',
                color: '#fff',
                backgroundColor: lineColor,
                padding: [2, 4],
                borderRadius: 2
              },
              lineStyle: {
                type: 'dashed',
                color: lineColor,
                width: 1,
                opacity: 0.8
              }
            }
          ]
        }
      },
      { data: ma5 },
      { data: ma10 },
      { data: ma30 },
      { data: volumeData }
    ]
  };

  // 6. 首次加载时的 Smart Zoom
  // 我们不希望一开始就显示 50 根空白，那样太丑了。
  // 我们希望默认显示：[所有历史数据] + [5根空白]
  // 这样用户会感觉到“哦，右边还有空间”，然后他可以自己滑过去。
  if (isFirstRender.value) {
    // 计算显示范围
    const totalLen = fullXAxisData.length;
    const realLen = realDates.length;
    // 默认显示最后 60 根 (如果数据够的话)
    const startValue = Math.max(0, realLen - 60);
    // 结束位置 = 真实数据末尾 + 5根空白
    const endValue = Math.min(totalLen - 1, realLen + 5);

    option.dataZoom = [
      { startValue, endValue }, // inside 组件
      { startValue, endValue }  // slider 组件
    ];

    isFirstRender.value = false;
  }

  myChart.setOption(option);
};

const resizeChart = () => {
  if (myChart) myChart.resize();
};

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