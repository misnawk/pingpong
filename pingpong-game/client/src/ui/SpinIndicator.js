import { gsap } from 'gsap';

export class SpinIndicator {
  constructor(rootElement) {
    this.rootElement = rootElement;
    this.activeKey = '';
    this.reset();
  }

  reset() {
    if (this.activeKey === 'idle') return;
    this.activeKey = 'idle';
    this.rootElement.innerHTML = `
      <div style="font-weight:900;">SPIN</div>
      <div style="color:#9fb3c8;">스윙을 하면 표시됩니다.</div>
    `;
  }

  update(spin) {
    if (!spin || spin.spinLevel === 0) {
      this.reset();
      return;
    }

    const key = `${spin.type}:${spin.spinLevel}:${spin.power?.toFixed?.(2) || 0}`;
    if (key === this.activeKey) return;
    this.show(spin);
  }

  show(spin) {
    this.activeKey = `${spin.type}:${spin.spinLevel}:${spin.power?.toFixed?.(2) || 0}`;
    this.rootElement.innerHTML = `
      <div style="font-weight:900;">${spin.type.toUpperCase()}</div>
      <div style="color:#9fffbf;">Power ${spin.power.toFixed(2)}</div>
    `;
    gsap.fromTo(this.rootElement, { scale: 0.94, opacity: 0.65 }, { scale: 1, opacity: 1, duration: 0.28, ease: 'back.out(2)' });
  }
}
