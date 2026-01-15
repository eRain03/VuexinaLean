/*
 * 文件名: src/hooks/useBinanceMarket.js
 * 作用:
 * 1. 使用原生 fetch 替代 CCXT 进行历史数据拉取 (解决 exchangeInfo 报错)。
 * 2. 建立 WebSocket 实时更新。
 */
import { ref, onUnmounted } from 'vue';

export function useBinanceMarket(symbol = 'BTC/USDT', timeframe = '1m') {
    const klineData = ref([]);
    const depthData = ref({ asks: [], bids: [] });
    let ws = null;

    // 格式化函数：[t, o, h, l, c, v]
    const formatCandle = (k) => {
        return [
            k[0],             // Timestamp
            parseFloat(k[1]), // Open
            parseFloat(k[2]), // High
            parseFloat(k[3]), // Low
            parseFloat(k[4]), // Close
            parseFloat(k[5])  // Volume
        ];
    };

    const formatWsCandle = (k) => {
        return [
            k.t,
            parseFloat(k.o),
            parseFloat(k.h),
            parseFloat(k.l),
            parseFloat(k.c),
            parseFloat(k.v)
        ];
    };

    /**
     * 启动函数
     */
    const start = async () => {
        // ---------------------------------------------------------
        // 1. [REST] 使用原生 fetch 拉取历史数据 (绕过 CCXT 初始化错误)
        // ---------------------------------------------------------
        try {
            // 构造请求参数
            const symbolCode = symbol.replace('/', '').toUpperCase(); // BTCUSDT
            // 这里的 /api 会被 vite 代理转发到 https://api.binance.com
            // 实际请求路径: https://api.binance.com/api/v3/klines
            const url = `/api/api/v3/klines?symbol=${symbolCode}&interval=${timeframe}&limit=500`;

            console.log('[REST] 开始拉取历史数据:', url);
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const rawData = await response.json();

            // 格式化数据
            klineData.value = rawData.map(item => formatCandle(item));
            console.log(`[REST] 成功获取 ${rawData.length} 条 K 线`);

        } catch (e) {
            console.error('[REST] 拉取失败 (请确保开启VPN并代理了浏览器流量):', e);
            // 即使失败，不要中断，继续尝试连接 WebSocket
        }

        // ---------------------------------------------------------
        // 2. [WebSocket] 启动实时流
        // ---------------------------------------------------------
        const wsSymbol = symbol.replace('/', '').toLowerCase(); // btcusdt
        const wsUrl = `wss://stream.binance.com:9443/stream?streams=${wsSymbol}@kline_${timeframe}/${wsSymbol}@depth20`;

        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => console.log('[WS] 实时行情已连接');

            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                const stream = msg.stream;
                const data = msg.data;

                // K 线处理
                if (stream.includes('kline')) {
                    const candle = formatWsCandle(data.k);
                    const currentData = klineData.value;

                    if (currentData.length === 0) {
                        currentData.push(candle);
                    } else {
                        const lastIndex = currentData.length - 1;
                        const lastTime = currentData[lastIndex][0];
                        const newTime = candle[0];

                        if (newTime === lastTime) {
                            // 实时更新当前 K 线
                            const newData = [...currentData];
                            newData[lastIndex] = candle;
                            klineData.value = newData;
                        } else if (newTime > lastTime) {
                            // 生成新 K 线
                            const newData = [...currentData, candle];
                            if (newData.length > 500) newData.shift();
                            klineData.value = newData;
                        }
                    }
                }
                // 深度处理
                else if (stream.includes('depth')) {
                    depthData.value = { bids: data.bids, asks: data.asks };
                }
            };

            ws.onerror = (err) => console.error('[WS] 连接错误', err);

        } catch (wsError) {
            console.error('[WS] 建立连接失败', wsError);
        }
    };

    const close = () => {
        if (ws) {
            ws.close();
            ws = null;
        }
    };

    onUnmounted(() => {
        close();
    });

    return {
        klineData,
        depthData,
        start,
        close
    };
}