import { useState, useEffect, useRef } from "react";

// ══════════════════════════════════════════════════════════════════════
// 미션 정의
// ══════════════════════════════════════════════════════════════════════
export const MISSIONS = [
  {
    id: "vip_3_consecutive",
    title: "VIP석 연속 3석 잡기",
    desc: "같은 열에서 VIP석을 연속으로 3개 예매하세요.",
    bonusBase: 300,
    check: (seats) => {
      const vip = seats.filter(s => s.grade === "VIP석");
      if (vip.length < 3) return { done: false };
      const bySection = {};
      vip.forEach(s => { (bySection[`${s.section}-${s.row}`] = bySection[`${s.section}-${s.row}`] || []).push(s.col); });
      for (const cols of Object.values(bySection)) {
        const sorted = cols.sort((a, b) => a - b);
        for (let i = 0; i <= sorted.length - 3; i++) {
          if (sorted[i+1] === sorted[i]+1 && sorted[i+2] === sorted[i]+2) return { done: true };
        }
      }
      return { done: false };
    },
    scoreBonus: (seats) => {
      const vip = seats.filter(s => s.grade === "VIP석").length;
      return 300 + vip * 20;
    },
  },
  {
    id: "op_any",
    title: "OP석(오케스트라피트) 1석 이상 잡기",
    desc: "무대 바로 앞 OP석을 1석이라도 예매하세요.",
    bonusBase: 500,
    check: (seats) => ({ done: seats.some(s => s.grade === "OP석") }),
    scoreBonus: (seats) => {
      const op = seats.filter(s => s.grade === "OP석").length;
      return 500 + op * 80;
    },
  },
  {
    id: "1f_row1",
    title: "1F 1열 잡기",
    desc: "1층 어느 구역이든 1열 좌석을 예매하세요.",
    bonusBase: 400,
    check: (seats) => ({ done: seats.some(s => s.section.startsWith("1F") && s.row === 1) }),
    scoreBonus: (seats) => {
      const cnt = seats.filter(s => s.section.startsWith("1F") && s.row === 1).length;
      return 400 + cnt * 50;
    },
  },
  {
    id: "four_seats",
    title: "4석 모두 채우기",
    desc: "최대 허용 매수인 4석을 전부 예매하세요.",
    bonusBase: 250,
    check: (seats) => ({ done: seats.length >= 4 }),
    scoreBonus: (seats) => 250 + seats.length * 30,
  },
  {
    id: "vip_and_op",
    title: "VIP석 + OP석 동시 잡기",
    desc: "VIP석과 OP석을 한 번의 예매에서 모두 포함시키세요.",
    bonusBase: 700,
    check: (seats) => ({
      done: seats.some(s => s.grade === "VIP석") && seats.some(s => s.grade === "OP석"),
    }),
    scoreBonus: (seats) => 700,
  },
  {
    id: "1fb_center",
    title: "1F-B 구역 센터 잡기",
    desc: "1층 B구역(센터)에서 1열~5열 사이 좌석을 예매하세요.",
    bonusBase: 350,
    check: (seats) => ({ done: seats.some(s => s.section === "1F-B" && s.row <= 5) }),
    scoreBonus: (seats) => {
      const cnt = seats.filter(s => s.section === "1F-B" && s.row <= 5).length;
      return 350 + (6 - Math.min(...seats.filter(s => s.section === "1F-B" && s.row <= 5).map(s => s.row))) * 40 + cnt * 20;
    },
  },
  {
    id: "same_row_4",
    title: "같은 열 4석 연속 잡기",
    desc: "같은 구역, 같은 행에서 연속된 4석을 예매하세요.",
    bonusBase: 600,
    check: (seats) => {
      if (seats.length < 4) return { done: false };
      const byRow = {};
      seats.forEach(s => { (byRow[`${s.section}-${s.row}`] = byRow[`${s.section}-${s.row}`] || []).push(s.col); });
      for (const cols of Object.values(byRow)) {
        const sorted = cols.sort((a, b) => a - b);
        for (let i = 0; i <= sorted.length - 4; i++) {
          if (sorted[i+1]===sorted[i]+1 && sorted[i+2]===sorted[i]+2 && sorted[i+3]===sorted[i]+3) return { done: true };
        }
      }
      return { done: false };
    },
    scoreBonus: () => 600,
  },
];

export function pickRandomMission() {
  return MISSIONS[Math.floor(Math.random() * MISSIONS.length)];
}

// ══════════════════════════════════════════════════════════════════════
// 1. ModeSelect — 앱 진입 화면 (3모드)
// ══════════════════════════════════════════════════════════════════════
export function ModeSelect({ onSolo, onMulti, onMission }) {
  return (
    <div className="mode-select-page">
      <div className="mode-logo">NOL<span>ticket</span></div>
      <div className="mode-title">티켓팅 시뮬레이터</div>
      <div className="mode-subtitle">연습 모드를 선택하세요</div>
      <div className="mode-cards">
        <button className="mode-card solo" onClick={onSolo}>
          <div className="mode-card-icon">🧑</div>
          <div className="mode-card-name">자유 연습</div>
          <div className="mode-card-desc">
            봇들과 경쟁하며<br/>혼자서 티켓팅을 연습합니다
          </div>
        </button>
        <button className="mode-card multi" onClick={onMulti}>
          <div className="mode-card-icon">👥</div>
          <div className="mode-card-name">멀티 모드</div>
          <div className="mode-card-desc">
            친구들과 입장코드를 공유하고<br/>더 많은 좌석을 잡는 사람이 승리!
          </div>
          <div className="mode-card-badge">멀티플레이어</div>
        </button>
        <button className="mode-card mission" onClick={onMission}>
          <div className="mode-card-icon">🎯</div>
          <div className="mode-card-name">미션 모드</div>
          <div className="mode-card-desc">
            주어진 미션을 달성하고<br/>추가 점수를 획득하세요!
          </div>
          <div className="mode-card-badge mission-badge">혼자 / 같이</div>
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// 2. MissionModeSelect — 미션 모드 내 혼자/같이 선택
// ══════════════════════════════════════════════════════════════════════
export function MissionModeSelect({ onSolo, onMulti, onBack }) {
  return (
    <div className="mode-select-page">
      <button className="room-back-btn" onClick={onBack}>‹ 뒤로</button>
      <div className="mode-logo">NOL<span>ticket</span> <span style={{fontSize:16,color:"#f59e0b",fontWeight:700}}>🎯 미션</span></div>
      <div className="mode-title">미션 모드</div>
      <div className="mode-subtitle">게임이 시작되면 미션이 공개됩니다!</div>
      <div className="mode-cards" style={{gridTemplateColumns:"1fr 1fr"}}>
        <button className="mode-card solo" onClick={onSolo}>
          <div className="mode-card-icon">🧑</div>
          <div className="mode-card-name">혼자 미션</div>
          <div className="mode-card-desc">
            혼자서 미션을 달성하고<br/>점수를 올려보세요
          </div>
        </button>
        <button className="mode-card multi" onClick={onMulti}>
          <div className="mode-card-icon">👥</div>
          <div className="mode-card-name">같이 미션</div>
          <div className="mode-card-desc">
            친구들과 같은 미션으로<br/>점수 경쟁!
          </div>
          <div className="mode-card-badge">멀티플레이어</div>
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// 3. MissionPanel — 게임 중 미션 표시 패널
// ══════════════════════════════════════════════════════════════════════
export function MissionPanel({ mission, seats, bonusEarned }) {
  if (!mission) return null;
  const result = mission.check(seats);
  const bonus = result.done ? mission.scoreBonus(seats) : null;

  return (
    <div className="mission-panel" style={{
      background: result.done ? "linear-gradient(135deg,#d1fae5,#a7f3d0)" : "linear-gradient(135deg,#fffbeb,#fef3c7)",
      border: `2px solid ${result.done ? "#10b981" : "#f59e0b"}`,
      borderRadius: 14, padding: "14px 18px", marginBottom: 14,
      boxShadow: "0 2px 12px rgba(0,0,0,.08)",
    }}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
        <span style={{fontSize:18}}>{result.done ? "✅" : "🎯"}</span>
        <span style={{fontWeight:700,fontSize:14,color: result.done ? "#065f46" : "#92400e"}}>
          {result.done ? "미션 달성!" : "진행 중 미션"}
        </span>
        {result.done && bonus !== null && (
          <span style={{marginLeft:"auto",fontWeight:800,fontSize:13,color:"#059669",background:"#d1fae5",borderRadius:8,padding:"2px 10px"}}>
            +{bonus.toLocaleString()}점
          </span>
        )}
      </div>
      <div style={{fontWeight:700,fontSize:15,color:"#111",marginBottom:3}}>{mission.title}</div>
      <div style={{fontSize:12,color:"#666"}}>{mission.desc}</div>
      {!result.done && (
        <div style={{marginTop:8,fontSize:11,color:"#92400e",background:"#fef3c7",borderRadius:6,padding:"4px 10px",display:"inline-block"}}>
          기본 보너스 {mission.bonusBase.toLocaleString()}점 + 달성 보너스
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// 4. RoomLobby — 방 생성 or 참가
// ══════════════════════════════════════════════════════════════════════
export function RoomLobby({ socket, onBack, onRoomReady, isMissionMode }) {
  const [tab, setTab] = useState("create");
  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [timerMin, setTimerMin] = useState(3);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("room");
    if (code) { setTab("join"); setJoinCode(code.toUpperCase()); }
  }, []);

  useEffect(() => {
    function onCreated({ code }) {
      setLoading(false);
      onRoomReady({ code, isHost: true, nickname: nickname.trim() || "나" });
    }
    function onJoined({ code, phase }) {
      setLoading(false);
      onRoomReady({ code, isHost: false, nickname: nickname.trim() || "나", phase });
    }
    function onError({ message }) {
      setLoading(false);
      setError(message);
    }
    socket.on("room_created", onCreated);
    socket.on("room_joined", onJoined);
    socket.on("room_error", onError);
    return () => {
      socket.off("room_created", onCreated);
      socket.off("room_joined", onJoined);
      socket.off("room_error", onError);
    };
  }, [socket, nickname, onRoomReady]);

  function handleCreate() {
    if (!nickname.trim()) { setError("닉네임을 입력해주세요."); return; }
    setError(""); setLoading(true);
    socket.emit("create_room", { nickname: nickname.trim(), timerSec: timerMin * 60, isMissionMode });
  }

  function handleJoin() {
    if (!nickname.trim()) { setError("닉네임을 입력해주세요."); return; }
    if (joinCode.trim().length !== 6) { setError("6자리 코드를 입력해주세요."); return; }
    setError(""); setLoading(true);
    socket.emit("join_room", { code: joinCode.trim().toUpperCase(), nickname: nickname.trim() });
  }

  return (
    <div className="room-lobby-page">
      <button className="room-back-btn" onClick={onBack}>‹ 뒤로</button>
      <div className="room-lobby-logo">
        NOL<span>ticket</span>
        <span className="room-lobby-multi-badge">{isMissionMode ? "🎯 미션" : "멀티"}</span>
      </div>
      <div className="room-lobby-card">
        <div className="room-tab-row">
          <button className={`room-tab${tab === "create" ? " active" : ""}`} onClick={() => { setTab("create"); setError(""); }}>방 만들기</button>
          <button className={`room-tab${tab === "join" ? " active" : ""}`} onClick={() => { setTab("join"); setError(""); }}>방 참가하기</button>
        </div>
        <div className="room-field">
          <label>닉네임</label>
          <input className="room-input" placeholder="ex) 티켓마스터" value={nickname} maxLength={12} onChange={e => setNickname(e.target.value)} />
        </div>
        {tab === "create" && (
          <>
            <div className="room-field">
              <label>예매 제한 시간</label>
              <div className="room-timer-row">
                {[3, 5, 7, 10].map(m => (
                  <button key={m} className={`room-timer-btn${timerMin === m ? " sel" : ""}`} onClick={() => setTimerMin(m)}>{m}분</button>
                ))}
              </div>
            </div>
            <div className="room-notice">
              {isMissionMode
                ? "※ 게임 시작 시 모든 플레이어에게 동일한 미션이 공개됩니다.\n※ 미션 달성 시 추가 점수를 획득합니다."
                : "※ 타이머가 끝나면 자동으로 게임이 종료되고 순위가 공개됩니다."
              }<br/>
              ※ 방 코드를 친구에게 공유하세요. 방장이 게임을 시작합니다.
            </div>
            {error && <div className="room-error">{error}</div>}
            <button className="room-action-btn" disabled={loading} onClick={handleCreate}>
              {loading ? "방 만드는 중..." : "방 만들기"}
            </button>
          </>
        )}
        {tab === "join" && (
          <>
            <div className="room-field">
              <label>입장 코드 (6자리)</label>
              <input className="room-input code-input" placeholder="ABCD12" value={joinCode} maxLength={6} onChange={e => setJoinCode(e.target.value.toUpperCase())} />
            </div>
            {error && <div className="room-error">{error}</div>}
            <button className="room-action-btn" disabled={loading} onClick={handleJoin}>
              {loading ? "입장 중..." : "입장하기"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// 5. WaitingRoom — 대기실
// ══════════════════════════════════════════════════════════════════════
export function WaitingRoom({ socket, roomCode, isHost, nickname, onGameStart }) {
  const [players, setPlayers] = useState([]);
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;

  useEffect(() => {
    function onRoomState({ players }) { setPlayers(players); }
    function onStarted() { onGameStart(); }
    socket.on("room_state", onRoomState);
    socket.on("room_started", onStarted);
    return () => {
      socket.off("room_state", onRoomState);
      socket.off("room_started", onStarted);
    };
  }, [socket, onGameStart]);

  function copyCode() {
    navigator.clipboard.writeText(roomCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  function copyLink() {
    navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div className="waiting-room-page">
      <div className="waiting-room-card">
        <div className="waiting-logo">NOL<span>ticket</span></div>
        <div className="waiting-title">대기실</div>
        <div className="waiting-code-section">
          <div className="waiting-code-label">입장 코드</div>
          <div className="waiting-code-display">
            {roomCode.split("").map((ch, i) => <span key={i} className="waiting-code-char">{ch}</span>)}
          </div>
          <div className="waiting-code-btns">
            <button className="waiting-copy-btn" onClick={copyCode}>{copied ? "✓ 복사됨" : "코드 복사"}</button>
            <button className="waiting-copy-btn outline" onClick={copyLink}>🔗 링크 복사</button>
          </div>
        </div>
        <div className="waiting-players-title">참가자 ({players.length}명)</div>
        <div className="waiting-players-list">
          {players.map((p, i) => (
            <div key={p.socketId} className="waiting-player-item">
              <span className="waiting-player-num">{i + 1}</span>
              <span className="waiting-player-name">
                {p.nickname}
                {p.socketId === socket.id && <span className="waiting-me-badge">나</span>}
              </span>
              {i === 0 && <span className="waiting-host-badge">👑 방장</span>}
            </div>
          ))}
          {players.length === 0 && (
            <div style={{ color: "#aaa", fontSize: 13, textAlign: "center", padding: "12px 0" }}>참가자를 기다리는 중...</div>
          )}
        </div>
        {isHost ? (
          <button className="waiting-start-btn" disabled={players.length < 1} onClick={() => socket.emit("start_room")}>
            🎫 게임 시작 ({players.length}명)
          </button>
        ) : (
          <div className="waiting-host-notice">방장이 게임을 시작하면 자동으로 시작됩니다.</div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// 6. MultiScorePanel — 실시간 순위판 + 남은 시간
// ══════════════════════════════════════════════════════════════════════
export function MultiScorePanel({ players, mySocketId, timerEndsAt }) {
  const [remainSec, setRemainSec] = useState(0);

  useEffect(() => {
    const tick = () => {
      const r = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
      setRemainSec(r);
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [timerEndsAt]);

  const sorted = [...players].sort((a, b) => b.score - a.score);
  const fmt = `${Math.floor(remainSec / 60)}:${String(remainSec % 60).padStart(2, "0")}`;
  const isUrgent = remainSec <= 30 && remainSec > 0;

  return (
    <div className="multi-score-panel">
      <div className="multi-score-header">
        <span className="multi-score-title">🏆 실시간 순위</span>
        <span className="multi-score-timer" style={{
          color: isUrgent ? "#ef4444" : "#5151e5",
          fontWeight: 800,
          animation: isUrgent ? "pulse 0.8s infinite" : "none",
        }}>
          ⏱ {fmt}
        </span>
      </div>
      <div className="multi-score-list">
        {sorted.map((p, i) => (
          <div key={p.socketId} className={`multi-score-item${p.socketId === mySocketId ? " me" : ""}`}>
            <span className={`multi-rank rank-${i + 1}`}>
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
            </span>
            <span className="multi-player-name">
              {p.nickname}
              {p.socketId === mySocketId && <span className="multi-me-dot"/>}
            </span>
            <span className="multi-player-score">{p.score}석</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// 7. RoomEndScreen — 게임 종료 결과 화면
// ══════════════════════════════════════════════════════════════════════
export function RoomEndScreen({ leaderboard, mySocketId, roomCode, onRestart, missionResult }) {
  const myEntry = leaderboard.find(p => p.socketId === mySocketId);
  const winner = leaderboard[0];
  const isWinner = winner?.socketId === mySocketId;

  const medalEmoji = (rank) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `${rank}위`;
  };

  return (
    <div className="room-end-page">
      <div className="room-end-card">
        <div className="room-end-logo">NOL<span>ticket</span></div>
        <div className="room-end-trophy">{isWinner ? "🏆" : myEntry?.rank === 2 ? "🥈" : myEntry?.rank === 3 ? "🥉" : "🎫"}</div>
        <div className="room-end-result-title">{isWinner ? "🎉 우승!" : `${myEntry?.rank ?? "?"}위로 완주!`}</div>
        <div className="room-end-my-score">내 점수: <strong>{myEntry?.score ?? 0}석</strong></div>

        {missionResult && (
          <div style={{
            margin: "12px 0", padding: "12px 16px", borderRadius: 12,
            background: missionResult.done ? "#d1fae5" : "#fef3c7",
            border: `1.5px solid ${missionResult.done ? "#10b981" : "#f59e0b"}`,
            textAlign: "center",
          }}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>
              {missionResult.done ? "🎯 미션 달성!" : "🎯 미션 미달성"}
            </div>
            <div style={{fontSize:13,color:"#555"}}>{missionResult.title}</div>
            {missionResult.done && (
              <div style={{fontWeight:800,color:"#059669",fontSize:16,marginTop:4}}>+{missionResult.bonus.toLocaleString()}점 보너스</div>
            )}
          </div>
        )}

        <div className="room-end-leaderboard">
          <div className="room-end-lb-title">최종 순위</div>
          {leaderboard.map((p) => (
            <div key={p.socketId} className={`room-end-lb-row${p.socketId === mySocketId ? " me" : ""}${p.rank === 1 ? " winner" : ""}`}>
              <span className="room-end-lb-rank">{medalEmoji(p.rank)}</span>
              <span className="room-end-lb-name">
                {p.nickname}
                {p.socketId === mySocketId && <span className="room-end-me-tag">나</span>}
              </span>
              <span className="room-end-lb-score">{p.score}석</span>
            </div>
          ))}
        </div>
        <div className="room-end-code">방 코드: <strong>{roomCode}</strong></div>
        <button className="room-end-restart-btn" onClick={onRestart}>처음으로 돌아가기</button>
      </div>
    </div>
  );
}