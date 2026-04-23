export class ScoreBoard {
  constructor(rootElement) {
    this.rootElement = rootElement;
    this.players = [];
    this.score = { left: 0, right: 0 };
    this.status = '연결 대기 중...';
    this.servingPlayer = null;
    this.renderKey = '';
    this.render();
  }

  setPlayers(players = []) {
    this.players = players;
    this.render();
  }

  updateScore(score = { left: 0, right: 0 }) {
    this.score = score;
    this.render();
  }

  setStatus(status) {
    this.status = status;
    this.render();
  }

  update({ players, score, status, servingPlayer } = {}) {
    if (players) this.players = players;
    if (score) this.score = score;
    if (status) this.status = status;
    if (servingPlayer !== undefined) this.servingPlayer = servingPlayer;
    this.render();
  }

  render() {
    const leftPlayer = this.players.find((player) => player.side === 'left');
    const rightPlayer = this.players.find((player) => player.side === 'right');
    const left = (leftPlayer?.nickname || 'LEFT').slice(0, 8);
    const right = (rightPlayer?.nickname || 'RIGHT').slice(0, 8);
    const leftScore = Math.floor(Number(this.score.left) || 0);
    const rightScore = Math.floor(Number(this.score.right) || 0);
    const leftServe = this.servingPlayer === 1 ? ' 🏓' : '';
    const rightServe = this.servingPlayer === 2 ? ' 🏓' : '';
    const renderKey = JSON.stringify({
      left,
      right,
      score: { left: leftScore, right: rightScore },
      status: this.status,
      servingPlayer: this.servingPlayer,
    });
    if (renderKey === this.renderKey) return;

    this.renderKey = renderKey;
    this.rootElement.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:12px;font-size:1.15rem;font-weight:900;white-space:nowrap;">
        <span>${left}${leftServe}</span>
        <span style="font-size:2rem;letter-spacing:0.03em;">${leftScore} : ${rightScore}</span>
        <span>${rightServe}${right}</span>
      </div>
      <div style="margin-top:8px;color:#9fb3c8;font-size:0.9rem;">${this.status}</div>
    `;
  }
}
