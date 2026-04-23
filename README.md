# 🏓 Ping Pong

실시간 멀티플레이어 탁구 게임 — Node.js, Express, Socket.io

## 실행 방법

```bash
# 1. 의존성 설치
npm install

# 2. 서버 시작
npm start
```

서버가 시작되면 브라우저에서 [http://localhost:3000](http://localhost:3000) 으로 접속하세요.

## 플레이 방법

1. 로비 페이지에서 닉네임을 입력하세요.
2. **방 만들기**를 클릭하면 6자리 방 코드가 생성됩니다.
3. 친구에게 방 코드를 공유하면 상대방이 **방 참가하기**로 입장할 수 있습니다.
4. 2명이 모이면 자동으로 게임이 시작됩니다.
5. 마우스를 위아래로 움직여 패들을 조작하세요.
6. **11점** 먼저 득점하면 승리합니다!

## 기술 스택

- **Frontend**: HTML, CSS, Canvas API, Socket.io Client
- **Backend**: Node.js, Express, Socket.io
- **실시간 통신**: WebSocket (Socket.io)
- **DB**: 없음 (서버 메모리로 상태 관리)
