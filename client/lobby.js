'use strict';

const socket = io();

const nicknameInput = document.getElementById('nicknameInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const errorMsg = document.getElementById('errorMsg');

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
  setTimeout(() => errorMsg.classList.add('hidden'), 4000);
}

createRoomBtn.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    showError('닉네임을 입력해주세요.');
    return;
  }
  socket.emit('create_room', { nickname });
});

joinRoomBtn.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  const roomId = roomCodeInput.value.trim().toUpperCase();
  if (!nickname) {
    showError('닉네임을 입력해주세요.');
    return;
  }
  if (roomId.length !== 6) {
    showError('방 코드는 6자리입니다.');
    return;
  }
  socket.emit('join_room', { roomId, nickname });
});

// Allow Enter key submission
nicknameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') roomCodeInput.value ? joinRoomBtn.click() : createRoomBtn.click();
});

roomCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoomBtn.click();
});

socket.on('room_joined', ({ roomId, side }) => {
  // Store session info and navigate
  sessionStorage.setItem('roomId', roomId);
  sessionStorage.setItem('side', side);
  sessionStorage.setItem('nickname', nicknameInput.value.trim());
  window.location.href = '/game.html';
});

socket.on('room_error', ({ message }) => {
  showError(message);
});
