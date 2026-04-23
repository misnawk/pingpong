'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const roomManager = require('./roomManager');
const { startGameLoop, stopGameLoop, updatePaddle, GAME_START_DELAY_MS } = require('./gameLoop');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static client files
app.use(express.static(path.join(__dirname, '..', 'client')));

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // Create room
  socket.on('create_room', ({ nickname }) => {
    if (!nickname || !nickname.trim()) {
      socket.emit('room_error', { message: '닉네임을 입력해주세요.' });
      return;
    }
    const room = roomManager.createRoom(socket.id, nickname.trim());
    socket.join(room.roomId);
    socket.emit('room_joined', {
      roomId: room.roomId,
      side: 'left',
      players: room.players.map((p) => ({ nickname: p.nickname, side: p.side })),
    });
    console.log(`[create_room] ${nickname} created room ${room.roomId}`);
  });

  // Join room
  socket.on('join_room', ({ roomId, nickname }) => {
    if (!nickname || !nickname.trim()) {
      socket.emit('room_error', { message: '닉네임을 입력해주세요.' });
      return;
    }
    if (!roomId || !roomId.trim()) {
      socket.emit('room_error', { message: '방 코드를 입력해주세요.' });
      return;
    }

    const result = roomManager.joinRoom(roomId.trim().toUpperCase(), socket.id, nickname.trim());
    if (result.error) {
      socket.emit('room_error', { message: result.error });
      return;
    }

    const { room, player } = result;
    socket.join(room.roomId);

    // Notify all players in the room
    io.to(room.roomId).emit('room_joined', {
      roomId: room.roomId,
      side: player.side,
      players: room.players.map((p) => ({ nickname: p.nickname, side: p.side })),
    });

    console.log(`[join_room] ${nickname} joined room ${room.roomId}`);

    // Start game if 2 players
    if (room.players.length === 2) {
      setTimeout(() => {
        startGameLoop(room, io);
        io.to(room.roomId).emit('game_start', { gameState: room.gameState });
        console.log(`[game_start] room ${room.roomId}`);
      }, GAME_START_DELAY_MS);
    }
  });

  // Paddle move
  socket.on('paddle_move', ({ y }) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room || room.status !== 'playing') return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    updatePaddle(room, player.side, y);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;

    const roomId = room.roomId;
    stopGameLoop(roomId);
    roomManager.removePlayerFromRoom(socket.id);

    io.to(roomId).emit('player_disconnected');
    console.log(`[player_disconnected] room ${roomId}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
