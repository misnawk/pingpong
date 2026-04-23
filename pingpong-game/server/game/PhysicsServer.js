import * as CANNON from 'cannon-es';
import {
  BALL_MASS,
  BALL_RADIUS,
  NET_HEIGHT,
  NET_TOP_Y,
  PADDLE_COLLISION_Y,
  SERVE_HIT_Y,
  TABLE_CENTER_Y,
  TABLE_HALF_LENGTH,
  TABLE_HALF_WIDTH,
  TABLE_LENGTH,
  TABLE_LINE_EPSILON,
  TABLE_SURFACE_Y,
  TABLE_THICKNESS,
  TABLE_WIDTH,
} from '../../shared/constants.js';

const TABLE_OUT_Z = 2.55;
const TABLE_OUT_X = TABLE_HALF_WIDTH + 0.18;
const TABLE_CONTACT_Y = TABLE_SURFACE_Y + BALL_RADIUS + 0.01;
const PADDLE_SIZE = [0.32, 0.32, 0.018];
const PADDLE_HIT_DISTANCE = 0.75;
const MAX_BALL_SPEED = 12;
const FIXED_STEP = 1 / 60;
const BOUNCE_DEBOUNCE_MS = 85;

export class PhysicsServer {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(gameState) {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.allowSleep = true;
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 20;

    const materials = this.createMaterials(world);
    const ballBody = new CANNON.Body({
      mass: BALL_MASS,
      material: materials.ball,
      shape: new CANNON.Sphere(BALL_RADIUS),
      position: toVec3(gameState.ball.position),
      linearDamping: 0.01,
      angularDamping: 0.05,
    });
    ballBody.allowSleep = true;
    ballBody.sleepSpeedLimit = 0.08;
    ballBody.sleepTimeLimit = 0.45;
    world.addBody(ballBody);

    const paddleBodies = {
      1: this.createPaddleBody(world, materials.paddle, gameState.player1Paddle.position),
      2: this.createPaddleBody(world, materials.paddle, gameState.player2Paddle.position),
    };

    const tableBody = new CANNON.Body({
      mass: 0,
      material: materials.table,
      shape: new CANNON.Box(new CANNON.Vec3(TABLE_HALF_WIDTH, TABLE_THICKNESS / 2, TABLE_HALF_LENGTH)),
      position: new CANNON.Vec3(0, TABLE_CENTER_Y, 0),
    });
    world.addBody(tableBody);

    const borderBodies = this.createTableBorders(world, materials.table);

    const netBody = new CANNON.Body({
      mass: 0,
      material: materials.net,
      shape: new CANNON.Box(new CANNON.Vec3((TABLE_WIDTH + 0.08) / 2, NET_HEIGHT / 2, 0.009)),
      position: new CANNON.Vec3(0, TABLE_SURFACE_Y + NET_HEIGHT / 2, 0),
    });
    world.addBody(netBody);
    const netPostBodies = this.createNetPosts(world, materials.net);

    const roomPhysics = {
      world,
      materials,
      ballBody,
      paddleBodies,
      tableBody,
      borderBodies,
      netBody,
      netPostBodies,
      previousBallZ: ballBody.position.z,
      lastBounceAt: 0,
      pointLockedUntil: 0,
    };

    ballBody.addEventListener('collide', (event) => {
      if (event.body === tableBody) {
        this.handleCourtBounce(gameState, roomPhysics);
        return;
      }

      if (event.body === netBody) {
        this.handleNetCollision(gameState, roomPhysics);
        return;
      }

      if (netPostBodies.has(event.body)) {
        this.handleNetAssemblyCollision(gameState, roomPhysics);
      }
    });

    this.rooms.set(gameState.roomCode, roomPhysics);
    this.syncFromGameState(gameState);
    return roomPhysics;
  }

  createMaterials(world) {
    const materials = {
      ball: new CANNON.Material({ name: 'ball', friction: 0.4, restitution: 0.9 }),
      table: new CANNON.Material({ name: 'table', friction: 0.3, restitution: 0.85 }),
      net: new CANNON.Material({ name: 'net', friction: 0.55, restitution: 0.1 }),
      paddle: new CANNON.Material({ name: 'paddle', friction: 0.4, restitution: 0.9 }),
    };

    world.addContactMaterial(new CANNON.ContactMaterial(materials.ball, materials.table, {
      friction: 0.3,
      restitution: 0.85,
    }));
    world.addContactMaterial(new CANNON.ContactMaterial(materials.ball, materials.net, {
      friction: 0.55,
      restitution: 0.1,
    }));
    world.addContactMaterial(new CANNON.ContactMaterial(materials.ball, materials.paddle, {
      friction: 0.4,
      restitution: 0.9,
    }));

    return materials;
  }

  createPaddleBody(world, material, position) {
    const body = new CANNON.Body({
      mass: 0.085,
      type: CANNON.Body.KINEMATIC,
      material,
      shape: new CANNON.Box(new CANNON.Vec3(PADDLE_SIZE[0] / 2, PADDLE_SIZE[1] / 2, PADDLE_SIZE[2] / 2)),
      position: toVec3(position),
    });
    world.addBody(body);
    return body;
  }

  createTableBorders(world, material) {
    const borderWidth = 0.055;
    const borderHeight = TABLE_THICKNESS * 1.35;
    const y = TABLE_CENTER_Y + TABLE_THICKNESS / 2 + borderHeight / 2 - 0.01;
    const bodies = new Set();
    const specs = [
      [[TABLE_WIDTH + borderWidth * 2, borderHeight, borderWidth], [0, y, TABLE_HALF_LENGTH + borderWidth / 2]],
      [[TABLE_WIDTH + borderWidth * 2, borderHeight, borderWidth], [0, y, -TABLE_HALF_LENGTH - borderWidth / 2]],
      [[borderWidth, borderHeight, TABLE_LENGTH], [-TABLE_HALF_WIDTH - borderWidth / 2, y, 0]],
      [[borderWidth, borderHeight, TABLE_LENGTH], [TABLE_HALF_WIDTH + borderWidth / 2, y, 0]],
    ];

    for (const [size, position] of specs) {
      const body = new CANNON.Body({
        mass: 0,
        material,
        shape: new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)),
        position: new CANNON.Vec3(...position),
      });
      bodies.add(body);
      world.addBody(body);
    }

    return bodies;
  }

  createNetPosts(world, material) {
    const bodies = new Set();
    const postShape = new CANNON.Box(new CANNON.Vec3(0.012, (NET_HEIGHT + 0.05) / 2, 0.012));
    for (const x of [-TABLE_HALF_WIDTH - 0.04, TABLE_HALF_WIDTH + 0.04]) {
      const body = new CANNON.Body({
        mass: 0,
        material,
        shape: postShape,
        position: new CANNON.Vec3(x, TABLE_SURFACE_Y + (NET_HEIGHT + 0.05) / 2, 0),
      });
      bodies.add(body);
      world.addBody(body);
    }
    return bodies;
  }

  applyPlayerInput(gameState, playerNumber, input) {
    const roomPhysics = this.rooms.get(gameState.roomCode);
    if (!roomPhysics || !input) return;

    const paddle = gameState.getPaddle(playerNumber);
    const paddleBody = roomPhysics.paddleBodies[playerNumber];
    this.updatePaddleBody(paddleBody, paddle.position, input.timestamp);

    if (!input.swingVector || input.swingVector.magnitude <= 5) return;
    if (!gameState.canHit(playerNumber, input.timestamp)) return;

    const isServeHit = gameState.phase === 'serve' && input.type === 'serve-hit';
    const isRallyHit = gameState.phase === 'rally' && (input.type === 'hit' || !input.type);
    if (!isServeHit && !isRallyHit) return;
    if (isServeHit && gameState.servingPlayer !== playerNumber) return;
    if (!isServeHit && !this.isBallNearPaddle(roomPhysics.ballBody, paddleBody)) return;

    if (isServeHit) {
      roomPhysics.ballBody.position.set(paddleBody.position.x, SERVE_HIT_Y, gameState.getServeZ(playerNumber));
    }

    this.applySwingImpulse(roomPhysics.ballBody, playerNumber, input.swingVector, input.spinData, {
      isServe: isServeHit,
    });
    gameState.markHit(playerNumber);
    roomPhysics.previousBallZ = roomPhysics.ballBody.position.z;
  }

  updatePaddleBody(body, position, timestamp = Date.now()) {
    const previous = body.position.clone();
    const previousTimestamp = body.lastTimestamp || timestamp - 16;
    const delta = Math.max((timestamp - previousTimestamp) / 1000, FIXED_STEP);

    body.position.copy(toVec3(position));
    body.velocity.set(
      (body.position.x - previous.x) / delta,
      (body.position.y - previous.y) / delta,
      (body.position.z - previous.z) / delta,
    );
    body.lastTimestamp = timestamp;
  }

  isBallNearPaddle(ballBody, paddleBody) {
    const dx = ballBody.position.x - paddleBody.position.x;
    const dy = ballBody.position.y - paddleBody.position.y;
    const dz = ballBody.position.z - paddleBody.position.z;
    return Math.hypot(dx, dy, dz) <= PADDLE_HIT_DISTANCE;
  }

  applySwingImpulse(ballBody, playerNumber, swingVector, spinData, { isServe = false } = {}) {
    const power = Math.min(Math.max(swingVector.magnitude / 15, 0), 1);
    const direction = playerNumber === 1 ? -1 : 1;

    if (isServe) {
      ballBody.velocity.set(
        Math.max(Math.min(swingVector.dx * 0.012, 0.65), -0.65),
        -1.45 - power * 0.35,
        direction * (1.75 + power * 0.55),
      );
    } else {
      const directionZ = playerNumber === 1 ? -Math.abs(swingVector.dy) * 0.03 : Math.abs(swingVector.dy) * 0.03;
      const impulseDirection = new CANNON.Vec3(swingVector.dx * 0.02, 0, directionZ);
      if (impulseDirection.length() === 0) return;

      impulseDirection.normalize();
      ballBody.applyImpulse(impulseDirection.scale(BALL_MASS * power * MAX_BALL_SPEED), ballBody.position);
    }

    const torque = new CANNON.Vec3(spinData.torqueX || 0, 0, spinData.torqueZ || 0);
    if (typeof ballBody.applyTorque === 'function') {
      ballBody.applyTorque(torque);
    } else {
      ballBody.torque.vadd(torque, ballBody.torque);
    }

    ballBody.wakeUp();
    this.clampBallSpeed(ballBody);
  }

  step(gameState, delta) {
    const roomPhysics = this.rooms.get(gameState.roomCode);
    if (!roomPhysics || gameState.winner) return;

    if (gameState.phase === 'point' || gameState.phase === 'let') {
      this.stopBall(roomPhysics.ballBody);
      if (gameState.resumeServeIfReady()) {
        this.resetRoomTracking(roomPhysics, gameState);
        this.placeBallForServe(gameState, roomPhysics.ballBody);
      }
      this.syncToGameState(gameState, roomPhysics);
      return;
    }

    if (gameState.phase === 'serve') {
      this.placeBallForServe(gameState, roomPhysics.ballBody);
      roomPhysics.previousBallZ = roomPhysics.ballBody.position.z;
      this.syncToGameState(gameState, roomPhysics);
      return;
    }

    const previousZ = roomPhysics.previousBallZ;
    roomPhysics.world.step(FIXED_STEP, delta, 3);
    this.updateNetCrossing(gameState, roomPhysics, previousZ, roomPhysics.ballBody.position.z);
    roomPhysics.previousBallZ = roomPhysics.ballBody.position.z;
    this.clampBallSpeed(roomPhysics.ballBody);
    this.syncToGameState(gameState, roomPhysics);
    this.applyRules(gameState, roomPhysics);
  }

  placeBallForServe(gameState, ballBody) {
    const paddle = gameState.getPaddle(gameState.servingPlayer);
    const serveZ = gameState.getServeZ(gameState.servingPlayer);
    ballBody.position.set(paddle.position.x, paddle.position.y + 0.12, serveZ);
    this.stopBall(ballBody);
  }

  handleCourtBounce(gameState, roomPhysics) {
    if (gameState.phase !== 'rally') return;

    const now = Date.now();
    if (now - roomPhysics.lastBounceAt < BOUNCE_DEBOUNCE_MS) return;
    roomPhysics.lastBounceAt = now;

    const zone = getCourtZone(roomPhysics.ballBody.position);
    if (!zone) return;

    const state = gameState.ballState;
    const previousZone = state.lastBounceZone;
    state.lastBounceZone = zone;
    state.bounceCount = previousZone === zone ? state.bounceCount + 1 : 1;

    if (state.isServing) {
      this.handleServeBounce(gameState, roomPhysics, zone);
      return;
    }

    if (state.bounceCount >= 2) {
      this.scoreAndReset(gameState, roomPhysics, opponentOf(courtOwner(zone)), 'double-bounce');
      return;
    }

    const lastHit = gameState.getLastHitPlayerNumber();
    if (lastHit && zone === courtForPlayer(lastHit)) {
      this.scoreAndReset(gameState, roomPhysics, gameState.getOpponent(lastHit), 'net');
    }
  }

  handleServeBounce(gameState, roomPhysics, zone) {
    const state = gameState.ballState;
    const server = state.server || gameState.servingPlayer;
    const ownCourt = courtForPlayer(server);
    const opponentCourt = courtForPlayer(gameState.getOpponent(server));

    if (zone === ownCourt) {
      if (state.serveStep === 0) {
        state.serveStep = 1;
        return;
      }

      this.scoreAndReset(gameState, roomPhysics, gameState.getOpponent(server), 'serve-fault');
      return;
    }

    if (zone !== opponentCourt) return;

    if (state.serveStep < 1) {
      this.scoreAndReset(gameState, roomPhysics, gameState.getOpponent(server), 'serve-fault');
      return;
    }

    state.crossedNet = true;
    if (state.touchedNet) {
      this.letAndReset(gameState, roomPhysics);
      return;
    }

    state.serveStep = 3;
    state.isServing = false;
  }

  handleNetCollision(gameState, roomPhysics) {
    if (gameState.phase !== 'rally') return;

    gameState.markNetTouch();
    roomPhysics.ballBody.velocity.scale(0.55, roomPhysics.ballBody.velocity);
    roomPhysics.ballBody.angularVelocity.scale(0.45, roomPhysics.ballBody.angularVelocity);
  }

  handleNetAssemblyCollision(gameState, roomPhysics) {
    if (gameState.phase !== 'rally') return;

    const lastHit = gameState.getLastHitPlayerNumber();
    const server = gameState.ballState.server || gameState.servingPlayer;
    const loser = gameState.ballState.isServing ? server : lastHit;
    if (!loser) return;

    this.scoreAndReset(gameState, roomPhysics, gameState.getOpponent(loser), gameState.ballState.isServing ? 'serve-fault' : 'net');
  }

  updateNetCrossing(gameState, roomPhysics, previousZ, currentZ) {
    const lastHit = gameState.getLastHitPlayerNumber();
    if (!lastHit || previousZ === undefined || previousZ === null) return;

    const crossedTowardOpponent = lastHit === 1
      ? previousZ > 0 && currentZ <= 0
      : previousZ < 0 && currentZ >= 0;
    if (!crossedTowardOpponent) return;

    if (roomPhysics.ballBody.position.y >= NET_TOP_Y) {
      gameState.markCrossedNet();
    }
  }

  applyRules(gameState, roomPhysics) {
    if (gameState.phase !== 'rally') return;

    const { ballBody } = roomPhysics;
    const z = ballBody.position.z;
    const x = ballBody.position.x;
    const y = ballBody.position.y;

    if (this.finalizeServeLanding(gameState, roomPhysics)) return;

    if (Math.abs(x) > TABLE_OUT_X || Math.abs(z) > TABLE_OUT_Z || y < TABLE_SURFACE_Y - 0.45) {
      const decision = this.resolveOutDecision(gameState, z);
      this.scoreAndReset(gameState, roomPhysics, decision.scorer, decision.reason);
    }
  }

  finalizeServeLanding(gameState, roomPhysics) {
    const state = gameState.ballState;
    if (!state.isServing || state.serveStep < 1 || !state.crossedNet) return false;

    const zone = getCourtZone(roomPhysics.ballBody.position);
    const server = state.server || gameState.servingPlayer;
    const opponentCourt = courtForPlayer(gameState.getOpponent(server));
    const isOnTable = roomPhysics.ballBody.position.y <= TABLE_CONTACT_Y;
    if (zone !== opponentCourt || !isOnTable) return false;

    if (state.touchedNet) {
      this.letAndReset(gameState, roomPhysics);
      return true;
    }

    state.lastBounceZone = opponentCourt;
    state.bounceCount = 1;
    state.serveStep = 3;
    state.isServing = false;
    return false;
  }

  resolveOutDecision(gameState, z) {
    const state = gameState.ballState;
    const lastHit = gameState.getLastHitPlayerNumber();
    if (!lastHit) {
      return { scorer: z >= 0 ? 2 : 1, reason: 'out' };
    }

    if (state.isServing) {
      return { scorer: gameState.getOpponent(state.server || gameState.servingPlayer), reason: 'serve-fault' };
    }

    const opponentCourt = courtForPlayer(gameState.getOpponent(lastHit));
    if (state.touchedNet && !state.crossedNet) {
      return { scorer: gameState.getOpponent(lastHit), reason: 'net' };
    }

    if (state.lastBounceZone === opponentCourt && state.bounceCount >= 1) {
      return { scorer: lastHit, reason: 'out' };
    }

    return { scorer: gameState.getOpponent(lastHit), reason: 'out' };
  }

  scoreAndReset(gameState, roomPhysics, scorer, reason) {
    const now = Date.now();
    if (now < roomPhysics.pointLockedUntil) return;

    const point = gameState.scorePoint(scorer, reason);
    if (!point) return;

    roomPhysics.pointLockedUntil = now + 250;
    this.stopBall(roomPhysics.ballBody);
    this.resetRoomTracking(roomPhysics, gameState);
  }

  letAndReset(gameState, roomPhysics) {
    const now = Date.now();
    if (now < roomPhysics.pointLockedUntil) return;

    gameState.markLet('let');
    roomPhysics.pointLockedUntil = now + 250;
    this.stopBall(roomPhysics.ballBody);
    this.resetRoomTracking(roomPhysics, gameState);
  }

  resetRoomTracking(roomPhysics, gameState) {
    roomPhysics.lastBounceAt = 0;
    roomPhysics.previousBallZ = gameState.getServeZ(gameState.servingPlayer);
  }

  syncFromGameState(gameState) {
    const roomPhysics = this.rooms.get(gameState.roomCode);
    if (!roomPhysics) return;

    roomPhysics.ballBody.position.copy(toVec3(gameState.ball.position));
    roomPhysics.ballBody.velocity.copy(toVec3(gameState.ball.velocity));
    roomPhysics.ballBody.angularVelocity.copy(toVec3(gameState.ball.angularVelocity));
    roomPhysics.paddleBodies[1].position.copy(toVec3(gameState.player1Paddle.position));
    roomPhysics.paddleBodies[2].position.copy(toVec3(gameState.player2Paddle.position));
  }

  syncToGameState(gameState, roomPhysics) {
    gameState.ball = {
      position: fromVec3(roomPhysics.ballBody.position),
      velocity: fromVec3(roomPhysics.ballBody.velocity),
      angularVelocity: fromVec3(roomPhysics.ballBody.angularVelocity),
    };
    gameState.player1Paddle.position = fromVec3(roomPhysics.paddleBodies[1].position);
    gameState.player2Paddle.position = fromVec3(roomPhysics.paddleBodies[2].position);
  }

  stopBall(ballBody) {
    ballBody.velocity.set(0, 0, 0);
    ballBody.angularVelocity.set(0, 0, 0);
    ballBody.force.set(0, 0, 0);
    ballBody.torque.set(0, 0, 0);
  }

  clampBallSpeed(ballBody) {
    const speed = ballBody.velocity.length();
    if (speed <= MAX_BALL_SPEED || speed === 0) return;

    ballBody.velocity.normalize();
    ballBody.velocity.scale(MAX_BALL_SPEED, ballBody.velocity);
  }

  removeRoom(roomCode) {
    this.rooms.delete(roomCode);
  }
}

function getCourtZone(position) {
  const inX = Math.abs(position.x) <= TABLE_HALF_WIDTH + TABLE_LINE_EPSILON;
  const inZ = Math.abs(position.z) <= TABLE_HALF_LENGTH + TABLE_LINE_EPSILON;
  if (!inX || !inZ) return null;
  return position.z >= 0 ? 'player1Court' : 'player2Court';
}

function courtForPlayer(playerNumber) {
  return playerNumber === 1 ? 'player1Court' : 'player2Court';
}

function courtOwner(zone) {
  return zone === 'player1Court' ? 1 : 2;
}

function opponentOf(playerNumber) {
  return playerNumber === 1 ? 2 : 1;
}

function toVec3(value = {}) {
  return new CANNON.Vec3(Number(value.x || 0), Number(value.y || 0), Number(value.z || 0));
}

function fromVec3(vec3) {
  return {
    x: vec3.x,
    y: vec3.y,
    z: vec3.z,
  };
}
