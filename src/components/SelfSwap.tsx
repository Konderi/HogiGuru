import { useState } from 'react';
import { api, fmt, fmtDate, POS_LABEL, type Slot } from '../api';
import { useApi } from '../auth';
import { Avatar, Card, EntityPicker, Modal, PosBadge, Spinner, type SearchHit } from '../ui';

interface Resp {
  enabled: boolean; preview: boolean; draftDone: boolean; open: boolean; freezeGames: number; minPlayed: number;
  guru: { id: number; name: string } | null; swaps: { used: number; max: number | null };
}

/** Gurun omat vaihdot: freeze N ottelua draftin jälkeen, sitten vapaa vaihtaminen kiintiön puitteissa. */
export function SelfSwap({ slots, onDone }: { slots: Slot[]; onDone: () => void }) {
  const { data, reload } = useApi<Resp>('/me/self-swap');
  const coaches = useApi<SearchHit[]>('/coaches');
  const [out, setOut] = useState<Slot | null>(null);
  const [pick, setPick] = useState<SearchHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  if (!data) return <Spinner />;
  if (!data.guru) return null;
  const active = slots.filter((s) => s.active);
  const left = data.swaps.max == null ? null : Math.max(0, data.swaps.max - data.swaps.used);
  const canSwap = data.enabled && data.open && left !== 0;
  const done = slots.filter((s) => !s.active && s.end_date).sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''));
  const close = () => { setOut(null); setPick(null); };

  const confirm = async () => {
    if (!out || !pick) return;
    setBusy(true);
    try {
      await api('/me/self-swap', { body: { slot_id: out.id, entity_id: pick.id } });
      setMsg({ t: `Vaihto tehty: ${out.name} → ${pick.name} ✓` }); close(); reload(); onDone();
    } catch (e) { setMsg({ t: (e as Error).message, err: true }); }
    setBusy(false);
  };

  const status = !data.draftDone ? 'Vaihdot avautuvat draftin jälkeen.'
    : !data.open ? `Freeze: vaihdot avautuvat, kun jokainen joukkue on pelannut ${data.freezeGames} ottelua (nyt ${data.minPlayed}/${data.freezeGames}).`
    : left === 0 ? 'Kaikki vaihdot on käytetty.'
    : 'Vaihtaminen on auki – vaihto astuu voimaan heti.';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card title="Omat vaihdot">
        <div className="space-y-4 p-5">
          {data.preview && <p className="rounded-xl bg-ice-500/10 p-3 text-sm text-ice-300">Esikatselu ylläpitäjälle – omat vaihdot eivät ole vielä käytössä, joten vaihtoja ei voi tehdä täältä.</p>}
          <p className={`rounded-xl p-3 text-sm ${canSwap ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-slate-300'}`}>{status}</p>
          <p className="text-sm text-slate-400">Valitse lähtevä pelaaja:</p>
          <ul className="divide-y divide-white/5 rounded-xl border border-white/10">
            {active.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                <PosBadge pos={s.position} />
                <Avatar src={s.picture} name={s.name} size="h-8 w-8" />
                <span className="min-w-0 flex-1 truncate text-sm text-white">{s.name}<span className="ml-2 text-xs text-slate-500">{s.team}</span></span>
                <span className="scoreboard font-mono text-sm">{fmt(s.value)}</span>
                <button className="btn btn-ghost py-1 text-xs" disabled={!canSwap && !data.preview} onClick={() => setOut(s)}>⇄ Vaihda</button>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <div className="space-y-6">
        <Card title="Vaihtokiintiö">
          <div className="p-5 text-center">
            <p className="scoreboard text-4xl">{data.swaps.used}{data.swaps.max != null && <span className="text-slate-500">/{data.swaps.max}</span>}</p>
            <p className="mt-1 text-xs text-slate-400">{left == null ? 'Rajaton' : `${left} vaihtoa jäljellä`}</p>
            <p className="mt-3 text-xs text-slate-500">Varausrajat pätevät normaalisti. Erotetun valmentajan korvaaminen ei kuluta kiintiötä.</p>
          </div>
        </Card>
        {done.length > 0 && (
          <Card title="Tehdyt vaihdot">
            <ul className="divide-y divide-white/5 text-sm">
              {done.map((s) => <li key={s.id} className="flex justify-between px-4 py-2"><span className="text-slate-300">{s.name}</span><span className="text-xs text-slate-500">{fmtDate(s.end_date)}</span></li>)}
            </ul>
          </Card>
        )}
      </div>

      <Modal open={!!out} onClose={close} title={out ? `Vaihda: ${out.name}` : ''}>
        {out && (
          <div className="space-y-4">
            {!pick ? (
              <EntityPicker pos={out.position} options={out.position === 'C' ? coaches.data ?? [] : undefined} placeholder={`Hae ${POS_LABEL[out.position].toLowerCase()}…`} onPick={setPick} />
            ) : (
              <div className="rounded-xl bg-white/5 p-4 text-sm">
                <p><span className="text-slate-400">Ulos:</span> <b className="text-white">{out.name}</b> ({fmt(out.value)} HG)</p>
                <p className="mt-1"><span className="text-slate-400">Sisään:</span> <b className="text-white">{pick.name}</b> {pick.team && <span className="text-slate-500">· {pick.team}</span>}</p>
                {pick.max != null && (pick.reserved ?? 0) >= pick.max && <p className="mt-2 text-goal">Pelaaja on jo varattu maksimimäärän.</p>}
                <p className="mt-3 text-xs text-slate-500">Vaihto on lopullinen ja kuluttaa yhden vaihdon kiintiöstä.</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              {pick && <button className="btn btn-ghost" onClick={() => setPick(null)}>Takaisin</button>}
              <button className="btn btn-primary" disabled={!pick || busy || data.preview} onClick={confirm}>{data.preview ? 'Esikatselu' : 'Vahvista vaihto'}</button>
            </div>
          </div>
        )}
      </Modal>
      {msg && <p className={`lg:col-span-2 text-sm ${msg.err ? 'text-goal' : 'text-emerald-300'}`}>{msg.t}</p>}
    </div>
  );
}
