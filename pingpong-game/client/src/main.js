import * as THREE from 'three';
import Stats from 'stats.js';
import { SceneSetup } from './scene/SceneSetup.js';
import { Lighting } from './scene/Lighting.js';
import { Table } from './scene/Table.js';
import { Ball } from './scene/Ball.js';
import { Paddle } from './scene/Paddle.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { MouseInput } from './input/MouseInput.js';
import { SpinSystem } from './spin/SpinSystem.js';
import { SocketClient } from './network/SocketClient.js';
import { ScoreBoard } from './ui/ScoreBoard.js';
import { SpinIndicator } from './ui/SpinIndicator.js';
import { LobbyUI } from './ui/LobbyUI.js';
import { PostProcessing } from './effects/PostProcessing.js';
import {
  SERVE_HOLD_Y,
  TABLE_HALF_WIDTH,
  TABLE_INPUT_PADDING,
} from '../../shared/constants.js';

const GAME_STATES = Object.freeze({
  LOBBY: 'LOBBY',
  WAITING: 'WAITING',
  PLAYING: 'PLAYING',
  POINT: 'POINT',
  GAME_OVER: 'GAME_OVER',
});
const TABLE_LIMIT_X = TABLE_HALF_WIDTH - TABLE_INPUT_PADDING;
const INTERPOLATION_DELAY_MS = 100;
const BUFFER_RETENTION_MS = 1200;
const POINT_PAUSE_MS = 1500;
const SERVER_LERP_ALPHA = 0.3;
const SERVE_TOSS_TRIGGER_DY = 4;
const SERVE_HIT_TRIGGER_DY = 5;
const SERVE_TOSS_MS = 700;

const root = document.getElementById('game-root');
const sceneSetup = new SceneSetup(root);
const physicsWorld = new PhysicsWorld();

new Lighting(sceneSetup.scene);
const table = new Table(sceneSetup.scene, physicsWorld);
const ball = new Ball(sceneSetup.scene, physicsWorld);
const paddles = {
  left: new Paddle(sceneSetup.scene, physicsWorld, { side: 'left' }),
  right: new Paddle(sceneSetup.scene, physicsWorld, { side: 'right' }),
};

const postProcessing = new PostProcessing(sceneSetup.renderer, sceneSetup.scene, sceneSetup.camera);
const spinSystem = new SpinSystem();
const socketClient = new SocketClient();
const scoreBoard = new ScoreBoard(document.getElementById('score-board'));
const spinIndicator = new SpinIndicator(document.getElementById('spin-indicator'));
const lobbyUI = new LobbyUI(document.getElementById('lobby-panel'));
const centerOverlay = createCenterOverlay();
let particlePool;
const stats = createStatsPanel();
const clock = new THREE.Clock();

let gameState = GAME_STATES.LOBBY;
let mySide = 'left';
let myPlayerNumber = 1;
let roomId = null;
let latestServerState = null;
let latestRenderedState = null;
let pointResumeAt = 0;
let serveAnimation = null;
const serverStateBuffer = [];
const scoreModel = {
  players: [],
  score: { left: 0, right: 0 },
  servingPlayer: null,
  status: '로비에서 방을 만들거나 입장하세요.',
};

const input = new MouseInput(sceneSetup.renderer.domElement, {
  camera: sceneSetup.camera,
  getActivePaddle: () => paddles[mySide],
  getBall: () => ball,
  getSide: () => mySide,
});

scoreBoard.update(scoreModel);
spinIndicator.reset();

lobbyUI.onCreateRoom(({ nickname }) => {
  setGameState(GAME_STATES.WAITING, '방을 생성하는 중입니다...');
  socketClient.createRoom({ nickname });
});

lobbyUI.onJoinRoom(({ nickname, roomCode }) => {
  setGameState(GAME_STATES.WAITING, '방에 입장하는 중입니다...');
  socketClient.joinRoom({ nickname, roomCode });
});

socketClient.on('connect', () => {
  if (gameState === GAME_STATES.LOBBY) {
    scoreModel.status = '서버에 연결되었습니다.';
  }
});

socketClient.on('disconnect', () => {
  resetNetworkState();
  setGameState(GAME_STATES.LOBBY, '서버 연결이 끊겼습니다.');
  lobbyUI.showMessage('서버 연결이 끊겼습니다. 서버를 확인해주세요.');
});

socketClient.on('room-created', ({ roomCode }) => {
  roomId = roomCode;
  myPlayerNumber = 1;
  mySide = 'left';
  sceneSetup.setCameraForSide(mySide);
  setGameState(GAME_STATES.WAITING, `방 코드 ${roomCode} · 상대를 기다리는 중...`);
  lobbyUI.showMessage(`방 코드 ${roomCode} · 상대를 기다리는 중...`);
});

socketClient.on('room-joined', (payload = {}) => {
  roomId = payload.roomCode || roomId;
  myPlayerNumber = payload.playerNumber || myPlayerNumber;
  mySide = playerNumberToSide(myPlayerNumber);
  sceneSetup.setCameraForSide(mySide);
  scoreModel.players = normalizePlayers(payload.room?.players || []);
  scoreModel.status = scoreModel.players.length < 2
    ? `방 코드 ${roomId} · 상대를 기다리는 중...`
    : '상대가 입장했습니다. 게임을 준비 중입니다...';
  lobbyUI.showRoomInfo(roomId, scoreModel.players);
  socketClient.sendReady();
});

socketClient.on('game-start', (payload = {}) => {
  resetInterpolationBuffer();
  pushServerState(payload.gameState);
  latestServerState = payload.gameState || null;
  setGameState(GAME_STATES.PLAYING, formatGameStatus(payload.gameState));
});

socketClient.on('game-state', (payload) => {
  pushServerState(payload);
});

socketClient.on('point-scored', (payload = {}) => {
  const scorerNumber = normalizePlayerNumber(payload.scorerPlayerNumber ?? payload.scorer);
  const reasonText = reasonToText(payload.reason);
  const scoredText = scorerNumber === myPlayerNumber ? 'YOU SCORED!' : 'OPPONENT SCORED!';
  scoreModel.score = scoreToUi(payload.score);
  scoreModel.servingPlayer = payload.nextServingPlayer ?? latestServerState?.servingPlayer ?? scoreModel.servingPlayer;
  pointResumeAt = performance.now() + POINT_PAUSE_MS;
  setGameState(GAME_STATES.POINT, `${scoredText} · ${reasonText}`);
  showCenterMessage(scoredText, createPointSubText(payload, reasonText), POINT_PAUSE_MS);
});

socketClient.on('let', (payload = {}) => {
  scoreModel.servingPlayer = payload.servingPlayer ?? scoreModel.servingPlayer;
  pointResumeAt = performance.now() + POINT_PAUSE_MS;
  setGameState(GAME_STATES.POINT, 'LET! 레트 · 다시 서브');
  showCenterMessage('LET!', payload.message || '레트! 다시 서브', POINT_PAUSE_MS);
});

socketClient.on('game-over', (payload = {}) => {
  const winnerNumber = normalizePlayerNumber(payload.winnerPlayerNumber ?? payload.winner);
  const resultText = winnerNumber === myPlayerNumber ? 'YOU WIN!' : 'YOU LOSE';
  scoreModel.score = scoreToUi(payload.score || scoreModel.score);
  setGameState(GAME_STATES.GAME_OVER, `${resultText} · 최종 점수 ${scoreModel.score.left} : ${scoreModel.score.right}`);
  centerOverlay.showGameOver(resultText, `최종 점수 ${scoreModel.score.left} : ${scoreModel.score.right}`);
  lobbyUI.showMessage('게임이 종료되었습니다. 리매치 또는 로비로 돌아가세요.');
});

socketClient.on('opponent-disconnected', () => {
  resetNetworkState();
  setGameState(GAME_STATES.WAITING, '상대가 나갔습니다.');
  lobbyUI.showMessage('상대가 나갔습니다. 새 방을 만들거나 다시 입장해주세요.');
});

socketClient.on('room-error', ({ message }) => {
  setGameState(GAME_STATES.LOBBY, message || '방 입장에 실패했습니다.');
  lobbyUI.showMessage(message || '방 입장에 실패했습니다.');
});

function animate() {
  stats?.begin();
  requestAnimationFrame(animate);

  const now = performance.now();
  const delta = Math.min(clock.getDelta(), 1 / 30);

  // 1. MouseInput.update() - collect the latest local paddle and swing intent.
  const inputFrame = input.update();
  processLocalInput(inputFrame, delta, now);

  // 2. Server authority: keep local physics dormant and move only local paddle prediction.

  // 3. SpinSystem.update() - keep spin UI state alive briefly after impact.
  const activeSpin = spinSystem.update(delta, now);

  // 4. SocketClient.sendInput() - flush the newest input at 60fps.
  socketClient.sendInput(now);

  // 5. Smooth server authority state using a 100ms delayed buffer.
  latestRenderedState = getInterpolatedServerState(now);
  applyServerState(latestRenderedState, now);
  ball.updateShadow();

  // 6. ScoreBoard.update() - state-machine aware HUD text.
  refreshStateMachine(now);
  scoreBoard.update(scoreModel);

  // 7. SpinIndicator.update() - show the current spin classification.
  spinIndicator.update(activeSpin);

  table.update(delta);
  particlePool.update(delta);

  // 8. PostProcessing.render() - final render pass with bloom/afterimage.
  postProcessing.render(delta);
  stats?.end();
}

function processLocalInput(frame, delta, now) {
  const canControl = gameState === GAME_STATES.PLAYING;
  const paddle = paddles[mySide];

  if (canControl) {
    if (frame.worldPosition) {
      paddle.setTargetPosition(frame.worldPosition.x, frame.worldPosition.z);
    } else {
      const fallbackX = THREE.MathUtils.clamp(frame.normalizedX * TABLE_LIMIT_X, -TABLE_LIMIT_X, TABLE_LIMIT_X);
      paddle.setTargetX(fallbackX);
    }
  }

  paddles.left.update(delta);
  paddles.right.update(delta);

  const inputPayload = {
    paddlePosition: {
      x: paddle.group.position.x,
      z: paddle.group.position.z,
    },
  };

  if (canControl && frame.hitSwing) {
    const serveSwing = createServeSwing(frame, now);
    const swing = serveSwing || (!isMyServePhase() ? frame.hitSwing : null);
    const spin = maybeApplySwing(swing, now);
    if (spin) {
      inputPayload.type = serveSwing ? 'serve-hit' : 'hit';
      inputPayload.swingVector = toSwingVector(swing);
      inputPayload.spinData = toSpinData(spin);
    }
  } else if (canControl) {
    const serveSwing = createServeSwing(frame, now);
    if (serveSwing) {
      const spin = maybeApplySwing(serveSwing, now);
      if (spin) {
        inputPayload.type = 'serve-hit';
        inputPayload.swingVector = toSwingVector(serveSwing);
        inputPayload.spinData = toSpinData(spin);
      }
    }
  }

  socketClient.setInput(inputPayload);
}

function maybeApplySwing(swing, now) {
  if (!swing) return null;

  const isServePhase = latestServerState?.phase === 'serve';
  const isMyServe = latestServerState?.servingPlayer === myPlayerNumber;

  if (isServePhase) {
    if (!isMyServe) return null;

    const spin = spinSystem.calculateSpin(swing);
    spinSystem.setActiveSpin(spin, now);
    particlePool.burst(ball.mesh.position, spin);
    return spin;
  }

  const spin = spinSystem.calculateSpin(swing);
  spinSystem.setActiveSpin(spin, now);
  if (!spin) return null;

  particlePool.burst(ball.mesh.position, spin);
  return spin;
}

function createServeSwing(frame, now) {
  if (!isMyServePhase()) return null;

  if (!serveAnimation && frame.swing.avgDy > SERVE_TOSS_TRIGGER_DY) {
    startServeAnimation(now);
    return null;
  }

  const tossElapsed = serveAnimation ? now - serveAnimation.startedAt : 0;
  if (
    serveAnimation
    && tossElapsed > 160
    && frame.swing.avgDy < -SERVE_HIT_TRIGGER_DY
    && frame.swing.magnitude > 5
  ) {
    return {
      ...frame.swing,
      avgDy: -Math.abs(frame.swing.avgDy),
      magnitude: Math.max(frame.swing.magnitude, Math.abs(frame.swing.avgDy)),
      timestamp: frame.timestamp,
    };
  }

  return null;
}

function isMyServePhase() {
  return latestServerState?.phase === 'serve'
    && latestServerState?.servingPlayer === myPlayerNumber;
}

function applyServerState(state, now) {
  if (!state) return;

  scoreModel.score = scoreToUi(state.score);
  scoreModel.servingPlayer = state.servingPlayer ?? scoreModel.servingPlayer;
  syncRemotePaddles(state);

  if (state.phase === 'serve') {
    updateServeBall(state, now);
  } else if (state.ball) {
    serveAnimation = null;
    ball.setFromState(state.ball, SERVER_LERP_ALPHA);
  }

  if (gameState === GAME_STATES.PLAYING) {
    scoreModel.status = formatGameStatus(state);
  }
}

function syncRemotePaddles(state) {
  if (state.player1Paddle && myPlayerNumber !== 1) {
    paddles.left.setFromState(state.player1Paddle, 0.3);
  }
  if (state.player2Paddle && myPlayerNumber !== 2) {
    paddles.right.setFromState(state.player2Paddle, 0.3);
  }
}

function updateServeBall(state, now) {
  const servingSide = playerNumberToSide(state.servingPlayer);
  const servingPaddle = paddles[servingSide];
  const basePosition = state.ball?.position || {};
  const isMyServe = state.servingPlayer === myPlayerNumber;
  const serveZ = Number.isFinite(Number(basePosition.z)) ? Number(basePosition.z) : (state.servingPlayer === 1
    ? 1.28
    : -1.28);
  let tossY = 0;

  if (serveAnimation && serveAnimation.playerNumber === state.servingPlayer) {
    const progress = THREE.MathUtils.clamp((now - serveAnimation.startedAt) / SERVE_TOSS_MS, 0, 1);
    tossY = Math.sin(progress * Math.PI) * 0.45;
    if (progress >= 1) serveAnimation = null;
  }

  if (isMyServe && servingPaddle && !serveAnimation) {
    ball.body.position.set(
      servingPaddle.group.position.x,
      servingPaddle.group.position.y + 0.15,
      serveZ,
    );
  } else {
    ball.body.position.set(
      servingPaddle?.group.position.x ?? basePosition.x ?? 0,
      SERVE_HOLD_Y + tossY,
      serveZ,
    );
  }
  ball.body.velocity.set(0, 0, 0);
  ball.body.angularVelocity.set(0, 0, 0);
  ball.updateFromPhysics();
}

function startServeAnimation(now) {
  serveAnimation = {
    playerNumber: myPlayerNumber,
    startedAt: now,
  };
}

function refreshStateMachine(now) {
  if (gameState === GAME_STATES.POINT && now >= pointResumeAt) {
    setGameState(GAME_STATES.PLAYING, formatGameStatus(latestServerState));
  }
}

function setGameState(nextState, status = scoreModel.status) {
  const previousState = gameState;
  gameState = nextState;
  scoreModel.status = status;

  if (previousState === nextState) return;

  if (nextState === GAME_STATES.PLAYING || nextState === GAME_STATES.POINT) {
    lobbyUI.hide();
    return;
  }

  lobbyUI.show();
}

function pushServerState(state) {
  if (!state) return;

  const receivedAt = performance.now();
  latestServerState = state;
  serverStateBuffer.push({ ...state, receivedAt });

  const cutoff = receivedAt - BUFFER_RETENTION_MS;
  while (serverStateBuffer.length > 2 && serverStateBuffer[0].receivedAt < cutoff) {
    serverStateBuffer.shift();
  }
}

function getInterpolatedServerState(now) {
  if (serverStateBuffer.length === 0) return null;

  const renderTime = now - INTERPOLATION_DELAY_MS;
  if (renderTime <= serverStateBuffer[0].receivedAt) return serverStateBuffer[0];

  for (let index = 0; index < serverStateBuffer.length - 1; index++) {
    const previous = serverStateBuffer[index];
    const next = serverStateBuffer[index + 1];
    if (renderTime >= previous.receivedAt && renderTime <= next.receivedAt) {
      const alpha = (renderTime - previous.receivedAt) / Math.max(next.receivedAt - previous.receivedAt, 1);
      return interpolateGameState(previous, next, alpha);
    }
  }

  return serverStateBuffer[serverStateBuffer.length - 1];
}

function interpolateGameState(previous, next, alpha) {
  return {
    ...next,
    ball: interpolateBody(previous.ball, next.ball, alpha),
    player1Paddle: interpolatePaddle(previous.player1Paddle, next.player1Paddle, alpha),
    player2Paddle: interpolatePaddle(previous.player2Paddle, next.player2Paddle, alpha),
  };
}

function interpolateBody(previous = {}, next = {}, alpha) {
  return {
    position: interpolateVector(previous.position, next.position, alpha),
    velocity: interpolateVector(previous.velocity, next.velocity, alpha),
    angularVelocity: interpolateVector(previous.angularVelocity, next.angularVelocity, alpha),
  };
}

function interpolatePaddle(previous = {}, next = {}, alpha) {
  return {
    position: interpolateVector(previous.position, next.position, alpha),
  };
}

function interpolateVector(previous = {}, next = {}, alpha) {
  return {
    x: lerpNumber(previous.x, next.x, alpha),
    y: lerpNumber(previous.y, next.y, alpha),
    z: lerpNumber(previous.z, next.z, alpha),
  };
}

function lerpNumber(previous, next, alpha) {
  const start = Number.isFinite(Number(previous)) ? Number(previous) : Number(next || 0);
  const end = Number.isFinite(Number(next)) ? Number(next) : start;
  return THREE.MathUtils.lerp(start, end, alpha);
}

function formatGameStatus(state) {
  if (!state) return roomId ? `방 코드 ${roomId}` : '게임 정보를 기다리는 중...';
  if (state.isDeuce) return 'DEUCE!';
  if (state.isMatchPoint) {
    return state.matchPointPlayer === myPlayerNumber ? '매치 포인트!' : '상대 매치 포인트!';
  }
  if (state.isGamePoint) {
    return state.gamePointPlayer === myPlayerNumber ? '게임 포인트!' : '상대 게임 포인트!';
  }
  if (state.phase === 'let') return 'LET! 레트 · 다시 서브';
  if (state.phase === 'point') return decisionToStatus(state.lastDecision);
  if (state.phase === 'serve') {
    return state.servingPlayer === myPlayerNumber
      ? '내 서브 대기 중 · 마우스를 위로 올려 토스 후 내려치세요.'
      : `${playerName(state.servingPlayer)} 서브 대기 중...`;
  }
  if (state.phase === 'finished') return '게임 종료';
  if (state.ballState?.isServing) return '서브 진행 중';
  return '랠리 중';
}

function toSwingVector(swing) {
  return {
    dx: Number(swing.avgDx || 0),
    dy: Number(swing.avgDy || 0),
    magnitude: Number(swing.magnitude || 0),
  };
}

function toSpinData(spin) {
  return {
    torqueX: Number(spin.torque?.x || 0),
    torqueZ: Number(spin.torque?.z || 0),
    spinLevel: Number(spin.spinLevel || 0),
  };
}

function playerNumberToSide(playerNumber) {
  return playerNumber === 2 ? 'right' : 'left';
}

function normalizePlayers(players) {
  return players.map((player) => ({
    nickname: player.nickname || `Player ${player.playerNumber}`,
    side: playerNumberToSide(player.playerNumber),
    playerNumber: player.playerNumber,
  }));
}

function scoreToUi(score = {}) {
  return {
    left: score.p1 ?? score.left ?? 0,
    right: score.p2 ?? score.right ?? 0,
  };
}

function resetInterpolationBuffer() {
  serverStateBuffer.length = 0;
  latestRenderedState = null;
  latestServerState = null;
}

function resetNetworkState() {
  resetInterpolationBuffer();
  serveAnimation = null;
  roomId = null;
}

function normalizePlayerNumber(value) {
  if (value === 1 || value === '1' || value === 'player1') return 1;
  if (value === 2 || value === '2' || value === 'player2') return 2;
  return null;
}

function playerName(playerNumber) {
  const side = playerNumberToSide(playerNumber);
  return scoreModel.players.find((player) => player.side === side)?.nickname || `Player${playerNumber}`;
}

function reasonToText(reason) {
  const labels = {
    out: 'OUT!',
    net: 'NET!',
    'serve-fault': '서브 실패!',
    'double-bounce': '더블 바운스!',
    let: 'LET!',
  };
  return labels[reason] || 'POINT!';
}

function createPointSubText(payload, reasonText) {
  if (payload.isDeuce) return `${reasonText} · DEUCE!`;
  if (payload.matchPointPlayer) return `${reasonText} · 매치 포인트!`;
  if (payload.gamePointPlayer) return `${reasonText} · 게임 포인트!`;
  return reasonText;
}

function decisionToStatus(decision) {
  if (!decision) return '득점 후 서브 준비 중...';
  if (decision.reason === 'let') return 'LET! 다시 서브';
  const scorerNumber = normalizePlayerNumber(decision.scorerPlayerNumber ?? decision.scorer);
  const scoredText = scorerNumber === myPlayerNumber ? 'YOU SCORED!' : 'OPPONENT SCORED!';
  return `${scoredText} · ${reasonToText(decision.reason)}`;
}

function showCenterMessage(title, subtitle = '', duration = 1200) {
  centerOverlay.showMessage(title, subtitle, duration);
}

function createCenterOverlay() {
  const rootElement = document.createElement('div');
  rootElement.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 18;
    display: none;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    min-width: min(460px, calc(100vw - 40px));
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 24px;
    padding: 28px 34px;
    text-align: center;
    background: rgba(4, 10, 18, 0.78);
    box-shadow: 0 24px 100px rgba(0,0,0,0.45);
    backdrop-filter: blur(18px);
    transform: scale(0.96);
    opacity: 0;
    transition: opacity 180ms ease, transform 180ms ease;
  `;
  rootElement.appendChild(panel);
  document.body.appendChild(rootElement);

  let timer = null;

  function render(title, subtitle, buttons = '') {
    panel.innerHTML = `
      <div style="font-size:clamp(2.2rem,7vw,4.8rem);font-weight:1000;letter-spacing:-0.06em;">${title}</div>
      <div style="margin-top:8px;color:#b9cbe0;font-size:1.08rem;font-weight:800;">${subtitle}</div>
      ${buttons}
    `;
  }

  function show() {
    rootElement.style.display = 'flex';
    requestAnimationFrame(() => {
      panel.style.opacity = '1';
      panel.style.transform = 'scale(1)';
    });
  }

  function hide() {
    panel.style.opacity = '0';
    panel.style.transform = 'scale(0.96)';
    window.setTimeout(() => {
      rootElement.style.display = 'none';
      rootElement.style.pointerEvents = 'none';
    }, 190);
  }

  return {
    showMessage(title, subtitle = '', duration = 1200) {
      window.clearTimeout(timer);
      rootElement.style.pointerEvents = 'none';
      render(title, subtitle);
      show();
      timer = window.setTimeout(hide, duration);
    },
    showGameOver(title, subtitle = '') {
      window.clearTimeout(timer);
      rootElement.style.pointerEvents = 'auto';
      render(title, subtitle, `
        <div style="display:flex;gap:10px;justify-content:center;margin-top:22px;">
          <button id="rematch-button" style="border:0;border-radius:12px;padding:12px 16px;background:#8ef06d;color:#071019;font-weight:900;cursor:pointer;">리매치</button>
          <button id="lobby-button" style="border:0;border-radius:12px;padding:12px 16px;background:#6dd9ff;color:#071019;font-weight:900;cursor:pointer;">로비로 나가기</button>
        </div>
      `);
      show();
      panel.querySelector('#rematch-button')?.addEventListener('click', () => window.location.reload());
      panel.querySelector('#lobby-button')?.addEventListener('click', () => window.location.reload());
    },
  };
}

function createStatsPanel() {
  if (!import.meta.env.DEV) return null;

  const panel = new Stats();
  panel.showPanel(0);
  panel.dom.style.left = '12px';
  panel.dom.style.top = 'auto';
  panel.dom.style.bottom = '12px';
  panel.dom.style.zIndex = '30';
  document.body.appendChild(panel.dom);
  return panel;
}

class ParticlePool {
  constructor(scene, size = 72) {
    this.index = 0;
    this.particles = [];
    this.geometry = new THREE.SphereGeometry(0.012, 8, 8);

    for (let i = 0; i < size; i++) {
      const mesh = new THREE.Mesh(
        this.geometry,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
      });
    }
  }

  burst(position, spin) {
    const count = 5 + Math.max(spin?.spinLevel || 0, 1) * 5;
    const color = this.getColor(spin?.type || 'none');

    for (let i = 0; i < count; i++) {
      const particle = this.nextParticle();
      particle.mesh.position.copy(position);
      particle.mesh.material.color.set(color);
      particle.mesh.material.opacity = 0.9;
      particle.mesh.visible = true;
      particle.velocity.set(
        (Math.random() - 0.5) * 0.6,
        0.25 + Math.random() * 0.45,
        (Math.random() - 0.5) * 0.6,
      );
      particle.life = 0.42 + Math.random() * 0.18;
      particle.maxLife = particle.life;
    }
  }

  update(delta) {
    for (const particle of this.particles) {
      if (!particle.mesh.visible) continue;

      particle.life -= delta;
      if (particle.life <= 0) {
        particle.mesh.visible = false;
        particle.mesh.material.opacity = 0;
        continue;
      }

      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.velocity.y -= delta * 0.9;
      particle.mesh.material.opacity = Math.max(particle.life / particle.maxLife, 0);
    }
  }

  nextParticle() {
    const particle = this.particles[this.index];
    this.index = (this.index + 1) % this.particles.length;
    return particle;
  }

  getColor(type) {
    if (type.includes('topspin')) return '#9fffbf';
    if (type.includes('backspin')) return '#6dd9ff';
    if (type.includes('side')) return '#ffcf6d';
    return '#ffffff';
  }
}

particlePool = new ParticlePool(sceneSetup.scene);
animate();
