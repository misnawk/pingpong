'use strict';

// ===== Session data =====
const roomId = sessionStorage.getItem('roomId');
const mySide = sessionStorage.getItem('side');
const myNickname = sessionStorage.getItem('nickname');

if (!roomId || !mySide || !myNickname) {
  window.location.href = '/';
}

// ===== DOM elements =====
const waitingScreen = document.getElementById('waitingScreen');
const gameScreen = document.getElementById('gameScreen');
const disconnectedScreen = document.getElementById('disconnectedScreen');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const leftNicknameEl = document.getElementById('leftNickname');
const rightNicknameEl = document.getElementById('rightNickname');
const leftScoreEl = document.getElementById('leftScore');
const rightScoreEl = document.getElementById('rightScore');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const gameOverTitle = document.getElementById('gameOverTitle');
const gameOverMsg = document.getElementById('gameOverMsg');
const restartBtn = document.getElementById('restartBtn');

// ===== 게임 상수 (서버와 동일) =====
const TABLE_W = 550;
const TABLE_L = 800;
const NET_HEIGHT = 25;
const NET_Y = TABLE_L / 2;
const BALL_R = 8;
const PADDLE_HALF_W = 50;
const NEAR_Y_POS = 35;
const FAR_Y_POS = TABLE_L - 35;

// ===== 캔버스 크기 =====
const CW = 800;
const CH = 600;

// ===== 퍼스펙티브 파라미터 =====
// Near edge (테이블 y=0, left player쪽) → 화면 아래
// Far edge  (테이블 y=TABLE_L, right player쪽) → 화면 위
const NEAR_SCR_Y = 530;
const FAR_SCR_Y  = 130;
const NEAR_LEFT  = 80;
const NEAR_RIGHT = 720;
const FAR_LEFT   = 265;
const FAR_RIGHT  = 535;

// right 플레이어는 자신을 아래(near)로 뷰를 뒤집음
const flipView = mySide === 'right';

// ===== 상태 =====
let gameState = null;
let players = [];

// ===== Socket =====
const socket = io();

// Re-join the room after page load (lobby → game.html 페이지 이동)
socket.on('connect', () => {
  socket.emit('rejoin_room', { roomId, nickname: myNickname, side: mySide });
});

socket.on('room_joined', ({ players: pl }) => {
  players = pl;
  updateNicknames();
  if (pl.length < 2) showWaiting();
});

socket.on('game_start', ({ gameState: gs }) => {
  gameState = gs;
  updateScore(gs.score);
  showGame();
  requestAnimationFrame(renderLoop);
});

socket.on('game_state', (gs) => {
  if (!gameState) { gameState = gs; return; }
  // 점수는 score_update로 유지하고 나머지만 병합
  gameState.ball = gs.ball;
  gameState.paddles = gs.paddles;
  gameState.phase = gs.phase;
  gameState.serveSide = gs.serveSide;
});

socket.on('score_update', ({ score }) => {
  if (gameState) gameState.score = score;
  updateScore(score);
});

socket.on('game_over', ({ winner, winnerNickname }) => {
  gameOverTitle.textContent = winner === mySide ? '🎉 승리!' : '😢 패배';
  gameOverMsg.textContent = `${winnerNickname} 님이 승리했습니다!`;
  gameOverOverlay.classList.remove('hidden');
});

socket.on('player_disconnected', () => showDisconnected());

socket.on('room_error', ({ message }) => {
  alert(message);
  window.location.href = '/';
});

// ===== 퍼스펙티브 투영 =====
function proj(tableX, tableY, tableZ) {
  if (tableZ === undefined) tableZ = 0;
  const ty = flipView ? TABLE_L - tableY : tableY;
  const t = Math.max(0, Math.min(1, ty / TABLE_L));
  const sy   = NEAR_SCR_Y + t * (FAR_SCR_Y  - NEAR_SCR_Y);
  const xl   = NEAR_LEFT  + t * (FAR_LEFT   - NEAR_LEFT);
  const xr   = NEAR_RIGHT + t * (FAR_RIGHT  - NEAR_RIGHT);
  const sx   = xl + (tableX / TABLE_W) * (xr - xl);
  const hf   = 1 - t * 0.45;
  return { x: sx, y: sy - tableZ * hf * 0.95, scale: 1 - t * 0.5 };
}

// ===== 테이블 그리기 =====
function drawTable() {
  const nL = proj(0, 0);
  const nR = proj(TABLE_W, 0);
  const fR = proj(TABLE_W, TABLE_L);
  const fL = proj(0, TABLE_L);

  // 테이블 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.moveTo(nL.x + 7, nL.y + 5);
  ctx.lineTo(nR.x + 7, nR.y + 5);
  ctx.lineTo(fR.x + 7, fR.y + 5);
  ctx.lineTo(fL.x + 7, fL.y + 5);
  ctx.closePath();
  ctx.fill();

  // 테이블 면 (그라디언트)
  const grad = ctx.createLinearGradient(0, FAR_SCR_Y, 0, NEAR_SCR_Y);
  grad.addColorStop(0, '#1a6e38');
  grad.addColorStop(1, '#22913f');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(nL.x, nL.y);
  ctx.lineTo(nR.x, nR.y);
  ctx.lineTo(fR.x, fR.y);
  ctx.lineTo(fL.x, fL.y);
  ctx.closePath();
  ctx.fill();

  // 테이블 앞면 두께 (near edge)
  const EDGE = 9;
  ctx.fillStyle = '#0d4a22';
  ctx.beginPath();
  ctx.moveTo(nL.x, nL.y);
  ctx.lineTo(nR.x, nR.y);
  ctx.lineTo(nR.x, nR.y + EDGE);
  ctx.lineTo(nL.x, nL.y + EDGE);
  ctx.closePath();
  ctx.fill();

  // 흰 테두리
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(nL.x, nL.y);
  ctx.lineTo(nR.x, nR.y);
  ctx.lineTo(fR.x, fR.y);
  ctx.lineTo(fL.x, fL.y);
  ctx.closePath();
  ctx.stroke();

  // 사이드 라인
  ctx.beginPath();
  ctx.moveTo(nL.x, nL.y); ctx.lineTo(fL.x, fL.y);
  ctx.moveTo(nR.x, nR.y); ctx.lineTo(fR.x, fR.y);
  ctx.stroke();

  // 가운데 세로 점선
  const cl = proj(TABLE_W / 2, 0);
  const cr = proj(TABLE_W / 2, TABLE_L);
  ctx.setLineDash([7, 7]);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cl.x, cl.y); ctx.lineTo(cr.x, cr.y); ctx.stroke();
  ctx.setLineDash([]);

  // 네트 위치 표시선 (테이블 면)
  const nl = proj(0, NET_Y);
  const nr = proj(TABLE_W, NET_Y);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(nl.x, nl.y); ctx.lineTo(nr.x, nr.y); ctx.stroke();
}

// ===== 네트 그리기 =====
function drawNet() {
  const SEGS = 10;
  const bL = proj(0, NET_Y, 0);
  const bR = proj(TABLE_W, NET_Y, 0);
  const tL = proj(0, NET_Y, NET_HEIGHT);
  const tR = proj(TABLE_W, NET_Y, NET_HEIGHT);

  // 그물망 가로줄
  for (let row = 0; row <= 3; row++) {
    const f = row / 3;
    const l = { x: bL.x + (tL.x - bL.x) * f, y: bL.y + (tL.y - bL.y) * f };
    const r = { x: bR.x + (tR.x - bR.x) * f, y: bR.y + (tR.y - bR.y) * f };
    ctx.strokeStyle = `rgba(220,220,220,${0.25 + f * 0.25})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.stroke();
  }

  // 그물망 세로줄
  for (let i = 0; i <= SEGS; i++) {
    const tx = (TABLE_W / SEGS) * i;
    const b = proj(tx, NET_Y, 0);
    const t = proj(tx, NET_Y, NET_HEIGHT);
    ctx.strokeStyle = 'rgba(200,200,200,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(t.x, t.y); ctx.stroke();
  }

  // 네트 상단 흰 테두리
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(tL.x, tL.y); ctx.lineTo(tR.x, tR.y); ctx.stroke();

  // 가운데 포스트
  const postB = proj(TABLE_W / 2, NET_Y, 0);
  const postT = proj(TABLE_W / 2, NET_Y, NET_HEIGHT + 6);
  ctx.beginPath(); ctx.moveTo(postB.x, postB.y); ctx.lineTo(postT.x, postT.y); ctx.stroke();
}

// ===== 패들 그리기 =====
function drawPaddle(side) {
  if (!gameState) return;
  const px = gameState.paddles[side].x;
  const py = side === 'left' ? NEAR_Y_POS : FAR_Y_POS;
  const D = 8; // 패들 세로 절반

  const tl = proj(px - PADDLE_HALF_W, py - D);
  const tr = proj(px + PADDLE_HALF_W, py - D);
  const bl = proj(px - PADDLE_HALF_W, py + D);
  const br = proj(px + PADDLE_HALF_W, py + D);

  const isMine = side === mySide;
  const g = ctx.createLinearGradient(tl.x, tl.y, br.x, br.y);
  if (isMine) {
    g.addColorStop(0, '#ff4444');
    g.addColorStop(1, '#991111');
  } else {
    g.addColorStop(0, '#4466ff');
    g.addColorStop(1, '#1133aa');
  }

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ===== 공 그림자 =====
function drawBallShadow() {
  if (!gameState) return;
  const { x, y, z } = gameState.ball;
  const s = proj(x, y, 0);
  const sr = Math.max(2, (13 - z * 0.12) * s.scale);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, sr, sr * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ===== 공 그리기 =====
function drawBall() {
  if (!gameState) return;
  const { x, y, z } = gameState.ball;
  const p = proj(x, y, z);
  const br = Math.max(3, BALL_R * p.scale * 1.4);

  const g = ctx.createRadialGradient(
    p.x - br * 0.3, p.y - br * 0.35, br * 0.08,
    p.x, p.y, br
  );
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, '#fffacc');
  g.addColorStop(1, '#d4c840');

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, br, 0, Math.PI * 2);
  ctx.fill();
}

// ===== 서브 힌트 =====
function drawServeHint() {
  if (!gameState || gameState.phase === 'rally') return;
  const isMyTurn = gameState.serveSide === mySide;
  ctx.textAlign = 'center';
  if (isMyTurn) {
    ctx.fillStyle = 'rgba(255,240,60,0.95)';
    ctx.font = 'bold 17px Arial';
    ctx.fillText('클릭 또는 스페이스바로 서브!', CW / 2, CH - 16);
  } else {
    ctx.fillStyle = 'rgba(200,200,200,0.7)';
    ctx.font = '15px Arial';
    ctx.fillText('상대방 서브 대기 중...', CW / 2, CH - 16);
  }
}

// ===== 프레임 그리기 =====
function drawFrame() {
  ctx.fillStyle = '#0d1520';
  ctx.fillRect(0, 0, CW, CH);
  if (!gameState) return;

  drawTable();
  drawBallShadow();
  drawNet();

  // far 패들을 먼저 그려서 near 패들이 앞에 오도록
  const [farSide, nearSide] = flipView ? ['left', 'right'] : ['right', 'left'];
  drawPaddle(farSide);
  drawPaddle(nearSide);
  drawBall();
  drawServeHint();
}

// ===== 마우스로 패들 조작 (X축 이동) =====
let lastSent = 0;
canvas.addEventListener('mousemove', (e) => {
  const now = Date.now();
  if (now - lastSent < 16) return;
  lastSent = now;

  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (CW / rect.width);
  // 화면 x → 테이블 x (near edge 기준 선형 매핑)
  const tableX = (mx - NEAR_LEFT) / (NEAR_RIGHT - NEAR_LEFT) * TABLE_W;
  const clamped = Math.max(PADDLE_HALF_W, Math.min(TABLE_W - PADDLE_HALF_W, tableX));
  socket.emit('paddle_move', { x: clamped });
});

// ===== 서브 입력 =====
function tryServe() {
  if (gameState && gameState.serveSide === mySide && gameState.phase !== 'rally') {
    socket.emit('serve_ball');
  }
}

canvas.addEventListener('click', tryServe);
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); tryServe(); }
});

// ===== 다시 시작 =====
restartBtn.addEventListener('click', () => {
  sessionStorage.removeItem('roomId');
  sessionStorage.removeItem('side');
  sessionStorage.removeItem('nickname');
  window.location.href = '/';
});

// ===== UI helpers =====
function showWaiting() {
  roomCodeDisplay.textContent = roomId;
  waitingScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  disconnectedScreen.classList.add('hidden');
}

function showGame() {
  waitingScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  disconnectedScreen.classList.add('hidden');
}

function showDisconnected() {
  waitingScreen.classList.add('hidden');
  gameScreen.classList.add('hidden');
  disconnectedScreen.classList.remove('hidden');
}

function updateNicknames() {
  const l = players.find((p) => p.side === 'left');
  const r = players.find((p) => p.side === 'right');
  leftNicknameEl.textContent  = l ? l.nickname : '-';
  rightNicknameEl.textContent = r ? r.nickname : '-';
}

function updateScore(score) {
  leftScoreEl.textContent  = score.left;
  rightScoreEl.textContent = score.right;
}

// ===== 렌더 루프 =====
function renderLoop() {
  drawFrame();
  requestAnimationFrame(renderLoop);
}
