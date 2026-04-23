import { gsap } from 'gsap';

export class LobbyUI {
  constructor(rootElement) {
    this.rootElement = rootElement;
    this.nicknameInput = rootElement.querySelector('#nickname');
    this.roomCodeInput = rootElement.querySelector('#room-code');
    this.createButton = rootElement.querySelector('#create-room');
    this.joinButton = rootElement.querySelector('#join-room');
    this.messageElement = rootElement.querySelector('#lobby-message');
    this.createHandlers = new Set();
    this.joinHandlers = new Set();

    this.createButton.addEventListener('click', () => this.emitCreate());
    this.joinButton.addEventListener('click', () => this.emitJoin());
    this.roomCodeInput.addEventListener('input', () => {
      this.roomCodeInput.value = this.roomCodeInput.value.toUpperCase();
    });

    gsap.from(rootElement, { y: 24, opacity: 0, duration: 0.45, ease: 'power3.out' });
  }

  onCreateRoom(handler) {
    this.createHandlers.add(handler);
  }

  onJoinRoom(handler) {
    this.joinHandlers.add(handler);
  }

  emitCreate() {
    const nickname = this.getNickname();
    if (!nickname) {
      this.showMessage('닉네임을 입력해주세요.');
      return;
    }
    for (const handler of this.createHandlers) handler({ nickname });
  }

  emitJoin() {
    const nickname = this.getNickname();
    const roomCode = this.roomCodeInput.value.trim().toUpperCase();
    if (!nickname) {
      this.showMessage('닉네임을 입력해주세요.');
      return;
    }
    if (roomCode.length !== 6) {
      this.showMessage('방 코드는 6자리입니다.');
      return;
    }
    for (const handler of this.joinHandlers) handler({ nickname, roomCode });
  }

  getNickname() {
    return this.nicknameInput.value.trim() || 'Player';
  }

  showRoomInfo(roomId, players = []) {
    const waiting = players.length < 2 ? '상대방을 기다리는 중...' : '게임을 준비 중...';
    this.showMessage(`방 코드 ${roomId} · ${waiting}`);
  }

  showMessage(message) {
    this.messageElement.textContent = message;
    gsap.fromTo(this.messageElement, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.25 });
  }

  show() {
    this.rootElement.style.display = 'block';
    gsap.fromTo(
      this.rootElement,
      { opacity: 0, y: 18, xPercent: -50, yPercent: -50 },
      { opacity: 1, y: 0, xPercent: -50, yPercent: -50, duration: 0.35, ease: 'power3.out' },
    );
  }

  hide() {
    if (this.rootElement.style.display === 'none') return;
    gsap.to(this.rootElement, {
      opacity: 0,
      y: -16,
      duration: 0.35,
      ease: 'power2.in',
      onComplete: () => {
        this.rootElement.style.display = 'none';
      },
    });
  }
}
