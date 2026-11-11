import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const sizes = ['small', 'normal', 'large'] as const;
type IconSize = typeof sizes[number];
const storageKey = 'sbd.ui.iconSize';
function readSize(): IconSize {
  try { const value = localStorage.getItem(storageKey); return sizes.find(size => size === value) ?? 'normal'; }
  catch { return 'normal'; }
}

/** Application chrome only. Never participates in document or workflow history. */
export function WorkspaceSettings() {
  const [size, setSize] = useState<IconSize>(readSize);
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const category = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const submenu = useRef<HTMLDivElement>(null);
  const focusSubmenu = useRef(false);
  useLayoutEffect(() => {
    if (nested && focusSubmenu.current) {
      submenu.current?.querySelector<HTMLButtonElement>(`[data-size="${size}"]`)?.focus();
      focusSubmenu.current = false;
    }
  }, [nested, size]);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [subPosition, setSubPosition] = useState({ left: 0, top: 0 });
  useEffect(() => {
    document.documentElement.dataset.uiSize = size;
    try { localStorage.setItem(storageKey, size); } catch { /* Storage is optional. */ }
  }, [size]);
  const close = (restore = true) => { setOpen(false); setNested(false); if (restore) trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect(), panel = menu.current?.getBoundingClientRect();
      if (anchor && panel) setPosition({ left: Math.max(4, Math.min(anchor.left, innerWidth - panel.width - 4)), top: Math.max(4, Math.min(anchor.bottom + 2, innerHeight - panel.height - 4)) });
      const item = category.current?.getBoundingClientRect(), child = submenu.current?.getBoundingClientRect();
      if (item && child) setSubPosition({ left: Math.max(4, Math.min(item.right + child.width <= innerWidth - 4 ? item.right : item.left - child.width, innerWidth - child.width - 4)), top: Math.max(4, Math.min(item.top, innerHeight - child.height - 4)) });
    };
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, nested, size, position.left, position.top]);
  useEffect(() => {
    if (!open) return;
    category.current?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(false); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const keys = (event: KeyboardEvent) => {
      // Capture only while a menu is open, before module CAD shortcuts.
      event.stopImmediatePropagation();
      const items = Array.from(submenu.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape' || (event.key === 'ArrowLeft' && nested)) {
        event.preventDefault(); if (nested) { setNested(false); category.current?.focus(); } else close();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        const controls = Array.from(document.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]'))
          .filter(element => !element.closest('[hidden], [inert]') && !element.matches(':disabled') && element.getClientRects().length > 0 && (!root.current?.contains(element) || element === trigger.current));
        const next = controls[(controls.indexOf(trigger.current!) + (event.shiftKey ? controls.length - 1 : 1)) % controls.length];
        close(false); next?.focus();
      }
      else if (event.key === 'ArrowRight' || (!nested && ['Enter', ' ', 'ArrowDown'].includes(event.key))) {
        event.preventDefault(); focusSubmenu.current = true; setNested(true); if (nested) submenu.current?.querySelector<HTMLButtonElement>(`[data-size="${size}"]`)?.focus();
      } else if (nested && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowUp' ? 2 : 1)) % 3; items[next]?.focus();
      } else if (nested && ['Enter', ' '].includes(event.key) && index >= 0) {
        event.preventDefault(); setSize(sizes[index]); close();
      } else if (nested && /^[snl]$/i.test(event.key)) {
        event.preventDefault(); items[sizes.findIndex(s => s[0] === event.key.toLowerCase())]?.focus();
      }
    };
    window.addEventListener('keydown', keys, true);
    return () => window.removeEventListener('keydown', keys, true);
  }, [open, nested, size]);
  return <div ref={root} className="workspace-settings" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) close(false); }}>
    <button ref={trigger} type="button" className="toolbar-button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'workspace-settings-menu' : undefined} onClick={() => { if (open) close(); else setOpen(true); }}><span className="settings-gear" aria-hidden="true">⚙</span> Settings</button>
    {open && <div ref={menu} id="workspace-settings-menu" role="menu" aria-label="Settings" className="settings-menu" style={position}>
      <button ref={category} role="menuitem" type="button" aria-haspopup="menu" aria-expanded={nested} aria-controls={nested ? 'workspace-icon-size-menu' : undefined} onPointerEnter={() => setNested(true)} onClick={() => setNested(true)}>Icon size <span aria-hidden="true">▶</span></button>
      {nested && <div ref={submenu} id="workspace-icon-size-menu" role="menu" aria-label="Icon size" className="settings-menu settings-submenu" style={subPosition}>
        {sizes.map(option => <button key={option} data-size={option} type="button" role="menuitemradio" aria-checked={size === option} onClick={() => { setSize(option); close(); }}><span aria-hidden="true">{size === option ? '✓' : ''}</span>{option[0].toUpperCase() + option.slice(1)}</button>)}
      </div>}
    </div>}
  </div>;
}
