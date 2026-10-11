"use client";
import { useEffect, useRef, useState } from "react";
import { fmt, useGameNow, useLive } from "@/components/useLive";
import type { ScreenView as SV } from "@/lib/game/views";

type Result = {
  bars: { name: string; votes: number }[];
  none: number;
  total: number;
  kind: "expel" | "wheel" | "none";
  targetName: string | null;
  share: number;
  text: string | null;
} | null;

type CouncilPayload = {
  stage: string;
  endsAt: number;
  line: string;
  corpses: string[];
  voters: number;
  electorate: number;
  result?: Result;
  name?: string;
  text?: string;
};

const COUNT_DURATION = 8;

export default function ScreenView() {
  const live = useLive<SV>("/api/screen", () => ["screen"], 2000);
  const now = useGameNow(live.data?.clock, live.fetchedAt);
  const [sound, setSound] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const d = live.data;

  useEffect(() => {
    if (sound && d?.mode === "glas") {
      audio.current ??= new Audio("/sounds/glas.mp3");
      void audio.current.play().catch(() => {});
    }
  }, [sound, d?.mode]);

  if (!d) return <div className="flex h-dvh items-center justify-center bg-black text-gold">…</div>;
  const p = d.payload as unknown as CouncilPayload & { text?: string };

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-black text-bone">
      <Banner banner={d.banner} now={now} />
      <div className="relative flex flex-1 items-center justify-center px-16">
        {d.mode === "veille" && <Veille text={p.text ?? ""} />}
        {d.mode === "glas" && <Glas p={p} />}
        {d.mode === "conseil" && <Conseil p={p} now={now} />}
        {d.mode === "expulsion" && <Expulsion p={p} />}
        {!["veille", "glas", "conseil", "expulsion"].includes(d.mode) && <Veille text={p.text ?? d.mode} />}
      </div>
      {d.clock.paused && <div className="absolute right-6 bottom-6 font-title text-2xl text-gold/70">PAUSE</div>}
      {!sound && (
        <button onClick={() => setSound(true)} className="absolute bottom-6 left-6 rounded border border-gold/50 px-4 py-2 font-title text-gold">
          Activer le son
        </button>
      )}
    </div>
  );
}

function nightClock(now: number, duration: number) {
  const minutes = 22 * 60 + Math.min(1, Math.max(0, now / duration)) * 8 * 60;
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

function Banner({ banner, now }: { banner: SV["banner"]; now: number }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-8 border-b border-gold/30 bg-gradient-to-b from-[#120808] to-black px-10 py-5">
      <ol className="space-y-1 text-xl text-bone/80">
        {banner.questions.map((q, i) => <li key={q}><span className="mr-2 font-title text-gold">{["I", "II", "III"][i]}.</span>{q}</li>)}
      </ol>
      <div className="text-center">
        <div className="font-title text-6xl text-gold tabular-nums">{nightClock(now, banner.nightDuration)}</div>
        <div className="mt-1 font-title tracking-[0.3em] text-bone/60">
          {banner.act ? `ACTE ${["", "I", "II", "III"][banner.act]}` : banner.phase === "intro" ? "PROLOGUE" : "—"}
        </div>
      </div>
      <div className="flex flex-col items-end gap-3">
        <div className="flex items-center gap-6 font-title text-2xl">
          <span>{banner.alive} <span className="text-base text-bone/60">vivants</span></span>
          <span className="text-violet">{banner.spirits} <span className="text-base text-bone/60">Esprits</span></span>
        </div>
        <div className="flex w-80 items-center gap-3">
          <span className="text-sm text-bone/60">Missions</span>
          <div className="h-3 flex-1 overflow-hidden rounded bg-white/10">
            <div className="h-3 bg-gold transition-all duration-1000" style={{ width: `${banner.gauge * 100}%` }} />
          </div>
          <span className="w-12 text-right font-title tabular-nums">{Math.round(banner.gauge * 100)}%</span>
        </div>
        <div className="flex gap-2">
          {banner.fragments.map((f) => (
            <div key={f.code} title={f.code} className={`h-8 w-8 rounded-sm border ${
              f.state === "saved" ? "border-gold bg-gold/70" : f.state === "burned" ? "border-blood bg-blood/70" : f.state === "active" ? "border-gold animate-pulse" : "border-white/20"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Veille({ text }: { text: string }) {
  return (
    <div className="text-center">
      <h1 className="font-gothic text-[9rem] leading-none text-gold drop-shadow-[0_0_30px_rgba(201,162,74,0.35)]">Les 66 Légions</h1>
      <p className="mt-10 text-3xl italic text-bone/70">{text}</p>
    </div>
  );
}

function Glas({ p }: { p: CouncilPayload }) {
  return (
    <div className="animate-[pulse_3s_ease-in-out_infinite] text-center">
      <p className="font-gothic text-[8rem] leading-none text-blood">Le Glas</p>
      <p className="mt-8 font-title text-5xl text-bone">{p.line}</p>
      {p.corpses.length > 0 && (
        <div className="mt-10 font-title text-4xl text-bone/80">
          {p.corpses.map((c) => <div key={c}>✝ {c}</div>)}
        </div>
      )}
    </div>
  );
}

function Conseil({ p, now }: { p: CouncilPayload; now: number }) {
  const remaining = p.endsAt - now;
  if (p.stage === "debate") {
    return (
      <div className="text-center">
        <p className="font-title text-4xl tracking-[0.3em] text-gold">LE CONSEIL DÉLIBÈRE</p>
        <p className="mt-6 font-title text-[12rem] leading-none tabular-nums">{fmt(remaining)}</p>
        <p className="mt-6 text-3xl text-bone/70">{p.line}</p>
      </div>
    );
  }
  if (p.stage === "vote") {
    return (
      <div className="text-center">
        <p className="font-title text-5xl tracking-[0.3em] text-blood">VOTEZ</p>
        <p className="mt-6 font-title text-[12rem] leading-none tabular-nums">{fmt(remaining)}</p>
        <p className="mt-6 text-3xl text-bone/70">{p.voters} / {p.electorate} voix exprimées</p>
      </div>
    );
  }
  const r = p.result;
  if (!r) return null;
  // Dépouillement : les barres montent pendant 8 s même si tout est déjà connu.
  const progress = p.stage === "count" ? Math.min(1, Math.max(0, 1 - remaining / COUNT_DURATION)) : 1;
  const rows = [...r.bars, { name: "Personne", votes: r.none }].sort((a, b) => b.votes - a.votes);
  const max = Math.max(1, ...rows.map((x) => x.votes));
  return (
    <div className="w-full max-w-5xl">
      <div className="space-y-3">
        {rows.slice(0, 10).map((b) => (
          <div key={b.name} className="flex items-center gap-6">
            <span className="w-72 truncate text-right font-title text-3xl">{b.name}</span>
            <div className="h-10 flex-1 overflow-hidden rounded bg-white/5">
              <div className={`h-10 ${b.name === r.targetName ? "bg-blood" : "bg-gold/70"}`} style={{ width: `${(b.votes / max) * 100 * progress}%`, transition: "width 250ms linear" }} />
            </div>
            <span className="w-16 font-title text-3xl tabular-nums">{Math.round(b.votes * progress)}</span>
          </div>
        ))}
      </div>
      {p.stage === "result" && (
        <p className="mt-12 text-center font-title text-5xl text-gold">
          {r.kind === "expel" ? `${r.targetName} — ${Math.round(r.share * 100)} %` : r.text}
        </p>
      )}
    </div>
  );
}

function Expulsion({ p }: { p: CouncilPayload }) {
  return (
    <div className="text-center">
      <p className="font-title text-3xl tracking-[0.4em] text-bone/60">EXPULSION</p>
      <p className="mt-10 font-gothic text-[6.5rem] leading-tight text-gold">{p.text}</p>
    </div>
  );
}
