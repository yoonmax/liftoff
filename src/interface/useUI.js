import { create } from 'zustand';
export const useUI = create((set) => ({
  chapter: 'prelaunch',
  sound: false,
  loaded: 0,
  ready: false,
  reduced: false,
  fallback: false,
  qualityOpen: false,
  inset: null,
  set,
}));
