import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Klikattava painike, joka avaa listan gurujen nimistä. Lista renderöidään portaalilla
 * document.bodyyn, jotta taulukon overflow tai korttien transform/backdrop-filter ei leikkaa tai siirrä sitä.
 */
export function GuruPopover({ gurus, children, className, title }: { gurus: string[]; children: ReactNode; className?: string; title?: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean } | null>(null);

  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => { if (e.target instanceof Node && btn.current?.contains(e.target)) return; setPos(null); };
    const t = setTimeout(() => document.addEventListener('pointerdown', close), 0);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', close); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [pos]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pos) { setPos(null); return; }
    const r = btn.current!.getBoundingClientRect();
    const w = 184, h = 32 + gurus.length * 22;
    const up = r.bottom + h + 8 > window.innerHeight && r.top > h + 8;
    setPos({ x: Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8)), y: up ? r.top - h - 4 : r.bottom + 4, up });
  };

  return (
    <>
      <button ref={btn} type="button" title={title} onClick={toggle} className={className}>{children}</button>
      {pos && createPortal(
        <div style={{ left: pos.x, top: pos.y, width: 184 }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
          className="fixed z-[100] rounded-xl border border-white/10 bg-rink-900 p-2 text-left text-xs shadow-2xl">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Kentällisessä ({gurus.length})</span>
          {gurus.map((g) => <span key={g} className="block truncate py-0.5 text-white">{g}</span>)}
        </div>,
        document.body,
      )}
    </>
  );
}
