class SystemSoundsService {
  private context: AudioContext | null = null;
  private unlocked = false;

  private async getContext() {
    if (typeof window === 'undefined') return null;

    if (!this.context || this.context.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.context = new AudioCtx();
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    return this.context;
  }

  async prime() {
    const ctx = await this.getContext();
    if (!ctx) return false;

    try {
      const gain = ctx.createGain();
      gain.gain.value = 0.00001;
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.frequency.value = 440;
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);
      this.unlocked = true;
      return true;
    } catch {
      return false;
    }
  }

  async playCompletion() {
    const ctx = await this.getContext();
    if (!ctx) return false;

    try {
      if (!this.unlocked) {
        await this.prime();
      }

      const master = ctx.createGain();
      master.gain.value = 0.12;
      master.connect(ctx.destination);

      const notes = [659.25, 783.99, 987.77];
      notes.forEach((frequency, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startAt = ctx.currentTime + index * 0.16;
        const stopAt = startAt + 0.22;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, startAt);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.11, startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

        osc.connect(gain);
        gain.connect(master);
        osc.start(startAt);
        osc.stop(stopAt);
      });

      if ('vibrate' in navigator) {
        navigator.vibrate?.(120);
      }

      return true;
    } catch {
      return false;
    }
  }
}

export const systemSounds = new SystemSoundsService();
