import { io } from 'socket.io-client';

export class SocketClient {
  constructor() {
    this.socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001', {
      transports: ['websocket', 'polling'],
    });
    this.lastPaddlePosition = { x: 0, z: 0 };
    this.pendingSwingVector = { dx: 0, dy: 0, magnitude: 0 };
    this.pendingSpinData = { torqueX: 0, torqueZ: 0, spinLevel: 0 };
    this.pendingType = 'move';
    this.lastSentAt = 0;
    this.sendIntervalMs = 1000 / 60;
  }

  on(eventName, handler) {
    this.socket.on(eventName, handler);
  }

  createRoom(payload = {}) {
    this.socket.emit('create-room', {
      nickname: payload.nickname,
    });
  }

  joinRoom(payload = {}) {
    this.socket.emit('join-room', {
      roomCode: payload.roomCode || payload.roomId,
      nickname: payload.nickname,
    });
  }

  sendReady() {
    this.socket.emit('ready');
  }

  setInput(payload = {}) {
    if (payload.paddlePosition) {
      this.lastPaddlePosition = {
        x: Number(payload.paddlePosition.x || 0),
        z: Number(payload.paddlePosition.z || 0),
      };
    }

    if (payload.type) {
      this.pendingType = payload.type;
    }

    if (payload.swingVector && Number(payload.swingVector.magnitude || 0) > 0) {
      this.pendingSwingVector = {
        dx: Number(payload.swingVector.dx || 0),
        dy: Number(payload.swingVector.dy || 0),
        magnitude: Number(payload.swingVector.magnitude || 0),
      };
    }

    if (payload.spinData && Number(payload.spinData.spinLevel || 0) > 0) {
      this.pendingSpinData = {
        torqueX: Number(payload.spinData.torqueX || 0),
        torqueZ: Number(payload.spinData.torqueZ || 0),
        spinLevel: Number(payload.spinData.spinLevel || 0),
      };
    }
  }

  sendInput(now = performance.now(), { force = false } = {}) {
    if (!force && now - this.lastSentAt < this.sendIntervalMs) return false;
    if (!this.socket.connected) return false;

    this.lastSentAt = now;
    this.socket.emit('player-input', {
      type: this.pendingType,
      paddlePosition: this.lastPaddlePosition,
      swingVector: this.pendingSwingVector,
      spinData: this.pendingSpinData,
      timestamp: Date.now(),
    });
    this.pendingSwingVector = { dx: 0, dy: 0, magnitude: 0 };
    this.pendingSpinData = { torqueX: 0, torqueZ: 0, spinLevel: 0 };
    this.pendingType = 'move';
    return true;
  }

  updatePaddle(payload = {}) {
    this.setInput({
      paddlePosition: {
        x: payload.x,
        z: payload.z,
      },
    });
  }

  sendSwing(payload = {}) {
    const spin = payload.spin || {};
    const velocity = payload.velocity || {};
    this.setInput({
      swingVector: {
        dx: Number(velocity.x || velocity.dx || 0),
        dy: Number(velocity.y || velocity.dy || 0),
        magnitude: Number(velocity.magnitude || spin.magnitude || 0),
      },
      spinData: {
        torqueX: Number(spin.torque?.x || spin.torqueX || 0),
        torqueZ: Number(spin.torque?.z || spin.torqueZ || 0),
        spinLevel: Number(spin.spinLevel || 0),
      },
    });
    this.sendInput(performance.now(), { force: true });
  }

  serveBall() {
    this.sendReady();
  }
}
