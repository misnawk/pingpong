import * as CANNON from 'cannon-es';

const FIXED_TIME_STEP = 1 / 60;
const SPIN_BOUNCE_FACTOR = 0.25;

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    this.world.allowSleep = true;
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 20;
    this.fixedTimeStep = FIXED_TIME_STEP;
    this.maxSubSteps = 3;
    this.syncPairs = new Set();
    this.tableBodies = new Set();
    this.tableSpinBodies = new Set();
    this.netBodies = new Set();

    this.defaultMaterial = new CANNON.Material('default');
    this.ballMaterial = new CANNON.Material({ name: 'ball', friction: 0.4, restitution: 0.9 });
    this.tableMaterial = new CANNON.Material({ name: 'table', friction: 0.3, restitution: 0.85 });
    this.netMaterial = new CANNON.Material({ name: 'net', friction: 0.55, restitution: 0.1 });
    this.paddleMaterial = new CANNON.Material({ name: 'paddle', friction: 0.42, restitution: 0.88 });

    this.world.defaultContactMaterial.friction = 0.4;
    this.world.defaultContactMaterial.restitution = 0.6;
    this.addContactMaterials();
  }

  addContactMaterials() {
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.ballMaterial, this.tableMaterial, {
      friction: 0.3,
      restitution: 0.85,
    }));

    this.world.addContactMaterial(new CANNON.ContactMaterial(this.ballMaterial, this.netMaterial, {
      friction: 0.55,
      restitution: 0.1,
    }));

    this.world.addContactMaterial(new CANNON.ContactMaterial(this.ballMaterial, this.paddleMaterial, {
      friction: 0.4,
      restitution: 0.9,
    }));
  }

  step(delta) {
    this.world.step(this.fixedTimeStep, delta, this.maxSubSteps);
    this.updatePhysics();
  }

  updatePhysics() {
    for (const { mesh, body } of this.syncPairs) {
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    }
  }

  addBody(body) {
    this.world.addBody(body);
    return body;
  }

  registerSync(mesh, body) {
    this.syncPairs.add({ mesh, body });
    this.updateMeshFromBody(mesh, body);
  }

  updateMeshFromBody(mesh, body) {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }

  addStaticBox({ size, position, material = this.defaultMaterial, mesh = null, collisionGroup = null }) {
    const body = new CANNON.Body({
      mass: 0,
      material,
      shape: new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)),
      position: new CANNON.Vec3(...position),
    });
    body.collisionGroupName = collisionGroup;
    if (collisionGroup === 'table') this.tableBodies.add(body);
    if (collisionGroup === 'net') this.netBodies.add(body);
    if (mesh) this.registerSync(mesh, body);
    return this.addBody(body);
  }

  createSphereBody({ radius, position, mesh = null }) {
    const body = new CANNON.Body({
      mass: 0.0027,
      material: this.ballMaterial,
      shape: new CANNON.Sphere(radius),
      position: new CANNON.Vec3(...position),
      linearDamping: 0.01,
      angularDamping: 0.05,
    });
    body.collisionGroupName = 'ball';
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.08;
    body.sleepTimeLimit = 0.45;
    body.addEventListener('collide', (event) => this.handleBallCollision(body, event));

    this.addBody(body);
    if (mesh) this.registerSync(mesh, body);
    return body;
  }

  createKinematicBoxBody({ size, position, quaternion = null, mesh = null }) {
    const body = new CANNON.Body({
      mass: 0.085,
      type: CANNON.Body.KINEMATIC,
      material: this.paddleMaterial,
      shape: new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)),
      position: new CANNON.Vec3(...position),
    });
    body.collisionGroupName = 'paddle';
    if (quaternion) body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);

    this.addBody(body);
    if (mesh) this.registerSync(mesh, body);
    return body;
  }

  createTableBodies({ dimensions, borderWidth, mesh = null, borderMeshes = [], yOffset = 0 }) {
    const { width, length, height } = dimensions;
    const bodies = {
      top: this.addStaticBox({
        size: [width, height, length],
        position: [0, yOffset, 0],
        material: this.tableMaterial,
        mesh,
        collisionGroup: 'table',
      }),
      borders: [],
    };
    this.tableSpinBodies.add(bodies.top);

    const borderHeight = height * 1.35;
    const borderY = yOffset + height / 2 + borderHeight / 2 - 0.01;
    const borderSpecs = [
      {
        size: [width + borderWidth * 2, borderHeight, borderWidth],
        position: [0, borderY, length / 2 + borderWidth / 2],
      },
      {
        size: [width + borderWidth * 2, borderHeight, borderWidth],
        position: [0, borderY, -length / 2 - borderWidth / 2],
      },
      {
        size: [borderWidth, borderHeight, length],
        position: [-width / 2 - borderWidth / 2, borderY, 0],
      },
      {
        size: [borderWidth, borderHeight, length],
        position: [width / 2 + borderWidth / 2, borderY, 0],
      },
    ];

    for (let i = 0; i < borderSpecs.length; i++) {
      const spec = borderSpecs[i];
      bodies.borders.push(this.addStaticBox({
        ...spec,
        material: this.tableMaterial,
        mesh: borderMeshes[i],
        collisionGroup: 'table',
      }));
    }

    return bodies;
  }

  createNetBody({ size, position, mesh }) {
    return this.addStaticBox({
      size,
      position,
      material: this.netMaterial,
      mesh,
      collisionGroup: 'net',
    });
  }

  updateKinematicBody(body, mesh, delta) {
    const safeDelta = Math.max(delta, this.fixedTimeStep);
    const previousPosition = body.position.clone();

    body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
    body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
    body.velocity.set(
      (body.position.x - previousPosition.x) / safeDelta,
      (body.position.y - previousPosition.y) / safeDelta,
      (body.position.z - previousPosition.z) / safeDelta,
    );
    body.angularVelocity.set(0, 0, 0);
  }

  handleBallCollision(ballBody, event) {
    const otherBody = event.body;
    if (this.tableSpinBodies.has(otherBody)) {
      this.applySpinBounce(ballBody);
    }

    if (this.netBodies.has(otherBody)) {
      ballBody.velocity.scale(0.35, ballBody.velocity);
      ballBody.angularVelocity.scale(0.25, ballBody.angularVelocity);
    }
  }

  applySpinBounce(ballBody) {
    const spin = ballBody.angularVelocity;
    const velocity = ballBody.velocity;

    // topspin/backspin affect forward travel, sidespin bends lateral travel.
    velocity.z += spin.x * SPIN_BOUNCE_FACTOR;
    velocity.x += spin.y * SPIN_BOUNCE_FACTOR;

    spin.scale(0.82, spin);
  }
}
