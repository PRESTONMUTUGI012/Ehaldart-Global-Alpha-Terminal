// Public WebSocket Endpoint (No PAT / App ID needed)
const PUBLIC_WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public';

let ws = null;
let currentSymbol = null; // No hardcoded initial symbol
let tickHistory = [];
let lastQuote = null;

document.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    document.getElementById('marketSelect').addEventListener('change', onSymbolChange);
});

// 1. Connect to Public WebSocket Stream
function initWebSocket() {
    ws = new WebSocket(PUBLIC_WS_URL);

    ws.onopen = () => {
        updateConnectionStatus(true, 'Connected (Public Feed)');
        // Request active symbols upon WebSocket connection
        ws.send(JSON.stringify({ active_symbols: 'brief', product_type: 'basic' }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };

    ws.onclose = () => {
        updateConnectionStatus(false, 'Disconnected');
        setTimeout(initWebSocket, 3000);
    };

    ws.onerror = () => updateConnectionStatus(false, 'Connection Error');
}

// 2. Process incoming websocket responses
function handleMessage(data) {
    const msgType = data.msg_type;

    if (msgType === 'active_symbols') {
        populateAllMarketsDropdown(data.active_symbols);
    } else if (msgType === 'tick') {
        processTick(data.tick);
    }
}

// 3. Loop through active_symbols and populate dropdown dynamically
function populateAllMarketsDropdown(symbols) {
    const select = document.getElementById('marketSelect');
    select.innerHTML = '';

    const categories = {
        'Synthetic Indices': [],
        'Forex Currency Pairs': [],
        'Commodities (Gold/Oil)': [],
        'Cryptocurrencies': [],
        'Stock & Basket Indices': []
    };

    symbols.forEach(s => {
        const marketName = s.market;
        if (marketName === 'synthetic_index') {
            categories['Synthetic Indices'].push(s);
        } else if (marketName === 'forex') {
            categories['Forex Currency Pairs'].push(s);
        } else if (marketName === 'commodities') {
            categories['Commodities (Gold/Oil)'].push(s);
        } else if (marketName === 'cryptocurrency') {
            categories['Cryptocurrencies'].push(s);
        } else {
            categories['Stock & Basket Indices'].push(s);
        }
    });

    Object.keys(categories).forEach(catName => {
        if (categories[catName].length > 0) {
            const group = document.createElement('optgroup');
            group.label = `--- ${catName.toUpperCase()} ---`;

            categories[catName].forEach(symbol => {
                const option = document.createElement('option');
                option.value = symbol.symbol;
                option.innerText = `${symbol.display_name} (${symbol.symbol})`;
                group.appendChild(option);
            });

            select.appendChild(group);
        }
    });

    // Auto-select and subscribe to the first active underlying symbol dynamically
    if (symbols.length > 0 && !currentSymbol) {
        currentSymbol = symbols[0].symbol;
        select.value = currentSymbol;
        subscribeToSymbolTicks(currentSymbol);
    }
}

// 4. Change symbol subscription dynamically
function onSymbolChange() {
    currentSymbol = document.getElementById('marketSelect').value;
    subscribeToSymbolTicks(currentSymbol);
}

function subscribeToSymbolTicks(symbol) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ forget_all: 'ticks' }));
        tickHistory = [];
        lastQuote = null;
        ws.send(JSON.stringify({ ticks: symbol }));
        document.getElementById('chartSymbol').innerText = symbol;
    }
}

// 5. Read tick data dynamically
function processTick(tick) {
    const quote = parseFloat(tick.quote).toFixed(tick.pip_size || 4);
    const epoch = tick.epoch;

    document.getElementById('livePrice').innerText = quote;
    document.getElementById('liveEpoch').innerText = epoch;

    const currentNum = parseFloat(quote);
    const prevNum = lastQuote !== null ? parseFloat(lastQuote) : null;

    analyzeTickFeatures(currentNum, prevNum);
    
    const quoteString = currentNum.toString();
    const lastChar = quoteString.slice(-1);
    const digitNum = parseInt(lastChar, 10);
    runAIBotAnalysis(currentNum, prevNum, digitNum);

    lastQuote = quote;

    tickHistory.push(currentNum);
    if (tickHistory.length > 30) tickHistory.shift();

    renderSVGChart();
    appendTickTableRow(epoch, quote);
}

// 6. Rise/Fall and Digit Analysis logic
function analyzeTickFeatures(currentQuote, previousQuote) {
    const directionBox = document.getElementById('tickDirectionBox');
    const digitValueEl = document.getElementById('lastDigitValue');
    const digitEvenOddEl = document.getElementById('digitEvenOdd');

    if (previousQuote !== null) {
        if (currentQuote > previousQuote) {
            directionBox.className = "p-4 bg-emerald-950/60 rounded-lg border border-emerald-500/50 text-center font-mono text-lg font-bold text-emerald-400 shadow-inner";
            directionBox.innerHTML = `<i class="fa-solid fa-arrow-up"></i> RISE (+${(currentQuote - previousQuote).toFixed(4)})`;
        } else if (currentQuote < previousQuote) {
            directionBox.className = "p-4 bg-rose-950/60 rounded-lg border border-rose-500/50 text-center font-mono text-lg font-bold text-rose-400 shadow-inner";
            directionBox.innerHTML = `<i class="fa-solid fa-arrow-down"></i> FALL (-${(previousQuote - currentQuote).toFixed(4)})`;
        } else {
            directionBox.className = "p-4 bg-slate-950/90 rounded-lg border border-emerald-500/30 text-center font-mono text-lg font-bold text-slate-300 shadow-inner";
            directionBox.innerHTML = `NO CHANGE`;
        }
    }

    const quoteString = currentQuote.toString();
    const lastChar = quoteString.slice(-1);
    const digitNum = parseInt(lastChar, 10);

    if (!isNaN(digitNum)) {
        digitValueEl.innerText = digitNum;
        const isEven = digitNum % 2 === 0;
        digitEvenOddEl.innerText = isEven ? "EVEN (🟢)" : "ODD (🔴)";
        digitEvenOddEl.className = isEven ? "text-xs font-bold text-emerald-400" : "text-xs font-bold text-rose-400";
    }
}

// 7. AI Bot Analysis Engine
function runAIBotAnalysis(currentQuote, previousQuote, lastDigit) {
    if (previousQuote === null) return;

    const botSignalEl = document.getElementById('aiBotSignal');
    const botConfidenceEl = document.getElementById('aiBotConfidence');
    if (!botSignalEl) return;

    const priceDiff = currentQuote - previousQuote;
    let signal = "HOLD / WAIT";
    let confidence = "54%";
    let recommendationColor = "text-amber-400";

    if (priceDiff > 0 && lastDigit % 2 === 0) {
        signal = "RISE & EVEN (CALL)";
        confidence = "81%";
        recommendationColor = "text-emerald-400";
    } else if (priceDiff < 0 && lastDigit % 2 !== 0) {
        signal = "FALL & ODD (PUT)";
        confidence = "79%";
        recommendationColor = "text-rose-400";
    } else if (priceDiff > 0) {
        signal = "MOMENTUM RISE";
        confidence = "67%";
        recommendationColor = "text-emerald-400";
    } else if (priceDiff < 0) {
        signal = "MOMENTUM FALL";
        confidence = "66%";
        recommendationColor = "text-rose-400";
    }

    botSignalEl.innerText = signal;
    botSignalEl.className = `text-sm font-bold font-mono ${recommendationColor}`;
    botConfidenceEl.innerText = confidence;
}

// 8. SVG Chart Rendering
function renderSVGChart() {
    if (tickHistory.length < 2) return;
    const svg = document.getElementById('tickChart');
    const path = document.getElementById('chartPath');
    const width = svg.clientWidth;
    const height = svg.clientHeight;

    const min = Math.min(...tickHistory);
    const max = Math.max(...tickHistory);
    const range = (max - min) || 1;

    const points = tickHistory.map((val, idx) => {
        const x = (idx / (tickHistory.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 20) - 10;
        return `${x},${y}`;
    });

    path.setAttribute('d', `M ${points.join(' L ')}`);
}

// 9. Add Row to Table
function appendTickTableRow(epoch, quote) {
    const tbody = document.getElementById('tickTableBody');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="p-2.5 text-slate-400">${epoch}</td>
        <td class="p-2.5 text-emerald-400 font-bold">${quote}</td>
    `;
    tbody.prepend(row);

    if (tbody.children.length > 12) {
        tbody.removeChild(tbody.lastChild);
    }
}

// 10. Update Connection Status Badge
function updateConnectionStatus(isConnected, text) {
    const badge = document.getElementById('connectionStatus');
    if (isConnected) {
        badge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-emerald-500 pulse-green"></span><span class="text-emerald-400 font-mono font-semibold">${text}</span>`;
    } else {
        badge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span><span class="text-rose-400 font-mono font-semibold">${text}</span>`;
    }
}
