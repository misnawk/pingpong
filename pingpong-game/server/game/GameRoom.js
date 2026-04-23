import { randomUUID } from 'node:crypto';

const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ROOM_CODE_LENGTH = 6;

export class GameRoom {
  constructor() {
    this.rooms = new Map();
    this.socketToRoom = new Map();
  }

  createRoom(socketId, nickname = 'Player') {
    const roomCode = this.generateRoomCode();
    const player = this.createPlayer(socketId, nickname, 1);
    const room = {
      roomCode,
      players: [player],
      status: 'waiting',
      state: null,
      createdAt: Date.now(),
      startedAt: null,
    };

    this.rooms.set(roomCode, room);
    this.socketToRoom.set(socketId, roomCode);
    return { room, player };
  }

  joinRoom(roomCode, socketId, nickname = 'Player') {
    const normalizedRoomCode = this.normalizeRoomCode(roomCode);
    const room = this.rooms.get(normalizedRoomCode);

    if (!room) return { error: '존재하지 않는 방입니다.' };
    if (room.status !== 'waiting') return { error: '이미 시작된 방입니다.' };
    if (room.players.length >= 2) return { error: '방이 가득 찼습니다.' };

    const player = this.createPlayer(socketId, nickname, 2);
    room.players.push(player);
    this.socketToRoom.set(socketId, normalizedRoomCode);
    return { room, player };
  }

  markReady(socketId) {
    const room = this.getRoomBySocketId(socketId);
    const player = room && this.getPlayerBySocketId(socketId);
    if (!room || !player) return null;

    player.ready = true;
    return { room, player };
  }

  startRoom(roomCode, state) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    room.status = 'playing';
    room.state = state;
    room.startedAt = Date.now();
    return room;
  }

  finishRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (room) room.status = 'finished';
    return room || null;
  }

  removeSocket(socketId) {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) return null;

    const room = this.rooms.get(roomCode);
    this.socketToRoom.delete(socketId);
    if (!room) return null;

    const playerIndex = room.players.findIndex((player) => player.socketId === socketId);
    if (playerIndex === -1) return null;

    const [player] = room.players.splice(playerIndex, 1);
    const opponent = room.players[0] || null;

    if (room.players.length === 0 || room.status === 'playing') {
      this.deleteRoom(roomCode);
    }

    return { roomCode, room, player, opponent };
  }

  deleteRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    for (const player of room.players) {
      this.socketToRoom.delete(player.socketId);
    }
    this.rooms.delete(roomCode);
  }

  getRoom(roomCode) {
    return this.rooms.get(this.normalizeRoomCode(roomCode)) || null;
  }

  getRoomBySocketId(socketId) {
    const roomCode = this.socketToRoom.get(socketId);
    return roomCode ? this.rooms.get(roomCode) || null : null;
  }

  getPlayerBySocketId(socketId) {
    const room = this.getRoomBySocketId(socketId);
    if (!room) return null;
    return room.players.find((player) => player.socketId === socketId) || null;
  }

  getPlayer(room, playerNumber) {
    return room.players.find((player) => player.playerNumber === playerNumber) || null;
  }

  activeRooms() {
    return [...this.rooms.values()].filter((room) => room.status === 'playing' && room.state);
  }

  canStart(room) {
    return Boolean(room && room.status === 'waiting' && room.players.length === 2);
  }

  count() {
    return this.rooms.size;
  }

  serializeRoom(room) {
    return {
      roomCode: room.roomCode,
      status: room.status,
      players: room.players.map((player) => ({
        playerId: player.playerId,
        playerNumber: player.playerNumber,
        nickname: player.nickname,
        ready: player.ready,
      })),
    };
  }

  createPlayer(socketId, nickname, playerNumber) {
    return {
      playerId: randomUUID(),
      socketId,
      playerNumber,
      nickname: String(nickname || 'Player').trim().slice(0, 12) || 'Player',
      ready: false,
      lastInputAt: 0,
    };
  }

  normalizeRoomCode(roomCode) {
    return String(roomCode || '').trim().toUpperCase();
  }

  generateRoomCode() {
    let roomCode = '';
    do {
      roomCode = Array.from(
        { length: ROOM_CODE_LENGTH },
        () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)],
      ).join('');
    } while (this.rooms.has(roomCode));

    return roomCode;
  }
}
