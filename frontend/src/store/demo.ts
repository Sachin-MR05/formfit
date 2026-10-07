import { create } from 'zustand';

/** Tiny store used by the Phase 0 design page to prove Zustand is wired up. */
interface DemoState {
  score: number;
  setScore: (score: number) => void;
}

export const useDemoStore = create<DemoState>()((set) => ({
  score: 87,
  setScore: (score) => set({ score: Math.min(100, Math.max(0, score)) }),
}));
