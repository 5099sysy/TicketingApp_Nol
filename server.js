import { startBots, stopBots, getBotStatus } from './bot.js';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ── 전역 상태 ────────────────────────────────────────────────────────
let seatMap = {};
let waitingQueue = [];
let queueCounter = 0;
let seatLocks = {};
let admittedSessions = {};

const MAX_CONCURRENT = 500;

const rooms = new Map();
const socketToRoom = new Map();

// 날짜+회차별 독립 좌석 맵
const sessionSeatMaps = {};
const sessionSeatLocks = {};

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function getRoomPlayers(room) {
  return Array.from(room.players.entries()).map(([sid, p]) => ({
    socketId: sid,
    nickname: p.nickname,
    score: p.score,
    seats: p.seats,
  }));
}

function broadcastRoomState(room) {
  const payload = {
    code: room.code,
    phase: room.phase,
    players: getRoomPlayers(room),
    timerEndsAt: room.timerEndsAt,
  };
  io.to(room.code).emit('room_state', payload);
}

function endRoom(room) {
  if (room.phase === 'ended') return;
  room.phase = 'ended';
  clearTimeout(room.timerRef);
  const leaderboard = getRoomPlayers(room)
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ ...p, rank: i + 1 }));
  io.to(room.code).emit('room_ended', { leaderboard });
  console.log(`[룸 ${room.code}] 게임 종료`);
}

function startRoomTimer(room) {
  room.timerEndsAt = Date.now() + room.timerSec * 1000;
  room.timerRef = setTimeout(() => { endRoom(room); }, room.timerSec * 1000);
}

// ── 혼잡도 기반 튕김 ─────────────────────────────────────────────────
const CONGESTION_KICK = {
  THRESHOLD: 300,
  MAX_KICK_RATE: 0.04,
  CHECK_INTERVAL: 8000,
};

function congestionKickLoop() {
  setInterval(() => {
    const totalConnections = io.sockets.sockets.size;
    if (totalConnections <= CONGESTION_KICK.THRESHOLD) return;
    if (waitingQueue.length === 0) return;
    const overRatio = Math.min(1, (totalConnections - CONGESTION_KICK.THRESHOLD) / CONGESTION_KICK.THRESHOLD);
    const kickRate = overRatio * CONGESTION_KICK.MAX_KICK_RATE;
    const kickCount = Math.floor(waitingQueue.length * kickRate);
    if (kickCount === 0) return;
    const safeZone = Math.floor(waitingQueue.length * 0.2);
    const candidates = waitingQueue.slice(safeZone);
    if (candidates.length === 0) return;
    const targets = [...candidates].sort(() => Math.random() - 0.5).slice(0, kickCount);
    targets.forEach(({ socketId, id }) => {
      const sock = io.sockets.sockets.get(socketId);
      if (!sock) return;
      sock.emit('congestion_kick', { queueNum: id, reason: '서버 혼잡으로 인해 대기열에서 이탈되었습니다. 다시 시도해주세요.' });
      sock.disconnect(true);
    });
  }, CONGESTION_KICK.CHECK_INTERVAL);
}

// ── 좌석 맵 초기화 ───────────────────────────────────────────────────
function buildInitialSeatMap() {
  const sections = [
    { key: "OP-L", rows: 2, cols: 7 }, { key: "OP-C", rows: 2, cols: 6 }, { key: "OP-R", rows: 2, cols: 7 },
    { key: "1F-A", rows: 20, cols: 8 }, { key: "1F-B", rows: 20, cols: 12 }, { key: "1F-C", rows: 20, cols: 8 },
    { key: "2F-A", rows: 12, cols: 6 }, { key: "2F-B", rows: 12, cols: 8 }, { key: "2F-C", rows: 12, cols: 6 },
  ];
  const map = {};
  sections.forEach(({ key, rows, cols }) => {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        map[`${key}-${r}-${c}`] = 'available';
  });
  return map;
}

// ── 날짜+회차별 사전매진 좌석 맵 생성 ────────────────────────────────
// 날짜마다 랜덤 시드가 다르므로 매번 다른 잔여석 패턴이 나옴
function buildPreSoldSeatMap() {
  const map = buildInitialSeatMap();
  const sections = [
    { key: "OP-L", rows: 2, cols: 7 }, { key: "OP-C", rows: 2, cols: 6 }, { key: "OP-R", rows: 2, cols: 7 },
    { key: "1F-A", rows: 20, cols: 8 }, { key: "1F-B", rows: 20, cols: 12 }, { key: "1F-C", rows: 20, cols: 8 },
    { key: "2F-A", rows: 12, cols: 6 }, { key: "2F-B", rows: 12, cols: 8 }, { key: "2F-C", rows: 12, cols: 6 },
  ];
  // 구역별 사전 매진율: 날짜마다 Math.random()이 다르게 돌아서 패턴이 달라짐
  const preSoldRates = {
    'OP':   () => 0.85 + Math.random() * 0.14,   // OP 85~99% 매진
    '1F-B': (row) => row <= 12 ? 0.90 + Math.random() * 0.09 : 0.55 + Math.random() * 0.25,
    '1F-A': (row) => row <= 9  ? 0.65 + Math.random() * 0.20 : 0.25 + Math.random() * 0.25,
    '1F-C': (row) => row <= 9  ? 0.65 + Math.random() * 0.20 : 0.25 + Math.random() * 0.25,
    '2F-B': (row) => row <= 4  ? 0.45 + Math.random() * 0.25 : 0.15 + Math.random() * 0.20,
    '2F-A': () => 0.10 + Math.random() * 0.20,
    '2F-C': () => 0.10 + Math.random() * 0.20,
  };
  sections.forEach(({ key, rows, cols }) => {
    const baseKey = key.startsWith('OP') ? 'OP' : key;
    const rateFn = preSoldRates[baseKey] || (() => 0.10);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (Math.random() < rateFn(r))
          map[`${key}-${r}-${c}`] = 'sold';
  });
  return map;
}

// ── 날짜+회차 키로 세션별 맵 조회 (없으면 새로 생성) ─────────────────
function getSessionMap(dateStr, time) {
  if (!dateStr || !time) return { map: seatMap, locks: seatLocks };
  const key = `${dateStr}_${time}`;
  if (!sessionSeatMaps[key]) {
    // 빈 맵이 아니라 사전매진 맵으로 시작
    sessionSeatMaps[key] = buildPreSoldSeatMap();
    sessionSeatLocks[key] = {};
    console.log(`[세션] 새 좌석맵 생성 (사전매진 적용): ${key}`);
  }
  return { map: sessionSeatMaps[key], locks: sessionSeatLocks[key] };
}

seatMap = buildInitialSeatMap();

function flushQueue() {
  const admittedCount = Object.keys(admittedSessions).length;
  const slots = Math.max(0, MAX_CONCURRENT - admittedCount);
  if (slots <= 0) return;
  const toAdmit = waitingQueue.splice(0, slots);
  toAdmit.forEach(({ id, socketId }) => {
    const sid = io.sockets.sockets.get(socketId);
    if (!sid) return;
    admittedSessions[socketId] = { queueNum: id, socketId, allowedAt: Date.now() };
    sid.emit('queue_admitted', { queueNum: id });
  });
  if (toAdmit.length > 0) io.emit('queue_update', { total: waitingQueue.length });
}

// ════════════════════════════════════════════════════════════════════
// 소켓 이벤트
// ════════════════════════════════════════════════════════════════════
io.on('connection', (socket) => {
  console.log('[접속]', socket.id);
  socket.emit('init', { seatMap, queueLength: waitingQueue.length });

  // ── 날짜+회차 선택 시 해당 세션 좌석맵 전송 ─────────────────────
  socket.on('select_session', ({ dateStr, time }) => {
    const { map } = getSessionMap(dateStr, time);
    socket.emit('init', { seatMap: map, queueLength: waitingQueue.length });
  });

  // ── 룸 생성 ──────────────────────────────────────────────────────
  socket.on('create_room', ({ nickname = '익명', timerSec = 420 } = {}) => {
    const code = genRoomCode();
    const room = {
      code,
      hostSocketId: socket.id,
      players: new Map(),
      seatOwner: new Map(),
      phase: 'lobby',
      timerSec,
      timerEndsAt: null,
      timerRef: null,
      createdAt: Date.now(),
    };
    room.players.set(socket.id, { nickname, score: 0, seats: [] });
    rooms.set(code, room);
    socketToRoom.set(socket.id, code);
    socket.join(code);
    socket.emit('room_created', { code, timerSec });
    broadcastRoomState(room);
    console.log(`[룸] 생성: ${code} by ${nickname}`);
  });

  // ── 룸 참가 ──────────────────────────────────────────────────────
  socket.on('join_room', ({ code, nickname = '익명' } = {}) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) { socket.emit('room_error', { message: '존재하지 않는 방 코드입니다.' }); return; }
    if (room.phase === 'ended') { socket.emit('room_error', { message: '이미 종료된 게임입니다.' }); return; }
    if (room.players.has(socket.id)) {
      socket.join(code);
      socketToRoom.set(socket.id, code);
      socket.emit('room_joined', { code, phase: room.phase, timerSec: room.timerSec, openTime: room.openTime });
      broadcastRoomState(room);
      return;
    }
    room.players.set(socket.id, { nickname, score: 0, seats: [] });
    socketToRoom.set(socket.id, code);
    socket.join(code);
    socket.emit('room_joined', { code, phase: room.phase, timerSec: room.timerSec, openTime: room.openTime });
    broadcastRoomState(room);
    console.log(`[룸 ${code}] 참가: ${nickname}`);
  });

  // ── 룸 정보 조회 ─────────────────────────────────────────────────
  socket.on('peek_room', ({ code } = {}) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) { socket.emit('room_peek_result', { exists: false }); return; }
    socket.emit('room_peek_result', {
      exists: true, phase: room.phase, playerCount: room.players.size, timerSec: room.timerSec,
    });
  });

  // ── 게임 시작 (호스트만) ─────────────────────────────────────────
  socket.on('start_room', () => {
    const code = socketToRoom.get(socket.id);
    const room = code && rooms.get(code);
    if (!room) return;
    if (room.hostSocketId !== socket.id) { socket.emit('room_error', { message: '방장만 시작할 수 있습니다.' }); return; }
    if (room.phase !== 'lobby') return;
    room.phase = 'playing';
    room.openTime = Date.now() + 30 * 1000;
    startRoomTimer(room);
    io.to(code).emit('room_started', { timerEndsAt: room.timerEndsAt, openTime: room.openTime });
    broadcastRoomState(room);
    console.log(`[룸 ${code}] 게임 시작`);
  });

  // ── 솔로 대기열 ──────────────────────────────────────────────────
  socket.on('join_queue', ({ userId } = {}) => {
    if (userId && admittedSessions[userId]) {
      socket.emit('queue_admitted', { queueNum: admittedSessions[userId].queueNum, restored: true });
      return;
    }
    const existing = waitingQueue.find(q => q.socketId === socket.id);
    if (existing) { socket.emit('queue_assigned', { myNum: existing.id, total: waitingQueue.length }); return; }
    queueCounter++;
    const myNum = queueCounter;
    waitingQueue.push({ id: myNum, socketId: socket.id, joinedAt: Date.now() });
    socket.emit('queue_assigned', { myNum, total: waitingQueue.length });
    io.emit('queue_update', { total: waitingQueue.length });
    flushQueue();
  });

  // ── 좌석 잠금 ────────────────────────────────────────────────────
  socket.on('lock_seat', ({ seatId, userId, dateStr, time } = {}) => {
    const { map, locks } = getSessionMap(dateStr, time);
    const now = Date.now();
    if (map[seatId] === 'sold') {
      socket.emit('lock_failed', { seatId, reason: '이미 판매된 좌석입니다.' }); return;
    }
    if (locks[seatId] && locks[seatId].expiresAt > now) {
      socket.emit('lock_failed', { seatId, reason: '다른 사용자가 선택 중인 좌석입니다.' }); return;
    }
    locks[seatId] = { userId, socketId: socket.id, expiresAt: now + 5 * 60 * 1000 };
    map[seatId] = 'reserved';
    socket.emit('lock_success', { seatId });
    io.emit('seat_update', { seatId, status: 'reserved', dateStr, time });
  });

  // ── 좌석 잠금 해제 ───────────────────────────────────────────────
  socket.on('unlock_seat', ({ seatId, userId, dateStr, time } = {}) => {
    const { map, locks } = getSessionMap(dateStr, time);
    if (locks[seatId]?.userId === userId) {
      delete locks[seatId];
      map[seatId] = 'available';
      io.emit('seat_update', { seatId, status: 'available', dateStr, time });
      const code = socketToRoom.get(socket.id);
      const room = code && rooms.get(code);
      if (room) {
        const player = room.players.get(socket.id);
        if (player) {
          player.seats = player.seats.filter(s => s !== seatId);
          player.score = player.seats.length;
          room.seatOwner.delete(seatId);
          broadcastRoomState(room);
        }
      }
    }
  });

  // ── 결제 확정 ────────────────────────────────────────────────────
  socket.on('confirm_seats', ({ seatIds, userId, dateStr, time } = {}) => {
    const { map, locks } = getSessionMap(dateStr, time);
    const confirmed = [];
    seatIds.forEach(seatId => {
      if (map[seatId] !== 'sold') {
        map[seatId] = 'sold';
        delete locks[seatId];
        confirmed.push(seatId);
        io.emit('seat_update', { seatId, status: 'sold', dateStr, time });
      }
    });
    socket.emit('payment_confirmed', { seatIds: confirmed });
    const code = socketToRoom.get(socket.id);
    const room = code && rooms.get(code);
    if (room && confirmed.length > 0) {
      const player = room.players.get(socket.id);
      if (player) {
        confirmed.forEach(sid => {
          if (!player.seats.includes(sid)) player.seats.push(sid);
          room.seatOwner.set(sid, socket.id);
        });
        player.score = player.seats.length;
        broadcastRoomState(room);
        io.to(code).emit('score_update', {
          socketId: socket.id, nickname: player.nickname, score: player.score, delta: confirmed.length,
        });
      }
    }
  });

  // ── 세션 복원 ────────────────────────────────────────────────────
  socket.on('restore_session', ({ userId, queueNum } = {}) => {
    if (!userId || !queueNum) return;
    const admitted = Object.values(admittedSessions).find(s => s.queueNum === queueNum);
    if (admitted) {
      admittedSessions[socket.id] = { ...admitted, socketId: socket.id };
      socket.emit('queue_admitted', { queueNum, restored: true });
      return;
    }
    const idx = waitingQueue.findIndex(q => q.id === queueNum);
    if (idx !== -1) {
      waitingQueue[idx].socketId = socket.id;
      socket.emit('queue_assigned', { myNum: queueNum, total: waitingQueue.length, restored: true });
    } else {
      socket.emit('session_expired');
    }
  });

  // ── 연결 종료 ────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    // 전역 좌석 잠금 해제
    Object.keys(seatLocks).forEach(seatId => {
      if (seatLocks[seatId].socketId === socket.id) {
        delete seatLocks[seatId];
        seatMap[seatId] = 'available';
        io.emit('seat_update', { seatId, status: 'available' });
      }
    });
    // 세션별 좌석 잠금 해제
    Object.keys(sessionSeatLocks).forEach(sessionKey => {
      const locks = sessionSeatLocks[sessionKey];
      const map = sessionSeatMaps[sessionKey];
      Object.keys(locks).forEach(seatId => {
        if (locks[seatId].socketId === socket.id) {
          const [dateStr, time] = sessionKey.split('_');
          delete locks[seatId];
          map[seatId] = 'available';
          io.emit('seat_update', { seatId, status: 'available', dateStr, time });
        }
      });
    });
    const before = waitingQueue.length;
    waitingQueue = waitingQueue.filter(q => q.socketId !== socket.id);
    if (waitingQueue.length < before) { io.emit('queue_update', { total: waitingQueue.length }); flushQueue(); }
    delete admittedSessions[socket.id];
    const code = socketToRoom.get(socket.id);
    if (code) {
      const room = rooms.get(code);
      if (room && room.phase !== 'ended') { broadcastRoomState(room); }
      socketToRoom.delete(socket.id);
    }
    console.log('[종료]', socket.id);
  });
});

// ── 잠금 만료 정리 ───────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  // 전역 잠금
  Object.keys(seatLocks).forEach(seatId => {
    if (seatLocks[seatId].expiresAt <= now) {
      delete seatLocks[seatId];
      seatMap[seatId] = 'available';
      io.emit('seat_update', { seatId, status: 'available' });
    }
  });
  // 세션별 잠금
  Object.keys(sessionSeatLocks).forEach(sessionKey => {
    const locks = sessionSeatLocks[sessionKey];
    const map = sessionSeatMaps[sessionKey];
    const [dateStr, time] = sessionKey.split('_');
    Object.keys(locks).forEach(seatId => {
      if (locks[seatId].expiresAt <= now) {
        delete locks[seatId];
        map[seatId] = 'available';
        io.emit('seat_update', { seatId, status: 'available', dateStr, time });
      }
    });
  });
}, 30000);

// ── 비활성 룸 정리 ───────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > 3600 * 1000 && room.phase === 'ended') {
      rooms.delete(code);
      console.log(`[룸] 정리: ${code}`);
    }
  }
}, 600 * 1000);


setInterval(() => {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  Object.keys(sessionSeatMaps).forEach(key => {
    const [dateStr] = key.split('_');
    if (new Date(dateStr).getTime() < cutoff) {
      delete sessionSeatMaps[key];
      delete sessionSeatLocks[key];
      console.log(`[세션] 정리: ${key}`);
    }
  });
}, 3600 * 1000);

// ── REST API ─────────────────────────────────────────────────────────
app.post('/bots/start', (req, res) => {
  // sessionSeatMaps에 이미 등록된 세션 수집
  const sessions = Object.entries(sessionSeatMaps).map(([key, map]) => {
    const [dateStr, time] = key.split('_');
    return { dateStr, time, seatMap: map };
  });

  // 클라이언트가 sessions 배열을 직접 보낸 경우, 없는 세션은 새로 생성해서 추가
  const incoming = req.body?.sessions || [];
  incoming.forEach(({ dateStr, time }) => {
    const key = `${dateStr}_${time}`;
    if (!sessionSeatMaps[key]) {
      sessionSeatMaps[key] = buildInitialSeatMap();
      sessionSeatLocks[key] = {};
      console.log(`[봇 시작] 세션 신규 생성: ${key}`);
    }
    // 이미 sessions에 없으면 추가
    if (!sessions.find(s => s.dateStr === dateStr && s.time === time)) {
      sessions.push({ dateStr, time, seatMap: sessionSeatMaps[key] });
    }
  });

  if (sessions.length === 0) {
    // 최후 fallback: 오늘 날짜로 하나
    const today = new Date().toISOString().split('T')[0];
    const key = `${today}_14:00`;
    if (!sessionSeatMaps[key]) {
      sessionSeatMaps[key] = buildInitialSeatMap();
      sessionSeatLocks[key] = {};
    }
    sessions.push({ dateStr: today, time: '14:00', seatMap: sessionSeatMaps[key] });
  }

  console.log(`[봇 시작] 총 ${sessions.length}개 세션에 봇 투입`);
  startBots(sessions);
  res.json({ ok: true, sessions: sessions.map(s => `${s.dateStr}_${s.time}`), ...getBotStatus() });
});

app.post('/bots/stop', (req, res) => {
  stopBots();
  res.json({ ok: true });
});

app.get('/room/:code', (req, res) => {
  const room = rooms.get(req.params.code?.toUpperCase());
  if (!room) return res.status(404).json({ ok: false });
  res.json({ ok: true, code: room.code, phase: room.phase, playerCount: room.players.size, timerSec: room.timerSec });
});

app.post('/kick/:socketId', (req, res) => {
  const sock = io.sockets.sockets.get(req.params.socketId);
  if (!sock) return res.status(404).json({ ok: false });
  sock.disconnect(true);
  res.json({ ok: true });
});

app.get('/status', (req, res) => {
  const sold = Object.values(seatMap).filter(v => v === 'sold').length;
  const reserved = Object.values(seatMap).filter(v => v === 'reserved').length;
  const available = Object.values(seatMap).filter(v => v === 'available').length;
  res.json({
    seats: { sold, reserved, available, total: sold + reserved + available },
    queue: { waiting: waitingQueue.length, admitted: Object.keys(admittedSessions).length },
    bots: getBotStatus(),
    connections: io.sockets.sockets.size,
    sessions: Object.keys(sessionSeatMaps),
    rooms: Array.from(rooms.values()).map(r => ({ code: r.code, phase: r.phase, players: r.players.size })),
  });
});

app.post('/reset', (req, res) => {
  stopBots();
  seatMap = buildInitialSeatMap();
  seatLocks = {};
  waitingQueue = [];
  queueCounter = 0;
  admittedSessions = {};
  Object.keys(sessionSeatMaps).forEach(k => delete sessionSeatMaps[k]);
  Object.keys(sessionSeatLocks).forEach(k => delete sessionSeatLocks[k]);
  rooms.clear();
  socketToRoom.clear();
  io.emit('init', { seatMap, queueLength: 0 });
  res.json({ ok: true });
});

server.listen(3001, () => {
  congestionKickLoop();
  console.log('✅ 서버 실행: http://localhost:3001');
});