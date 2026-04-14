type NoiseKind = 'white' | 'brown';

class AudioTherapyEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private cleanupFns: Array<() => void> = [];
  private playing = false;

  private async createContext() {
    if (this.context && this.context.state !== 'closed') {
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context;
    }

    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) throw new Error('Web Audio API is not supported on this device.');

    this.context = new AudioCtx();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.06;
    this.masterGain.connect(this.context.destination);
    return this.context;
  }

  async startBinauralBeat(beatHz: number, carrierHz = 220, volume = 0.06) {
    await this.stop();
    const ctx = await this.createContext();
    if (!this.masterGain) throw new Error('Audio output could not be created.');

    const merger = ctx.createChannelMerger(2);
    const leftOsc = ctx.createOscillator();
    const rightOsc = ctx.createOscillator();
    const leftGain = ctx.createGain();
    const rightGain = ctx.createGain();

    leftOsc.type = 'sine';
    rightOsc.type = 'sine';
    leftOsc.frequency.value = Math.max(40, carrierHz - beatHz / 2);
    rightOsc.frequency.value = Math.max(40, carrierHz + beatHz / 2);
    leftGain.gain.value = volume;
    rightGain.gain.value = volume;

    leftOsc.connect(leftGain);
    rightOsc.connect(rightGain);
    leftGain.connect(merger, 0, 0);
    rightGain.connect(merger, 0, 1);
    merger.connect(this.masterGain);

    leftOsc.start();
    rightOsc.start();

    this.cleanupFns.push(() => {
      leftOsc.stop();
      rightOsc.stop();
      leftOsc.disconnect();
      rightOsc.disconnect();
      leftGain.disconnect();
      rightGain.disconnect();
      merger.disconnect();
    });

    this.playing = true;
  }

  async startPureTone(frequencyHz: number, volume = 0.05) {
    await this.stop();
    const ctx = await this.createContext();
    if (!this.masterGain) throw new Error('Audio output could not be created.');

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequencyHz;
    gain.gain.value = volume;

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();

    this.cleanupFns.push(() => {
      osc.stop();
      osc.disconnect();
      gain.disconnect();
    });

    this.playing = true;
  }

  private buildNoiseBuffer(ctx: AudioContext, kind: NoiseKind) {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);

    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === 'brown') {
        lastOut = (lastOut + 0.02 * white) / 1.02;
        output[i] = lastOut * 3.5;
      } else {
        output[i] = white * 0.35;
      }
    }

    return buffer;
  }

  async startNatureNoise(kind: 'rain' | 'forest', volume = 0.05) {
    await this.stop();
    const ctx = await this.createContext();
    if (!this.masterGain) throw new Error('Audio output could not be created.');

    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    source.buffer = this.buildNoiseBuffer(ctx, kind === 'rain' ? 'white' : 'brown');
    source.loop = true;
    filter.type = kind === 'rain' ? 'highpass' : 'lowpass';
    filter.frequency.value = kind === 'rain' ? 1200 : 500;
    gain.gain.value = volume;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();

    this.cleanupFns.push(() => {
      source.stop();
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    });

    this.playing = true;
  }

  async setVolume(volume: number) {
    if (!this.context || !this.masterGain) return;
    this.masterGain.gain.value = volume;
  }

  isPlaying() {
    return this.playing;
  }

  async stop() {
    this.cleanupFns.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore individual cleanup failures
      }
    });
    this.cleanupFns = [];
    this.playing = false;

    if (this.context && this.context.state !== 'closed') {
      await this.context.close();
    }

    this.context = null;
    this.masterGain = null;
  }
}

export const audioTherapy = new AudioTherapyEngine();
