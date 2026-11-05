import { useUI } from './useUI.js';
import { audio } from '../audio/AudioController.js';

export function SoundToggle() {
  const sound = useUI((s) => s.sound);
  const set = useUI((s) => s.set);
  return (
    <button
      type="button" className="tool" aria-pressed={sound} aria-label={sound ? 'turn sound off' : 'turn sound on'}
      onClick={() => { const next = !sound; audio.setEnabled(next); set({ sound: next }); }}
    >
      sound <b>{sound ? 'on' : 'off'}</b>
      <span className={`meter${sound ? ' is-on' : ''}`} aria-hidden="true"><i /><i /><i /></span>
    </button>
  );
}
