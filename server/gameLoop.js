'use strict';

// ── 테이블 치수 (게임 좌표계) ──
// x: 0~TABLE_W (좌우), y: 0~TABLE_L (near→far), z: 높이(0=테이블 바닥)
// left player = near side (y=NEAR_Y), right player = far side (y=FAR_Y)
const TABLE_W = 550;
const TABLE_L = 800;
const NET_HEIGHT = 25;
const NET_Y = TABLE_L / 2;
const GRAVITY = 0.55;
const BALL_R = 8;
const PADDLE_HALF_W = 50;
const PADDLE_DEPTH = 8;
const NEAR_Y = 35;
const FAR_Y = TABLE_L - 35;
const WIN_SCORE = 11;
const TICK_RATE = 1000 / 60;
const GAME_START_DELAY_MS = 1000;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function createInitialGameState(serveSide) {
  if (!serveSide) serveSide = 'left';
  const isNear = serveSide === 'left';
  return {
    ball: {
      x: TABLE_W / 2,
      y: isNear ? NEAR_Y + BALL_R + 2 : FAR_Y - BALL_R - 2,
      z: 5,
      vx: 0, vy: 0, vz: 0,
    },
    paddles: {
      left: { x: TABLE_W / 2 },
      right: { x: TABLE_W / 2 },
    },
    score: { left: 0, right: 0 },
    phase: `serve_${serveSide}`,
    serveSide,
  };
}

function launchBall(gs) {
  const isNear = gs.serveSide === 'left';
  const px = gs.paddles[gs.serveSide].x;
  gs.ball.x = px;
  gs.ball.y = isNear ? NEAR_Y + BALL_R + 2 : FAR_Y - BALL_R - 2;
  gs.ball.z = 5;
  const spd = 5.5;
  gs.ball.vy = isNear ? spd : -spd;
  gs.ball.vx = (Math.random() * 0.5 - 0.25) * spd;
  gs.ball.vz = 8;
  gs.phase = 'rally';
}

function doScore(gs, scorer) {
  gs.score[scorer] += 1;
  let winner = null;
  if (gs.score.left >= WIN_SCORE) winner = 'left';
  else if (gs.score.right >= WIN_SCORE) winner = 'right';

  const next = scorer === 'left' ? 'right' : 'left';
  gs.phase = `serve_${next}`;
  gs.serveSide = next;
  const isNear = next === 'left';
  gs.ball = {
    x: gs.paddles[next].x,
    y: isNear ? NEAR_Y + BALL_R + 2 : FAR_Y - BALL_R - 2,
    z: 5,
    vx: 0, vy: 0, vz: 0,
  };
  return { scored: scorer, winner };
}

function tick(room) {
  const gs = room.gameState;
  if (gs.phase !== 'rally') return { scored: null, winner: null };

  const b = gs.ball;
  const prevY = b.y;

  b.vz -= GRAVITY;
  b.x += b.vx;
  b.y += b.vy;
  b.z += b.vz;

  // 테이블 바닥 바운스
  if (b.z <= 0) {
    b.z = 0;
    b.vz = Math.abs(b.vz) * 0.72;
    if (b.vz < 0.4) b.vz = 0;
    b.vx *= 0.94;
    b.vy *= 0.94;
  }

  // 좌우 벽
  if (b.x - BALL_R <= 0) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
  else if (b.x + BALL_R >= TABLE_W) { b.x = TABLE_W - BALL_R; b.vx = -Math.abs(b.vx); }

  // 네트 충돌 (높이 부족하면 네트에 걸림)
  const crossFar = prevY < NET_Y && b.y >= NET_Y;
  const crossNear = prevY > NET_Y && b.y <= NET_Y;
  if ((crossFar || crossNear) && b.z < NET_HEIGHT) {
    return doScore(gs, crossFar ? 'right' : 'left');
  }

  // Near 패들 충돌 (left player)
  if (b.vy < 0 &&
      b.y - BALL_R <= NEAR_Y + PADDLE_DEPTH &&
      b.y + BALL_R >= NEAR_Y - PADDLE_DEPTH &&
      b.z <= 22) {
    if (Math.abs(b.x - gs.paddles.left.x) <= PADDLE_HALF_W + BALL_R) {
      b.y = NEAR_Y + PADDLE_DEPTH + BALL_R;
      const spd = Math.hypot(b.vx, b.vy) * 1.04;
      b.vy = Math.max(spd, 5);
      b.vz = 7.5;
      b.vx = clamp(b.vx + (b.x - gs.paddles.left.x) / PADDLE_HALF_W * 3, -9, 9);
    }
  }

  // Far 패들 충돌 (right player)
  if (b.vy > 0 &&
      b.y + BALL_R >= FAR_Y - PADDLE_DEPTH &&
      b.y - BALL_R <= FAR_Y + PADDLE_DEPTH &&
      b.z <= 22) {
    if (Math.abs(b.x - gs.paddles.right.x) <= PADDLE_HALF_W + BALL_R) {
      b.y = FAR_Y - PADDLE_DEPTH - BALL_R;
      const spd = Math.hypot(b.vx, b.vy) * 1.04;
      b.vy = -Math.max(spd, 5);
      b.vz = 7.5;
      b.vx = clamp(b.vx + (b.x - gs.paddles.right.x) / PADDLE_HALF_W * 3, -9, 9);
    }
  }

  // 아웃 오브 바운즈
  if (b.y < NEAR_Y - 100) return doScore(gs, 'right');
  if (b.y > FAR_Y + 100) return doScore(gs, 'left');

  return { scored: null, winner: null };
}

const activeLoops = new Map();

function startGameLoop(room, io) {
  if (activeLoops.has(room.roomId)) return;

  room.gameState = createInitialGameState('left');
  room.status = 'playing';

  const id = setInterval(() => {
    if (room.status !== 'playing') { stopGameLoop(room.roomId); return; }

    const { scored, winner } = tick(room);
    const gs = room.gameState;

    io.to(room.roomId).emit('game_state', {
      ball: gs.ball,
      paddles: gs.paddles,
      phase: gs.phase,
      serveSide: gs.serveSide,
    });

    if (scored) io.to(room.roomId).emit('score_update', { score: gs.score });

    if (winner) {
      room.status = 'finished';
      const wp = room.players.find((p) => p.side === winner);
      io.to(room.roomId).emit('game_over', {
        winner,
        winnerNickname: wp ? wp.nickname : winner,
      });
      stopGameLoop(room.roomId);
    }
  }, TICK_RATE);

  activeLoops.set(room.roomId, id);
}

function stopGameLoop(roomId) {
  const id = activeLoops.get(roomId);
  if (id) { clearInterval(id); activeLoops.delete(roomId); }
}

function updatePaddle(room, side, x) {
  if (!room.gameState) return;
  const gs = room.gameState;
  const paddle = gs.paddles[side];
  if (!paddle) return;
  paddle.x = clamp(x, PADDLE_HALF_W, TABLE_W - PADDLE_HALF_W);
  // 서브 중에는 공이 패들을 따라다님
  if (gs.phase === `serve_${side}`) {
    const isNear = side === 'left';
    gs.ball.x = paddle.x;
    gs.ball.y = isNear ? NEAR_Y + BALL_R + 2 : FAR_Y - BALL_R - 2;
    gs.ball.z = 5;
  }
}

function serveBall(room, side) {
  if (!room.gameState) return false;
  const gs = room.gameState;
  if (gs.phase !== `serve_${side}`) return false;
  launchBall(gs);
  return true;
}

module.exports = {
  startGameLoop,
  stopGameLoop,
  updatePaddle,
  serveBall,
  GAME_START_DELAY_MS,
  TABLE_W,
  TABLE_L,
};
