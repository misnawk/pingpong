'use strict';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PADDLE_HEIGHT = 100;
const PADDLE_WIDTH = 12;
const BALL_SIZE = 10;
const BALL_SPEED_INITIAL = 5;
const WIN_SCORE = 11;
const TICK_RATE = 1000 / 60; // 60fps

function createInitialGameState() {
  return {
    ball: {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      vx: (Math.random() > 0.5 ? 1 : -1) * BALL_SPEED_INITIAL,
      vy: (Math.random() > 0.5 ? 1 : -1) * (BALL_SPEED_INITIAL * 0.6),
    },
    paddles: {
      left: { y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
      right: { y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
    },
    score: { left: 0, right: 0 },
  };
}

function resetBall(gameState) {
  gameState.ball.x = CANVAS_WIDTH / 2;
  gameState.ball.y = CANVAS_HEIGHT / 2;
  gameState.ball.vx = (Math.random() > 0.5 ? 1 : -1) * BALL_SPEED_INITIAL;
  gameState.ball.vy = (Math.random() > 0.5 ? 1 : -1) * (BALL_SPEED_INITIAL * 0.6);
}

function tick(room) {
  const gs = room.gameState;
  const ball = gs.ball;

  // Move ball
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Top / bottom wall reflection
  if (ball.y - BALL_SIZE / 2 <= 0) {
    ball.y = BALL_SIZE / 2;
    ball.vy *= -1;
  } else if (ball.y + BALL_SIZE / 2 >= CANVAS_HEIGHT) {
    ball.y = CANVAS_HEIGHT - BALL_SIZE / 2;
    ball.vy *= -1;
  }

  // Left paddle collision
  const leftPaddleX = PADDLE_WIDTH;
  const leftPaddleY = gs.paddles.left.y;
  if (
    ball.vx < 0 &&
    ball.x - BALL_SIZE / 2 <= leftPaddleX + PADDLE_WIDTH &&
    ball.x - BALL_SIZE / 2 >= leftPaddleX &&
    ball.y + BALL_SIZE / 2 >= leftPaddleY &&
    ball.y - BALL_SIZE / 2 <= leftPaddleY + PADDLE_HEIGHT
  ) {
    ball.x = leftPaddleX + PADDLE_WIDTH + BALL_SIZE / 2;
    ball.vx *= -1.05;
    // Adjust vy based on hit position
    const hitPos = (ball.y - (leftPaddleY + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
    ball.vy = hitPos * Math.abs(ball.vx) * 0.8;
  }

  // Right paddle collision
  const rightPaddleX = CANVAS_WIDTH - PADDLE_WIDTH * 2;
  const rightPaddleY = gs.paddles.right.y;
  if (
    ball.vx > 0 &&
    ball.x + BALL_SIZE / 2 >= rightPaddleX &&
    ball.x + BALL_SIZE / 2 <= rightPaddleX + PADDLE_WIDTH &&
    ball.y + BALL_SIZE / 2 >= rightPaddleY &&
    ball.y - BALL_SIZE / 2 <= rightPaddleY + PADDLE_HEIGHT
  ) {
    ball.x = rightPaddleX - BALL_SIZE / 2;
    ball.vx *= -1.05;
    const hitPos = (ball.y - (rightPaddleY + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
    ball.vy = hitPos * Math.abs(ball.vx) * 0.8;
  }

  // Scoring
  let scored = null;
  if (ball.x + BALL_SIZE / 2 < 0) {
    gs.score.right += 1;
    scored = 'right';
    resetBall(gs);
  } else if (ball.x - BALL_SIZE / 2 > CANVAS_WIDTH) {
    gs.score.left += 1;
    scored = 'left';
    resetBall(gs);
  }

  // Check win condition
  let winner = null;
  if (gs.score.left >= WIN_SCORE) {
    winner = 'left';
  } else if (gs.score.right >= WIN_SCORE) {
    winner = 'right';
  }

  return { scored, winner };
}

const activeLoops = new Map();

function startGameLoop(room, io) {
  if (activeLoops.has(room.roomId)) {
    return;
  }

  room.gameState = createInitialGameState();
  room.status = 'playing';

  const intervalId = setInterval(() => {
    if (room.status !== 'playing') {
      stopGameLoop(room.roomId);
      return;
    }

    const { scored, winner } = tick(room);

    io.to(room.roomId).emit('game_state', {
      ball: room.gameState.ball,
      paddles: room.gameState.paddles,
      score: room.gameState.score,
    });

    if (scored) {
      io.to(room.roomId).emit('score_update', { score: room.gameState.score });
    }

    if (winner) {
      room.status = 'finished';
      const winnerPlayer = room.players.find((p) => p.side === winner);
      io.to(room.roomId).emit('game_over', {
        winner,
        winnerNickname: winnerPlayer ? winnerPlayer.nickname : winner,
      });
      stopGameLoop(room.roomId);
    }
  }, TICK_RATE);

  activeLoops.set(room.roomId, intervalId);
}

function stopGameLoop(roomId) {
  const intervalId = activeLoops.get(roomId);
  if (intervalId) {
    clearInterval(intervalId);
    activeLoops.delete(roomId);
  }
}

function updatePaddle(room, side, y) {
  if (!room.gameState) return;
  const clampedY = Math.max(0, Math.min(y, CANVAS_HEIGHT - PADDLE_HEIGHT));
  room.gameState.paddles[side].y = clampedY;
}

module.exports = {
  startGameLoop,
  stopGameLoop,
  updatePaddle,
  createInitialGameState,
};
