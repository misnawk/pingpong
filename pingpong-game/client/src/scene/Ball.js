import * as THREE from 'three';
import {
  BALL_RADIUS,
  TABLE_LENGTH,
  TABLE_SURFACE_Y,
  TABLE_WIDTH,
} from '../../../shared/constants.js';

const SERVER_LIMIT_X = 2.65;
const SERVER_LIMIT_Z = 4.45;
const SCENE_LIMIT_X = TABLE_WIDTH / 2 - BALL_RADIUS;
const SCENE_LIMIT_Z = TABLE_LENGTH / 2 - 0.18;
const SERVER_LERP_ALPHA = 0.3;
const BALL_COLORS = {
  white: '#ffffff',
  orange: '#FFD700',
};

export class Ball {
  constructor(scene, physicsWorld, { color = 'orange' } = {}) {
    this.radius = BALL_RADIUS;
    this.physicsWorld = physicsWorld;
    this.color = BALL_COLORS[color] || BALL_COLORS.white;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, 48, 32),
      new THREE.MeshStandardMaterial({
        color: this.color,
        map: this.createStripeTexture(this.color),
        roughness: 0.3,
        metalness: 0.1,
      }),
    );
    this.mesh.name = 'Ball';
    this.mesh.castShadow = true;
    this.ballLight = new THREE.PointLight(0xffd700, 0.65, 0.85, 2);
    this.ballLight.name = 'BallVisibilityPointLight';
    this.ballLight.position.set(0, 0, 0);
    this.mesh.add(this.ballLight);
    scene.add(this.mesh);
    this.shadowMesh = this.createBallShadow();
    scene.add(this.shadowMesh);
    this.serverPosition = new THREE.Vector3();

    this.body = physicsWorld.createSphereBody({
      radius: this.radius,
      position: [0, TABLE_SURFACE_Y + this.radius + 0.08, 1.06],
      mesh: this.mesh,
    });
    this.updateShadow();
  }

  createStripeTexture(baseColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = baseColor === BALL_COLORS.orange ? 'rgba(255, 255, 255, 0.92)' : 'rgba(245, 120, 32, 0.92)';
    ctx.lineWidth = 10;
    for (let x = -canvas.width; x < canvas.width * 2; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 70, 40, x + 20, 150, x + 120, canvas.height);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }

  applyImpulse(vector) {
    this.body.applyImpulse(vector, this.body.position);
  }

  setFromState(state, alpha = SERVER_LERP_ALPHA) {
    const position = state.position ? state.position : this.toScenePosition(state);
    const velocity = state.velocity || this.toSceneVelocity(state);
    const angularVelocity = state.angularVelocity || state.spin || { x: 0, y: 0, z: 0 };
    this.serverPosition.set(position.x, position.y, position.z);
    this.mesh.position.lerp(this.serverPosition, alpha);

    this.body.position.set(
      this.mesh.position.x,
      this.mesh.position.y,
      this.mesh.position.z,
    );
    this.body.velocity.set(velocity.x, velocity.y, velocity.z);
    this.body.angularVelocity.set(
      angularVelocity.x || 0,
      angularVelocity.y || 0,
      angularVelocity.z || 0,
    );
    this.mesh.quaternion.copy(this.body.quaternion);
    this.updateShadow();
  }

  updateFromPhysics() {
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
    this.updateShadow();
  }

  createBallShadow() {
    const texture = this.createShadowTexture();
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.14, 48),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        map: texture,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    );
    shadow.name = 'BallContactShadow';
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = TABLE_SURFACE_Y + 0.002;
    return shadow;
  }

  createShadowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
    gradient.addColorStop(0, 'rgba(0,0,0,0.72)');
    gradient.addColorStop(0.48, 'rgba(0,0,0,0.26)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  updateShadow() {
    if (!this.shadowMesh) return;

    const heightAboveTable = Math.max(this.body.position.y - TABLE_SURFACE_Y - this.radius, 0);
    const spread = THREE.MathUtils.clamp(1 + heightAboveTable * 2.5, 0.85, 2.35);
    const opacity = THREE.MathUtils.clamp(0.42 - heightAboveTable * 0.34, 0.08, 0.42);
    this.shadowMesh.position.x = this.body.position.x;
    this.shadowMesh.position.z = this.body.position.z;
    this.shadowMesh.scale.set(spread, spread, 1);
    this.shadowMesh.material.opacity = opacity;
  }

  snapshot() {
    return {
      x: this.body.position.x,
      y: this.body.position.y,
      z: this.body.position.z,
      vx: this.body.velocity.x,
      vy: this.body.velocity.y,
      vz: this.body.velocity.z,
      spin: {
        x: this.body.angularVelocity.x,
        y: this.body.angularVelocity.y,
        z: this.body.angularVelocity.z,
      },
    };
  }

  toScenePosition(state) {
    return {
      x: this.scaleAxis(state.x, SERVER_LIMIT_X, SCENE_LIMIT_X),
      y: THREE.MathUtils.clamp(Number(state.y || TABLE_SURFACE_Y), TABLE_SURFACE_Y + BALL_RADIUS, TABLE_SURFACE_Y + 0.75),
      z: this.scaleAxis(state.z, SERVER_LIMIT_Z, SCENE_LIMIT_Z),
    };
  }

  toSceneVelocity(state) {
    return {
      x: this.scaleAxis(state.vx || 0, SERVER_LIMIT_X, SCENE_LIMIT_X),
      y: Number(state.vy || 0),
      z: this.scaleAxis(state.vz || 0, SERVER_LIMIT_Z, SCENE_LIMIT_Z),
    };
  }

  scaleAxis(value, sourceLimit, targetLimit) {
    const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;
    return THREE.MathUtils.clamp((numericValue / sourceLimit) * targetLimit, -targetLimit, targetLimit);
  }
}
