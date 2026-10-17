import { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui';

/** Maalivideo (HLS .m3u8) sivuston sisällä: Safari/iOS toistaa natiivisti, muut selaimet hls.js:llä. */
export default function VideoModal({ src, title, onClose }: { src: string | null; title: string; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!src || !v) return;
    setErr(false);
    let destroy = () => {};
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src;
      v.play().catch(() => {});
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (!Hls.isSupported()) { setErr(true); return; }
        const h = new Hls();
        h.loadSource(src); h.attachMedia(v);
        h.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
        h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) setErr(true); });
        destroy = () => h.destroy();
      });
    }
    return () => destroy();
  }, [src]);
  return (
    <Modal open={!!src} onClose={onClose} title={title} wide>
      <video ref={ref} controls playsInline className="aspect-video w-full rounded-xl bg-black" />
      {err && <p className="mt-2 text-sm text-goal">Videota ei voitu toistaa. <a className="underline" href={src ?? '#'} target="_blank" rel="noreferrer">Avaa suoraan</a></p>}
    </Modal>
  );
}
