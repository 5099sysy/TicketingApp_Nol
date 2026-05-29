import { io as SocketClient } from 'socket.io-client';

function getPopularity(dow, time) {
  const hour = time ? parseInt(time.split(':')[0]) : 14;
  const isEvening = hour >= 18;
  if (dow === 6) return 1.0;
  if (dow === 0) return 0.92;
  if (dow === 5 && isEvening) return 0.85;
  if (dow === 5) return 0.65;
  if (dow === 4 && isEvening) return 0.55;
  if (isEvening) return 0.45;
  return 0.25;
}

const BOT_CONFIG = {
  BASE_BOTS: 600,
  GHOST_RATIO: 0.35,
  CANCEL_RATIO: 0.10,
  SERVER_URL: 'http://localhost:3001',
  REACTION_MIN: 10,
  REACTION_MAX: 30,
  GHOST_HOLD_MIN: 30000,
  GHOST_HOLD_MAX: 120000,
  BUYER_PAY_MIN: 1000,
  BUYER_PAY_MAX: 5000,
  CANCEL_HOLD_MIN: 5000,
  CANCEL_HOLD_MAX: 30000,
  RETRY_MIN: 50,
  RETRY_MAX: 200,
  SEATS_PER_BUYER: () =>
    Math.random() < 0.6 ? 2 : Math.random() < 0.7 ? 1 : Math.floor(Math.random() * 2) + 3,
};

const SECTIONS = [
  { key: "OP-L",  rows: 2,  cols: 7  },
  { key: "OP-C",  rows: 2,  cols: 6  },
  { key: "OP-R",  rows: 2,  cols: 7  },
  { key: "1F-A",  rows: 20, cols: 8  },
  { key: "1F-B",  rows: 20, cols: 12 },
  { key: "1F-C",  rows: 20, cols: 8  },
  { key: "2F-A",  rows: 12, cols: 6  },
  { key: "2F-B",  rows: 12, cols: 8  },
  { key: "2F-C",  rows: 12, cols: 6  },
];

function getSeatWeight(sectionKey, row, popularity = 1.0) {
  const frontBoost = 1 + popularity * 8;
  if (sectionKey.startsWith("OP")) return (80000 + Math.random() * 5000) * frontBoost;
  if (sectionKey === "1F-B") {
    if (row === 0) return (60000 + Math.random() * 3000) * frontBoost;
    if (row <= 2)  return (45000 - row * 2000 + Math.random() * 2000) * frontBoost;
    if (row <= 5)  return (30000 - row * 1000 + Math.random() * 1500) * frontBoost;
    if (row <= 9)  return (15000 - row * 500  + Math.random() * 800)  * (0.5 + popularity * 0.5);
    if (row <= 14) return 6000 - row * 200 + Math.random() * 300;
    return 2000 - row * 50 + Math.random() * 100;
  }
  if (sectionKey === "1F-A" || sectionKey === "1F-C") {
    if (row === 0) return (40000 + Math.random() * 2000) * frontBoost;
    if (row <= 2)  return (28000 - row * 2000 + Math.random() * 1500) * frontBoost;
    if (row <= 5)  return (18000 - row * 800  + Math.random() * 1000) * (0.6 + popularity * 0.4);
    if (row <= 9)  return 8000 - row * 400 + Math.random() * 500;
    return 2500 - row * 80 + Math.random() * 100;
  }
  if (sectionKey === "2F-B") {
    if (row <= 1) return (12000 + Math.random() * 1000) * (0.5 + popularity * 0.5);
    if (row <= 4) return 7000 - row * 300 + Math.random() * 400;
    if (row <= 7) return 4000 - row * 150 + Math.random() * 200;
    return 1500 - row * 50 + Math.random() * 100;
  }
  if (sectionKey === "2F-A" || sectionKey === "2F-C") {
    if (row <= 2) return (6000 - row * 500 + Math.random() * 400) * (0.4 + popularity * 0.4);
    return 2000 - row * 80 + Math.random() * 100;
  }
  return Math.max(100, 1500 - row * 50 + Math.random() * 100);
}

function pickTargetSeat(seatMap, count = 1, popularity = 1.0) {
  const priority = [];
  const normal = [];
  SECTIONS.forEach(({ key, rows, cols }) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = `${key}-${r}-${c}`;
        if (seatMap[id] !== 'available') continue;
        const isPriority = key.startsWith('OP') || (key === '1F-B' && r <= 12);
        const weight = Math.max(1, getSeatWeight(key, r, popularity));
        if (isPriority) priority.push({ id, weight });
        else normal.push({ id, weight });
      }
    }
  });
  const pool = priority.length > 0 ? priority : normal;
  if (pool.length === 0) return [];
  const picked = [];
  const remaining = [...pool];
  for (let i = 0; i < Math.min(count, remaining.length); i++) {
    const total = remaining.reduce((s, x) => s + x.weight, 0);
    let rand2 = Math.random() * total;
    let idx = 0;
    for (let j = 0; j < remaining.length; j++) {
      rand2 -= remaining[j].weight;
      if (rand2 <= 0) { idx = j; break; }
    }
    picked.push(remaining[idx].id);
    remaining.splice(idx, 1);
  }
  return picked;
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ══════════════════════════════════════════════════
// 세션별 독립 봇 그룹
// ══════════════════════════════════════════════════

// sessionKey → { seatMap, botList, running }
const sessionBotGroups = new Map();
let globalRunning = false;

function createGhostBot(botId, sessionCtx) {
  const { dateStr, time, seatMap: sharedMap, popularity } = sessionCtx;
  const userId = `ghost-${dateStr}-${time}-${botId}-${Date.now()}`;
  const socket = SocketClient(BOT_CONFIG.SERVER_URL, {
    reconnection: false, timeout: 5000,
  });
  let active = true;

  socket.on('connect', () => {
    if (!globalRunning || !sessionCtx.running) { socket.disconnect(); return; }
    setTimeout(() => {
      if (!globalRunning || !sessionCtx.running || !active) { socket.disconnect(); return; }
      attemptLock();
    }, rand(BOT_CONFIG.REACTION_MIN, BOT_CONFIG.REACTION_MAX));
  });

  function attemptLock() {
    if (!globalRunning || !sessionCtx.running || !active) return;
    const targets = pickTargetSeat(sessionCtx.seatMap, rand(1, 2), popularity);
    if (targets.length === 0) {
      setTimeout(attemptLock, rand(BOT_CONFIG.RETRY_MIN, BOT_CONFIG.RETRY_MAX));
      return;
    }
    targets.forEach(seatId => socket.emit('lock_seat', { seatId, userId, dateStr, time }));
  }

  socket.on('lock_success', ({ seatId }) => {
    if (!active) return;
    socket.emit('confirm_seats', { seatIds: [seatId], userId, dateStr, time });
    setTimeout(() => socket.disconnect(), 200);
  });
  socket.on('lock_failed', () => {
    if (!active) return;
    setTimeout(attemptLock, rand(3000, 8000));
  });
  socket.on('seat_update', ({ seatId, status, dateStr: d, time: t }) => {
    if (d === dateStr && t === time) sessionCtx.seatMap[seatId] = status;
  });
  socket.on('disconnect', () => { active = false; });
  socket.on('connect_error', () => { active = false; });

  return { type: 'ghost', userId, stop() { active = false; try { socket.disconnect(); } catch {} } };
}

function createBuyerBot(botId, sessionCtx) {
  const { dateStr, time, popularity } = sessionCtx;
  const userId = `buyer-${dateStr}-${time}-${botId}-${Date.now()}`;
  const socket = SocketClient(BOT_CONFIG.SERVER_URL, {
    reconnection: false, timeout: 5000,
  });
  let active = true;
  let lockedSeats = [];
  let retryCount = 0;
  const MAX_RETRY = 5;
  const wantCount = BOT_CONFIG.SEATS_PER_BUYER();

  socket.on('connect', () => {
    if (!globalRunning || !sessionCtx.running) { socket.disconnect(); return; }
    setTimeout(() => {
      if (!globalRunning || !sessionCtx.running || !active) { socket.disconnect(); return; }
      attemptLock();
    }, rand(BOT_CONFIG.REACTION_MIN, BOT_CONFIG.REACTION_MAX));
  });

  function attemptLock() {
    if (!globalRunning || !sessionCtx.running || !active || retryCount >= MAX_RETRY) {
      if (retryCount >= MAX_RETRY) socket.disconnect();
      return;
    }
    const targets = pickTargetSeat(sessionCtx.seatMap, wantCount - lockedSeats.length, popularity);
    if (targets.length === 0) {
      retryCount++;
      setTimeout(attemptLock, rand(BOT_CONFIG.RETRY_MIN, BOT_CONFIG.RETRY_MAX));
      return;
    }
    targets.forEach(seatId => socket.emit('lock_seat', { seatId, userId, dateStr, time }));
  }

  socket.on('lock_success', ({ seatId }) => {
    if (!active) return;
    lockedSeats.push(seatId);
    if (lockedSeats.length >= wantCount) {
      setTimeout(() => {
        if (!active) return;
        socket.emit('confirm_seats', { seatIds: [...lockedSeats], userId, dateStr, time });
        lockedSeats = [];
        socket.disconnect();
      }, rand(BOT_CONFIG.BUYER_PAY_MIN, BOT_CONFIG.BUYER_PAY_MAX));
    } else {
      attemptLock();
    }
  });
  socket.on('lock_failed', () => {
    if (!active) return;
    retryCount++;
    setTimeout(attemptLock, rand(BOT_CONFIG.RETRY_MIN, BOT_CONFIG.RETRY_MAX));
  });
  socket.on('seat_update', ({ seatId, status, dateStr: d, time: t }) => {
    if (d === dateStr && t === time) sessionCtx.seatMap[seatId] = status;
  });
  socket.on('disconnect', () => { active = false; });
  socket.on('connect_error', () => { active = false; });

  return { type: 'buyer', userId, stop() { active = false; try { socket.disconnect(); } catch {} } };
}

function createCancelBot(botId, sessionCtx) {
  const { dateStr, time, popularity } = sessionCtx;
  const userId = `cancel-${dateStr}-${time}-${botId}-${Date.now()}`;
  const socket = SocketClient(BOT_CONFIG.SERVER_URL, {
    reconnection: false, timeout: 5000,
  });
  let active = true;
  let lockedSeats = [];
  let retryCount = 0;
  const MAX_RETRY = 5;
  const wantCount = BOT_CONFIG.SEATS_PER_BUYER();

  socket.on('connect', () => {
    if (!globalRunning || !sessionCtx.running) { socket.disconnect(); return; }
    setTimeout(() => {
      if (!globalRunning || !sessionCtx.running || !active) { socket.disconnect(); return; }
      attemptLock();
    }, rand(BOT_CONFIG.REACTION_MIN, BOT_CONFIG.REACTION_MAX));
  });

  function attemptLock() {
    if (!globalRunning || !sessionCtx.running || !active || retryCount >= MAX_RETRY) {
      if (retryCount >= MAX_RETRY) socket.disconnect();
      return;
    }
    const targets = pickTargetSeat(sessionCtx.seatMap, wantCount - lockedSeats.length, popularity);
    if (targets.length === 0) {
      retryCount++;
      setTimeout(attemptLock, rand(BOT_CONFIG.RETRY_MIN, BOT_CONFIG.RETRY_MAX));
      return;
    }
    targets.forEach(seatId => socket.emit('lock_seat', { seatId, userId, dateStr, time }));
  }

  socket.on('lock_success', ({ seatId }) => {
    if (!active) return;
    lockedSeats.push(seatId);
    if (lockedSeats.length >= wantCount) {
      setTimeout(() => {
        if (!active) return;
        // 결제 확정 후
        socket.emit('confirm_seats', { seatIds: [...lockedSeats], userId, dateStr, time });
        // 일정 시간 뒤 취소
        setTimeout(() => {
          if (!active) return;
          lockedSeats.forEach(seatId =>
            socket.emit('unlock_seat', { seatId, userId, dateStr, time })
          );
          console.log(`[취소봇 ${dateStr} ${time}] ${lockedSeats.length}석 취소`);
          lockedSeats = [];
          socket.disconnect();
        }, rand(BOT_CONFIG.CANCEL_HOLD_MIN, BOT_CONFIG.CANCEL_HOLD_MAX));
      }, rand(BOT_CONFIG.BUYER_PAY_MIN, BOT_CONFIG.BUYER_PAY_MAX));
    } else {
      attemptLock();
    }
  });
  socket.on('lock_failed', () => {
    if (!active) return;
    retryCount++;
    setTimeout(attemptLock, rand(BOT_CONFIG.RETRY_MIN, BOT_CONFIG.RETRY_MAX));
  });
  socket.on('seat_update', ({ seatId, status, dateStr: d, time: t }) => {
    if (d === dateStr && t === time) sessionCtx.seatMap[seatId] = status;
  });
  socket.on('disconnect', () => { active = false; });
  socket.on('connect_error', () => { active = false; });

  return { type: 'cancel', userId, stop() { active = false; try { socket.disconnect(); } catch {} } };
}

// ── 세션 하나에 풀 봇 투입 ────────────────────────────────────────────
function startBotsForSession(dateStr, time, initialSeatMap) {
  const sessionKey = `${dateStr}_${time}`;
  if (sessionBotGroups.has(sessionKey)) return; // 이미 투입된 세션 스킵

  const dow = new Date(dateStr).getDay();
  const popularity = getPopularity(dow, time);

  const total       = Math.max(20, Math.round(BOT_CONFIG.BASE_BOTS * popularity));
  const ghostCount  = Math.round(total * BOT_CONFIG.GHOST_RATIO);
  const cancelCount = Math.round(total * BOT_CONFIG.CANCEL_RATIO);
  const buyerCount  = total - ghostCount - cancelCount;

  // 세션 컨텍스트: 봇들이 공유하는 좌석맵 + 실행 상태
  const sessionCtx = {
    dateStr,
    time,
    popularity,
    seatMap: { ...initialSeatMap },
    running: true,
    botList: [],
  };

  sessionBotGroups.set(sessionKey, sessionCtx);

  const spawnWindow = Math.round(500 - popularity * 200);

  console.log(`[봇] 세션 ${sessionKey} | 인기도 ${(popularity*100).toFixed(0)}% | 유령 ${ghostCount}, 구매 ${buyerCount}, 취소 ${cancelCount} (총 ${total})`);

  for (let i = 0; i < ghostCount; i++) {
    setTimeout(() => {
      if (!globalRunning || !sessionCtx.running) return;
      sessionCtx.botList.push(createGhostBot(i, sessionCtx));
    }, rand(0, spawnWindow));
  }
  for (let i = 0; i < buyerCount; i++) {
    setTimeout(() => {
      if (!globalRunning || !sessionCtx.running) return;
      sessionCtx.botList.push(createBuyerBot(ghostCount + i, sessionCtx));
    }, rand(0, spawnWindow));
  }
  for (let i = 0; i < cancelCount; i++) {
    setTimeout(() => {
      if (!globalRunning || !sessionCtx.running) return;
      sessionCtx.botList.push(createCancelBot(ghostCount + buyerCount + i, sessionCtx));
    }, rand(spawnWindow, spawnWindow * 3));
  }
}

// ── 공개 API ─────────────────────────────────────────────────────────

// sessions: [{ dateStr, time, seatMap }] 형태로 서버에서 전달
export function startBots(sessions) {
  if (globalRunning) return;
  globalRunning = true;
  sessionBotGroups.clear();

  if (!sessions || sessions.length === 0) {
    console.warn('[봇] 투입할 세션이 없습니다.');
    return;
  }

  sessions.forEach(({ dateStr, time, seatMap }) => {
    startBotsForSession(dateStr, time, seatMap);
  });
}

export function stopBots() {
  globalRunning = false;
  for (const sessionCtx of sessionBotGroups.values()) {
    sessionCtx.running = false;
    sessionCtx.botList.forEach(b => { try { b.stop(); } catch {} });
  }
  sessionBotGroups.clear();
  console.log('[봇] 전체 중지');
}

export function getBotStatus() {
  let ghost = 0, buyer = 0, cancel = 0;
  for (const sessionCtx of sessionBotGroups.values()) {
    ghost  += sessionCtx.botList.filter(b => b.type === 'ghost').length;
    buyer  += sessionCtx.botList.filter(b => b.type === 'buyer').length;
    cancel += sessionCtx.botList.filter(b => b.type === 'cancel').length;
  }
  return {
    total: ghost + buyer + cancel,
    ghost, buyer, cancel,
    sessions: sessionBotGroups.size,
  };
}