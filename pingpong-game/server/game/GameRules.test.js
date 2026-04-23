import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SERVE_HIT_Y,
  TABLE_SURFACE_Y,
} from '../../shared/constants.js';
import { GameState } from './GameState.js';
import { PhysicsServer } from './PhysicsServer.js';

test('serve succeeds after own-court bounce, net crossing, and opponent-court bounce', () => {
  const state = createDeterministicState();
  const physics = new PhysicsServer();
  physics.createRoom(state);

  const input = state.applyInput(1, {
    type: 'serve-hit',
    paddlePosition: { x: 0, z: 2.0 },
    swingVector: { dx: 0, dy: -12, magnitude: 15 },
    spinData: {},
    timestamp: Date.now(),
  });
  physics.applyPlayerInput(state, 1, input);

  stepUntil(physics, state, () => state.ballState.serveStep === 3);

  assert.equal(state.phase, 'rally');
  assert.equal(state.ballState.serveStep, 3);
  assert.equal(state.ballState.isServing, false);
  assert.deepEqual(state.score, { p1: 0, p2: 0 });
});

test('serve fault is awarded when serve reaches opponent court without own-court bounce', () => {
  const state = createDeterministicState();
  const physics = new PhysicsServer();
  const roomPhysics = physics.createRoom(state);

  state.markHit(1);
  roomPhysics.ballBody.position.set(0, SERVE_HIT_Y, 0.2);
  roomPhysics.ballBody.velocity.set(0, -1.6, -1.2);

  stepUntil(physics, state, () => state.phase === 'point');

  assert.equal(state.lastDecision.reason, 'serve-fault');
  assert.deepEqual(state.score, { p1: 0, p2: 1 });
});

test('double bounce awards the point to the other player', () => {
  const state = createDeterministicState();
  const physics = new PhysicsServer();
  const roomPhysics = physics.createRoom(state);

  state.phase = 'rally';
  state.ballState.lastHitBy = 'player2';
  roomPhysics.ballBody.position.set(0, TABLE_SURFACE_Y, 0.45);
  physics.handleCourtBounce(state, roomPhysics);
  roomPhysics.lastBounceAt = 0;
  physics.handleCourtBounce(state, roomPhysics);

  assert.equal(state.lastDecision.reason, 'double-bounce');
  assert.deepEqual(state.score, { p1: 0, p2: 1 });
});

test('11 point game requires a two point margin and deuce switches serve every point', () => {
  const state = createDeterministicState();

  for (let i = 0; i < 10; i++) state.scorePoint(1, 'out');
  for (let i = 0; i < 10; i++) state.scorePoint(2, 'out');
  assert.equal(state.winner, null);
  assert.equal(state.isDeuce(), true);

  state.scorePoint(1, 'out');
  assert.equal(state.winner, null);
  assert.equal(state.score.p1, 11);
  assert.equal(state.servingPlayer, 2);

  state.scorePoint(1, 'out');
  assert.equal(state.winner, 1);
  assert.equal(state.phase, 'finished');
});

function createDeterministicState() {
  const state = new GameState('RULES');
  state.firstServer = 1;
  state.servingPlayer = 1;
  state.ball = state.createServeBall(1);
  state.ballState = state.createBallState({ isServing: true, server: 1 });
  return state;
}

function stepUntil(physics, state, predicate, maxSteps = 360) {
  for (let i = 0; i < maxSteps; i++) {
    physics.step(state, 1 / 60);
    if (predicate()) return;
  }
  assert.fail('condition was not reached within simulation budget');
}
