import * as THREE from 'three';
import {
  NET_HEIGHT,
  TABLE_CENTER_Y,
  TABLE_LENGTH,
  TABLE_SURFACE_Y,
  TABLE_THICKNESS,
  TABLE_WIDTH,
} from '../../../shared/constants.js';

const LINE_WIDTH = 0.02;
const BORDER_WIDTH = 0.02;
const SURFACE_OFFSET_Y = TABLE_SURFACE_Y - TABLE_CENTER_Y;

export class Table {
  constructor(scene, physicsWorld) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.group = new THREE.Group();
    this.group.name = 'PingPongTable';
    this.group.position.set(0, TABLE_CENTER_Y, 0);

    this.dimensions = {
      width: TABLE_WIDTH,
      length: TABLE_LENGTH,
      height: TABLE_THICKNESS,
      netHeight: NET_HEIGHT,
    };

    this.createTableTop();
    this.createWoodenBorder();
    this.createNet();
    this.createFloorGlow();
    this.createPhysics();

    scene.add(this.group);
  }

  createTableTop() {
    const { width, length, height } = this.dimensions;
    const geometry = new THREE.BoxGeometry(width, height, length);
    const edgeMaterial = this.createBorderMaterial();
    const undersideMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.75 });
    const surfaceMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.createTableLineTexture(),
      roughness: 0.48,
      metalness: 0.04,
    });
    const top = new THREE.Mesh(geometry, [
      edgeMaterial,
      edgeMaterial,
      surfaceMaterial,
      undersideMaterial,
      edgeMaterial,
      edgeMaterial,
    ]);
    top.receiveShadow = true;
    top.castShadow = true;
    top.position.y = 0;
    this.tableTopMesh = top;
    this.group.add(top);
  }

  createTableLineTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    const lineX = Math.max(2, Math.round((LINE_WIDTH / TABLE_WIDTH) * canvas.width));
    const lineZ = Math.max(2, Math.round((LINE_WIDTH / TABLE_LENGTH) * canvas.height));

    ctx.fillStyle = '#2E7D32';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#ffffff';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = lineX;
    ctx.strokeRect(lineX / 2, lineZ / 2, canvas.width - lineX, canvas.height - lineZ);

    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, lineZ);
    ctx.lineTo(canvas.width / 2, canvas.height - lineZ);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }

  createBorderMaterial() {
    return new THREE.MeshStandardMaterial({
      color: 0x2c2c2c,
      roughness: 0.7,
      metalness: 0.02,
    });
  }

  createWoodenBorder() {
    const { width, length, height } = this.dimensions;
    const borderMaterial = this.createBorderMaterial();
    const borderHeight = height * 1.35;
    const borderY = height / 2 + borderHeight / 2 - 0.01;
    this.borderMeshes = [];

    const borders = [
      {
        name: 'NearWoodBorder',
        size: [width + BORDER_WIDTH * 2, borderHeight, BORDER_WIDTH],
        position: [0, borderY, length / 2 + BORDER_WIDTH / 2],
      },
      {
        name: 'FarWoodBorder',
        size: [width + BORDER_WIDTH * 2, borderHeight, BORDER_WIDTH],
        position: [0, borderY, -length / 2 - BORDER_WIDTH / 2],
      },
      {
        name: 'LeftWoodBorder',
        size: [BORDER_WIDTH, borderHeight, length],
        position: [-width / 2 - BORDER_WIDTH / 2, borderY, 0],
      },
      {
        name: 'RightWoodBorder',
        size: [BORDER_WIDTH, borderHeight, length],
        position: [width / 2 + BORDER_WIDTH / 2, borderY, 0],
      },
    ];

    for (const border of borders) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...border.size), borderMaterial);
      mesh.name = border.name;
      mesh.position.set(...border.position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.borderMeshes.push(mesh);
      this.group.add(mesh);
    }
  }

  createNetTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.lineWidth = 3;

    for (let x = 0; x <= canvas.width; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    for (let y = 0; y <= canvas.height; y += 42) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  createNet() {
    const { width, netHeight } = this.dimensions;
    const netMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.createNetTexture(),
      transparent: true,
      opacity: 0.68,
      roughness: 0.42,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.08, netHeight), netMaterial);
    net.name = 'CenterWhiteNet';
    net.position.set(0, SURFACE_OFFSET_Y + netHeight / 2, 0);
    net.castShadow = true;
    this.netMesh = net;
    this.group.add(net);

    const tapeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.04,
    });
    const topTape = new THREE.Mesh(new THREE.BoxGeometry(width + 0.12, 0.018, 0.018), tapeMaterial);
    topTape.name = 'NetTopWhiteTape';
    topTape.position.set(0, SURFACE_OFFSET_Y + netHeight, 0);
    topTape.castShadow = true;
    this.group.add(topTape);

    const postGeometry = new THREE.CylinderGeometry(0.012, 0.012, netHeight + 0.05, 16);
    for (const x of [-width / 2 - 0.04, width / 2 + 0.04]) {
      const post = new THREE.Mesh(postGeometry, tapeMaterial);
      post.name = x < 0 ? 'LeftNetPost' : 'RightNetPost';
      post.position.set(x, SURFACE_OFFSET_Y + (netHeight + 0.05) / 2, 0);
      post.castShadow = true;
      this.group.add(post);
    }
  }

  createFloorGlow() {
    const glowTexture = this.createRadialGlowTexture();
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 4.8),
      new THREE.MeshBasicMaterial({
        map: glowTexture,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glow.name = 'GreenTableReflection';
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -TABLE_CENTER_Y + 0.012;
    this.group.add(glow);
  }

  createRadialGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
    gradient.addColorStop(0, 'rgba(46, 125, 50, 0.42)');
    gradient.addColorStop(0.45, 'rgba(46, 125, 50, 0.12)');
    gradient.addColorStop(1, 'rgba(46, 125, 50, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  createPhysics() {
    if (!this.physicsWorld) return;
    this.tableBodies = this.physicsWorld.createTableBodies({
      dimensions: this.dimensions,
      borderWidth: BORDER_WIDTH,
      yOffset: TABLE_CENTER_Y,
    });
    this.netBody = this.physicsWorld.createNetBody({
      size: [this.dimensions.width + 0.08, this.dimensions.netHeight, 0.018],
      position: [0, TABLE_SURFACE_Y + this.dimensions.netHeight / 2, 0],
    });
  }

  update() {
    // Reserved for table effects such as net shimmer or score-reactive lighting.
  }
}
