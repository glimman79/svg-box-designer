import { useRef, useState, type PointerEvent } from 'react';

const DOUBLE_ACTIVATION_MS = 350;
const DOUBLE_ACTIVATION_DISTANCE_PX = 6;

type Activation = { timestamp: number; x: number; y: number };

export default function EdgeToolRepro() {
  const [pointerCount, setPointerCount] = useState(0);
  const [activationMode, setActivationMode] = useState<'normal' | 'persistent'>('normal');
  const previousActivation = useRef<Activation | null>(null);

  const activate = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const previous = previousActivation.current;
    const elapsed = previous ? event.timeStamp - previous.timestamp : Number.POSITIVE_INFINITY;
    const distanceSquared = previous
      ? (event.clientX - previous.x) ** 2 + (event.clientY - previous.y) ** 2
      : Number.POSITIVE_INFINITY;
    const persistent = elapsed >= 0
      && elapsed <= DOUBLE_ACTIVATION_MS
      && distanceSquared <= DOUBLE_ACTIVATION_DISTANCE_PX ** 2;

    setActivationMode(persistent ? 'persistent' : 'normal');
    previousActivation.current = { timestamp: event.timeStamp, x: event.clientX, y: event.clientY };
  };

  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Microsoft Edge tool activation repro</h1>
      <p>This development-only page compares four isolated button behaviors. No Drawing or Box code is loaded.</p>

      <section style={{ marginBlock: 32 }}>
        <h2>Case 1 — Native button</h2>
        <button type="button">Line</button>
      </section>

      <section style={{ marginBlock: 32 }}>
        <h2>Case 2 — user-select none</h2>
        <button type="button" style={{ WebkitUserSelect: 'none', userSelect: 'none' }}>Line</button>
      </section>

      <section style={{ marginBlock: 32 }}>
        <h2>Case 3 — pointer handler</h2>
        <button type="button" onPointerDown={() => setPointerCount((count) => count + 1)}>Line</button>
        <output style={{ marginInlineStart: 12 }}>Pointer activations: {pointerCount}</output>
      </section>

      <section style={{ marginBlock: 32 }}>
        <h2>Case 4 — custom double activation</h2>
        <button type="button" onPointerDown={activate}>Line</button>
        <output style={{ marginInlineStart: 12 }}>Mode: {activationMode}</output>
        <p>First activation is normal; a second activation within 350 ms and 6 px is persistent.</p>
      </section>
    </main>
  );
}
