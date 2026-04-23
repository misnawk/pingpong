'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const roomManager = require('./roomManager');
const { startGameLoop, stopGameLoop, updatePaddle, serveBall, GAME_START_DELAY_MS } = require('./gameLoop');

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
  socket.on('paddle_move', ({ x }) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room || room.status !== 'playing') return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    updatePaddle(room, player.side, x);
  });

  // Serve ball
  socket.on('serve_ball', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room || room.status !== 'playing') return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    if (serveBall(room, player.side)) {
      const gs = room.gameState;
      io.to(room.roomId).emit('game_state', {
        ball: gs.ball,
        paddles: gs.paddles,
        phase: gs.phase,
        serveSide: gs.serveSide,
      });
    }
  });

  // Rejoin room (after page navigation from lobby to game.html)
  socket.on('rejoin_room', ({ roomId, nickname, side }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) {
      socket.emit('room_error', { message: '방 세션이 만료되었습니다.' });
      return;
    }

    let player = room.players.find((p) => p.nickname === nickname);
    if (player) {
      player.socketId = socket.id; // 새 소켓 ID로 업데이트
    } else {
      // 플레이어가 제거된 경우 복구 (fallback)
      player = { socketId: socket.id, nickname, side: side || 'left', score: 0 };
      room.players.push(player);
    }

    socket.join(room.roomId);
    socket.emit('room_joined', {
      roomId: room.roomId,
      side: player.side,
      players: room.players.map((p) => ({ nickname: p.nickname, side: p.side })),
    });

    // 게임이 이미 시작된 경우 현재 상태 재전송
    if (room.status === 'playing' && room.gameState) {
      socket.emit('game_start', { gameState: room.gameState });
    }

    console.log(`[rejoin_room] ${nickname} rejoined room ${room.roomId}`);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;

    const roomId = room.roomId;

    if (room.status === 'playing') {
      // 게임 중 연결 끊김 → 즉시 정리
      stopGameLoop(roomId);
      roomManager.removePlayerFromRoom(socket.id);
      io.to(roomId).emit('player_disconnected');
      console.log(`[player_disconnected] room ${roomId}`);
    } else {
      // 대기 중 연결 끊김 → 페이지 이동일 수 있으므로 5초 유예
      const disconnectedSocketId = socket.id;
      setTimeout(() => {
        const currentRoom = roomManager.getRoom(roomId);
        if (!currentRoom) return;
        const player = currentRoom.players.find((p) => p.socketId === disconnectedSocketId);
        if (player) {
          // 재접속 없이 실제 연결 끊김 → 정리
          roomManager.removePlayerFromRoom(disconnectedSocketId);
          console.log(`[timeout_remove] ${disconnectedSocketId} from room ${roomId}`);
        }
      }, 5000);
    }
  });
});

function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const localIP = getLocalIP();
  console.log(`Server running on http://localhost:${PORT}`);
  if (localIP) {
    console.log(`Network access:  http://${localIP}:${PORT}`);
  }
});
