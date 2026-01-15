<template>
  <div class="layout-container">

    <div class="control-bar">
      <div class="control-group">
        <span class="label">Symbol:</span>
        <button
            v-for="sym in supportedSymbols"
            :key="sym"
            :class="['ctrl-btn', { active: currentSymbol === sym }]"
            @click="switchSymbol(sym)"
        >
          {{ sym }}
        </button>
      </div>

      <div class="divider"></div>

      <div class="control-group">
        <span class="label">Time:</span>
        <button
            v-for="intv in supportedIntervals"
            :key="intv"
            :class="['ctrl-btn', { active: currentInterval === intv }]"
            @click="switchInterval(intv)"
        >
          {{ intv }}
        </button>
      </div>
    </div>

    <div class="main-content">
      <div class="left-panel card-box">
        <KLineChart :data="klineList" :key="currentSymbol + currentInterval" />
      </div>
      <div class="right-panel card-box">
        <OrderBook :asks="orderBook.asks" :bids="orderBook.bids" />
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import KLineChart from './components/KLineChart.vue';
import OrderBook from './components/OrderBook.vue';
import { fetchHistoryCandles, loadHistoryFromLS, saveHistoryToLS, connectWebSocket } from './services/binanceService';

// --- 配置项 ---
const supportedSymbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'DOGE/USDT'];
const supportedIntervals = ['1m', '15m', '1h', '4h', '1d'];

// --- 状态定义 ---
const currentSymbol = ref('BTC/USDT');
const currentInterval = ref('1m');

const klineList = ref([]);
const orderBook = ref({ asks: [], bids: [] });
let ws = null;

// --- 核心逻辑：初始化/重置数据 ---
const initData = async () => {
  // 1. 清理旧连接和数据
  if (ws) {
    ws.close();
    ws = null;
  }
  klineList.value = [];
  orderBook.value = { asks: [], bids: [] };

  const sym = currentSymbol.value;
  const intv = currentInterval.value;

  // 2. 尝试加载缓存
  const cached = loadHistoryFromLS(sym, intv);
  if (cached && cached.length) {
    klineList.value = cached;
  }

  // 3. 拉取最新历史数据
  const history = await fetchHistoryCandles(sym, intv);
  if (history && history.length) {
    klineList.value = history;
    saveHistoryToLS(history, sym, intv);
  }

  // 4. 建立 WebSocket 连接
  // 回调函数需要使用当前的 sym 和 intv 上下文
  ws = connectWebSocket(
      sym,
      intv,
      (candle, isClosed) => onKlineUpdate(candle, isClosed, sym, intv),
      onDepthUpdate
  );
};

// --- WebSocket 回调处理 ---
const onKlineUpdate = (candle, isClosed, sym, intv) => {
  // 防止旧 WS 的消息污染新状态 (双重保险)
  if (sym !== currentSymbol.value || intv !== currentInterval.value) return;

  if (klineList.value.length === 0) {
    klineList.value.push(candle);
    return;
  }

  const lastIndex = klineList.value.length - 1;
  const lastCandle = klineList.value[lastIndex];

  // 如果新K线时间 > 最后一根K线时间 -> 新增
  if (candle[0] > lastCandle[0]) {
    klineList.value.push(candle);
    // 保持数据长度不过长
    if (klineList.value.length > 500) klineList.value.shift();
  } else {
    // 否则 -> 更新当前这根
    klineList.value[lastIndex] = candle;
  }

  if (isClosed) {
    saveHistoryToLS(klineList.value, sym, intv);
  }
};

const onDepthUpdate = (data) => {
  orderBook.value = data;
};

// --- 切换事件 ---
const switchSymbol = (sym) => {
  if (currentSymbol.value === sym) return;
  currentSymbol.value = sym;
  initData(); // 重新初始化
};

const switchInterval = (intv) => {
  if (currentInterval.value === intv) return;
  currentInterval.value = intv;
  initData(); // 重新初始化
};

// --- 生命周期 ---
onMounted(() => {
  initData();
});

onUnmounted(() => {
  if (ws) ws.close();
});
</script>

<style>
/* 引入 Roboto Mono 字体 */
@import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500&display=swap');

body {
  margin: 0;
  background: #0b0e11;
  color: #EAECEF;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.layout-container {
  display: flex;
  flex-direction: column; /* 改为垂直布局，顶部放控制栏 */
  height: 100vh;
  width: 100vw;
  padding: 16px;
  box-sizing: border-box;
  gap: 16px;
}

/* 顶部控制栏样式 */
.control-bar {
  display: flex;
  align-items: center;
  background: #171b26;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #232733;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  min-height: 40px;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.divider {
  width: 1px;
  height: 20px;
  background: #2B2F3B;
  margin: 0 16px;
}

.label {
  color: #616876;
  font-size: 12px;
  margin-right: 4px;
  font-weight: 600;
}

.ctrl-btn {
  background: transparent;
  border: 1px solid transparent; /* 预留边框防止抖动 */
  color: #848E9C;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.ctrl-btn:hover {
  color: #EAECEF;
  background: #2B2F3B;
}

.ctrl-btn.active {
  color: #171b26;
  background: #F0B90B; /* 币安黄 */
  font-weight: bold;
}

/* 主内容区域，包含图表和盘口 */
.main-content {
  display: flex;
  flex: 1; /* 占据剩余高度 */
  gap: 16px;
  min-height: 0; /* 防止 flex 子项溢出 */
}

.card-box {
  background: #171b26;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  border: 1px solid #232733;
}

.left-panel {
  flex: 3;
  padding: 10px;
  display: flex;
  flex-direction: column;
}

.right-panel {
  flex: 1;
}
</style>