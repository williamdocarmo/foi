// src/lib/sounds.ts
"use client";

let audioContext: AudioContext;

// Function to initialize AudioContext on user gesture
const initAudioContext = () => {
  if (!audioContext && typeof window !== 'undefined') {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
};

// It's best to call this from a user interaction event, like a button click.
// We will call it from the components themselves.
export const ensureAudioContext = () => {
  if (!audioContext || audioContext.state === 'suspended') {
    initAudioContext();
    audioContext?.resume();
  }
};

type SoundType = 'correct' | 'wrong' | 'combo' | 'navigate';

const playTone = (frequency: number, duration: number, type: OscillatorType = 'sine') => {
    ensureAudioContext();
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

    gainNode.gain.setValueAtTime(0.001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
};

export const playSound = (sound: SoundType) => {
    // Ensure context is ready, especially on first play.
    ensureAudioContext();

    switch (sound) {
        case 'correct':
            // Um som ascendente e positivo
            playTone(600, 0.1, 'sine');
            setTimeout(() => playTone(800, 0.15, 'sine'), 100);
            break;
        case 'wrong':
            // Um som descendente e grave
            playTone(200, 0.2, 'sawtooth');
             setTimeout(() => playTone(150, 0.25, 'sawtooth'), 120);
            break;
        case 'combo':
             // Um som rápido e brilhante, como uma notificação
            playTone(900, 0.08, 'triangle');
            setTimeout(() => playTone(1200, 0.1, 'triangle'), 80);
            break;
        case 'navigate':
            // Um clique sutil
            playTone(800, 0.05, 'triangle');
            break;
    }
};
