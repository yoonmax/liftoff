import gsap from 'gsap';
import { interfaceBus } from '../interface/interfaceBus.js';
import { scrollToProgress } from './ScrollController.js';

let busy = false;

/** Closes the circle: a slow fade through deep blue, the scroll position moves under cover, dawn on the pad returns. */
export function beginAgain() {
  if (busy) return;
  busy = true;
  const type = document.querySelector('.titles');
  gsap.to(type, { autoAlpha: 0, duration: 0.7, ease: 'power1.in' });
  gsap.to(interfaceBus, {
    veil: 1, duration: 1.1, ease: 'power2.inOut',
    onComplete() {
      scrollToProgress(0, { immediate: true });
      history.replaceState(null, '', location.pathname + location.search);
      gsap.to(interfaceBus, { veil: 0, duration: 1.8, delay: 0.25, ease: 'power1.inOut', onComplete() { busy = false; } });
      gsap.to(type, { autoAlpha: 1, duration: 1.4, delay: 0.9, ease: 'power1.out' });
    },
  });
}
