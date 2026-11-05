import { CHAPTERS } from '../experience/ChapterRegistry.js';
import { Wordmark } from './Wordmark.jsx';

// Without WebGL2 the film can't play, so its stills stand in rather than a broken canvas.
export function Fallback() {
  return (
    <main className="fallback">
      <header style={{ position: 'fixed', left: 'var(--gutter)', top: 'var(--gutter)', zIndex: 3 }}><Wordmark /></header>
      {CHAPTERS.map((c) => (
        <section key={c.id} id={c.id} style={{ backgroundImage: `url(${import.meta.env.BASE_URL}stills/${c.id}.jpg)` }}>
          <div>
            <h2>{c.name}</h2>
            <p>{c.summary}</p>
          </div>
        </section>
      ))}
      <p style={{ padding: 'var(--gutter)' }}>this browser or device can&rsquo;t run WebGL 2, so you&rsquo;re seeing stills from the film. try a recent desktop browser for the full journey.</p>
    </main>
  );
}
