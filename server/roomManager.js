'use strict';

const rooms = new Map();

function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function createRoom(socketId, nickname) {
  let roomId;
  do {
    roomId = generateRoomId();
  } while (rooms.has(roomId));

  const player = {
    socketId,
    nickname,
    side: 'left',
    score: 0,
  };

  const room = {
    roomId,
    players: [player],
    status: 'waiting',
    gameState: null,
  };

  rooms.set(roomId, room);
  return room;
}

function joinRoom(roomId, socketId, nickname) {
  const room = rooms.get(roomId);
  if (!room) {
    return { error: '존재하지 않는 방입니다.' };
  }
  if (room.status !== 'waiting') {
    return { error: '이미 게임이 시작된 방입니다.' };
  }
  if (room.players.length >= 2) {
    return { error: '방이 가득 찼습니다.' };
  }

  const player = {
    socketId,
    nickname,
    side: 'right',
    score: 0,
  };

  room.players.push(player);
  return { room, player };
}

function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

function getRoomBySocketId(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.socketId === socketId)) {
      return room;
    }
  }
  return null;
}

function removePlayerFromRoom(socketId) {
  for (const [roomId, room] of rooms.entries()) {
    const index = room.players.findIndex((p) => p.socketId === socketId);
    if (index !== -1) {
      room.players.splice(index, 1);
      if (room.players.length === 0) {
        rooms.delete(roomId);
      }
      return room;
    }
  }
  return null;
}

function setRoomStatus(roomId, status) {
  const room = rooms.get(roomId);
  if (room) {
    room.status = status;
  }
}

module.exports = {
  createRoom,
  joinRoom,
  getRoom,
  getRoomBySocketId,
  removePlayerFromRoom,
  setRoomStatus,
};
