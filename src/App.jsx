import './App.css'; 
import socket from './socket';
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ModeSelect, MissionModeSelect, MissionPanel, RoomLobby, WaitingRoom, MultiScorePanel as FloatingScorePanel, RoomEndScreen, MISSIONS, pickRandomMission } from './MultiplayerComponents';


// ─── 좌석 등급 결정 함수 ───────────────────────────────────────────────────────
function getSeatGrade(sectionKey, row, col) {
  if (sectionKey === "OP-L" || sectionKey === "OP-C" || sectionKey === "OP-R") {
    return { grade: "OP석", price: 170000 };
  }
  if (sectionKey === "1F-A") {
    if (row <= 17 && col >= 4 && col <= 7) return { grade: "VIP석", price: 170000 };
    return { grade: "R석", price: 140000 };
  }
  if (sectionKey === "1F-B") {
    if (row <= 17) return { grade: "VIP석", price: 170000 };
    return { grade: "R석", price: 140000 };
  }
  if (sectionKey === "1F-C") {
    if (row <= 17 && col >= 0 && col <= 3) return { grade: "VIP석", price: 170000 };
    return { grade: "R석", price: 140000 };
  }
  if (sectionKey === "2F-A") {
    if (row <= 1 && col >= 3 && col <= 5) return { grade: "VIP석", price: 170000 };
    if (row <= 4 && col === 1) return { grade: "R석", price: 140000 };
    if (row >= 2 && row <= 4 && col >= 1 && col <= 5) return { grade: "R석", price: 140000 };
    if (row <= 7) return { grade: "S석", price: 110000 };
    return { grade: "A석", price: 80000 };
  }
  if (sectionKey === "2F-B") {
    if (row <= 1) return { grade: "VIP석", price: 170000 };
    if (row >= 2 && row <= 4) return { grade: "R석", price: 140000 };
    if (row <= 7) return { grade: "S석", price: 110000 };
    return { grade: "A석", price: 80000 };
  }
  if (sectionKey === "2F-C") {
    if (row <= 1 && col >= 0 && col <= 2) return { grade: "VIP석", price: 170000 };
    if (row <= 4 && col === 4) return { grade: "R석", price: 140000 };
    if (row >= 2 && row <= 4 && col >= 0 && col <= 3) return { grade: "R석", price: 140000 };
    if (row <= 7) return { grade: "S석", price: 110000 };
    return { grade: "A석", price: 80000 };
  }
  return { grade: "R석", price: 140000 };
}

// ─── 섹션 정의 ───────────────────────────────────────────────────────────────
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

// 전체 좌석 수 (고정)
const TOTAL_SEATS_ALL = SECTIONS.reduce((s, sec) => s + sec.rows * sec.cols, 0);

// 등급별 실제 좌석 수 (앱 초기에 한번만 계산)
const GRADE_SEAT_COUNTS = (() => {
  const counts = { "OP석": 0, "VIP석": 0, "R석": 0, "S석": 0, "A석": 0 };
  SECTIONS.forEach(({ key, rows, cols }) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const { grade } = getSeatGrade(key, r, c);
        counts[grade]++;
      }
    }
  });
  return counts;
})();

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

const showEnd = new Date(TODAY.getTime() + 14 * 24 * 60 * 60 * 1000);

function getSessionSeats() {
  const { "OP석": op, "VIP석": vip, "R석": r, "S석": s, "A석": a } = GRADE_SEAT_COUNTS;
  return `OP석 ${op}석 / VIP석 ${vip}석 / R석 ${r}석 / S석 ${s}석 / A석 ${a}석`;
}

const SESSION_BY_DOW = {
  0: [{ label: "1회 14:00", time: "14:00" }],
  1: [{ label: "1회 19:30", time: "19:30" }],
  2: [{ label: "1회 19:30", time: "19:30" }],
  3: [{ label: "1회 19:30", time: "19:30" }],
  4: [
    { label: "1회 15:00", time: "15:00" },
    { label: "2회 19:30", time: "19:30" },
  ],
  5: [
    { label: "1회 14:00", time: "14:00" },
    { label: "2회 19:00", time: "19:00" },
  ],
  6: [
    { label: "1회 13:00", time: "13:00" },
    { label: "2회 17:00", time: "17:00" },
  ],
};

function computeSimulation() {
  const hours = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  const h = hours[Math.floor(Math.random() * hours.length)];
  const openTime = new Date();
  openTime.setHours(h, 0, 0, 0);
  const fakeNow = new Date(openTime.getTime() - 30 * 1000);
  const offset = fakeNow.getTime() - Date.now();
  return { openTime, offset };
}

function getFakeNow(offset) {
  return new Date(Date.now() + offset);
}

function buildInitialSeatMap() {
  const map = {};
  SECTIONS.forEach(({ key, rows, cols }) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        map[`${key}-${r}-${c}`] = "available";
      }
    }
  });
  return map;
}

// ─── 경과 시간 기반 사전 판매 좌석맵 ─────────────────────────────────────────
function buildPreSoldSeatMap(elapsedSec) {
  const map = buildInitialSeatMap();
  if (elapsedSec <= 0) return map;

  let simElapsedMs = 0;
  let simSold = 0;
  const targetMs = elapsedSec * 1000;

  for (let tick = 0; simElapsedMs < targetMs; tick++) {
    let interval, batch;
    if (tick < 10)      { interval = 90;   batch = 22; }
    else if (tick < 30) { interval = 185;  batch = 19; }
    else if (tick < 70) { interval = 600;  batch = 7;  }
    else                { interval = 1500; batch = 4;  }

    simElapsedMs += interval;
    simSold += batch;
    if (simSold >= TOTAL_SEATS_ALL) break;
  }

  const toSell = Math.min(simSold, Math.floor(TOTAL_SEATS_ALL * 0.97));

  const allSeats = [];
  SECTIONS.forEach(({ key, rows, cols }) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        allSeats.push({ id: `${key}-${r}-${c}`, weight: getSeatPriorityWeight(key, r, c, cols) });
      }
    }
  });
  const picked = pickSeatsWeighted(allSeats, toSell);
  picked.forEach(id => { map[id] = "sold"; });
  return map;
}

function getSeatPriorityWeight(sectionKey, row, col, totalCols) {
  const r = row;
  if (sectionKey === "OP-L" || sectionKey === "OP-C" || sectionKey === "OP-R") {
    return 100000 + Math.random() * 500;
  }
  if (sectionKey === "1F-B" && r <= 9) {
    return 90000 - r * 200 + Math.random() * 300;
  }
  if (sectionKey === "1F-A" && r <= 9 && col >= totalCols - 2) {
    return 7000 - r * 150 + Math.random() * 300;
  }
  if (sectionKey === "1F-C" && r <= 9 && col <= 1) {
    return 7000 - r * 150 + Math.random() * 300;
  }
  if (sectionKey === "2F-B" && r >= 2 && r <= 4) {
    return 6500 - r * 100 + Math.random() * 300;
  }
  if (sectionKey === "1F-B" && r >= 10 && r <= 14) {
    return 5500 - r * 100 + Math.random() * 200;
  }
  if ((sectionKey === "1F-A" || sectionKey === "1F-C") && r <= 9) {
    return 5000 - r * 120 + Math.random() * 200;
  }
  if ((sectionKey === "2F-A" || sectionKey === "2F-C") && r >= 2 && r <= 6) {
    return 4500 - r * 100 + Math.random() * 200;
  }
  if (sectionKey === "2F-B" && r <= 1) {
    return 4000 + Math.random() * 200;
  }
  if (sectionKey === "2F-B" && r >= 5 && r <= 7) {
    return 4200 - r * 80 + Math.random() * 200;
  }
  if (sectionKey === "1F-A" || sectionKey === "1F-B" || sectionKey === "1F-C") {
    const penalty = r >= 10 ? (r - 10) * 80 : 0;
    return Math.max(500, 3500 - r * 100 - penalty + Math.random() * 200);
  }
  return Math.max(200, 2000 - r * 120 + Math.random() * 200);
}

function buildPriorityWeightedSeatList(seatMap, excludeIds = []) {
  const list = [];
  SECTIONS.forEach(({ key, rows, cols }) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = `${key}-${r}-${c}`;
        if (seatMap[id] !== "available") continue;
        if (excludeIds.includes(id)) continue;
        const weight = getSeatPriorityWeight(key, r, c, cols);
        list.push({ id, weight });
      }
    }
  });
  return list;
}

function pickSeatsWeighted(weightedList, count) {
  const picked = [];
  const pool = [...weightedList];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const totalWeight = pool.reduce((s, x) => s + x.weight, 0);
    let rand = Math.random() * totalWeight;
    let idx = 0;
    for (let j = 0; j < pool.length; j++) {
      rand -= pool[j].weight;
      if (rand <= 0) { idx = j; break; }
    }
    picked.push(pool[idx].id);
    pool.splice(idx, 1);
  }
  return picked;
}

// ══════════════════════════════════════════════════
// 대기열 인원 계산
// ══════════════════════════════════════════════════
function calcWaitingCount(clickedAtOffset) {
  if (clickedAtOffset < 0) return 0;
  if (clickedAtOffset <= 3)  return Math.floor(3000 + Math.random() * 2000);
  if (clickedAtOffset <= 10) return Math.floor(2000 + Math.random() * 1000);
  if (clickedAtOffset <= 30) return Math.floor(800  + Math.random() * 700);
  return Math.floor(200 + Math.random() * 300);
}

function calcTotalAccessors(myQueue, waitingCount) {
  return Math.floor(waitingCount * 1.3 + Math.random() * 20000);
}

function gradeClass(grade) {
  if (grade === "OP석") return "op";
  if (grade === "VIP석") return "vip";
  if (grade === "R석") return "r";
  if (grade === "S석") return "s";
  return "a";
}

function Seat({ id, status, gradeKey, isShaking, isJustSold, onClick }) {
  let cls;
  if (isJustSold) cls = "seat just-sold";
  else if (status === "available") cls = `seat available-${gradeKey}`;
  else cls = `seat ${status}`;
  return (
    <div
      className={`${cls}${isShaking ? " shake" : ""}`}
      onClick={() => onClick(id)}
      title={id}
    />
  );
}

function SeatMap({ seatMap, selectedIds, shakingIds, justSoldIds, onSeatClick }) {
  function renderCol(sectionKey, rows, cols) {
    return (
      <div className="seat-col">
        {Array.from({ length: rows }, (_, r) => (
          <div className="seat-row-wrap" key={r}>
            <div className="seat-row-num">{r + 1}</div>
            {Array.from({ length: cols }, (_, c) => {
              const id = `${sectionKey}-${r}-${c}`;
              const raw = seatMap[id] || "available";
              const isMine = selectedIds.includes(id);
              const { grade } = getSeatGrade(sectionKey, r, c);
              const gk = gradeClass(grade);
              const status = isMine ? "mine" : raw;
              return (
                <Seat
                  key={id} id={id} status={status} gradeKey={gk}
                  isShaking={shakingIds.includes(id)}
                  isJustSold={justSoldIds.includes(id)}
                  onClick={onSeatClick}
                />
              );
            })}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div>
      <div className="seat-section-wrap">
        <div className="seat-section-lbl">OP (오케스트라피트)</div>
        <div className="seat-block">
          {renderCol("OP-L", 2, 7)}
          {renderCol("OP-C", 2, 6)}
          {renderCol("OP-R", 2, 7)}
        </div>
      </div>
      <div className="floor-lbl">1F</div>
      <div className="floor-block">
        <div><div className="seat-section-lbl">A</div>{renderCol("1F-A", 20, 8)}</div>
        <div><div className="seat-section-lbl">B</div>{renderCol("1F-B", 20, 12)}</div>
        <div><div className="seat-section-lbl">C</div>{renderCol("1F-C", 20, 8)}</div>
      </div>
      <div className="floor-lbl">2F</div>
      <div className="floor-block">
        <div><div className="seat-section-lbl">A</div>{renderCol("2F-A", 12, 6)}</div>
        <div><div className="seat-section-lbl">B</div>{renderCol("2F-B", 12, 8)}</div>
        <div><div className="seat-section-lbl">C</div>{renderCol("2F-C", 12, 6)}</div>
      </div>
    </div>
  );
}

function Calendar({ selectedDate, onSelectDate }) {
  const [year, setYear] = useState(TODAY.getFullYear());
  const [month, setMonth] = useState(TODAY.getMonth() + 1);
  function changeMonth(dir) {
    let m = month + dir, y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(m); setYear(y);
  }
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= lastDate; d++) days.push(d);
  return (
    <div>
      <div className="cal-header">
        <button className="cal-nav" onClick={() => changeMonth(-1)}>‹</button>
        <span className="cal-month-lbl">{year}. {String(month).padStart(2, "0")}</span>
        <button className="cal-nav" onClick={() => changeMonth(1)}>›</button>
      </div>
      <div className="cal-grid">
        {["일","월","화","수","목","금","토"].map((d, i) => (
          <div key={d} className={`day-hdr ${i===0?"sun":i===6?"sat":""}`}>{d}</div>
        ))}
        {days.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          const dateObj = new Date(year, month-1, d);
          dateObj.setHours(0,0,0,0);
          const dow = dateObj.getDay();
          const isPast = dateObj < TODAY;
          const isAfterEnd = dateObj > showEnd;
          const sessions = SESSION_BY_DOW[dow] || [];
          const noShow = sessions.length === 0;
          const isDisabled = isPast || isAfterEnd || noShow;
          const isToday = dateObj.getTime() === TODAY.getTime();
          const isSelected = selectedDate === dateStr;
          let cls = "cal-day";
          if (dow === 0) cls += " sun";
          if (dow === 6) cls += " sat";
          if (isSelected) cls += " selected";
          else if (isDisabled) cls += noShow ? " no-show disabled" : " disabled";
          else { cls += " selectable"; if (isToday) cls += " today-ring"; }
          return <div key={dateStr} className={cls} onClick={() => !isDisabled && onSelectDate(dateStr)}>{d}</div>;
        })}
      </div>
    </div>
  );
}

// ─── 플레이 데이터 추적 ───────────────────────────────────────────────────────
function usePlayStats() {
  const statsRef = useRef({
    openClickedAt: null,
    bookBtnClickedAt: null,
    seatSelectedAt: null,
    seatFailCount: 0,
    errorCount: 0,
    botPressureCount: 0,
    clickTimes: [],
    captchaTotal: 0,
    captchaSuccess: 0,
    errorLog: [],
  });

  const recordOpenClick = useCallback((openTime, clickedAt) => {
    const clickMs = clickedAt ?? Date.now();
    statsRef.current.bookBtnClickedAt = clickMs;
    statsRef.current.openClickedAt = openTime ? openTime.getTime() : clickMs;
    statsRef.current.clickTimes.push(clickMs);
  }, []);

  const recordSeatClick = useCallback((success) => {
    const now = Date.now();
    statsRef.current.clickTimes.push(now);
    if (success && !statsRef.current.seatSelectedAt) {
      statsRef.current.seatSelectedAt = now;
    }
    if (!success) statsRef.current.seatFailCount++;
  }, []);

  const recordError = useCallback((type = "일반 오류", msg = "") => {
    statsRef.current.errorCount++;
    statsRef.current.errorLog.push({
      type,
      msg,
      time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
    });
  }, []);

  const recordCaptcha = useCallback((success) => {
    statsRef.current.captchaTotal++;
    if (success) statsRef.current.captchaSuccess++;
  }, []);

  const recordBotPressure = useCallback(() => {
    statsRef.current.botPressureCount++;
  }, []);

  const computeResult = useCallback(() => {
    const s = statsRef.current;
    const openClickMs = s.bookBtnClickedAt && s.openClickedAt
      ? Math.max(0, s.bookBtnClickedAt - s.openClickedAt)
      : null;
    const openScore = openClickMs !== null
      ? Math.max(0, Math.min(100, Math.round(100 - (openClickMs / 1000 - 3) * 100 / 27)))
      : 0;
    const clicks = s.clickTimes;
    let avgInterval = null;
    if (clicks.length >= 2) {
      const gaps = [];
      for (let i = 1; i < clicks.length; i++) gaps.push(clicks[i] - clicks[i-1]);
      avgInterval = Math.round(gaps.reduce((a,b)=>a+b,0) / gaps.length);
    }
    const seatSelectSec = s.seatSelectedAt && s.bookBtnClickedAt
      ? Math.round((s.seatSelectedAt - s.bookBtnClickedAt) / 1000)
      : null;
    return {
      openClickMs,
      openScore,
      avgInterval,
      seatSelectSec,
      captchaRate: s.captchaTotal > 0 ? Math.round((s.captchaSuccess / s.captchaTotal) * 100) : 100,
      captchaTotal: s.captchaTotal,
      serverErrorScore: Math.max(0, 100 - s.errorCount * 10),
      seatFailCount: s.seatFailCount,
      errorCount: s.errorCount,
      botPressureCount: s.botPressureCount,
      errorLog: [...s.errorLog],
    };
  }, []);

  return { recordOpenClick, recordSeatClick, recordError, recordBotPressure, recordCaptcha, computeResult };
}

function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const show = useCallback((msg, type = "info") => {
    setToast({ msg, type });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2800);
  }, []);
  return { toast, show };
}

function useTimer(active, initialSec, onExpire) {
  const [sec, setSec] = useState(initialSec);
  const intervalRef = useRef(null);
  useEffect(() => {
    if (!active) { clearInterval(intervalRef.current); return; }
    setSec(initialSec);
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setSec(s => {
        if (s <= 1) { clearInterval(intervalRef.current); onExpire(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [active]);
  const fmt = `${Math.floor(sec/60)}:${String(sec%60).padStart(2,"0")}`;
  return { sec, fmt };
}

function OpenCountdown({ openTime, offset, isOpen, flashKey }) {
  const [fakeNow, setFakeNow] = useState(() => getFakeNow(offset));
  const openHHMM = openTime.toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit", hour12:false });
  const openDate = openTime.toLocaleDateString("ko-KR", { month:"long", day:"numeric", weekday:"short" });
  const nowStr = fakeNow.toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false });
  const remainSec = Math.max(0, Math.ceil((openTime.getTime() - fakeNow.getTime()) / 1000));
  if (isOpen) {
    return (
      <div className="open-banner open-flash" key={flashKey}>
        <span className="open-banner-label">🎫 예매 오픈</span>
        <span className="open-banner-open">지금 바로 예매하세요!</span>
      </div>
    );
  }
  return (
    <div className="open-banner">
      <span className="open-banner-label">예매 오픈</span>
      <span style={{fontSize:13,color:"#92400e"}}>{openDate} {openHHMM}</span>
      <span style={{fontSize:12,color:"#aaa"}}>|</span>
      <span style={{fontSize:13,color:"#92400e"}}>현재 시각</span>
      <span className="open-banner-time">{nowStr}</span>
      <div className="open-banner-countdown">
        <span className="open-banner-countdown-lbl">오픈까지</span>
        <span className="open-banner-countdown-num" style={{color:remainSec<=10?"#dc2626":"#ea580c"}}>{remainSec}초</span>
      </div>
    </div>
  );
}

function DdayPanel({ openTime, offset }) {
  const [fakeNow, setFakeNow] = useState(() => getFakeNow(offset));
  useEffect(() => {
    const iv = setInterval(() => setFakeNow(getFakeNow(offset)), 1000);
    return () => clearInterval(iv);
  }, [offset]);
  const openHHMM = openTime.toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit", hour12:false });
  const openDate = openTime.toLocaleDateString("ko-KR", { month:"long", day:"numeric", weekday:"short" });
  const nowStr = fakeNow.toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false });
  const remainSec = Math.max(0, Math.ceil((openTime.getTime() - fakeNow.getTime()) / 1000));
  const isImminent = remainSec <= 10;
  return (
    <div className="dday-lock">
      <div className="dday-icon">{isImminent ? "⏰" : "🔒"}</div>
      <div className="dday-title">D-DAY</div>
      <div className="dday-open-label">예매 오픈 시각</div>
      <div className="dday-open-time">{openHHMM}</div>
      <div className="dday-open-date">{openDate}</div>
      <div className={`dday-clock-box${isImminent?" imminent":""}`}>
        <div className="dday-clock-label">오픈까지 남은 시간</div>
        <div className="dday-clock-time" style={{color:isImminent?"#ea580c":undefined}}>{remainSec}초</div>
        <div className="dday-clock-label" style={{marginTop:4}}>현재 시각</div>
        <div style={{fontSize:15,fontWeight:700,color:"#555",fontVariantNumeric:"tabular-nums"}}>{nowStr}</div>
        <div className="dday-clock-sub" style={{marginTop:6}}>
          오픈 1분 전({new Date(openTime.getTime()-60000).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false})})부터 대기하세요
        </div>
      </div>
      <div className="dday-notice">
        ※ 오픈 시각 이후 달력과 예매 버튼이 활성화됩니다.<br/>
        ※ 빠른 좌석 선택을 위해 미리 준비해 주세요.<br/>
        ※ 이 화면은 연습용입니다.
      </div>
    </div>
  );
}

function QueueScreen({ myQueueNum: initQueue, totalWaiting: initWaiting, onEnter }) {
  const [myQueue, setMyQueue] = useState(initQueue);
  const [totalWaiting, setTotalWaiting] = useState(initWaiting);
  const [entered, setEntered] = useState(false);

  const QUEUE_DECREASE_INTERVAL_MS = 80;
  const QUEUE_DECREASE_AMOUNT = () => Math.floor(200 + Math.random() * 400);
  const TOTAL_WAITING_DECREASE_RATIO = useRef(1.2 + Math.random() * 0.3).current;

  useEffect(() => {
    if (entered) return;
    const iv = setInterval(() => {
      setMyQueue(prev => {
        const dec = QUEUE_DECREASE_AMOUNT();
        const next = prev - dec;
        if (next <= 0) {
          clearInterval(iv);
          setEntered(true);
          return 0;
        }
        return next;
      });
      setTotalWaiting(prev => {
        const dec = Math.floor(QUEUE_DECREASE_AMOUNT() * TOTAL_WAITING_DECREASE_RATIO);
        return Math.max(0, prev - dec);
      });
    }, QUEUE_DECREASE_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [entered]);

  useEffect(() => {
    if (entered) {
      const t = setTimeout(onEnter, 800);
      return () => clearTimeout(t);
    }
  }, [entered]);

  const progressPct = Math.min(100, Math.max(0, Math.round((1 - myQueue / initQueue) * 100)));
  const isAlmost = myQueue <= 100;
  const isReady = myQueue === 0 || entered;
  const barColor = isReady
    ? "#16a34a"
    : isAlmost
      ? "#e53935"
      : `hsl(${220 - progressPct * 1.4}, 80%, 52%)`;

  let statusLabel = "대기 중";
  let statusClass = "waiting";
  if (isReady) { statusLabel = "입장 준비 완료!"; statusClass = "ready"; }
  else if (isAlmost) { statusLabel = "거의 다 됐어요!"; statusClass = "almost"; }

  return (
    <div className="queue-page">
      <div className="queue-top-bar">
        <div className="dots">
          <div className="dot"/><div className="dot"/><div className="dot"/>
        </div>
        <span>접속 인원이 많아 대기 중입니다. 조금만 기다려주세요.</span>
      </div>

      <div className="queue-card">
        <div className="queue-brand">
          <span>NOLticket</span> | 뮤지컬 데스노트 (The Musical)
        </div>
        <div className="queue-show-name">뮤지컬 데스노트 (The Musical)</div>
        <div className="queue-show-sub">디큐브 링크아트센터</div>

        <div className="queue-person-icon">🧑</div>

        <div className={`queue-status-badge ${statusClass}`}>
          <div className="queue-status-dot"/>
          {statusLabel}
        </div>

        <div className="queue-order-label">나의 대기순서</div>
        <div className="queue-order-num" style={{ color: isAlmost && !isReady ? "#e53935" : isReady ? "#16a34a" : "#111" }}>
          {isReady ? "0" : myQueue.toLocaleString()}
        </div>
        <div className="queue-order-unit">번째</div>

        <div className="queue-progress-wrap">
          <div className="queue-progress-labels">
            <span>대기 시작</span>
            <span>{progressPct}% 진행</span>
            <span>입장</span>
          </div>
          <div className="queue-progress-track">
            <div
              className="queue-progress-fill"
              style={{
                width: `${progressPct}%`,
                backgroundColor: barColor,
              }}
            />
          </div>
        </div>

        <div className="queue-waiting-count">
          <span className="label">현재 대기 인원</span>
          <span className="value">{totalWaiting.toLocaleString()}명</span>
        </div>

        {isReady && (
          <button className="queue-enter-btn" onClick={onEnter}>
            🎫 지금 바로 입장하기
          </button>
        )}

        <div className="queue-notice">
          ※ 대기 순서는 접속 시간 기준으로 자동 배정됩니다.<br/>
          ※ 창을 닫거나 새로고침하면 순서가 초기화될 수 있습니다.<br/>
          ※ 이 화면은 연습용 시뮬레이션입니다.
        </div>
      </div>
    </div>
  );
}

/* ─── 결제 모달들 ─── */
function KbModal({ onClose, onSuccess, grandTotal }) {
  const [step, setStep] = useState("login");
  const [phone, setPhone] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [phoneErr, setPhoneErr] = useState("");
  const [pwErr, setPwErr] = useState("");
  function formatPhone(raw) {
    const d = raw.replace(/\D/g,"").slice(0,11);
    if (d.length <= 3) return d;
    if (d.length <= 7) return d.slice(0,3)+"-"+d.slice(3);
    return d.slice(0,3)+"-"+d.slice(3,7)+"-"+d.slice(7);
  }
  function handleLogin() {
    let ok = true;
    const rawPhone = phone.replace(/\D/g,"");
    if (rawPhone !== "01012345678") { setPhoneErr("등록되지 않은 번호입니다. (힌트: 010-1234-5678)"); ok = false; }
    if (pw !== "kb1234") { setPwErr("비밀번호가 올바르지 않습니다. (힌트: kb1234)"); ok = false; }
    if (ok) setStep("payment");
  }
  function handlePay() { setStep("processing"); setTimeout(()=>{onClose();onSuccess();},1800); }
  return (
    <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="kb-wrap">
        <div className="kb-header">
          <div className="kb-logo-box"><div className="kb-logo-icon">KB<br/>Pay</div><div className="kb-logo-text">KB Pay</div></div>
          <button className="kb-close" onClick={onClose}>×</button>
        </div>
        {step === "login" && (
          <div className="kb-body">
            <div className="kb-title">KB Pay 로그인</div>
            <div className="kb-sub">휴대폰 번호와 비밀번호를 입력해주세요.</div>
            <div className="inp-group">
              <div className="inp-label">휴대폰 번호</div>
              <input className={`inp-field${phoneErr?" err":""}`} placeholder="010-0000-0000" value={phone} onChange={e=>{setPhone(formatPhone(e.target.value));setPhoneErr("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} maxLength={13} inputMode="numeric"/>
              {phoneErr && <div className="inp-error">{phoneErr}</div>}
            </div>
            <div className="inp-group">
              <div className="inp-label">비밀번호</div>
              <div style={{position:"relative"}}>
                <input className={`inp-field${pwErr?" err":""}`} type={showPw?"text":"password"} placeholder="비밀번호 입력" value={pw} onChange={e=>{setPw(e.target.value);setPwErr("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={{paddingRight:44}}/>
                <button onClick={()=>setShowPw(v=>!v)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#aaa",fontSize:16}}>{showPw?"👁":"🙈"}</button>
              </div>
              {pwErr && <div className="inp-error">{pwErr}</div>}
              <div className="inp-hint">※ 연습용: 010-1234-5678 / kb1234</div>
            </div>
            <button className="kb-login-btn" disabled={!phone||!pw} onClick={handleLogin}>로그인</button>
            <div className="kb-divider">간편 로그인</div>
            <div className="kb-social-row">
              {[{bg:"#03C75A",label:"N",color:"#fff"},{bg:"#FAE100",label:"💬",color:"#000"},{bg:"#EA4335",label:"G",color:"#fff"}].map((s,i)=>(
                <div key={i} className="kb-social-btn" style={{background:s.bg,border:"none"}} onClick={()=>{setPhone("010-1234-5678");setPw("kb1234");setPhoneErr("");setPwErr("");setTimeout(()=>setStep("payment"),200)}}>
                  <span style={{color:s.color,fontWeight:700,fontSize:17}}>{s.label}</span>
                </div>
              ))}
            </div>
            <div className="kb-links"><span>아이디 찾기</span><span className="kb-sep">|</span><span>비밀번호 찾기</span><span className="kb-sep">|</span><span>회원가입</span></div>
          </div>
        )}
        {step === "payment" && (
          <div className="kb-body">
            <div className="kb-pay-title">KB Pay 결제</div>
            <div className="kb-pay-amount">{grandTotal.toLocaleString()}원</div>
            <div className="kb-card-box">
              <div className="kb-card-img">KB<br/>국민카드</div>
              <div><div className="kb-card-name">KB국민카드</div><div className="kb-card-num">1234-****-****-5678</div></div>
            </div>
            <select className="kb-install"><option>일시불</option><option>2개월</option><option>3개월</option><option>6개월</option><option>12개월</option></select>
            <button className="kb-pay-final-btn" onClick={handlePay}>{grandTotal.toLocaleString()}원 결제하기</button>
            <button className="kb-cancel-btn" onClick={onClose}>취소</button>
          </div>
        )}
        {step === "processing" && <div className="kb-processing"><div className="kb-spin"/>결제 처리 중입니다...</div>}
      </div>
    </div>
  );
}

function PaycoModal({ onClose, onSuccess, grandTotal }) {
  const [step, setStep] = useState("login");
  const [id, setId] = useState(""); const [pw, setPw] = useState("");
  const [idErr, setIdErr] = useState(""); const [pwErr, setPwErr] = useState("");
  const [showPw, setShowPw] = useState(false);
  const paycoCouponDiscount = Math.floor(grandTotal * 0.01);
  const paycoFinal = grandTotal - paycoCouponDiscount;
  function handleLogin() {
    let ok = true;
    if (id !== "noticket@payco.com") { setIdErr("등록되지 않은 아이디입니다. (힌트: noticket@payco.com)"); ok = false; }
    if (pw !== "payco1234") { setPwErr("비밀번호가 올바르지 않습니다. (힌트: payco1234)"); ok = false; }
    if (ok) setStep("payment");
  }
  function handlePay() { setStep("processing"); setTimeout(()=>{onClose();onSuccess();},1800); }
  return (
    <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="payco-wrap">
        {step === "login" && (
          <div className="payco-login-body">
            <div className="payco-logo">PAYCO</div>
            <div className="payco-tagline">일상의 빈틈을 채우다</div>
            <div style={{width:"100%",marginBottom:4}}>
              <div style={{fontSize:12,fontWeight:600,color:"#555",marginBottom:4}}>아이디 (이메일)</div>
              <div className="payco-input-wrap"><input className={`payco-input${idErr?" err":""}`} placeholder="이메일" value={id} onChange={e=>{setId(e.target.value);setIdErr("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/></div>
              {idErr && <div className="payco-input-error">{idErr}</div>}
            </div>
            <div className="payco-pw-wrap" style={{marginTop:4}}>
              <div style={{fontSize:12,fontWeight:600,color:"#555",marginBottom:4}}>비밀번호</div>
              <div className="payco-input-wrap">
                <input className={`payco-input pw${pwErr?" err":""}`} type={showPw?"text":"password"} placeholder="비밀번호" value={pw} onChange={e=>{setPw(e.target.value);setPwErr("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
                <button className="payco-pw-toggle" onClick={()=>setShowPw(v=>!v)}>{showPw?"👁":"🙈"}</button>
              </div>
              {pwErr && <div className="payco-input-error">{pwErr}</div>}
              <div style={{fontSize:11,color:"#aaa",marginTop:4,marginLeft:16}}>※ 연습용: noticket@payco.com / payco1234</div>
            </div>
            <div className="payco-options" style={{marginTop:12}}>
              <div className="payco-chk-row"><div className="payco-chk on">✓</div>로그인 상태 유지</div>
              <div className="payco-ip-row">IP 보안<div className="payco-toggle"><div className="payco-toggle-dot"/></div></div>
            </div>
            <button className="payco-login-btn" disabled={!id||!pw} onClick={handleLogin}>로그인</button>
            <button className="payco-app-btn"><strong>PAYCO</strong> 앱으로 로그인</button>
            <div className="payco-links"><span>아이디 찾기</span><span className="payco-link-sep">·</span><span>비밀번호 찾기</span><span className="payco-link-sep">·</span><span>회원 가입</span></div>
          </div>
        )}
        {step === "payment" && (
          <>
            <div className="payco-pay-header">
              <div><div className="payco-pay-logo-text">PAYCO</div><div className="payco-pay-subtitle">페이코 ID로 페이코 라이프 하세요!</div></div>
              <div className="payco-pay-user">
                <span>{id}</span><span className="payco-pay-point-badge">3,614 P</span>
                <button className="payco-pay-logout" onClick={()=>setStep("login")}>로그아웃</button>
              </div>
            </div>
            <div className="payco-pay-body">
              <div className="payco-pay-left">
                <div className="payco-card-selector">
                  <div className="payco-card-arrow">‹</div>
                  <div className="payco-card-main">
                    <div className="payco-card-img"><div className="payco-card-img-title">PAYCO</div><div className="payco-card-img-sub">Point</div></div>
                    <div className="payco-card-name">PAYCO 포인트</div>
                  </div>
                  <div className="payco-card-arrow">›</div>
                </div>
                <div className="payco-charging-bank"><span>[충전계좌] NOL뱅크 (3847)</span><button className="payco-charge-btn">충전</button></div>
                <div className="payco-point-rows">
                  <div className="payco-point-row"><span>포인트 잔액</span><span>3,614 P</span></div>
                  <div className="payco-point-row red"><span>부족금액 충전</span><span>{(paycoFinal-3614).toLocaleString()} P</span></div>
                </div>
                <hr className="payco-point-divider"/>
                <div className="payco-coupon-section">
                  <div className="payco-coupon-header"><div className="payco-coupon-title">쿠폰</div><button className="payco-coupon-change">변경</button></div>
                  <div className="payco-coupon-item"><span>NOL 1% 할인</span><span className="payco-coupon-discount">{paycoCouponDiscount.toLocaleString()}원 할인</span></div>
                </div>
              </div>
              <div className="payco-pay-right">
                <div className="payco-right-title">최종 결제금액</div>
                <div className="payco-right-amount">{paycoFinal.toLocaleString()}<span>원</span></div>
                <div className="payco-right-rows">
                  <div className="payco-right-row"><span>총 결제 금액</span><span>{grandTotal.toLocaleString()}원</span></div>
                  <div className="payco-right-row discount"><span>할인 쿠폰</span><span>- {paycoCouponDiscount.toLocaleString()}원</span></div>
                </div>
                <div className="payco-right-notice">위 구매조건 확인 후 동의하면 결제해 주세요.</div>
                <div className="payco-security-bar">🔒 PAYCO 안전결제</div>
                <div className="payco-pay-btns">
                  <button className="payco-cancel-btn" onClick={onClose}>취소</button>
                  <button className="payco-confirm-btn" onClick={handlePay}>결제</button>
                </div>
              </div>
            </div>
            <div className="payco-pay-footer">
              <div style={{display:"flex",gap:14}}><span>이용약관</span><span>개인정보처리방침</span><span>고객센터</span></div>
              <span>© NHN PAYCO Corp.</span>
            </div>
          </>
        )}
        {step === "processing" && <div className="payco-processing"><div className="payco-spin"/>결제 처리 중입니다...</div>}
      </div>
    </div>
  );
}

const CARDS = [
  {name:"KB국민",color:"#f5a500"},{name:"신한",color:"#0051a8"},{name:"현대",color:"#333333"},
  {name:"삼성",color:"#1428a0"},{name:"롯데",color:"#ee1122"},{name:"우리",color:"#006db7"},
  {name:"하나",color:"#00a651"},{name:"BC",color:"#d72027"},
];
function KgModal({ onClose, onSuccess, grandTotal, isNpay }) {
  const [step, setStep] = useState("terms");
  const [t1, setT1] = useState(false); const [t2, setT2] = useState(false);
  const [cardType, setCardType] = useState(CARDS[0].name);
  const termsAll = t1 && t2;
  const canProceed = t1 && t2 && cardType !== null;
  function handlePay() { setStep("processing"); setTimeout(()=>{onClose();onSuccess();},1800); }
  return (
    <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="kg-wrap">
        <div className="kg-left">
          <div className="kg-left-item active">신용카드</div>
          <div className="kg-left-item" style={{color:"#aaa",fontSize:12}}>간편결제</div>
          <div className="kg-left-item" style={{color:"#aaa",fontSize:12}}>계좌이체</div>
          <div className="kg-left-item" style={{color:"#aaa",fontSize:12}}>가상계좌</div>
        </div>
        <div className="kg-center">
          <div className="kg-header">
            <div className="kg-logo">{isNpay?"NAVER":"KG"} <span>{isNpay?"Pay":"이니시스"}</span></div>
            <div className="kg-subtitle">안전하고 편리한 결제를 도와드립니다.</div>
          </div>
          {step === "processing" ? (
            <div className="kg-processing"><div className="kg-spin"/>결제 처리 중입니다...</div>
          ) : (
            <div className="kg-body">
              <div className="kg-section-title">이용약관<div className="kg-chk-all" onClick={()=>{const v=!termsAll;setT1(v);setT2(v);}}><div className={`kg-checkbox${termsAll?" on":""}`}>{termsAll?"✓":""}</div>전체동의</div></div>
              <div className="kg-chk-row" onClick={()=>setT1(v=>!v)}><div className={`kg-checkbox${t1?" on":""}`}>{t1?"✓":""}</div>전자금융거래 이용약관 동의</div>
              <div className="kg-chk-row" onClick={()=>setT2(v=>!v)}><div className={`kg-checkbox${t2?" on":""}`}>{t2?"✓":""}</div>개인정보의 수집 및 이용안내 동의</div>
              <button className="kg-terms-btn">약관보기 ▾</button>
              <div className="kg-divider"/>
              <div className="kg-section-title">카드 선택</div>
              {CARDS.map(card=>(
                <button key={card.name} className={`card-select-btn${cardType===card.name?" active":""}`} onClick={()=>setCardType(card.name)}>
                  <div className="card-dot" style={{background:card.color}}/>{card.name}
                  {cardType===card.name&&<span className="card-check">✓</span>}
                </button>
              ))}
              <button className="kg-next-btn" disabled={!canProceed} onClick={handlePay}>{canProceed?`${grandTotal.toLocaleString()}원 결제하기`:`다음${!termsAll?" (약관 동의 필요)":""}`}</button>
            </div>
          )}
        </div>
        <div className="kg-right">
          <div className="kg-right-header">
            <div className="kg-logo" style={{fontSize:13}}>KG <span>이니시스</span></div>
            <button className="kg-close" onClick={onClose}>×</button>
          </div>
          <div className="kg-right-body">
            <div className="kg-info-row"><div className="kg-info-lbl">상품명</div><div className="kg-info-val">뮤지컬 데스노트</div></div>
            <div className="kg-info-row"><div className="kg-info-lbl">결제금액</div><div className="kg-info-val price" style={{fontWeight:800}}>{grandTotal.toLocaleString()} 원</div></div>
            {cardType&&<div className="kg-info-row"><div className="kg-info-lbl">선택 카드</div><div className="kg-info-val" style={{color:"#4b2db5"}}>{cardType}</div></div>}
          </div>
          <div className="kg-ads">
            <div className="kg-ad-box">📢 단속내역 '교통민원24' 수시 조회!</div>
            <div className="kg-ad-box2">언제, 어디서나 <strong>이니톡결제</strong> ▶</div>
          </div>
          <div className="kg-right-bottom"><button className="kg-next-btn" style={{margin:0}} disabled={!canProceed} onClick={handlePay}>{canProceed?"결제하기":"약관 동의 필요"}</button></div>
        </div>
      </div>
    </div>
  );
}

function TossModal({ onClose, onSuccess, grandTotal, bookerEmail, bookerName }) {
  const [step, setStep] = useState("bank");
  const [selectedBank, setSelectedBank] = useState(null);
  const [depositor, setDepositor] = useState(bookerName || "");
  const [receiptType, setReceiptType] = useState("소득공제용(휴대폰)");
  const [receiptNum, setReceiptNum] = useState("");
  const [agree, setAgree] = useState(true);
  const BANKS = [
    {name:"농협",color:"#00a050",emoji:"🌾"},{name:"국민",color:"#f5a500",emoji:"⭐"},
    {name:"우리",color:"#006db7",emoji:"🔵"},{name:"신한",color:"#0051a8",emoji:"🐍"},
    {name:"기업",color:"#004a9f",emoji:"🔷"},{name:"우체국",color:"#e11",emoji:"📮"},
    {name:"KEB하나",color:"#00a651",emoji:"🍀"},
  ];
  return (
    <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="toss-wrap">
        <div className="toss-header">
          <div className="toss-logo"><div className="toss-logo-dot"><div className="toss-logo-inner"/></div>toss payments</div>
          <button className="toss-close" onClick={onClose}>×</button>
        </div>
        {step === "bank" ? (
          <div className="toss-body">
            <div className="toss-title">입금할 은행을 선택해주세요</div>
            <div className="toss-subtitle">뮤지컬 〈데스노트 The Musical〉</div>
            <div className="bank-grid">
              {BANKS.map(b=>(
                <div key={b.name} className={`bank-btn${selectedBank===b.name?" sel":""}`} onClick={()=>setSelectedBank(b.name)}>
                  <div className="bank-icon" style={{background:b.color+"18"}}><span style={{fontSize:20}}>{b.emoji}</span></div>
                  <div className="bank-name">{b.name}</div>
                </div>
              ))}
            </div>
            <button className="toss-confirm-btn" disabled={!selectedBank} onClick={()=>setStep("form")}>다음</button>
          </div>
        ) : (
          <div className="toss-body">
            <div className="toss-info-main">{selectedBank}은행으로<br/>{grandTotal.toLocaleString()}원<br/>무통장입금</div>
            <div className="toss-info-sub">뮤지컬 〈데스노트 The Musical〉</div>
            <button className="toss-change-bank" onClick={()=>setStep("bank")}>입금 은행 변경</button>
            <hr className="toss-section-divider"/>
            <div className="toss-field-lbl">입금자명</div>
            <input className="toss-input" value={depositor} onChange={e=>setDepositor(e.target.value)} placeholder="입금자명"/>
            <div className="toss-field-lbl">이메일 (선택)</div>
            <input className="toss-input" placeholder="" value={bookerEmail} readOnly/>
            <div className="toss-field-lbl">현금영수증</div>
            <select className="toss-select" value={receiptType} onChange={e=>setReceiptType(e.target.value)}>
              <option>소득공제용(휴대폰)</option><option>지출증빙용(사업자번호)</option><option>미발급</option>
            </select>
            {receiptType!=="미발급"&&<input className="toss-input" value={receiptNum} onChange={e=>setReceiptNum(e.target.value)} placeholder="번호 입력"/>}
            <div className="toss-agree-row" onClick={()=>setAgree(v=>!v)}>
              <div className={`toss-agree-chk${agree?"":" off"}`}>✓</div>
              [필수] 서비스 이용 약관, 개인정보 처리 동의
            </div>
            <button className="toss-confirm-btn" disabled={!agree||!depositor.trim()} onClick={()=>{onClose();onSuccess();}}>확인</button>
          </div>
        )}
      </div>
    </div>
  );
}

function useSeatAutoSell(isActive, seatMapRef, selectedSeatIds, onSell) {
  const timerRef = useRef(null);
  const tickCountRef = useRef(0);

  useEffect(() => {
    if (!isActive) {
      clearTimeout(timerRef.current);
      return;
    }
    tickCountRef.current = 0;

    function getIntervalAndBatch() {
      const t = tickCountRef.current;
      if (t < 10) {
        return { interval: 60 + Math.random() * 60, batch: Math.floor(Math.random() * 5) + 20 };
      }
      if (t < 30) {
        return { interval: 120 + Math.random() * 130, batch: Math.floor(Math.random() * 3) + 18 };
      }
      if (t < 70) {
        return { interval: 400 + Math.random() * 400, batch: Math.random() < 0.4 ? 8 : 6};
      }
      return { interval: 1000 + Math.random() * 2000, batch: 4 };
    }

    function tick() {
      tickCountRef.current++;
      const currentMap = seatMapRef.current;
      const excluded = selectedSeatIds.current || [];
      const { interval, batch } = getIntervalAndBatch();
      const weighted = buildPriorityWeightedSeatList(currentMap, excluded);
      if (weighted.length === 0) return;
      const toSell = pickSeatsWeighted(weighted, batch);
      onSell(toSell);
      timerRef.current = setTimeout(tick, interval);
    }

    timerRef.current = setTimeout(tick, 30);
    return () => clearTimeout(timerRef.current);
  }, [isActive]);
}

function MultiRoomTimer({ timerEndsAt }) {
  const [remainSec, setRemainSec] = useState(() => Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000)));
  useEffect(() => {
    const iv = setInterval(() => {
      setRemainSec(Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(iv);
  }, [timerEndsAt]);
  const fmt = `${Math.floor(remainSec / 60)}:${String(remainSec % 60).padStart(2, "0")}`;
  return (
    <span className="timer-time" style={{color: remainSec <= 30 ? "var(--red)" : "var(--blue)"}}>
      {fmt}
    </span>
  );
}

/* ══════════════════════════════════════════════════
   메인 앱
══════════════════════════════════════════════════ */
export default function TicketingApp() {
  const { recordOpenClick, recordSeatClick, recordError, recordBotPressure, recordCaptcha, computeResult } = usePlayStats();
  const [playResult, setPlayResult] = useState(null);

  // 튕김 팝업 상태
  const [showKickPopup, setShowKickPopup] = useState(false);
  const [kickReason, setKickReason] = useState("");

  // CAPTCHA 상태
  const [showCaptchaPopup, setShowCaptchaPopup] = useState(false);
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaErr, setCaptchaErr] = useState(false);
  const captchaPendingRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const clickedAtOffsetRef = useRef(null);

  const [page, setPage] = useState("info");
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSessionIdx, setSelectedSessionIdx] = useState(null);
  const [showDateModal, setShowDateModal] = useState(false);

  const [queueMyNum, setQueueMyNum] = useState(0);
  const [queueTotal, setQueueTotal] = useState(0);

  const [seatMap, setSeatMap] = useState(() => buildInitialSeatMap());

  const [socketConnected, setSocketConnected] = useState(false);
  const [serverQueueTotal, setServerQueueTotal] = useState(0);
  const [serverAdmitted, setServerAdmitted] = useState(false);

  const [appMode, setAppMode] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [myNickname, setMyNickname] = useState('');
  const [roomPhase, setRoomPhase] = useState('lobby');
  const [roomPlayers, setRoomPlayers] = useState([]);
  const [roomTimerEndsAt, setRoomTimerEndsAt] = useState(null);
  const [roomOpenTime, setRoomOpenTime] = useState(null);
  const [roomLeaderboard, setRoomLeaderboard] = useState([]);

  // 미션 모드 상태
  const [currentMission, setCurrentMission] = useState(null);
  const [missionResult, setMissionResult] = useState(null);

  const [{ openTime: localOpenTime, offset: localOffset }] = useState(() => computeSimulation());
  const openTime = ((appMode === 'multi' || appMode === 'mission-multi') && roomOpenTime) ? new Date(roomOpenTime) : localOpenTime;
  const offset = ((appMode === 'multi' || appMode === 'mission-multi') && roomOpenTime) ? 0 : localOffset;

  // isMultiMode를 소켓 이벤트 등록 이전에 선언 (아래에서 참조)
  const isMultiMode = appMode === 'multi' || appMode === 'mission-multi';
  const isMissionMode = appMode === 'mission-solo' || appMode === 'mission-multi';

  useEffect(() => {
    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('init', ({ seatMap: serverSeatMap }) => {
      setSeatMap(serverSeatMap);
      setSoldCount(Object.values(serverSeatMap).filter(v => v === 'sold').length);
    });

    socket.on('seat_update', ({ seatId, status }) => {
      setSeatMap(prev => ({ ...prev, [seatId]: status }));
    });

    socket.on('queue_update', ({ total }) => {
      setServerQueueTotal(total);
    });

    socket.on('queue_admitted', ({ queueNum, restored }) => {
      setServerAdmitted(true);
      if (restored) setPage('seat');
    });

    socket.on('session_expired', () => {
      localStorage.removeItem('ticketing_userId');
      localStorage.removeItem('ticketing_queueNum');
      showToast('세션이 만료되었습니다. 다시 대기해주세요.', 'error');
      setPage('info');
    });

    socket.on('lock_failed', ({ seatId, reason }) => {
      shakeSeat(seatId);
      showToast(`👻 유령 좌석: ${reason}`, 'warn');
      setSeatMap(prev => ({ ...prev, [seatId]: 'reserved' }));
      setSelectedSeats(prev => prev.filter(s => s.id !== seatId));
    });

    socket.on('congestion_kick', ({ reason }) => {
      showToast(`⚠️ ${reason || '서버 혼잡으로 대기열에서 이탈되었습니다. 다시 시도해주세요.'}`, 'error');
      setPage('info');
    });

    socket.on('room_state', ({ players, timerEndsAt, openTime }) => {
      setRoomPlayers(players);
      if (timerEndsAt) setRoomTimerEndsAt(timerEndsAt);
      if (openTime) setRoomOpenTime(openTime);
    });

    socket.on('room_started', ({ timerEndsAt, missionId }) => {
      setRoomPhase('playing');
      setRoomTimerEndsAt(timerEndsAt);
      if (appMode === 'mission-multi' || appMode === 'mission-solo') {
        const mission = missionId
          ? MISSIONS.find(m => m.id === missionId) || pickRandomMission()
          : pickRandomMission();
        setCurrentMission(mission);
      }
      setPage('info');
    });

    socket.on('room_ended', ({ leaderboard }) => {
      setRoomLeaderboard(leaderboard);
      setRoomPhase('ended');
      setPage('room_end');
    });

    socket.on('score_update', ({ nickname, score, delta }) => {
      showToast(`🏆 ${nickname} +${delta}석 (총 ${score}석)`, 'info');
    });

    const savedUserId = localStorage.getItem('ticketing_userId');
    const savedQueueNum = localStorage.getItem('ticketing_queueNum');
    if (savedUserId && savedQueueNum) {
      socket.emit('restore_session', {
        userId: savedUserId,
        queueNum: parseInt(savedQueueNum),
      });
    }

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('init');
      socket.off('seat_update');
      socket.off('queue_update');
      socket.off('queue_admitted');
      socket.off('session_expired');
      socket.off('lock_failed');
      socket.off('congestion_kick');
      socket.off('room_state');
      socket.off('room_started');
      socket.off('room_ended');
      socket.off('score_update');
    };
  }, []); // eslint-disable-line

  const seatMapRef = useRef(seatMap);
  useEffect(() => { seatMapRef.current = seatMap; }, [seatMap]);

  const seatSellStartedRef = useRef(false);

  const [selectedSeats, setSelectedSeats] = useState([]);
  const selectedSeatIdsRef = useRef([]);
  useEffect(() => { selectedSeatIdsRef.current = selectedSeats.map(s => s.id); }, [selectedSeats]);

  const [shakingIds, setShakingIds] = useState([]);
  const [justSoldIds, setJustSoldIds] = useState([]);
  const [soldCount, setSoldCount] = useState(0);
  const [sessionSoldCounts, setSessionSoldCounts] = useState({});

  const REALTIME_MSGS = useMemo(() => [
    "OP석 1열 2번 예매됨", "1F-B VIP석 1열 6번 예매됨", "OP석 1열 5번 예매됨",
    "1F-B VIP석 2열 8번 예매됨", "1F-A R석 3열 통로 예매됨", "2F-B S석 3열 4번 예매됨",
    "OP석 2열 1번 예매됨", "1F-B VIP석 1열 11번 예매됨", "1F-C VIP석 2열 1번 예매됨",
    "2F-B S석 4열 6번 예매됨", "1F-B VIP석 5열 7번 예매됨", "1F-A R석 1열 8번 예매됨",
  ], []);

  const [bookerName, setBookerName] = useState("");
  const [bookerBirth, setBookerBirth] = useState("");
  const [bookerEmail, setBookerEmail] = useState("");
  const [bookerPhone, setBookerPhone] = useState("");
  const [ticketMethod, setTicketMethod] = useState("현장수령");
  const [chk1, setChk1] = useState(false);
  const [chk2, setChk2] = useState(false);

  const [payMethod, setPayMethod] = useState("npay");
  const [payOption, setPayOption] = useState("card");
  const [orderNum, setOrderNum] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [showKgModal, setShowKgModal] = useState(false);
  const [showKbModal, setShowKbModal] = useState(false);
  const [showPaycoModal, setShowPaycoModal] = useState(false);
  const [showTossModal, setShowTossModal] = useState(false);
  const [isNpay, setIsNpay] = useState(false);

  const { toast, show: showToast } = useToast();

  async function handleBotStart() {
    try {
    // 오픈 시각 기준 앞으로 14일치 모든 날짜×회차 조합 생성
      const allSessions = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(TODAY);
        d.setDate(TODAY.getDate() + i);
        const dow = d.getDay();
        const sessions = SESSION_BY_DOW[dow] || [];
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        sessions.forEach(({ time }) => {
          // 서버에 세션맵 생성 요청 (select_session emit)
          socket.emit('select_session', { dateStr, time });
          allSessions.push({ dateStr, time, dow });
        });
      }

      // 소켓 emit이 서버에서 처리될 시간을 잠깐 기다린 후 봇 시작
      await new Promise(r => setTimeout(r, 800));

      await fetch('http://localhost:3001/bots/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: allSessions }),
      });
    } catch {}
  }

  const timerActive = page === "seat" || page === "form" || page === "payment";
  const { sec: timerSec, fmt: timerFmt } = useTimer(timerActive, 420, () => {
    showToast("예매 가능 시간이 초과되었습니다.", "error");
    setTimeout(() => restart(), 2000);
  });

  useEffect(() => {
    if (isOpen) return;
    const iv = setInterval(() => {
      if (getFakeNow(offset).getTime() >= openTime.getTime()) {
        setIsOpen(true); 
        setFlashKey(k=>k+1); 
        clearInterval(iv);
        handleBotStart();
      }
    }, 300);
    return () => clearInterval(iv);
  }, [openTime, offset, isOpen]);

  const [seatSellActive, setSeatSellActive] = useState(false);
  useEffect(() => {
    if (seatSellActive) return;
    const iv = setInterval(() => {
      if (getFakeNow(offset).getTime() >= openTime.getTime() && !seatSellStartedRef.current) {
        seatSellStartedRef.current = true;
        setSeatSellActive(true);
        clearInterval(iv);
      }
    }, 200);
    return () => clearInterval(iv);
  }, [openTime, offset, seatSellActive]);

  const handleAutoSell = useCallback((ids) => {
    const key = selectedDate && selectedSessionIdx !== null
      ? `${selectedDate}_${(SESSION_BY_DOW[new Date(selectedDate).getDay()] || [])[selectedSessionIdx]?.time}`
      : null;
    setSeatMap(prev => {
      const next = { ...prev };
      ids.forEach(id => { next[id] = "sold"; });
      return next;
    });
    setJustSoldIds(prev => [...prev, ...ids]);
    setSoldCount(c => c + ids.length);
    if (key) setSessionSoldCounts(prev => ({ ...prev, [key]: (prev[key] || 0) + ids.length }));
    recordBotPressure();
    setTimeout(() => {
      setJustSoldIds(prev => prev.filter(x => !ids.includes(x)));
    }, 600);
  }, [selectedDate, selectedSessionIdx, recordBotPressure]);

  useSeatAutoSell(seatSellActive, seatMapRef, selectedSeatIdsRef, handleAutoSell);

  const formRef = useRef(null);
  useEffect(() => {
    if (page === "form") window.scrollTo({ top: 0, behavior: "instant" });
  }, [page]);

  // ── elapsed 계산 헬퍼: 솔로/멀티 공통 ──
  // 솔로: getFakeNow(offset) 기준, 멀티: Date.now() 기준(offset=0이므로 동일하지만 roomOpenTime 활용)
  function calcElapsedSec() {
    if (isMultiMode && roomOpenTime) {
      return Math.max(0, (Date.now() - roomOpenTime) / 1000);
    }
    if (seatSellActive) {
      return Math.max(0, (getFakeNow(offset).getTime() - openTime.getTime()) / 1000);
    }
    return 0;
  }

  function handleSelectDate(dateStr) {
    setSelectedDate(dateStr);
    setSelectedSessionIdx(null);
    setSelectedSeats([]);
    setJustSoldIds([]);
    // 프론트에서 맵을 재생성하지 않고,
    // 서버에 해당 세션 맵 요청 → 서버가 init 이벤트로 응답
    // (select_session emit은 회차 선택 시점에 함)
  }

  const sessions = selectedDate ? SESSION_BY_DOW[new Date(selectedDate).getDay()] || [] : [];
  const sessionSeats = getSessionSeats();

  function handleSeatClick(id) {
    const raw = seatMap[id];
    const alreadyMine = selectedSeats.find(s => s.id === id);
    if (alreadyMine) {
      setSelectedSeats(prev => prev.filter(s => s.id !== id));
      setSeatMap(prev => ({ ...prev, [id]: "available" }));
      const currentSession = selectedDate && selectedSessionIdx !== null
        ? (SESSION_BY_DOW[new Date(selectedDate).getDay()] || [])[selectedSessionIdx]
        : null;
      socket.emit('unlock_seat', { 
        seatId: id, 
        userId: localStorage.getItem('ticketing_userId') || `user-${Date.now()}` , 
        dateStr: selectedDate, 
        time:currentSession?.time });
      return;
    }

    if (raw === "sold") {
      shakeSeat(id);
      showToast("이미 선택된 좌석입니다.", "error");
      recordSeatClick(false);
      recordError();
      return;
    }
    if (raw === "reserved") {
      shakeSeat(id);
      showToast("다른 사용자가 선택 중인 좌석입니다.", "warn");
      recordSeatClick(false);
      recordError();
      return;
    }

    if (selectedSeats.length >= 4) { showToast("최대 4매까지 선택 가능합니다.", "warn"); return; }
    const parts = id.split("-");
    const col = parseInt(parts[parts.length-1]);
    const row = parseInt(parts[parts.length-2]);
    const sectionKey = parts.slice(0, parts.length-2).join("-");
    const gradeInfo = getSeatGrade(sectionKey, row, col);
    setSelectedSeats(prev => [...prev, { id, section:sectionKey, row:row+1, col:col+1, grade:gradeInfo.grade, price:gradeInfo.price }]);
    recordSeatClick(true);
    showToast(`${gradeInfo.grade} ${row+1}열 ${col+1}번 선택됨`, "success");
    socket.emit('lock_seat', { 
      seatId: id, 
      userId: localStorage.getItem('ticketing_userId') || `user-${Date.now()}`,
      dateStr: selectedDate,
      time: currentSession?.time,
    });
  }

  function shakeSeat(id) {
    setShakingIds(prev => [...prev, id]);
    setTimeout(() => setShakingIds(prev => prev.filter(x => x !== id)), 450);
  }
  function removeSeat(id) {
    setSelectedSeats(prev => prev.filter(s => s.id !== id));
    setSeatMap(prev => ({ ...prev, [id]: "available" }));
    const currentSession = selectedDate && selectedSessionIdx !== null 
      ? (SESSION_BY_DOW[new Date(selectedDate).getDay()] || [])[selectedSessionIdx] 
      : null;
    socket.emit('unlock_seat', { 
      seatId: id, 
      userId: localStorage.getItem('ticketing_userId') || `user-${Date.now()}`,
      dateStr: selectedDate,
      time:currentSession?.time,
    });
  }

  function goToSeat() {
    if (Math.random() < 0.15) {
      const reasons = [
        "서버 혼잡으로 연결이 끊어졌습니다.",
        "세션이 만료되어 처음으로 돌아갑니다.",
        "일시적인 오류가 발생했습니다. 다시 시도해주세요.",
        "접속 인원이 너무 많아 연결이 실패했습니다.",
      ];
      setKickReason(reasons[Math.floor(Math.random() * reasons.length)]);
      setShowKickPopup(true);
      return;
    }
    if (!selectedDate) { showToast("관람일을 선택해주세요.", "warn"); return; }
    if (selectedSessionIdx === null) { showToast("회차를 선택해주세요.", "warn"); return; }

    const nowMs = getFakeNow(offset).getTime();
    const clickedOffsetSec = (nowMs - openTime.getTime()) / 1000;
    clickedAtOffsetRef.current = clickedOffsetSec;

    const myQueue = calcWaitingCount(clickedOffsetSec);
    const totalW = calcTotalAccessors(myQueue, myQueue);
    setQueueMyNum(myQueue);
    setQueueTotal(totalW);

    const userId = `user-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    localStorage.setItem('ticketing_userId', userId);
    socket.emit('join_queue', { userId });

    recordOpenClick(openTime, getFakeNow(offset).getTime());

    setPage("queue");
  }

  function handleQueueEnter() {
    setIsLoading(true);
    setTimeout(() => { setIsLoading(false); setPage("seat"); }, 1200);
  }

  function goToPayment() {
    if (!bookerName.trim()) { showToast("예매자 이름을 입력해주세요.", "warn"); return; }
    if (!chk1 || !chk2) { showToast("필수 약관에 동의해주세요.", "warn"); return; }
    const num = "2026" + String(Math.floor(Math.random() * 100000000)).padStart(8,"0") + "QU8K";
    setOrderNum(num);
    setPage("payment");
  }

  function openPayModal() {
    if (payMethod === "npay") { setIsNpay(true); setShowKgModal(true); return; }
    if (payOption === "payco") { setShowPaycoModal(true); return; }
    if (payOption === "kb") { setShowKbModal(true); return; }
    if (payOption === "card") { setIsNpay(false); setShowKgModal(true); return; }
    if (payOption === "virtual") { setShowTossModal(true); return; }
    setIsNpay(false); setShowKgModal(true);
  }

  function handlePaySuccess() {
    const seatIds = selectedSeats.map(s => s.id);
    const userId = localStorage.getItem('ticketing_userId') || `user-${Date.now()}`;
    if (seatIds.length > 0) socket.emit('confirm_seats', { seatIds, userId });

    const isMulti = appMode === 'multi' || appMode === 'mission-multi';

    if (currentMission) {
      const result = currentMission.check(selectedSeats);
      const bonus = result.done ? currentMission.scoreBonus(selectedSeats) : 0;
      setMissionResult({ done: result.done, title: currentMission.title, bonus });
    }

    if (isMulti) {
      setSelectedSeats([]);
      setBookerName(""); setBookerBirth(""); setBookerEmail(""); setBookerPhone("");
      setChk1(false); setChk2(false);
      setPage("seat");
      showToast("예매 완료! 시간이 남아있으면 추가 예매할 수 있어요.", "success");
    } else {
      localStorage.removeItem('ticketing_userId');
      localStorage.removeItem('ticketing_queueNum');
      setPlayResult(computeResult());
      setPage("done");
    }
  }

  function restart() {
    setIsOpen(false);
    setFlashKey(0);
    setSeatSellActive(false);
    setPage("info"); setSelectedDate(null); setSelectedSessionIdx(null); setSelectedSeats([]);
    setSeatMap(buildInitialSeatMap()); setSoldCount(0); setJustSoldIds([]);
    setBookerName(""); setBookerBirth(""); setBookerEmail(""); setBookerPhone("");
    setChk1(false); setChk2(false);
    setPayMethod("npay"); setPayOption("card"); setOrderNum("");
    setSeatSellActive(false); seatSellStartedRef.current = false;
    clickedAtOffsetRef.current = null;
    setAppMode(null);
    setRoomCode(null);
    setIsHost(false);
    setMyNickname('');
    setRoomPhase('lobby');
    setRoomPlayers([]);
    setRoomTimerEndsAt(null);
    setRoomOpenTime(null);
    setRoomLeaderboard([]);
    setCurrentMission(null);
    setMissionResult(null);
  }

  const ticketTotal = selectedSeats.reduce((s, seat) => s + seat.price, 0);
  const grandTotal = ticketTotal + 2000;
  const totalAvailable = Object.values(seatMap).filter(v => v === "available").length;
  const totalSeats = Object.keys(seatMap).length;
  const soldPercent = Math.min(100, Math.round((soldCount / totalSeats) * 100));

  function fmtDate(dateStr) {
    if (!dateStr) return "";
    const dt = new Date(dateStr);
    return `${dateStr.replace(/-/g,".")}(${DAY_NAMES[dt.getDay()]})`;
  }
  const sessionLabel = selectedSessionIdx !== null && sessions[selectedSessionIdx] ? sessions[selectedSessionIdx].label : "";
  const allChecked = chk1 && chk2;
  const payOptionLabels = { card:"카드", kb:"KB페이", payco:"페이코", phone:"휴대폰", virtual:"가상계좌" };
  const currentPayLabel = payMethod === "npay" ? "Npay" : (payOptionLabels[payOption] || payOption);

  if (!appMode) return (
    <ModeSelect
      onSolo={() => setAppMode('solo')}
      onMulti={() => setAppMode('multi')}
      onMission={() => setAppMode('mission-select')}
    />
  );

  if (appMode === 'mission-select') return (
    <MissionModeSelect
      onBack={() => setAppMode(null)}
      onSolo={() => {
        const mission = pickRandomMission();
        setCurrentMission(mission);
        setAppMode('mission-solo');
      }}
      onMulti={() => setAppMode('mission-multi')}
    />
  );

  if (isMultiMode && !roomCode) return (
    <RoomLobby
      socket={socket}
      isMissionMode={isMissionMode}
      onBack={() => setAppMode(appMode === 'mission-multi' ? 'mission-select' : null)}
      onRoomReady={({ code, isHost: h, nickname, phase, openTime }) => {
        setRoomCode(code);
        setIsHost(h);
        setMyNickname(nickname);
        setRoomPhase(phase || 'lobby');
        if (openTime) setRoomOpenTime(openTime);
        if (phase === 'playing') setPage('info');
      }}
    />
  );

  if (isMultiMode && roomCode && roomPhase === 'lobby') return (
    <WaitingRoom
      socket={socket}
      roomCode={roomCode}
      isHost={isHost}
      nickname={myNickname}
      onGameStart={() => { setRoomPhase('playing'); setPage('info'); }}
    />
  );

  if (page === 'room_end') return (
    <RoomEndScreen
      leaderboard={roomLeaderboard}
      mySocketId={socket.id}
      roomCode={roomCode}
      onRestart={restart}
      missionResult={missionResult}
    />
  );

  return (
    <>
      {showKgModal && <KgModal isNpay={isNpay} grandTotal={grandTotal} onClose={()=>setShowKgModal(false)} onSuccess={handlePaySuccess}/>}
      {showKbModal && <KbModal grandTotal={grandTotal} onClose={()=>setShowKbModal(false)} onSuccess={handlePaySuccess}/>}
      {showPaycoModal && <PaycoModal grandTotal={grandTotal} onClose={()=>setShowPaycoModal(false)} onSuccess={handlePaySuccess}/>}
      {showTossModal && <TossModal grandTotal={grandTotal} bookerEmail={bookerEmail} bookerName={bookerName} onClose={()=>setShowTossModal(false)} onSuccess={handlePaySuccess}/>}

      {/* 튕김 팝업 */}
      {showKickPopup && (
        <div className="modal-backdrop" onClick={() => setShowKickPopup(false)}>
          <div style={{
            background:"#fff", borderRadius:16, padding:32, width:320, maxWidth:"90vw",
            boxShadow:"0 8px 40px rgba(0,0,0,.25)", textAlign:"center"
          }} onClick={e => e.stopPropagation()}>
            <div style={{fontSize:40, marginBottom:12}}>⚠️</div>
            <div style={{fontSize:17, fontWeight:700, color:"#111", marginBottom:10}}>연결 오류</div>
            <div style={{fontSize:14, color:"#555", marginBottom:24, lineHeight:1.6}}>{kickReason}</div>
            <button
              onClick={() => { setShowKickPopup(false); }}
              style={{
                width:"100%", padding:"12px 0", borderRadius:10, border:"none",
                background:"#3b82f6", color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer"
              }}
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* FloatingScorePanel: position:fixed wrapper로 레이아웃 영향 차단 */}
      {isMultiMode && roomTimerEndsAt && (
        <div style={{position:"fixed", top:0, left:0, right:0, zIndex:9999, pointerEvents:"none"}}>
          <div style={{pointerEvents:"auto"}}>
            <FloatingScorePanel
              players={roomPlayers}
              mySocketId={socket.id}
              timerEndsAt={roomTimerEndsAt}
            />
          </div>
        </div>
      )}

      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"/>
          <p>예매 화면을 불러오는 중입니다.</p>
          <span>조금만 기다려주세요.</span>
        </div>
      )}

      <div className="ws-badge">
        🟡 연습 모드
        {isOpen && (
          <button
            onClick={async () => {
              try {
                await fetch('http://localhost:3001/bots/stop', { method: 'POST' });
                showToast('봇이 중지되었습니다.', 'info');
              } catch {
                showToast('봇 중지 실패', 'error');
              }
            }}
            style={{
              marginLeft: 10, padding: '2px 10px', fontSize: 11, fontWeight: 600,
              background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6,
              cursor: 'pointer', lineHeight: 1.6,
            }}
          >
            봇 중지
          </button>
        )}
      </div>

      <header className="hdr">
        <div className="logo">NOL<span>ticket</span></div>
        <nav style={{display:"flex",gap:24}}>
          <button className="nav-link">홈</button>
          <button className="nav-link">투어</button>
          <button className="nav-link active">티켓</button>
        </nav>
        <div className="hdr-right">
          <span>👤 로그인</span>
          <span>📋 내 예약</span>
        </div>
      </header>

      {(page === "info" || page === "queue") && (
        <OpenCountdown openTime={openTime} offset={offset} isOpen={isOpen} flashKey={flashKey}/>
      )}

      {isOpen && page === "info" && (
        <div className="realtime-bar">
          <div className="realtime-dot"/>
          <span className="realtime-text">실시간</span>
          <div style={{overflow:"hidden",flex:1}}>
            <div className="realtime-scroll">
              {[...REALTIME_MSGS, ...REALTIME_MSGS].map((m,i)=>(
                <span key={i} className="realtime-item">🎫 {m}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 타이머 바: 솔로/멀티 분리 렌더링 ── */}
      {timerActive && !isMultiMode && (
        <div className="timer-bar">
          <span>예매 가능 시간</span>
          <span className="timer-time" style={{color:timerSec<60?"var(--red)":"var(--blue)"}}>{timerFmt}</span>
          {page === "seat" && (
            <div className="speed-gauge" style={{flex:1,marginLeft:24}}>
              <span className="sold-count-badge">🔥 {soldCount}석 판매됨</span>
              <div className="gauge-bar">
                <div className="gauge-fill" style={{width:`${soldPercent}%`}}/>
              </div>
              <span style={{fontSize:11,color:"#888",whiteSpace:"nowrap"}}>{totalAvailable}석 남음</span>
            </div>
          )}
        </div>
      )}
      {timerActive && isMultiMode && (
        <div className="timer-bar">
          {roomTimerEndsAt ? (
            <>
              <span>🏁 게임 종료까지</span>
              <MultiRoomTimer timerEndsAt={roomTimerEndsAt} />
            </>
          ) : (
            <>
              <span>예매 가능 시간</span>
              <span className="timer-time" style={{color:timerSec<60?"var(--red)":"var(--blue)"}}>{timerFmt}</span>
            </>
          )}
          {page === "seat" && (
            <div className="speed-gauge" style={{flex:1,marginLeft:24}}>
              <span className="sold-count-badge">🔥 {soldCount}석 판매됨</span>
              <div className="gauge-bar">
                <div className="gauge-fill" style={{width:`${soldPercent}%`}}/>
              </div>
              <span style={{fontSize:11,color:"#888",whiteSpace:"nowrap"}}>{totalAvailable}석 남음</span>
            </div>
          )}
        </div>
      )}

      {/* ── 정보 페이지 ── */}
      {page === "info" && (
        <div className="page-info">
          <div className="show-left">
            <div>
              <div className="poster">
                <div className="apple">🍎</div>
                <div className="tk">데스노트</div>
                <div className="te">THE MUSICAL</div>
              </div>
              <div style={{marginTop:12,color:"#888",fontSize:12}}>🤍 티켓캐스트 10,227</div>
            </div>
            <div className="show-meta">
              <h1>뮤지컬 데스노트(The Musical Death Note)</h1>
              <div className="show-rating">뮤지컬 주간 9위 · <span className="stars">★★★★★</span> 9.8</div>
              <table className="meta-table">
                <tbody>
                  <tr><td>장소</td><td>디큐브 링크아트센터 ▶</td></tr>
                  <tr>
                    <td>공연기간</td>
                    <td>
                      {`2025.10.14 ~ ${showEnd.getFullYear()}.${String(showEnd.getMonth()+1).padStart(2,"0")}.${String(showEnd.getDate()).padStart(2,"0")}`}
                    </td>
                  </tr>
                  <tr><td>공연시간</td><td>165분(인터미션 20분 포함)</td></tr>
                  <tr><td>관람연령</td><td>14세 이상 관람가</td></tr>
                  <tr>
                    <td>가격</td>
                    <td>
                      <div style={{color:"var(--blue)",fontWeight:600,cursor:"pointer",marginBottom:8}}>전체가격보기 ▶</div>
                      {[["OP석","170,000","op"],["VIP석","170,000","vip"],["R석","140,000","r"],["S석","110,000","s"],["A석","80,000","a"]].map(([g,p,cls])=>(
                        <div key={g} style={{display:"flex",gap:12,marginBottom:4,alignItems:"center"}}>
                          <span className={`price-badge ${cls}`}>{g}</span>
                          <strong>{p}원</strong>
                        </div>
                      ))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="booking-panel">
            {!isOpen ? (
              <>
                <div className="panel-sec"><h3>관람일</h3><DdayPanel openTime={openTime} offset={offset}/></div>
                <button className="book-btn" disabled>예매하기</button>
              </>
            ) : (
              <>
                <div className="panel-sec"><h3>관람일 <span style={{fontSize:14,color:"#888"}}>∧</span></h3><Calendar selectedDate={selectedDate} onSelectDate={handleSelectDate}/></div>
                {selectedDate && (
                  <div className="panel-sec">
                    <h3>회차 <span style={{fontSize:14,color:"#888"}}>∧</span></h3>
                    {sessions.length === 0 ? (
                      <div className="no-session">해당 날짜는 공연이 없습니다.</div>
                    ) : (
                      <>
                        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                          {sessions.map((s,i)=>(
                            <button key={i} className={`session-btn${selectedSessionIdx===i?" sel":""}`} 
                            onClick={()=> {
                                setSelectedSessionIdx(i);
                                setSelectedSeats([]);
                                setJustSoldIds([]);
                                socket.emit('select_session', { dateStr: selectedDate, time: s.time });
                            }}>
                              {s.label}
                            </button>
                          ))}
                        </div>
                        {selectedSessionIdx !== null && (
                          <div className="session-info">
                            {`OP석 ${Math.max(0, GRADE_SEAT_COUNTS["OP석"] - Math.floor(soldCount * 0.05))}석 / VIP석 ${Math.max(0, GRADE_SEAT_COUNTS["VIP석"] - Math.floor(soldCount * 0.4))}석 / R석 ${Math.max(0, GRADE_SEAT_COUNTS["R석"] - Math.floor(soldCount * 0.35))}석 / S석 ${Math.max(0, GRADE_SEAT_COUNTS["S석"] - Math.floor(soldCount * 0.1))}석 / A석 ${Math.max(0, GRADE_SEAT_COUNTS["A석"] - Math.floor(soldCount * 0.1))}석`}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                {selectedDate && sessions.length > 0 && (
                  <div className="panel-sec"><h3>캐스팅</h3><div className="casting-list">김민석, 김성철, 장은아, 양승리, 장민제</div></div>
                )}
                <button className="book-btn" onClick={goToSeat}>예매하기</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 대기열 페이지 ── */}
      {page === "queue" && (
        <QueueScreen
          myQueueNum={queueMyNum}
          totalWaiting={queueTotal}
          onEnter={handleQueueEnter}
        />
      )}

      {/* ── 좌석 선택 페이지 ── */}
      {page === "seat" && (
        <div className="page-seat">
          <div className="seat-area">
            <div style={{fontSize:13,color:"#555",marginBottom:8,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
              뮤지컬 데스노트 |
              <button onClick={() => setShowDateModal(true)} style={{fontWeight:700,color:"var(--blue)",background:"none",border:"none",cursor:"pointer",fontSize:13,textDecoration:"underline",padding:0}}>
                {fmtDate(selectedDate)} {sessionLabel} ✏️
              </button>
            </div>
            <div className="seat-legend">
              {[
                ["var(--op)",    "OP석 (170,000원)"],
                ["var(--vip)",   "VIP석 (170,000원)"],
                ["var(--r)",     "R석 (140,000원)"],
                ["var(--s)",     "S석 (110,000원)"],
                ["var(--a-seat)","A석 (80,000원)"],
                ["var(--sold)",  "판매완료"],
                ["#111",         "내가 선택"],
              ].map(([bg, label]) => (
                <div className="legend-item" key={label}>
                  <div className="legend-dot" style={{background:bg, outline:bg==="#111"?"2px solid var(--blue)":"none"}}/>{label}
                </div>
              ))}
            </div>
            <div className="stage-lbl">STAGE</div>
            <SeatMap
              seatMap={seatMap}
              selectedIds={selectedSeats.map(s=>s.id)}
              shakingIds={shakingIds}
              justSoldIds={justSoldIds}
              onSeatClick={handleSeatClick}
            />
          </div>
          <div className="sel-panel">
            <h2>{selectedSeats.length > 0 ? `선택 좌석 ${selectedSeats.length}` : "선택 좌석"}</h2>

            {/* 미션 패널 */}
            {isMissionMode && currentMission && (
              <MissionPanel mission={currentMission} seats={selectedSeats} />
            )}

            <div style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontSize:12,color:"#555",fontWeight:600}}>{fmtDate(selectedDate)} {sessionLabel}</div>
                <button onClick={() => setShowDateModal(true)} style={{fontSize:11,color:"var(--blue)",background:"none",border:"1px solid var(--blue)",borderRadius:6,padding:"2px 8px",cursor:"pointer"}}>날짜 변경</button>
              </div>
              <div style={{fontSize:11,color:"#555",background:"#f8f8fc",borderRadius:6,padding:"6px 10px",lineHeight:1.8}}>
                {`OP석 ${Math.max(0,GRADE_SEAT_COUNTS["OP석"]-Math.floor(soldCount*0.05))}석 / VIP석 ${Math.max(0,GRADE_SEAT_COUNTS["VIP석"]-Math.floor(soldCount*0.4))}석 / R석 ${Math.max(0,GRADE_SEAT_COUNTS["R석"]-Math.floor(soldCount*0.35))}석 / S석 ${Math.max(0,GRADE_SEAT_COUNTS["S석"]-Math.floor(soldCount*0.1))}석 / A석 ${Math.max(0,GRADE_SEAT_COUNTS["A석"]-Math.floor(soldCount*0.1))}석`}
              </div>
            </div>

            <div className="sel-panel-seats">
              {selectedSeats.length === 0 ? (
                <div className="no-seat">선택한 좌석이 없습니다.</div>
              ) : (
                <>
                  {selectedSeats.map(s => (
                    <div className="seat-item" key={s.id}>
                      <div>
                        <span className={`grade-badge ${gradeClass(s.grade)}`}>{s.grade}</span>
                        {s.section} {s.row}열 {s.col}번
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontWeight:700}}>{s.price.toLocaleString()}원</span>
                        <button className="remove-btn" onClick={()=>removeSeat(s.id)}>×</button>
                      </div>
                    </div>
                  ))}
                  <div style={{marginTop:12,display:"flex",justifyContent:"flex-end",cursor:"pointer",fontSize:12,color:"#888"}} onClick={()=>setSelectedSeats([])}>전체삭제</div>
                </>
              )}
            </div>
            <button className="complete-btn" disabled={selectedSeats.length===0} onClick={()=>setPage("form")}>선택 완료</button>
          </div>
        </div>
      )}

      {/* ── 예매 정보 입력 ── */}
      {page === "form" && (
        <div className="page-form" ref={formRef}>
          <div className="page-title"><button className="back-btn" onClick={()=>setPage("seat")}>‹</button>예매 정보 입력</div>
          <div className="sec-title">예매자 정보 <span className="required">*</span></div>
          {[["예매자","이름 입력","text",bookerName,setBookerName],["생년월일","YYYY-MM-DD","text",bookerBirth,setBookerBirth],["이메일","이메일 입력","email",bookerEmail,setBookerEmail],["휴대폰","010-0000-0000","tel",bookerPhone,setBookerPhone]].map(([label,ph,type,val,set])=>(
            <div className="form-group" key={label}>
              <label>{label}</label>
              <input className="form-input" type={type} placeholder={ph} value={val} onChange={e=>set(e.target.value)}/>
            </div>
          ))}
          <div className="form-hint">티켓 수령 및 본인 확인을 위해 정확한 정보를 입력해주세요.</div>
          <hr className="divider"/>
          <div className="sec-title">티켓 수령 방법 <span className="required">*</span></div>
          <div className="ticket-method">
            {["현장수령","배송"].map(m=>(
              <button key={m} className={`method-btn${ticketMethod===m?" sel":""}`} onClick={()=>setTicketMethod(m)}>{m==="현장수령"?"🎫":"📨"} {m}</button>
            ))}
          </div>
          <div className="form-hint">예매 시 부여된 예약번호로 관람 당일 티켓을 수령해 입장합니다.</div>
          <hr className="divider"/>
          <div className="sec-title">약관 동의</div>
          <div className="terms-wrap">
            <div className="term-all" onClick={()=>{const v=!allChecked;setChk1(v);setChk2(v);}}><div className={`checkbox${allChecked?" chk":""}`}>{allChecked?"✓":""}</div>전체 동의</div>
            <div className="term-item" onClick={()=>setChk1(v=>!v)}><div className={`checkbox${chk1?" chk":""}`}>{chk1?"✓":""}</div>(필수) 취소 규정 안내 ▶<span className="term-link">예매 당일까지 무료 취소 가능</span></div>
            <div className="term-item" onClick={()=>setChk2(v=>!v)}><div className={`checkbox${chk2?" chk":""}`}>{chk2?"✓":""}</div>(필수) 티켓 이용정책 동의 ▶</div>
          </div>
          <button className="proceed-btn" disabled={!allChecked||!bookerName.trim()} onClick={goToPayment}>예매 진행하기</button>
        </div>
      )}

      {/* ── 결제 페이지 ── */}
      {page === "payment" && (
        <div className="page-payment">
          <div>
            <div className="page-title" style={{marginBottom:24}}><button className="back-btn" onClick={()=>setPage("form")}>‹</button>결제 준비</div>
            <div className="order-card">
              <div className="order-show">
                <div className="order-img">🍎</div>
                <div className="order-info">
                  <strong>뮤지컬 데스노트(The Musical Death Note)</strong>
                  {fmtDate(selectedDate)} {sessionLabel}<br/>
                  디큐브 링크아트센터<br/>
                  수령 방법: {ticketMethod}<br/>
                  주문 번호: {orderNum}
                </div>
              </div>
              {selectedSeats.map(s=>(
                <div className="seat-detail-row" key={s.id}>
                  <span><span className={`seat-grade-badge ${gradeClass(s.grade)}`}>{s.grade}</span>{s.section} {s.row}열 {s.col}번</span>
                  <span style={{fontWeight:700}}>{s.price.toLocaleString()}원</span>
                </div>
              ))}
              <div className="seat-detail-row" style={{marginTop:6,borderTop:"1px solid #eee",paddingTop:6,fontSize:12,color:"#888"}}><span>예매수수료</span><span>+2,000원</span></div>
            </div>
            <div className="order-card">
              <div className="order-card-title">결제 수단</div>
              <div className="radio-group">
                {[{id:"npay",label:<>🟢 Npay</>},{id:"other",label:"다른 결제 수단"}].map(({id,label})=>(
                  <div key={id} className={`radio-item${payMethod===id?" sel":""}`} onClick={()=>setPayMethod(id)}>
                    <div className="radio-circle">{payMethod===id&&<div className="radio-dot"/>}</div>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              {payMethod === "other" && (
                <div className="pay-grid">
                  {[["card","카드"],["kb","🟡 KB페이"],["payco","🔴 페이코"],["phone","휴대폰"],["virtual","가상계좌"]].map(([id,lbl])=>(
                    <div key={id} className={`pay-option${payOption===id?" sel":""}`} onClick={()=>setPayOption(id)}>{lbl}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="payment-side">
            <div className="price-summary">
              <div className="order-card-title" style={{marginBottom:12}}>결제 금액</div>
              <div className="price-row"><span>티켓금액</span><span>{ticketTotal.toLocaleString()}원</span></div>
              <div className="price-row"><span>예매수수료</span><span>+2,000원</span></div>
              <div className="price-total"><span>총 결제 예상금액</span><span>{grandTotal.toLocaleString()}원</span></div>
            </div>
            <button className="pay-btn" onClick={openPayModal}>{grandTotal.toLocaleString()}원 결제하기</button>
          </div>
        </div>
      )}

      {/* ── 예매 완료 페이지 ── */}
      {page === "done" && (
        <div className="page-done-v2">
          <div className="done-v2-header">
            <div className="done-v2-logo">NOL<span>ticket</span></div>
            <div className="done-v2-nav"><span>마이페이지</span><span>예약확인/취소</span></div>
          </div>
          <div className="done-check-circle">✓</div>
          <div className="done-v2-title">예매 완료</div>

          {playResult && (
            <div style={{width:"100%",maxWidth:600,margin:"0 auto 24px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,padding:"0 16px"}}>
              {[
                ["오픈 클릭 반응", playResult.openClickMs !== null ? `${playResult.openClickMs.toLocaleString()}ms` : "-"],
                ["오픈 반응 점수", `${playResult.openScore}점`],
                ["평균 클릭 간격", playResult.avgInterval !== null ? `${playResult.avgInterval.toLocaleString()}ms` : "-"],
                ["좌석 선택 시간", playResult.seatSelectSec !== null ? `${playResult.seatSelectSec}초` : "-"],
                ["CAPTCHA 성공률", playResult.captchaTotal > 0 ? `${playResult.captchaRate}%` : "등장하지 않음"],
                ["서버 오류 대처 점수", `${playResult.serverErrorScore}점`],
                ["좌석 실패 횟수", `${playResult.seatFailCount}회`],
                ["총 오류 노출", `${playResult.errorCount}회`],
                ["봇 압박 이벤트", `${playResult.botPressureCount}회`],
              ].map(([label, value]) => (
                <div key={label} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:"16px 18px"}}>
                  <div style={{fontSize:12,color:"#888",marginBottom:6,display:"flex",alignItems:"center",gap:4}}>
                    <span style={{fontSize:11}}>📊</span> {label}
                  </div>
                  <div style={{fontSize:22,fontWeight:800,color:"#111"}}>{value}</div>
                </div>
              ))}
            </div>
          )}

          <div className="done-v2-card">
            <div className="done-v2-row"><div className="done-v2-lbl">예매번호</div><div className="done-v2-val">{orderNum.slice(0,10)}</div></div>
            <div className="done-v2-row"><div className="done-v2-lbl">예매정보</div><div className="done-v2-val sub"><span>뮤지컬 데스노트 (The Musical)</span><small>디큐브 링크아트센터</small></div></div>
            <div className="done-v2-row"><div className="done-v2-lbl">공연일정</div><div className="done-v2-val">{fmtDate(selectedDate)} {sessionLabel}</div></div>
            <div className="done-v2-row"><div className="done-v2-lbl">수령방법</div><div className="done-v2-val">{ticketMethod}</div></div>
            <div className="done-v2-row"><div className="done-v2-lbl">결제금액</div><div className="done-v2-val">{grandTotal.toLocaleString()}원 ({currentPayLabel})</div></div>
            <div className="done-v2-row"><div className="done-v2-lbl">예매상태</div><div className="done-v2-val status">결제 완료</div></div>
          </div>
          <div className="done-v2-btns">
            <button className="done-v2-btn-outline" onClick={restart}>처음으로</button>
            <button className="done-v2-btn-fill" onClick={restart}>다시 연습하기</button>
          </div>
        </div>
      )}

      {/* ── 날짜 변경 모달 ── */}
      {showDateModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowDateModal(false)}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:340,maxWidth:"95vw",boxShadow:"0 8px 40px rgba(0,0,0,.2)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:700}}>날짜 변경</div>
              <button onClick={() => setShowDateModal(false)} style={{fontSize:22,color:"#aaa",background:"none",border:"none",cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            <Calendar
              selectedDate={selectedDate}
              onSelectDate={(dateStr) => {
                setSelectedDate(dateStr);
                setSelectedSessionIdx(null);
                setSelectedSeats([]);
                const elapsedSec = calcElapsedSec();
                const preMap = buildPreSoldSeatMap(elapsedSec);
                setSeatMap(preMap);
                setSoldCount(Object.values(preMap).filter(v => v === "sold").length);
                setJustSoldIds([]);
              }}
            />
            {selectedDate && (() => {
              const dow = new Date(selectedDate).getDay();
              const sess = SESSION_BY_DOW[dow] || [];
              return sess.length > 0 ? (
                <div style={{marginTop:16}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#555",marginBottom:8}}>회차 선택</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {sess.map((s, i) => (
                      <button key={i} className={`session-btn${selectedSessionIdx === i ? " sel" : ""}`} 
                      onClick={() => { 
                        setSelectedSessionIdx(i); 
                        setSelectedSeats([]);
                        setJustSoldIds([]);
                        socket.emit('select_session', { dateStr: selectedDate, time: s.time }); }}>
                          {s.label}</button>
                    ))}
                  </div>
                  {selectedSessionIdx !== null && (
                    <div style={{marginTop:8,fontSize:11,color:"#555",background:"#f8f8fc",borderRadius:6,padding:"6px 10px",lineHeight:1.8}}>
                      {`OP석 ${Math.max(0,GRADE_SEAT_COUNTS["OP석"]-Math.floor(soldCount*0.05))}석 / VIP석 ${Math.max(0,GRADE_SEAT_COUNTS["VIP석"]-Math.floor(soldCount*0.4))}석 / R석 ${Math.max(0,GRADE_SEAT_COUNTS["R석"]-Math.floor(soldCount*0.35))}석 / S석 ${Math.max(0,GRADE_SEAT_COUNTS["S석"]-Math.floor(soldCount*0.1))}석 / A석 ${Math.max(0,GRADE_SEAT_COUNTS["A석"]-Math.floor(soldCount*0.1))}석`}
                    </div>
                  )}
                </div>
              ) : null;
            })()}
            <button
              className="book-btn"
              style={{marginTop:20}}
              disabled={!selectedDate || selectedSessionIdx === null}
              onClick={() => setShowDateModal(false)}
            >이 날짜로 변경</button>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </>
  );
}