import * as THREE from 'three';
import {
  OPPONENT_PADDLE_MAX_Z,
  OPPONENT_PADDLE_MIN_Z,
  OPPONENT_PADDLE_Z,
  OPPONENT_VISUAL_PADDLE_Y,
  PADDLE_COLLISION_Y,
  PLAYER_PADDLE_MAX_Z,
  PLAYER_PADDLE_MIN_Z,
  PLAYER_PADDLE_Z,
  PLAYER_VISUAL_PADDLE_Y,
  TABLE_HALF_WIDTH,
  TABLE_INPUT_PADDING,
} from '../../../shared/constants.js';

const PADDLE_RADIUS = 0.08;
const PADDLE_THICKNESS = 0.018;
const HANDLE_LENGTH = 0.22;
const SERVER_LIMIT_X = 2.65;
const MAX_PADDLE_X = TABLE_HALF_WIDTH - TABLE_INPUT_PADDING;
const COURT_Z_BOUNDS = {
  left: {
    min: PLAYER_PADDLE_MIN_Z,
    max: PLAYER_PADDLE_MAX_Z,
  },
  right: {
    min: OPPONENT_PADDLE_MIN_Z,
    max: OPPONENT_PADDLE_MAX_Z,
  },
};
const PADDLE_CONFIG = {
  left: {
    position: [0, PLAYER_VISUAL_PADDLE_Y, PLAYER_PADDLE_Z],
    scale: 1.0,
    rotationY: 0,
  },
  right: {
    position: [0, OPPONENT_VISUAL_PADDLE_Y, OPPONENT_PADDLE_Z],
    scale: 0.8,
    rotationY: 0,
  },
};

export class Paddle {
  constructor(scene, physicsWorld, { side }) {
    this.side = side;
    this.physicsWorld = physicsWorld;
    this.config = PADDLE_CONFIG[side];
    this.visualScale = this.config.scale;
    this.targetX = 0;
    this.targetZ = this.config.position[2];
    this.group = new THREE.Group();
    this.group.name = `${side}Paddle`;

    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x2b1d18, roughness: 0.5, metalness: 0.05 });
    const redRubber = new THREE.MeshStandardMaterial({ color: 0xc9151b, roughness: 0.48, metalness: 0.03 });
    const blackRubber = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.58, metalness: 0.02 });

    const blade = new THREE.Mesh(
      new THREE.CylinderGeometry(PADDLE_RADIUS, PADDLE_RADIUS, PADDLE_THICKNESS, 64),
      [edgeMaterial, redRubber, blackRubber],
    );
    blade.name = `${side}PaddleBlade`;
    blade.rotation.x = Math.PI / 2;
    blade.position.y = 0;
    blade.castShadow = true;
    blade.receiveShadow = true;
    this.group.add(blade);

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.029, HANDLE_LENGTH, 24),
      this.createHandleMaterial(),
    );
    handle.name = `${side}PaddleHandle`;
    handle.position.y = -PADDLE_RADIUS - HANDLE_LENGTH / 2 + 0.018;
    handle.castShadow = true;
    handle.receiveShadow = true;
    this.group.add(handle);

    this.group.position.set(...this.config.position);
    this.group.scale.setScalar(this.visualScale);
    this.group.rotation.set(0, this.config.rotationY, 0);
    scene.add(this.group);

    this.body = physicsWorld.createKinematicBoxBody({
      size: [
        PADDLE_RADIUS * 2 * this.visualScale,
        (PADDLE_RADIUS * 2 + HANDLE_LENGTH) * this.visualScale,
        PADDLE_THICKNESS * this.visualScale,
      ],
      position: [this.config.position[0], PADDLE_COLLISION_Y, this.config.position[2]],
      quaternion: this.group.quaternion,
      mesh: this.group,
    });
  }

  createHandleMaterial() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#4a2a14');
    gradient.addColorStop(0.5, '#8a5a2d');
    gradient.addColorStop(1, '#2c160b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255, 220, 160, 0.12)';
    for (let y = 12; y < canvas.height; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y + Math.sin(y) * 4);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.5, 1);

    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: texture,
      roughness: 0.55,
      metalness: 0.04,
    });
  }

  setTargetX(x) {
    this.targetX = this.toSceneX(x);
  }

  setTargetPosition(x, z) {
    const bounds = COURT_Z_BOUNDS[this.side];
    this.targetX = THREE.MathUtils.clamp(Number(x) || 0, -MAX_PADDLE_X, MAX_PADDLE_X);
    this.targetZ = THREE.MathUtils.clamp(Number(z) || this.config.position[2], bounds.min, bounds.max);
  }

  setFromState(state, alpha = 0.35) {
    if (!state) return;
    const position = state.position || state;
    const targetX = Number.isFinite(Number(position.x)) ? Number(position.x) : this.toSceneX(position.x);
    const targetZ = THREE.MathUtils.clamp(
      Number.isFinite(Number(position.z)) ? Number(position.z) : this.targetZ,
      COURT_Z_BOUNDS[this.side].min,
      COURT_Z_BOUNDS[this.side].max,
    );
    this.targetX = targetX;
    this.targetZ = targetZ;
    this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, targetX, alpha);
    this.group.position.z = THREE.MathUtils.lerp(this.group.position.z, targetZ, alpha);
    this.body.position.set(this.group.position.x, PADDLE_COLLISION_Y, this.group.position.z);
  }

  update(delta) {
    const smoothing = 1 - Math.exp(-delta * 18);
    this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, this.targetX, smoothing);
    this.group.position.z = THREE.MathUtils.lerp(this.group.position.z, this.targetZ, smoothing);
    this.body.position.set(this.group.position.x, PADDLE_COLLISION_Y, this.group.position.z);
    this.body.quaternion.set(this.group.quaternion.x, this.group.quaternion.y, this.group.quaternion.z, this.group.quaternion.w);
  }

  snapshot() {
    return {
      x: this.group.position.x,
      y: this.group.position.y,
      z: this.group.position.z,
    };
  }

  toSceneX(x) {
    const numericX = Number.isFinite(Number(x)) ? Number(x) : 0;
    const scaledX = (numericX / SERVER_LIMIT_X) * MAX_PADDLE_X;
    return THREE.MathUtils.clamp(scaledX, -MAX_PADDLE_X, MAX_PADDLE_X);
  }
}
