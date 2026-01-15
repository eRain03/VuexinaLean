/*
 * 文件名: src/services/binanceService.js
 * 作用: 数据层封装 (稳定版)。
 * 1. [关键修改] 历史数据：放弃 CCXT，改用原生 fetch 请求本地代理，彻底解决 500 报错。
 * 2. 实时数据：使用原生 WebSocket 连接。
 * 3. 缓存：管理 LocalStorage。
 */

// 常量定义
const SYMBOL = 'BTC/USDT';
const TIMEFRAME = '1m';
const LIMIT = 500;
const LS_KEY = `kline_data_${SYMBOL}_${TIMEFRAME}`;

/**
 * 1. 从 LocalStorage 获取缓存数据
 * 用于页面秒开，避免等待 API 请求
 */
export function loadHistoryFromLS() {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
        try {
            return JSON.parse(raw);
        } catch (e) {
            console.error('解析 LocalStorage 数据失败', e);
            return [];
        }
    }
    return [];
}

/**
 * 2. 保存数据到 LocalStorage
 * @param {Array} data - K线数据数组
 */
export function saveHistoryToLS(data) {
    if (!data || data.length === 0) return;
    // 只保存最近 LIMIT 条，防止 LocalStorage 溢出
    const dataToSave = data.slice(-LIMIT);
    localStorage.setItem(LS_KEY, JSON.stringify(dataToSave));
}

/**
 * 3. [核心修复] 获取历史 K 线数据
 * 之前的 CCXT 报错是因为它尝试获取交易所信息失败。
 * 这里改为直接请求本地代理接口，绕过 CCXT 检查，稳定可靠。
 */
export async function fetchHistoryCandles() {
    try {
        // 构造请求参数
        // 我们请求本地 /api/api/v3/klines，Vite 会将其代理到 binance
        const symbolClean = SYMBOL.replace('/', ''); // BTCUSDT
        const url = `/api/api/v3/klines?symbol=${symbolClean}&interval=${TIMEFRAME}&limit=${LIMIT}`;

        console.log('[REST] 正在请求历史数据:', url);

        // 使用原生 fetch
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`网络请求失败，状态码: ${response.status}`);
        }

        const rawData = await response.json();

        // Binance API 返回的是字符串数组，需要转换为数字
        // 原始格式: [ [t, o, h, l, c, v, ...], ... ]
        const formattedData = rawData.map(item => {
            return [
                item[0],                // Timestamp (无需转换)
                parseFloat(item[1]),    // Open
                parseFloat(item[2]),    // High
                parseFloat(item[3]),    // Low
                parseFloat(item[4]),    // Close
                parseFloat(item[5])     // Volume
            ];
        });

        console.log(`[REST] 成功拉取 ${formattedData.length} 条 K 线`);
        return formattedData;

    } catch (error) {
        console.error('拉取历史数据失败。请检查：1.VPN是否开启 2.Vite Proxy配置是否正确。', error);
        return [];
    }
}

/**
 * 4. 建立 WebSocket 连接监听 K 线和深度
 * 保持不变，这部分逻辑是正确的。
 */
export function connectWebSocket(onKlineUpdate, onDepthUpdate) {
    const symbolLower = SYMBOL.replace('/', '').toLowerCase();

    // 订阅 K线 (kline_1m) 和 20档深度 (depth20)
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${symbolLower}@kline_${TIMEFRAME}/${symbolLower}@depth20`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('Binance WebSocket 已连接');
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            const stream = message.stream;
            const data = message.data;

            // --- 处理 K 线数据 ---
            if (stream.includes('kline')) {
                const k = data.k;
                const candle = [
                    k.t,             // Timestamp
                    parseFloat(k.o), // Open
                    parseFloat(k.h), // High
                    parseFloat(k.l), // Low
                    parseFloat(k.c), // Close
                    parseFloat(k.v)  // Volume
                ];
                // k.x 为 true 代表这根 K 线走完闭合了
                onKlineUpdate(candle, k.x);
            }
            // --- 处理深度数据 ---
            else if (stream.includes('depth')) {
                onDepthUpdate({
                    bids: data.bids,
                    asks: data.asks
                });
            }
        } catch (err) {
            console.error('WebSocket 消息解析错误:', err);
        }
    };

    ws.onerror = (err) => {
        console.error('WebSocket 发生错误:', err);
    };

    ws.onclose = () => {
        console.log('WebSocket 已断开');
    };

    return ws;
}