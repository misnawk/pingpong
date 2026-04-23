import {
  OPPONENT_PADDLE_MAX_Z,
  OPPONENT_PADDLE_MIN_Z,
  OPPONENT_PADDLE_Z,
  PADDLE_COLLISION_Y,
  PLAYER_PADDLE_MAX_Z,
  PLAYER_PADDLE_MIN_Z,
  PLAYER_PADDLE_Z,
  SERVE_HOLD_Y,
  SERVE_START_Z,
  TABLE_HALF_WIDTH,
  TABLE_INPUT_PADDING,
} from '../../shared/constants.js';

const WIN_SCORE = 11;
const WIN_MARGIN = 2;
const POINT_PAUSE_MS = 1500;
const PADDLE_Z = {
  1: PLAYER_PADDLE_Z,
  2: OPPONENT_PADDLE_Z,
};

export class GameState {
  constructor(roomCode, { matchBestOf = 1, gameNumber = 1 } = {}) {
    this.roomCode = roomCode;
    this.matchBestOf = matchBestOf;
    this.gameNumber = gameNumber;
    this.games = { p1: 0, p2: 0 };
    this.score = { p1: 0, p2: 0 };
    this.firstServer = Math.random() < 0.5 ? 1 : 2;
    this.servingPlayer = this.getOpeningServer();
    this.phase = 'serve';
    this.winner = null;
    this.matchWinner = null;
    this.totalPoints = 0;
    this.lastPoint = null;
    this.lastLet = null;
    this.lastDecision = null;
    this.lastHitPlayer = null;
    this.lastNetHitBy = null;
    this.pauseUntil = 0;
    this.playerInputs = new Map();
    this.hitCooldowns = new Map();
    this.player1Paddle = this.createPaddle(1);
    this.player2Paddle = this.createPaddle(2);
    this.ballState = this.createBallState({ isServing: true, server: this.servingPlayer });
    this.ball = this.createServeBall(this.servingPlayer);
  }

  applyInput(playerNumber, input = {}) {
    const paddle = this.getPaddle(playerNumber);
    if (!paddle) return null;

    const position = input.paddlePosition || {};
    const clamped = this.clampPaddlePosition(playerNumber, position);
    paddle.position.x = clamped.x;
    paddle.position.z = clamped.z;
    paddle.timestamp = input.timestamp || Date.now();

    this.playerInputs.set(playerNumber, {
      type: input.type || 'move',
      paddlePosition: clamped,
      swingVector: this.normalizeSwingVector(input.swingVector),
      spinData: this.normalizeSpinData(input.spinData),
      timestamp: paddle.timestamp,
    });

    if (this.phase === 'serve' && this.servingPlayer === playerNumber) {
      this.ball.position.x = clamped.x;
      this.ball.position.z = this.getServeZ(playerNumber);
    }

    return this.playerInputs.get(playerNumber);
  }

  consumeInput(playerNumber) {
    return this.playerInputs.get(playerNumber) || null;
  }

  markHit(playerNumber) {
    this.lastHitPlayer = playerNumber;
    this.lastNetHitBy = null;
    this.hitCooldowns.set(playerNumber, Date.now());

    this.ballState = this.createBallState({
      isServing: this.phase === 'serve',
      server: this.phase === 'serve' ? playerNumber : null,
      lastHitBy: playerLabel(playerNumber),
    });
    this.phase = 'rally';
  }

  markCrossedNet() {
    this.ballState.crossedNet = true;
    if (this.ballState.isServing && this.ballState.serveStep === 1) {
      this.ballState.serveStep = 2;
    }
  }

  markNetTouch() {
    const lastHit = this.getLastHitPlayerNumber();
    this.lastNetHitBy = lastHit;
    this.ballState.lastBounceZone = 'net';
    this.ballState.touchedNet = true;
    this.ballState.netHitBy = lastHit ? playerLabel(lastHit) : null;
  }

  canHit(playerNumber, timestamp = Date.now()) {
    if (this.phase !== 'serve' && this.phase !== 'rally') return false;
    return timestamp - (this.hitCooldowns.get(playerNumber) || 0) >= 300;
  }

  scorePoint(scorer, reason = 'out') {
    if (this.winner) return null;

    const key = scorer === 1 ? 'p1' : 'p2';
    this.score[key] += 1;
    this.totalPoints += 1;

    const point = {
      scorer: playerLabel(scorer),
      scorerPlayerNumber: scorer,
      reason,
      score: { ...this.score },
      isDeuce: this.isDeuce(),
      gamePointPlayer: this.getGamePointPlayer(),
      matchPointPlayer: this.getMatchPointPlayer(),
    };

    if (this.hasWinner(scorer)) {
      this.winner = scorer;
      this.matchWinner = scorer;
      this.phase = 'finished';
      this.lastPoint = {
        ...point,
        gameOver: true,
        winner: playerLabel(scorer),
        winnerPlayerNumber: scorer,
      };
      this.lastDecision = this.lastPoint;
      return this.lastPoint;
    }

    this.servingPlayer = this.getServerForNextPoint();
    this.phase = 'point';
    this.pauseUntil = Date.now() + POINT_PAUSE_MS;
    this.lastHitPlayer = null;
    this.lastNetHitBy = null;
    this.ballState.isServing = false;
    this.lastPoint = {
      ...point,
      nextServer: playerLabel(this.servingPlayer),
      nextServingPlayer: this.servingPlayer,
    };
    this.lastDecision = this.lastPoint;
    return this.lastPoint;
  }

  markLet(reason = 'let') {
    this.phase = 'let';
    this.pauseUntil = Date.now() + POINT_PAUSE_MS;
    this.lastLet = {
      reason,
      server: playerLabel(this.servingPlayer),
      servingPlayer: this.servingPlayer,
      message: '레트! 다시 서브',
      score: { ...this.score },
    };
    this.lastDecision = this.lastLet;
    this.lastHitPlayer = null;
    this.lastNetHitBy = null;
    this.ballState.isServing = false;
    return this.lastLet;
  }

  resumeServeIfReady(now = Date.now()) {
    if (this.phase !== 'point' && this.phase !== 'let') return false;
    if (now < this.pauseUntil) return false;

    this.phase = 'serve';
    this.ballState = this.createBallState({ isServing: true, server: this.servingPlayer });
    this.ball = this.createServeBall(this.servingPlayer);
    return true;
  }

  consumeLastPoint() {
    const point = this.lastPoint;
    this.lastPoint = null;
    return point;
  }

  consumeLastLet() {
    const letDecision = this.lastLet;
    this.lastLet = null;
    return letDecision;
  }

  hasWinner(playerNumber) {
    const own = playerNumber === 1 ? this.score.p1 : this.score.p2;
    const opponent = playerNumber === 1 ? this.score.p2 : this.score.p1;
    return own >= WIN_SCORE && own - opponent >= WIN_MARGIN;
  }

  isDeuce() {
    return this.score.p1 >= WIN_SCORE - 1
      && this.score.p2 >= WIN_SCORE - 1
      && Math.abs(this.score.p1 - this.score.p2) < WIN_MARGIN;
  }

  isDeuceServeMode() {
    return this.score.p1 >= WIN_SCORE - 1 && this.score.p2 >= WIN_SCORE - 1;
  }

  getGamePointPlayer() {
    if (this.isDeuce()) return null;
    if (this.score.p1 >= WIN_SCORE - 1 && this.score.p1 >= this.score.p2) return 1;
    if (this.score.p2 >= WIN_SCORE - 1 && this.score.p2 >= this.score.p1) return 2;
    return null;
  }

  getMatchPointPlayer() {
    return this.matchBestOf === 1 ? this.getGamePointPlayer() : null;
  }

  getServerForNextPoint() {
    if (this.isDeuceServeMode()) {
      const pointsAfterDeuce = Math.max(this.totalPoints - (WIN_SCORE - 1) * 2, 0);
      return pointsAfterDeuce % 2 === 0 ? this.firstServer : this.getOpponent(this.firstServer);
    }

    const block = Math.floor(this.totalPoints / 2);
    return block % 2 === 0 ? this.firstServer : this.getOpponent(this.firstServer);
  }

  getOpeningServer() {
    return this.gameNumber % 2 === 1 ? this.firstServer : this.getOpponent(this.firstServer);
  }

  getPaddle(playerNumber) {
    if (playerNumber === 1) return this.player1Paddle;
    if (playerNumber === 2) return this.player2Paddle;
    return null;
  }

  getOpponent(playerNumber) {
    return playerNumber === 1 ? 2 : 1;
  }

  getLastHitPlayerNumber() {
    if (this.ballState.lastHitBy === 'player1') return 1;
    if (this.ballState.lastHitBy === 'player2') return 2;
    return this.lastHitPlayer;
  }

  isOwnCourt(playerNumber, z) {
    return playerNumber === 1 ? z > 0 : z < 0;
  }

  createPaddle(playerNumber) {
    return {
      position: {
        x: 0,
        y: PADDLE_COLLISION_Y,
        z: PADDLE_Z[playerNumber],
      },
      timestamp: Date.now(),
    };
  }

  createServeBall(playerNumber) {
    const paddle = this.getPaddle(playerNumber) || this.createPaddle(playerNumber);
    return {
      position: {
        x: paddle.position.x,
        y: SERVE_HOLD_Y,
        z: this.getServeZ(playerNumber),
      },
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    };
  }

  createBallState({ isServing = false, server = null, lastHitBy = null } = {}) {
    return {
      lastBounceZone: null,
      bounceCount: 0,
      lastHitBy,
      crossedNet: false,
      isServing,
      serveStep: 0,
      server,
      touchedNet: false,
      netHitBy: null,
    };
  }

  getServeZ(playerNumber) {
    return playerNumber === 1 ? SERVE_START_Z : -SERVE_START_Z;
  }

  clampPaddlePosition(playerNumber, position) {
    const zBounds = playerNumber === 1
      ? { min: PLAYER_PADDLE_MIN_Z, max: PLAYER_PADDLE_MAX_Z }
      : { min: OPPONENT_PADDLE_MIN_Z, max: OPPONENT_PADDLE_MAX_Z };

    return {
      x: clampNumber(position.x, -TABLE_HALF_WIDTH + TABLE_INPUT_PADDING, TABLE_HALF_WIDTH - TABLE_INPUT_PADDING, 0),
      y: PADDLE_COLLISION_Y,
      z: clampNumber(position.z, zBounds.min, zBounds.max, PADDLE_Z[playerNumber]),
    };
  }

  normalizeSwingVector(swingVector = {}) {
    return {
      dx: Number(swingVector.dx || 0),
      dy: Number(swingVector.dy || 0),
      magnitude: Number(swingVector.magnitude || 0),
    };
  }

  normalizeSpinData(spinData = {}) {
    return {
      torqueX: Number(spinData.torqueX || 0),
      torqueZ: Number(spinData.torqueZ || 0),
      spinLevel: Number(spinData.spinLevel || 0),
    };
  }

  snapshot(timestamp = Date.now()) {
    return {
      ball: cloneBodyState(this.ball),
      player1Paddle: clonePaddleState(this.player1Paddle),
      player2Paddle: clonePaddleState(this.player2Paddle),
      score: { ...this.score },
      games: { ...this.games },
      servingPlayer: this.servingPlayer,
      servingPlayerLabel: playerLabel(this.servingPlayer),
      phase: this.phase,
      winner: this.winner ? playerLabel(this.winner) : null,
      winnerPlayerNumber: this.winner,
      matchWinner: this.matchWinner ? playerLabel(this.matchWinner) : null,
      matchWinnerPlayerNumber: this.matchWinner,
      isDeuce: this.isDeuce(),
      isGamePoint: Boolean(this.getGamePointPlayer()),
      gamePointPlayer: this.getGamePointPlayer(),
      isMatchPoint: Boolean(this.getMatchPointPlayer()),
      matchPointPlayer: this.getMatchPointPlayer(),
      pauseUntil: this.pauseUntil,
      ballState: { ...this.ballState },
      lastDecision: this.lastDecision,
      timestamp,
    };
  }
}

function playerLabel(playerNumber) {
  return playerNumber === 1 ? 'player1' : 'player2';
}

function cloneBodyState(body) {
  return {
    position: { ...body.position },
    velocity: { ...body.velocity },
    angularVelocity: { ...body.angularVelocity },
  };
}

function clonePaddleState(paddle) {
  return {
    position: { ...paddle.position },
  };
}

function clampNumber(value, min, max, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(min, Math.min(max, numericValue));
}
