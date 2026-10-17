import { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui';

/**
 * Maalivideo sivuston sisällä. liiga.fi:n master-soittolista sisältää HEVC-variantin, erillisen ääniraidan ja
 * mainosalun, joita selainten MSE-toisto ei aina kestä. Siksi toistetaan ensin suoraan H.264-variantti (hls-720p,
 * ilman mainosta) hls.js:llä; varalla alkuperäinen lista hls.js:llä ja lopuksi selaimen natiivi HLS (Safari).
 */
export default function VideoModal({ src, title, onClose }: { src: string | null; title: string; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!src || !v) return;
    setErr(false);
    let cancelled = false;
    let destroy = () => {};
    const avc = src.replace(/playlist\.m3u8(\?.*)?$/, 'hls-720p.m3u8');
    const sources = [...new Set([avc, src])];
    const canNative = !!v.canPlayType('application/vnd.apple.mpegurl');
    const native = () => {
      v.onerror = () => setErr(true);
      v.src = avc; v.load(); v.play().catch(() => {});
    };
    import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) { if (canNative) native(); else setErr(true); return; }
      const tryAt = (i: number) => {
        if (cancelled) return;
        if (i >= sources.length) { if (canNative) native(); else setErr(true); return; }
        const h = new Hls({ preferManagedMediaSource: true });
        destroy = () => h.destroy();
        h.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
        h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) { h.destroy(); tryAt(i + 1); } });
        h.loadSource(sources[i]); h.attachMedia(v);
      };
      tryAt(0);
    }).catch(() => (canNative ? native() : setErr(true)));
    return () => { cancelled = true; destroy(); v.onerror = null; v.removeAttribute('src'); };
  }, [src]);
  return (
    <Modal open={!!src} onClose={onClose} title={title} wide>
      <video ref={ref} controls playsInline preload="auto" className="aspect-video w-full rounded-xl bg-black" />
      {err && <p className="mt-2 text-sm text-goal">Videota ei voitu toistaa. <a className="underline" href={src ?? '#'} target="_blank" rel="noreferrer">Avaa suoraan</a></p>}
    </Modal>
  );
}
