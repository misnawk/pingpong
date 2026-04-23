import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { GameRoom } from './game/GameRoom.js';
import { GameState } from './game/GameState.js';
import { PhysicsServer } from './game/PhysicsServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const TICK_MS = 1000 / 60;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const rooms = new GameRoom();
const physicsServer = new PhysicsServer();

app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.count() });
});

io.on('connection', (socket) => {
  console.log(`[socket] connected ${socket.id}`);

  socket.on('create-room', (payload = {}) => {
    const { room, player } = rooms.createRoom(socket.id, payload.nickname);
    socket.join(room.roomCode);
    socket.emit('room-created', { roomCode: room.roomCode });
    socket.emit('room-joined', {
      playerNumber: player.playerNumber,
      roomCode: room.roomCode,
      room: rooms.serializeRoom(room),
    });
  });

  socket.on('join-room', (payload = {}) => {
    const result = rooms.joinRoom(payload.roomCode, socket.id, payload.nickname);
    if (result.error) {
      socket.emit('room-error', { message: result.error });
      return;
    }

    const { room, player } = result;
    socket.join(room.roomCode);
    socket.emit('room-joined', {
      playerNumber: player.playerNumber,
      roomCode: room.roomCode,
      room: rooms.serializeRoom(room),
    });
    socket.to(room.roomCode).emit('room-joined', {
      playerNumber: 1,
      roomCode: room.roomCode,
      room: rooms.serializeRoom(room),
    });

    if (rooms.canStart(room)) {
      startGame(room);
    }
  });

  socket.on('ready', () => {
    const result = rooms.markReady(socket.id);
    if (!result) return;
    if (rooms.canStart(result.room) && !result.room.state) {
      startGame(result.room);
    }
  });

  socket.on('player-input', (payload = {}) => {
    const room = rooms.getRoomBySocketId(socket.id);
    const player = rooms.getPlayerBySocketId(socket.id);
    if (!room?.state || !player || room.status !== 'playing') return;

    const input = room.state.applyInput(player.playerNumber, {
      type: payload.type,
      paddlePosition: payload.paddlePosition,
      swingVector: payload.swingVector,
      spinData: payload.spinData,
      timestamp: Number(payload.timestamp || Date.now()),
    });
    physicsServer.applyPlayerInput(room.state, player.playerNumber, input);
    player.lastInputAt = Date.now();
  });

  socket.on('disconnect', () => {
    const result = rooms.removeSocket(socket.id);
    if (!result) return;

    physicsServer.removeRoom(result.roomCode);
    if (result.opponent) {
      io.to(result.opponent.socketId).emit('opponent-disconnected');
    }
    console.log(`[socket] disconnected ${socket.id}`);
  });
});

setInterval(() => {
  for (const room of rooms.activeRooms()) {
    physicsServer.step(room.state, TICK_MS / 1000);

    const point = room.state.consumeLastPoint();
    if (point) {
      io.to(room.roomCode).emit('point-scored', point);
    }

    const letDecision = room.state.consumeLastLet();
    if (letDecision) {
      io.to(room.roomCode).emit('let', letDecision);
    }

    const snapshot = room.state.snapshot(Date.now());
    io.to(room.roomCode).emit('game-state', snapshot);

    if (room.state.winner) {
      io.to(room.roomCode).emit('game-over', {
        winner: room.state.winner === 1 ? 'player1' : 'player2',
        winnerPlayerNumber: room.state.winner,
        score: { ...room.state.score },
      });
      physicsServer.removeRoom(room.roomCode);
      rooms.finishRoom(room.roomCode);
    }
  }
}, TICK_MS);

function startGame(room) {
  if (room.state) return;

  const state = new GameState(room.roomCode);
  rooms.startRoom(room.roomCode, state);
  physicsServer.createRoom(state);
  io.to(room.roomCode).emit('game-start', {
    firstServer: state.firstServer,
    gameState: state.snapshot(Date.now()),
  });
}

server.listen(PORT, () => {
  console.log(`3D ping pong server listening on http://localhost:${PORT}`);
});
