import * as THREE from 'three';
import {
  CAMERA_FOV,
  CAMERA_POSITION,
  CAMERA_TARGET,
} from '../../../shared/constants.js';

export class SceneSetup {
  constructor(rootElement) {
    this.rootElement = rootElement;
    this.cameraTarget = new THREE.Vector3(...CAMERA_TARGET);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x5b4932);
    this.scene.fog = new THREE.Fog(0x6a563b, 7, 16);

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.05, 80);
    this.camera.position.set(...CAMERA_POSITION);
    this.camera.lookAt(this.cameraTarget);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.rootElement.appendChild(this.renderer.domElement);
    this.createGymnasium();
    window.addEventListener('resize', () => this.resize());
  }

  setCameraForSide() {
    this.camera.position.set(...CAMERA_POSITION);
    this.camera.fov = CAMERA_FOV;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.cameraTarget);
  }

  resize() {
    const { innerWidth, innerHeight } = window;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  createGymnasium() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.MeshStandardMaterial({
        color: 0xc8a96e,
        map: this.createFloorTexture(),
        metalness: 0.08,
        roughness: 0.58,
      }),
    );
    floor.name = 'WarmWoodGymFloor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8924e,
      map: this.createWoodPlankTexture('#B8924E', '#8B6734', 12),
      roughness: 0.72,
      metalness: 0.02,
    });

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), wallMaterial);
    backWall.name = 'FarWoodPanelWall';
    backWall.position.set(0, 2.5, -5.5);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), wallMaterial);
    leftWall.name = 'LeftWoodPanelWall';
    leftWall.position.set(-5.2, 2.5, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    this.scene.add(leftWall);

    const rightWall = leftWall.clone();
    rightWall.name = 'RightWoodPanelWall';
    rightWall.position.x = 5.2;
    rightWall.rotation.y = -Math.PI / 2;
    this.scene.add(rightWall);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 12),
      new THREE.MeshStandardMaterial({ color: 0x2b261f, roughness: 0.86 }),
    );
    ceiling.name = 'DarkGymCeiling';
    ceiling.position.set(0, 5, 0);
    ceiling.rotation.x = Math.PI / 2;
    this.scene.add(ceiling);
  }

  createFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#C8A96E';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Horizontal planks only (boards running left-right, no vertical crossing lines)
    const plankCount = 20;
    const plankHeight = canvas.height / plankCount;
    for (let i = 0; i <= plankCount; i++) {
      const y = i * plankHeight;
      ctx.strokeStyle = '#8B6434';
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y + Math.sin(i * 1.3) * 2);
      ctx.stroke();

      // Subtle grain within each plank (horizontal only)
      for (let g = 5; g < plankHeight - 5; g += 7) {
        ctx.strokeStyle = '#A87E43';
        ctx.globalAlpha = 0.1;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + g);
        for (let x = 0; x < canvas.width; x += 50) {
          ctx.lineTo(x, y + g + Math.sin(x * 0.02 + i + g) * 1.5);
        }
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 2);
    return texture;
  }

  createWoodPlankTexture(baseColor, lineColor, plankCount) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const plankWidth = canvas.width / plankCount;
    for (let i = 0; i <= plankCount; i++) {
      const x = i * plankWidth;
      ctx.strokeStyle = lineColor;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + Math.sin(i) * 4, canvas.height);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#ffffff';
    for (let y = 18; y < canvas.height; y += 38) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x < canvas.width; x += 34) {
        ctx.lineTo(x, y + Math.sin(x * 0.025 + y) * 5);
      }
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 3);
    return texture;
  }
}
