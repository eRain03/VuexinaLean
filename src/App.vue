<template>
  <div class="layout-container">

    <div class="control-bar">
      <div class="bar-left">
        <div class="control-group scrollable-group">
          <span class="label">Favorites:</span>
          <div
              v-for="sym in favorites"
              :key="sym"
              :class="['ctrl-btn', 'symbol-btn', { active: currentSymbol === sym }]"
              @click="switchSymbol(sym)"
              title="Click to view"
          >
            {{ sym }}
          </div>
          <span v-if="favorites.length === 0" class="empty-tip">No favorites yet</span>
        </div>
      </div>

      <div class="divider"></div>

      <div class="bar-right">
        <div class="current-info-group">
          <span class="current-symbol">{{ currentSymbol }}</span>
          <button
              class="star-btn"
              @click="toggleFavorite"
              :title="isFavorite ? 'Remove from favorites' : 'Add to favorites'"
          >
            <span v-if="isFavorite" style="color: #FF95A5;">★</span>
            <span v-else style="color: #5E6673;">☆</span>
          </button>
        </div>

        <div class="control-group">
          <button
              v-for="intv in supportedIntervals"
              :key="intv"
              :class="['ctrl-btn', { active: currentInterval === intv }]"
              @click="switchInterval(intv)"
          >
            {{ intv }}
          </button>
        </div>

        <div class="search-box">
          <input
              v-model="searchQuery"
              @keyup.enter="handleSearch"
              type="text"
              placeholder="Search Coin"
              class="search-input"
          />
          <button @click="handleSearch" class="action-btn" :disabled="isSearching">
            {{ isSearching ? '...' : 'Go' }}
          </button>
        </div>
      </div>
    </div>

    <div class="main-content" ref="mainContainer" @mousemove="onDrag" @mouseup="stopDrag" @mouseleave="stopDrag">

      <div class="left-panel card-box" :style="{ width: chartWidthPercent + '%' }">
        <KLineChart :data="klineList" :key="currentSymbol + currentInterval" />
      </div>

      <div class="resizer" @mousedown="startDrag">
        <div class="resizer-line"></div>
      </div>

      <div class="right-panel card-box">
        <OrderBook :asks="orderBook.asks" :bids="orderBook.bids" />
      </div>

    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import KLineChart from './components/KLineChart.vue';
import OrderBook from './components/OrderBook.vue';
import { fetchHistoryCandles, loadHistoryFromLS, saveHistoryToLS, connectWebSocket } from './services/binanceService';

// --- 配置项 ---
const supportedIntervals = ['1m', '15m', '1h', '4h', '1d'];
const LS_FAV_KEY = 'user_favorites_coins';

// --- 状态定义 ---
const favorites = ref(['BTC/USDT', 'ETH/USDT', 'BNB/USDT']);
const searchQuery = ref('');
const isSearching = ref(false);
const currentSymbol = ref('BTC/USDT');
const currentInterval = ref('1m');
const klineList = ref([]);
const orderBook = ref({ asks: [], bids: [] });
let ws = null;

// --- 拖拽调整宽度逻辑 ---
const mainContainer = ref(null);
const chartWidthPercent = ref(75);
const isDragging = ref(false);

const startDrag = () => {
  isDragging.value = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
};

const onDrag = (e) => {
  if (!isDragging.value || !mainContainer.value) return;
  const containerRect = mainContainer.value.getBoundingClientRect();
  const offsetX = e.clientX - containerRect.left;
  let newPercent = (offsetX / containerRect.width) * 100;
  if (newPercent < 20) newPercent = 20;
  if (newPercent > 80) newPercent = 80;
  chartWidthPercent.value = newPercent;
  window.dispatchEvent(new Event('resize'));
};

const stopDrag = () => {
  if (isDragging.value) {
    isDragging.value = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
};

// --- 收藏夹 & 业务逻辑 ---
const isFavorite = computed(() => favorites.value.includes(currentSymbol.value));

const loadFavorites = () => {
  const saved = localStorage.getItem(LS_FAV_KEY);
  if (saved) { try { favorites.value = JSON.parse(saved); } catch (e) { console.error(e); } }
};

const saveFavorites = () => { localStorage.setItem(LS_FAV_KEY, JSON.stringify(favorites.value)); };

const toggleFavorite = () => {
  const sym = currentSymbol.value;
  if (isFavorite.value) {
    favorites.value = favorites.value.filter(item => item !== sym);
  } else {
    favorites.value.push(sym);
  }
  saveFavorites();
};

const handleSearch = async () => {
  if (!searchQuery.value) return;
  let input = searchQuery.value.trim().toUpperCase();
  if (!input.includes('/') && !input.endsWith('USDT')) input += '/USDT';
  else if (input.endsWith('USDT') && !input.includes('/')) input = input.replace('USDT', '/USDT');

  if (input === currentSymbol.value) { searchQuery.value = ''; return; }

  isSearching.value = true;
  try {
    const testData = await fetchHistoryCandles(input, '1m');
    if (testData && testData.length > 0) {
      switchSymbol(input);
      searchQuery.value = '';
    } else {
      alert(`Symbol "${input}" not found.`);
    }
  } catch (e) {
    alert(`Error searching "${input}".`);
  } finally {
    isSearching.value = false;
  }
};

const initData = async () => {
  if (ws) { ws.close(); ws = null; }
  klineList.value = [];
  orderBook.value = { asks: [], bids: [] };
  const sym = currentSymbol.value;
  const intv = currentInterval.value;
  const cached = loadHistoryFromLS(sym, intv);
  if (cached && cached.length) klineList.value = cached;
  const history = await fetchHistoryCandles(sym, intv);
  if (history && history.length) {
    klineList.value = history;
    saveHistoryToLS(history, sym, intv);
  }
  ws = connectWebSocket(sym, intv, (candle, isClosed) => onKlineUpdate(candle, isClosed, sym, intv), onDepthUpdate);
};

const onKlineUpdate = (candle, isClosed, sym, intv) => {
  if (sym !== currentSymbol.value || intv !== currentInterval.value) return;
  if (klineList.value.length === 0) { klineList.value.push(candle); return; }
  const lastIndex = klineList.value.length - 1;
  if (candle[0] > klineList.value[lastIndex][0]) {
    klineList.value.push(candle);
    if (klineList.value.length > 500) klineList.value.shift();
  } else { klineList.value[lastIndex] = candle; }
  if (isClosed) saveHistoryToLS(klineList.value, sym, intv);
};

const onDepthUpdate = (data) => { orderBook.value = data; };
const switchSymbol = (sym) => { if (currentSymbol.value === sym) return; currentSymbol.value = sym; initData(); };
const switchInterval = (intv) => { if (currentInterval.value === intv) return; currentInterval.value = intv; initData(); };

onMounted(() => { loadFavorites(); initData(); window.addEventListener('mouseup', stopDrag); });
onUnmounted(() => { if (ws) ws.close(); window.removeEventListener('mouseup', stopDrag); });
</script>

<style>
/* 字体 */
@import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;700&display=swap');

/* 全局变量：定义颜色，方便管理 */
:root {
  --bg-color: #121212;          /* 整体背景：纯净深黑 (类似 Bitget) */
  --panel-bg: #1E1E1E;          /* 卡片背景：中性深灰 */
  --border-color: #2C2C2C;      /* 边框颜色 */
  --text-primary: #E0E0E0;      /* 主要文字：灰白 */
  --text-secondary: #757575;    /* 次要文字 */
  --hover-bg: #2A2A2A;          /* 悬停背景 */
  --accent-color: #FF95A5;      /* 核心强调色：浅粉色 */
  --accent-text: #121212;       /* 强调色上的文字颜色：深黑 (高对比度) */
}

body {
  margin: 0;
  background: var(--bg-color);
  color: var(--text-primary);
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.layout-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  padding: 16px;
  box-sizing: border-box;
  gap: 16px;
}

/* --- 顶部控制栏 (全新配色) --- */
.control-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--panel-bg);
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 6px rgba(0,0,0,0.2);
  min-height: 40px;
  flex-shrink: 0;
}

.bar-left { flex: 1; display: flex; align-items: center; overflow: hidden; }
.bar-right { display: flex; align-items: center; gap: 16px; }

/* 状态胶囊 */
.current-info-group {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-color); /* 深底 */
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}
.current-symbol { font-family: 'Roboto Mono', monospace; font-weight: 700; font-size: 14px; color: var(--text-primary); }
.star-btn { background: transparent; border: none; font-size: 16px; cursor: pointer; padding: 0; line-height: 1; display: flex; align-items: center; }
.star-btn:hover { transform: scale(1.1); }

/* 按钮组 */
.control-group { display: flex; align-items: center; gap: 6px; }
.scrollable-group { overflow-x: auto; white-space: nowrap; padding-bottom: 2px; display: flex; align-items: center; gap: 6px; }
.scrollable-group::-webkit-scrollbar { height: 0; width: 0; }
.divider { width: 1px; height: 20px; background: var(--border-color); margin: 0 16px; flex-shrink: 0; }
.label { color: var(--text-secondary); font-size: 12px; margin-right: 4px; font-weight: 600; white-space: nowrap; }
.empty-tip { color: var(--text-secondary); font-size: 12px; font-style: italic; padding: 0 10px; }

/* 按钮通用样式 - 修改为中性风 */
.ctrl-btn {
  background: transparent;
  border: 1px solid transparent;
  color: #9E9E9E; /* 默认灰色 */
  padding: 5px 12px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
  user-select: none;
}
.ctrl-btn:hover {
  color: var(--text-primary);
  background: var(--hover-bg);
}
/* 激活状态：粉色背景，黑色文字 */
.ctrl-btn.active {
  color: var(--accent-text);
  background: var(--accent-color);
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(255, 149, 165, 0.3); /* 粉色发光 */
}

/* 搜索框 */
.search-box { display: flex; align-items: center; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px; }
.search-input { background: transparent; border: none; color: var(--text-primary); padding: 6px 10px; font-size: 12px; outline: none; width: 100px; font-family: 'Roboto Mono', monospace; text-transform: uppercase; }
.search-input::placeholder { color: var(--text-secondary); text-transform: none; }
.action-btn {
  background: var(--hover-bg);
  border: none;
  color: var(--accent-color); /* 文字变成粉色 */
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  border-radius: 2px;
}
.action-btn:hover:not(:disabled) { background: #333; }

/* --- 布局区域 --- */
.main-content {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
}

.left-panel { padding: 10px; display: flex; flex-direction: column; }
.right-panel { flex: 1; min-width: 200px; }

.card-box {
  background: var(--panel-bg);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  border: 1px solid var(--border-color);
}

/* 分割条 (Splitter) */
.resizer {
  width: 10px;
  margin: 0 -5px;
  cursor: col-resize;
  z-index: 10;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
}
.resizer-line {
  width: 2px;
  height: 100%;
  background-color: transparent;
  transition: background-color 0.2s;
}
.resizer:hover .resizer-line,
.resizer:active .resizer-line {
  background-color: var(--accent-color); /* 粉色分割线 */
}
</style>