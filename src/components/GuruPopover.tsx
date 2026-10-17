import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Klikattava painike, joka avaa listan gurujen nimistä. Lista renderöidään portaalilla
 * document.bodyyn, jotta taulukon overflow tai korttien transform/backdrop-filter ei leikkaa tai siirrä sitä.
 */
export interface GuruGroup { label: string; gurus: string[] }

export function GuruPopover({ gurus, groups, children, className, title }: { gurus: string[]; groups?: GuruGroup[]; children: ReactNode; className?: string; title?: string }) {
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
    const w = groups ? 220 : 184, h = groups ? 40 + groups.reduce((a, g) => a + 26 + Math.max(1, g.gurus.length) * 22, 0) : 32 + gurus.length * 22;
    const up = r.bottom + h + 8 > window.innerHeight && r.top > h + 8;
    setPos({ x: Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8)), y: up ? r.top - h - 4 : r.bottom + 4, up });
  };

  return (
    <>
      <button ref={btn} type="button" title={title} onClick={toggle} className={className}>{children}</button>
      {pos && createPortal(
        <div style={{ left: pos.x, top: pos.y, width: groups ? 220 : 184 }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
          className="fixed z-[100] rounded-xl border border-white/10 bg-rink-900 p-2 text-left text-xs shadow-2xl">
          {groups && (() => {
            const total = groups.reduce((a, g) => a + g.gurus.length, 0);
            return <span className="mb-2 block border-b border-white/10 pb-1.5 text-[10px] text-slate-400">{gurus.length} eri gurua{total > gurus.length ? ` · ${total} pelaajavalintaa (osalla useampi maalin pelaaja)` : ''}</span>;
          })()}
          {groups ? groups.map((gr, i) => (
            <div key={gr.label} className={i ? 'mt-2 border-t border-white/10 pt-2' : ''}>
              <span className="mb-1 block truncate text-[10px] font-semibold uppercase tracking-wider text-ice-300">{gr.label} <span className="text-slate-500">({gr.gurus.length})</span></span>
              {gr.gurus.length ? gr.gurus.map((g) => <span key={g} className="block truncate py-0.5 text-white">{g}</span>) : <span className="block py-0.5 text-slate-500">ei kenelläkään</span>}
            </div>
          )) : <>
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Kentällisessä ({gurus.length})</span>
            {gurus.map((g) => <span key={g} className="block truncate py-0.5 text-white">{g}</span>)}
          </>}
        </div>,
        document.body,
      )}
    </>
  );
}
