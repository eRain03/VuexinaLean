/*
 * 文件名: src/services/binanceService.js
 * 作用: 数据层封装 (动态版)。
 * 修改点: 移除了顶部硬编码的常量，所有函数都增加了 symbol 和 interval 参数。
 */

const LIMIT = 500;

// 辅助函数：生成缓存 Key
const getLsKey = (symbol, interval) => `kline_data_${symbol}_${interval}`;

/**
 * 1. 从 LocalStorage 获取缓存数据
 */
export function loadHistoryFromLS(symbol, interval) {
    const key = getLsKey(symbol, interval);
    const raw = localStorage.getItem(key);
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
 */
export function saveHistoryToLS(data, symbol, interval) {
    if (!data || data.length === 0) return;
    const key = getLsKey(symbol, interval);
    // 只保存最近 LIMIT 条
    const dataToSave = data.slice(-LIMIT);
    localStorage.setItem(key, JSON.stringify(dataToSave));
}

/**
 * 3. 获取历史 K 线数据 (支持动态币种和周期)
 */
export async function fetchHistoryCandles(symbol, interval) {
    try {
        // 构造请求参数
        const symbolClean = symbol.replace('/', ''); // BTC/USDT -> BTCUSDT
        const url = `/api/api/v3/klines?symbol=${symbolClean}&interval=${interval}&limit=${LIMIT}`;

        console.log(`[REST] 正在请求 ${symbol} ${interval} 历史数据...`);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`网络请求失败，状态码: ${response.status}`);
        }

        const rawData = await response.json();

        const formattedData = rawData.map(item => {
            return [
                item[0],                // Timestamp
                parseFloat(item[1]),    // Open
                parseFloat(item[2]),    // High
                parseFloat(item[3]),    // Low
                parseFloat(item[4]),    // Close
                parseFloat(item[5])     // Volume
            ];
        });

        console.log(`[REST] 成功拉取 ${formattedData.length} 条数据`);
        return formattedData;

    } catch (error) {
        console.error('拉取历史数据失败', error);
        return [];
    }
}

/**
 * 4. 建立 WebSocket 连接 (支持动态订阅)
 */
export function connectWebSocket(symbol, interval, onKlineUpdate, onDepthUpdate) {
    const symbolLower = symbol.replace('/', '').toLowerCase(); // btc/usdt -> btcusdt

    // 订阅 K线 和 深度
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${symbolLower}@kline_${interval}/${symbolLower}@depth20`;

    console.log(`[WS] 正在连接: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log(`[WS] ${symbol} 连接成功`);
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            const stream = message.stream;
            const data = message.data;

            // --- 处理 K 线 ---
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
                onKlineUpdate(candle, k.x);
            }
            // --- 处理深度 ---
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
        console.log(`[WS] ${symbol} 连接已断开`);
    };

    return ws;
}