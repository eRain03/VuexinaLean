<template>
  <div class="layout-container">
    <div class="left-panel card-box">
      <KLineChart :data="klineList" />
    </div>
    <div class="right-panel card-box">
      <OrderBook :asks="orderBook.asks" :bids="orderBook.bids" />
    </div>
  </div>
</template>

<script setup>
// JS 代码逻辑部分完全不变
import { ref, onMounted, onUnmounted } from 'vue';
import KLineChart from './components/KLineChart.vue';
import OrderBook from './components/OrderBook.vue';
import { fetchHistoryCandles, loadHistoryFromLS, saveHistoryToLS, connectWebSocket } from './services/binanceService';

const klineList = ref([]);
const orderBook = ref({ asks: [], bids: [] });
let ws = null;

const onKlineUpdate = (candle, isClosed) => {
  if (klineList.value.length === 0) { klineList.value.push(candle); return; }
  const last = klineList.value[klineList.value.length - 1];
  if (candle[0] > last[0]) {
    klineList.value.push(candle);
    if (klineList.value.length > 500) klineList.value.shift();
  } else {
    klineList.value[klineList.value.length - 1] = candle;
  }
  if (isClosed) saveHistoryToLS(klineList.value);
};

const onDepthUpdate = (data) => { orderBook.value = data; };

onMounted(async () => {
  const cached = loadHistoryFromLS();
  if (cached && cached.length) klineList.value = cached;
  const history = await fetchHistoryCandles();
  if (history && history.length) {
    klineList.value = history;
    saveHistoryToLS(history);
  }
  ws = connectWebSocket(onKlineUpdate, onDepthUpdate);
});

onUnmounted(() => { if (ws) ws.close(); });
</script>

<style>
/* 引入 Roboto Mono 字体 (可选，如果没有网络会自动回退) */
@import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500&display=swap');

/* 全局重置 */
body {
  margin: 0;
  /* 全局背景色调深一点，让卡片浮现出来 */
  background: #0b0e11;
  color: #EAECEF;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.layout-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  /* 关键：增加内边距，让卡片不贴边 */
  padding: 16px;
  box-sizing: border-box;
  /* 关键：增加卡片之间的间距 */
  gap: 16px;
}

/* 通用卡片样式 */
.card-box {
  /* 卡片背景色，比大背景稍浅 */
  background: #171b26;
  /* 圆角 */
  border-radius: 12px;
  /* 柔和的阴影，增加立体感 */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  /* 确保内部内容不会溢出圆角 */
  overflow: hidden;
  /* 加上一个极细微的边框，增加精致感 */
  border: 1px solid #232733;
}

.left-panel {
  flex: 3;
  /* K线图卡片增加一点内边距，让图表呼吸 */
  padding: 10px;
  display: flex;
  flex-direction: column;
}

.right-panel {
  flex: 1;
  /* 深度图不需要内边距，因为它自己内部处理好了 */
}
</style>