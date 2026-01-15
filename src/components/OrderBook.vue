<template>
  <div class="ob-wrapper">
    <div class="ob-header">
      <span>Price(USDT)</span>
      <span>Amount(BTC)</span>
    </div>

    <div class="asks-area">
      <div v-for="(ask, i) in displayAsks" :key="'ask'+i" class="row">
        <span class="price ask-color">{{ fmt(ask[0]) }}</span>
        <span class="amount">{{ fmtAmt(ask[1]) }}</span>
        <div class="bar ask-bg" :style="{ width: calcWidth(ask[1]) + '%' }"></div>
      </div>
    </div>

    <div class="spread-divider">
      Last Price
    </div>

    <div class="bids-area">
      <div v-for="(bid, i) in displayBids" :key="'bid'+i" class="row">
        <span class="price bid-color">{{ fmt(bid[0]) }}</span>
        <span class="amount">{{ fmtAmt(bid[1]) }}</span>
        <div class="bar bid-bg" :style="{ width: calcWidth(bid[1]) + '%' }"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  asks: { type: Array, default: () => [] },
  bids: { type: Array, default: () => [] }
});

// 核心修改：大幅增加渲染条数，利用 overflow: hidden 裁剪
// 这样无论屏幕多高，看起来都是满的
const COUNT = 10;

const displayAsks = computed(() => {
  // 截取前 COUNT 条，然后反转，让最低卖价显示在最底部
  return props.asks.slice(0, COUNT).reverse();
});

const displayBids = computed(() => {
  return props.bids.slice(0, COUNT);
});

const fmt = (v) => parseFloat(v).toFixed(2);
const fmtAmt = (v) => parseFloat(v).toFixed(5); // 增加一位小数，看起来更专业
const calcWidth = (v) => Math.min((parseFloat(v) / 1) * 100, 100); // 调整深度条比例，让它跳动更明显
</script>

<style scoped>
.ob-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #171b26;
  font-family: 'Roboto Mono', 'Consolas', monospace; /* 更好看的等宽字体 */
  font-size: 12px;
  color: #B2B5BE;
  overflow: hidden;
}

.ob-header {
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  color: #616876;
  font-size: 11px;
  border-bottom: 1px solid #232733;
}

.asks-area {
  flex: 1; /* 占据一半空间 */
  display: flex;
  flex-direction: column;
  justify-content: flex-end; /* 内容沉底 */
  overflow: hidden; /* 多余的隐藏 */
}

.bids-area {
  flex: 1; /* 占据一半空间 */
  display: flex;
  flex-direction: column;
  justify-content: flex-start; /* 内容顶头 */
  overflow: hidden; /* 多余的隐藏 */
}

.spread-divider {
  text-align: center;
  padding: 8px 0;
  color: #EAECEF;
  font-weight: bold;
  font-size: 13px;
  border-top: 1px solid #232733;
  border-bottom: 1px solid #232733;
  background: #1e2230;
}

.row {
  display: flex;
  justify-content: space-between;
  padding: 1px 12px; /* 减小行高，让数据更紧凑 */
  line-height: 18px;
  position: relative;
  z-index: 1;
  cursor: pointer;
}
.row:hover { background-color: #2a2e39; }

.price { font-weight: 500; }
.amount { color: #848E9C; }

.ask-color { color: #F6465D; }
.bid-color { color: #0ECB81; }

.bar {
  position: absolute;
  top: 1px; bottom: 1px; right: 0;
  z-index: -1;
  opacity: 0.15;
}
.ask-bg { background: #F6465D; }
.bid-bg { background: #0ECB81; }
</style>