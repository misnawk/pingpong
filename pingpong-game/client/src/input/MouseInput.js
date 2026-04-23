import * as THREE from 'three';
import {
  OPPONENT_PADDLE_MAX_Z,
  OPPONENT_PADDLE_MIN_Z,
  PLAYER_PADDLE_MAX_Z,
  PLAYER_PADDLE_MIN_Z,
  TABLE_HALF_WIDTH,
  TABLE_INPUT_PADDING,
} from '../../../shared/constants.js';

const MAX_HISTORY_FRAMES = 8;
const HISTORY_TTL_MS = 100;
const MIN_HIT_MAGNITUDE = 5;
const HIT_COOLDOWN_MS = 300;
const HIT_DISTANCE = 0.48;

export class MouseInput {
  constructor(element, options = {}) {
    this.element = element;
    this.camera = options.camera || null;
    this.getActivePaddle = options.getActivePaddle || (() => null);
    this.getBall = options.getBall || (() => null);
    this.getSide = options.getSide || (() => 'left');
    this.handlers = {
      move: new Set(),
      swing: new Set(),
      serve: new Set(),
    };
    this.swingHistory = [];
    this.previousMouse = null;
    this.lastHitAt = 0;
    this.currentFrame = {
      normalizedX: 0,
      normalizedY: 0,
      worldPosition: null,
      swing: this.createEmptySwing(),
      timestamp: performance.now(),
    };
    this.pendingSwing = null;
    this.pendingServe = false;
    element.addEventListener('mousemove', (event) => this.handleMouseMove(event));
    element.addEventListener('click', () => this.requestServe());
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        this.requestServe();
      }
    });
  }

  onMove(handler) {
    this.handlers.move.add(handler);
  }

  onSwing(handler) {
    this.handlers.swing.add(handler);
  }

  onServe(handler) {
    this.handlers.serve.add(handler);
  }

  handleMouseMove(event) {
    const timestamp = performance.now();
    const rect = this.element.getBoundingClientRect();
    const normalizedX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const normalizedY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    const worldPosition = this.getWorldPositionFromMouse(normalizedX, normalizedY);

    this.recordMovement(event, timestamp);
    const swing = this.calculateSwing(timestamp);
    this.currentFrame = {
      normalizedX,
      normalizedY,
      worldPosition,
      swing,
      timestamp,
    };

    this.emit('move', {
      normalizedX,
      normalizedY,
      worldPosition,
      swing,
      timestamp,
    });

    if (this.shouldHit(swing, timestamp)) {
      this.lastHitAt = timestamp;
      this.pendingSwing = {
        ...swing,
        normalizedX,
        normalizedY,
        worldPosition,
        timestamp,
      };
      this.emit('swing', this.pendingSwing);
    }
  }

  update() {
    const timestamp = performance.now();
    const swing = this.calculateSwing(timestamp);
    const frame = {
      ...this.currentFrame,
      swing,
      hitSwing: this.pendingSwing,
      serveRequested: this.pendingServe,
      timestamp,
    };

    this.pendingSwing = null;
    this.pendingServe = false;
    return frame;
  }

  recordMovement(event, timestamp) {
    const dx = this.previousMouse ? event.clientX - this.previousMouse.x : 0;
    // Screen Y grows downward, so invert it: upward swings produce positive avgDy.
    const dy = this.previousMouse ? this.previousMouse.y - event.clientY : 0;
    this.previousMouse = { x: event.clientX, y: event.clientY };

    this.swingHistory.push({ dx, dy, timestamp });
    this.pruneHistory(timestamp);
  }

  pruneHistory(timestamp) {
    this.swingHistory = this.swingHistory
      .filter((frame) => timestamp - frame.timestamp <= HISTORY_TTL_MS)
      .slice(-MAX_HISTORY_FRAMES);
  }

  calculateSwing(timestamp = performance.now()) {
    this.pruneHistory(timestamp);
    if (this.swingHistory.length === 0) {
      return this.createEmptySwing();
    }

    let weightedDx = 0;
    let weightedDy = 0;
    let totalWeight = 0;
    const lastIndex = Math.max(this.swingHistory.length - 1, 1);

    for (let index = 0; index < this.swingHistory.length; index++) {
      const frame = this.swingHistory[index];
      const weight = 0.5 + (index / lastIndex) * 1.5;
      weightedDx += frame.dx * weight;
      weightedDy += frame.dy * weight;
      totalWeight += weight;
    }

    const avgDx = weightedDx / totalWeight;
    const avgDy = weightedDy / totalWeight;
    const magnitude = Math.hypot(avgDx, avgDy);

    return {
      avgDx,
      avgDy,
      magnitude,
      normalizedPower: THREE.MathUtils.clamp(magnitude / 15, 0, 1),
      direction: {
        x: Math.sign(avgDx),
        y: Math.sign(avgDy),
      },
      historySize: this.swingHistory.length,
    };
  }

  createEmptySwing() {
    return {
      avgDx: 0,
      avgDy: 0,
      magnitude: 0,
      normalizedPower: 0,
      direction: { x: 0, y: 0 },
      historySize: 0,
    };
  }

  shouldHit(swing, timestamp) {
    if (swing.magnitude <= MIN_HIT_MAGNITUDE) return false;
    if (timestamp - this.lastHitAt < HIT_COOLDOWN_MS) return false;
    return this.isBallNearPaddle();
  }

  isBallNearPaddle() {
    const ball = this.getBall();
    const paddle = this.getActivePaddle();
    const ballPosition = ball?.body?.position || ball?.mesh?.position;
    const paddlePosition = paddle?.group?.position || paddle?.body?.position;
    if (!ballPosition || !paddlePosition) return false;

    const dx = ballPosition.x - paddlePosition.x;
    const dy = ballPosition.y - paddlePosition.y;
    const dz = ballPosition.z - paddlePosition.z;
    return Math.hypot(dx, dy, dz) <= HIT_DISTANCE;
  }

  getWorldPositionFromMouse(normalizedX, normalizedY) {
    const side = this.getSide();
    const halfRangeX = TABLE_HALF_WIDTH - TABLE_INPUT_PADDING;
    const x = THREE.MathUtils.clamp(
      normalizedX * halfRangeX,
      -halfRangeX,
      halfRangeX,
    );
    const z = this.mapPointerToZ(normalizedY, side);
    return new THREE.Vector3(x, 0, z);
  }

  mapPointerToZ(normalizedY, side) {
    const t = THREE.MathUtils.clamp((normalizedY + 1) / 2, 0, 1);
    if (side === 'right') {
      return THREE.MathUtils.lerp(OPPONENT_PADDLE_MIN_Z, OPPONENT_PADDLE_MAX_Z, t);
    }
    return THREE.MathUtils.lerp(PLAYER_PADDLE_MAX_Z, PLAYER_PADDLE_MIN_Z, t);
  }

  emit(type, payload) {
    for (const handler of this.handlers[type]) {
      handler(payload);
    }
  }

  requestServe() {
    this.pendingServe = true;
    this.emit('serve', {});
  }
}
