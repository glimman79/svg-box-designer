import type { ReactNode } from 'react';

/** Shared layout boundary. Keep module owners mounted so navigation preserves CAD state. */
export function WorkspaceShell({ active, label, className, children }: {
  active: boolean;
  label: string;
  className: string;
  children: ReactNode;
}) {
  return <section className={`${className} workspace-shell`} aria-label={label} hidden={!active} inert={!active}>
    {children}
  </section>;
}
