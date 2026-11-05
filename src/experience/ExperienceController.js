import { createTrack, createTimeline, seekTimeline } from './CinematicTimeline.js';
import { computeFrame, createFrame } from '../camera/CameraController.js';

// The single source of truth for the film. One progress number goes in, and `track` and `frame` come out.
export const track = createTrack();
export const timeline = createTimeline(track);
export const frame = createFrame();

export const experience = {
  progress: 0, // smoothed progress the picture is showing
  target: 0, // raw scroll progress
  velocity: 0,
  aspect: 1.6,
  apply(p, aspect = experience.aspect) {
    experience.progress = p;
    experience.aspect = aspect;
    seekTimeline(timeline, track, p);
    computeFrame(track, p, aspect, frame);
  },
};
experience.apply(0);
