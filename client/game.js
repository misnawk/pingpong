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

// ===== Constants =====
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 100;
const BALL_SIZE = 10;
const MOUSE_THROTTLE_MS = 16; // ~60fps

// ===== Game state (mirror from server) =====
let gameState = null;
let players = [];

// ===== Socket =====
const socket = io();

// Re-join the room after page load
socket.on('connect', () => {
  socket.emit('join_room', { roomId, nickname: myNickname });
});

socket.on('room_joined', ({ players: pl }) => {
  players = pl;
  updateNicknames();

  if (pl.length < 2) {
    showWaiting();
  }
  // Game start event will show the game screen when ready
});

socket.on('game_start', ({ gameState: gs }) => {
  gameState = gs;
  showGame();
  requestAnimationFrame(renderLoop);
});

socket.on('game_state', (gs) => {
  gameState = gs;
});

socket.on('score_update', ({ score }) => {
  if (gameState) gameState.score = score;
  updateScore(score);
});

socket.on('game_over', ({ winner, winnerNickname }) => {
  const isWinner = winner === mySide;
  gameOverTitle.textContent = isWinner ? '🎉 승리!' : '😢 패배';
  gameOverMsg.textContent = `${winnerNickname} 님이 승리했습니다!`;
  gameOverOverlay.classList.remove('hidden');
});

socket.on('player_disconnected', () => {
  showDisconnected();
});

socket.on('room_error', ({ message }) => {
  // If joining fails (e.g., room is full / finished), go back to lobby
  alert(message);
  window.location.href = '/';
});

// ===== Mouse control =====
let lastMouseSent = 0;

canvas.addEventListener('mousemove', (e) => {
  const now = Date.now();
  if (now - lastMouseSent < MOUSE_THROTTLE_MS) return; // ~60fps throttle
  lastMouseSent = now;

  const rect = canvas.getBoundingClientRect();
  const mouseY = e.clientY - rect.top;
  const paddleY = mouseY - PADDLE_HEIGHT / 2;
  const clampedY = Math.max(0, Math.min(paddleY, CANVAS_HEIGHT - PADDLE_HEIGHT));

  socket.emit('paddle_move', { y: clampedY });
});

// ===== Restart button =====
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
  const left = players.find((p) => p.side === 'left');
  const right = players.find((p) => p.side === 'right');
  leftNicknameEl.textContent = left ? left.nickname : '-';
  rightNicknameEl.textContent = right ? right.nickname : '-';
}

function updateScore(score) {
  leftScoreEl.textContent = score.left;
  rightScoreEl.textContent = score.right;
}

// ===== Canvas renderer =====
function renderLoop() {
  drawFrame();
  requestAnimationFrame(renderLoop);
}

function drawFrame() {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (!gameState) return;

  // Center dashed line
  ctx.setLineDash([10, 10]);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CANVAS_WIDTH / 2, 0);
  ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
  ctx.stroke();
  ctx.setLineDash([]);

  // Left paddle
  ctx.fillStyle = mySide === 'left' ? '#4a9eff' : '#ffffff';
  ctx.fillRect(
    PADDLE_WIDTH,
    gameState.paddles.left.y,
    PADDLE_WIDTH,
    PADDLE_HEIGHT
  );

  // Right paddle
  ctx.fillStyle = mySide === 'right' ? '#4a9eff' : '#ffffff';
  ctx.fillRect(
    CANVAS_WIDTH - PADDLE_WIDTH * 2,
    gameState.paddles.right.y,
    PADDLE_WIDTH,
    PADDLE_HEIGHT
  );

  // Ball
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(
    gameState.ball.x,
    gameState.ball.y,
    BALL_SIZE / 2,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // Score update
  updateScore(gameState.score);
}
