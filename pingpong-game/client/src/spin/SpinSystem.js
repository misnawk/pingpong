import * as CANNON from 'cannon-es';

const MAX_BALL_SPEED = 12;
const SPIN_STRENGTH_FACTOR = 0.04;
const HIT_VECTOR_X_SCALE = 0.02;
const HIT_VECTOR_Z_SCALE = 0.03;
const BALL_MASS = 0.0027;
const ACTIVE_SPIN_MS = 850;

export class SpinSystem {
  constructor() {
    this.activeSpin = null;
    this.activeUntil = 0;
  }

  update(_delta = 0, now = performance.now()) {
    if (this.activeSpin && now >= this.activeUntil) {
      this.activeSpin = null;
    }

    return this.activeSpin;
  }

  calculateSpin(swing) {
    const avgDx = Number(swing?.avgDx || 0);
    const avgDy = Number(swing?.avgDy || 0);
    const magnitude = Number(swing?.magnitude || Math.hypot(avgDx, avgDy));
    const spinStrength = magnitude * SPIN_STRENGTH_FACTOR;
    const torque = {
      x: -avgDy * spinStrength,
      y: 0,
      z: avgDx * spinStrength,
    };
    const spinLevel = this.getSpinLevel(magnitude);
    const type = this.getSpinType(avgDx, avgDy, spinLevel);

    return {
      type,
      spinLevel,
      magnitude,
      power: normalizePower(magnitude),
      spinStrength,
      torque,
      vector: {
        x: torque.x,
        y: torque.y,
        z: torque.z,
      },
      components: {
        topspin: avgDy > 0 ? Math.abs(avgDy) : 0,
        backspin: avgDy < 0 ? Math.abs(avgDy) : 0,
        sideRight: avgDx > 0 ? Math.abs(avgDx) : 0,
        sideLeft: avgDx < 0 ? Math.abs(avgDx) : 0,
      },
    };
  }

  applyHit(ball, swing) {
    const body = ball?.body;
    if (!body || typeof ball.applyImpulse !== 'function') return null;

    const spin = this.calculateSpin(swing);
    const impulse = this.createHitImpulse(swing);
    ball.applyImpulse(impulse);
    this.applyToBody(body, spin);
    this.clampVelocity(body, MAX_BALL_SPEED);
    this.setActiveSpin(spin);
    return spin;
  }

  setActiveSpin(spin, now = performance.now()) {
    this.activeSpin = spin;
    this.activeUntil = now + ACTIVE_SPIN_MS;
  }

  createHitImpulse(swing) {
    const avgDx = Number(swing?.avgDx || 0);
    const avgDy = Number(swing?.avgDy || 0);
    const magnitude = Number(swing?.magnitude || Math.hypot(avgDx, avgDy));
    const direction = new CANNON.Vec3(
      avgDx * HIT_VECTOR_X_SCALE,
      0,
      avgDy * HIT_VECTOR_Z_SCALE,
    );

    if (direction.length() === 0) return new CANNON.Vec3(0, 0, 0);

    const normalizedPower = Math.min(Math.max(magnitude / 15, 0), 1);
    const targetSpeed = normalizedPower * MAX_BALL_SPEED;
    direction.normalize();
    return direction.scale(BALL_MASS * targetSpeed);
  }

  applyToBody(body, spin) {
    if (!body || !spin) return;

    const torque = new CANNON.Vec3(spin.torque.x, spin.torque.y, spin.torque.z);
    if (typeof body.applyTorque === 'function') {
      body.applyTorque(torque);
    } else {
      body.torque.vadd(torque, body.torque);
    }

    // Give immediate visual rotation feedback while the torque is integrated.
    body.angularVelocity.x += torque.x * 0.02;
    body.angularVelocity.y += torque.y * 0.02;
    body.angularVelocity.z += torque.z * 0.02;
  }

  clampVelocity(body, maxSpeed) {
    const speed = body.velocity.length();
    if (speed <= maxSpeed || speed === 0) return;

    body.velocity.normalize();
    body.velocity.scale(maxSpeed, body.velocity);
  }

  getSpinLevel(magnitude) {
    if (magnitude < 3) return 0;
    if (magnitude < 8) return 1;
    if (magnitude < 15) return 2;
    return 3;
  }

  getSpinType(avgDx, avgDy, spinLevel) {
    if (spinLevel === 0) return 'none';

    const vertical = avgDy > 0 ? 'topspin' : avgDy < 0 ? 'backspin' : '';
    const horizontal = avgDx > 0 ? 'sidespin-right' : avgDx < 0 ? 'sidespin-left' : '';
    if (vertical && horizontal) return `${vertical}+${horizontal}`;
    return vertical || horizontal || 'none';
  }
}

function normalizePower(magnitude) {
  return Math.min(Math.max(magnitude / 15, 0), 1);
}
