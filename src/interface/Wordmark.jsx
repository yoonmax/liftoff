// A minimal mark: each letter sits a hair above the one before, tracing a shallow climb. Nothing else is added.
const LETTERS = 'liftoff'.split('');
export function Wordmark({ size = 'small', as: Tag = 'span' }) {
  return (
    <Tag className={`wordmark wordmark--${size}`} aria-label="liftoff">
      {LETTERS.map((l, i) => <span aria-hidden="true" key={i} style={{ '--i': i }}>{l}</span>)}
    </Tag>
  );
}
