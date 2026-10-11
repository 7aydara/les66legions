"use client";
import { useEffect, useRef, useState } from "react";
import { fmt, post, useGameNow, useLive } from "@/components/useLive";
import type { PlayerView } from "@/lib/game/views";
import type { ScanResult } from "@/lib/game/engine";
import Scanner from "./Scanner";

type Tab = "role" | "scan" | "missions" | "vote";

const NOTICES: Record<string, string> = {
  badge_first: "Scanne d'abord ton badge.",
  badge_taken: "Ce badge est déjà lié à un autre téléphone. Va voir le MJ.",
  badge_unknown: "Badge inconnu.",
};

export default function Play({ initialNotice, initialScan }: { initialNotice?: string; initialScan?: string }) {
  const live = useLive<PlayerView>("/api/me", (d) => (d ? ["screen", d.channel] : []), 3000);
  const { data, status } = live;
  const now = useGameNow(data?.clock, live.fetchedAt);
  // L'onglet Vote s'ouvre tout seul quand le vote commence, tant que le joueur n'a pas changé d'onglet depuis.
  const [tabChoice, setTabChoice] = useState<{ tab: Tab; stage?: string }>({ tab: "role" });
  const notice = initialNotice ? NOTICES[initialNotice] ?? initialNotice : null;
  const [scanResult, setScanResult] = useState<(ScanResult & { code: string }) | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const lastStatus = useRef<string | null>(null);

  // Paramètres d'URL venant de /q/[code].
  const initialScanDone = useRef(false);
  useEffect(() => {
    if (initialNotice || initialScan) window.history.replaceState(null, "", "/play");
    if (initialScan && !initialScanDone.current) {
      initialScanDone.current = true;
      void doScan(initialScan);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNotice, initialScan]);

  // Vibration à la mort, ouverture auto de l'onglet vote.
  useEffect(() => {
    if (!data) return;
    if (lastStatus.current === "alive" && data.me.status === "corpse") navigator.vibrate?.([400, 200, 400, 200, 800]);
    lastStatus.current = data.me.status;
  }, [data]);
  const councilStage = data && "council" in data ? data.council?.stage : undefined;
  const tab: Tab = councilStage === "vote" && tabChoice.stage !== "vote" ? "vote" : tabChoice.tab;
  const setTab = (t: Tab) => setTabChoice({ tab: t, stage: councilStage });

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function doScan(raw: string) {
    const code = raw.includes("/q/") ? decodeURIComponent(raw.split("/q/")[1].split(/[?#]/)[0]) : raw;
    const r = await post<ScanResult>("/api/me/scan", { code });
    if (r.error) return flash(r.error);
    if (r.kind === "self") return flash("C'est ton propre badge.");
    if (r.kind === "zone") { flash(`Zone enregistrée.`); live.reload(); return; }
    setScanResult({ ...r, code: code.toUpperCase() });
  }

  if (status === 401 || (!data && live.error)) {
    return (
      <Screen>
        <h1 className="font-gothic text-5xl text-gold">Les 66 Légions</h1>
        <p className="mt-8 text-xl">{notice ?? live.error ?? "Scanne ton badge avec l'appareil photo de ton téléphone."}</p>
      </Screen>
    );
  }
  if (!data) return <Screen><p className="text-gold">…</p></Screen>;

  if (!data.me.name) return <NameForm onDone={live.reload} notice={notice} />;
  if (!data.role) {
    return (
      <Screen>
        <h1 className="font-gothic text-5xl text-gold">Les 66 Légions</h1>
        <p className="mt-6 text-2xl">Bienvenue, {data.me.name}.</p>
        <p className="mt-4 text-lg opacity-80">{data.lobbyText}</p>
      </Screen>
    );
  }

  const v = data as PlayerView & { role: NonNullable<PlayerView["role"]> };
  if (v.me.status === "corpse") return <Death view={v} onDone={live.reload} />;

  const isSpirit = v.me.status === "spirit" || v.me.status === "expelled";
  const tabs: [Tab, string][] = [["role", isSpirit ? "Esprit" : "Rôle"], ["scan", "Scanner"], ["missions", "Missions"]];
  if (v.council && !isSpirit) tabs.push(["vote", "Vote"]);

  return (
    <div className={`flex min-h-dvh flex-col ${isSpirit ? "bg-[#07030c]" : ""}`}>
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="font-title text-gold">{v.me.name}</span>
        <span className="text-sm opacity-70">{v.clock.paused ? "Pause" : phaseLabel(v.clock.phase)}</span>
      </header>
      {v.council && (
        <div className="bg-blood/80 px-4 py-2 text-center font-title text-sm">
          Conseil — {stageLabel(v.council.stage)} · {fmt(v.council.endsAt - now)}
        </div>
      )}
      <main className="flex-1 overflow-y-auto p-4 pb-28">
        {tab === "role" && (isSpirit ? <SpiritPanel view={v} /> : <RolePanel view={v} now={now} onBell={async () => {
          if (!confirm("Sonner la cloche d'urgence ? (1 fois par partie)")) return;
          const r = await post("/api/me/bell");
          if (r.error) flash(r.error); else live.reload();
        }} />)}
        {tab === "scan" && <ScanPanel onScan={doScan} />}
        {tab === "missions" && <MissionsPanel view={v} now={now} onScan={doScan} />}
        {tab === "vote" && v.council && <VotePanel view={v} onVoted={live.reload} flash={flash} />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 grid border-t border-white/10 bg-ink/95 backdrop-blur" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`py-4 font-title text-sm ${tab === id ? "text-gold" : "opacity-60"}`}>
            {label}
          </button>
        ))}
      </nav>
      {scanResult && (
        <ScanSheet result={scanResult} missions={v.missions} now={now} onClose={() => setScanResult(null)} flash={flash} reload={live.reload} />
      )}
      {toast && <div className="fixed inset-x-4 top-4 z-50 rounded-lg bg-black/90 p-4 text-center ring-1 ring-gold/50">{toast}</div>}
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">{children}</div>;
}

const phaseLabel = (p: string) =>
  ({ lobby: "Accueil", roles: "Rôles", intro: "Prologue", act1: "Acte I", act2: "Acte II", act3: "Acte III", verdict: "Verdict", finale: "Finale" })[p] ?? p;
const stageLabel = (s: string) =>
  ({ glas: "Glas", debate: "Débat", vote: "Vote", count: "Dépouillement", result: "Résultat", expulsion: "Expulsion", closed: "Clos" })[s] ?? s;

function NameForm({ onDone, notice }: { onDone: () => void; notice: string | null }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(notice);
  return (
    <Screen>
      <h1 className="font-gothic text-5xl text-gold">Les 66 Légions</h1>
      <form
        className="mt-10 w-full max-w-sm space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await post("/api/me/name", { name });
          if (r.error) setErr(r.error); else onDone();
        }}
      >
        <label className="block text-left text-lg">Ton prénom (le vrai)</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoFocus />
        <button className="btn w-full" disabled={!name.trim()}>Entrer</button>
        {err && <p className="text-blood">{err}</p>}
      </form>
    </Screen>
  );
}

type V = PlayerView & { role: NonNullable<PlayerView["role"]> };

function RolePanel({ view, now, onBell }: { view: V; now: number; onBell: () => void }) {
  const r = view.role;
  return (
    <div className="space-y-4">
      <div className="card text-center">
        <div className="mx-auto mb-3 flex h-32 w-32 items-center justify-center rounded-full border border-gold/40 text-4xl text-gold/60">✶</div>
        <h2 className="font-title text-2xl text-gold">{r.name}</h2>
        <p className={`mt-1 font-title text-sm uppercase tracking-widest ${r.camp === "legion" ? "text-blood" : "opacity-70"}`}>{r.campLabel}</p>
        <p className="mt-3 text-lg">{r.objective}</p>
        <p className="mt-2 text-sm opacity-60">{r.description}</p>
      </div>
      {view.legion && (
        <div className="card border-blood/50">
          <h3 className="font-title text-blood">Le Conclave</h3>
          <ul className="mt-2 space-y-1">
            {view.legion.allies.map((a) => (
              <li key={a.name} className={a.status !== "alive" ? "line-through opacity-50" : ""}>
                {a.name} — <span className="opacity-70">{a.roleName}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            Meurtre :{" "}
            {!view.legion.killsOpen ? "pas encore possible"
              : view.legion.cooldownUntil > now ? `disponible dans ${fmt(view.legion.cooldownUntil - now)}`
              : <span className="text-blood">disponible</span>}
          </p>
        </div>
      )}
      {view.known.map((k) => (
        <div key={k.label} className="card">{k.label} : <b>{k.name}</b></div>
      ))}
      <div className="card">
        <h3 className="font-title text-gold">Pouvoirs</h3>
        <ul className="mt-2 space-y-3">
          {r.powers.map((p) => (
            <li key={p.label}>
              <div className="font-semibold">{p.label} <span className="text-sm opacity-60">({p.limit})</span></div>
              <div className="text-sm opacity-80">{p.rule}</div>
            </li>
          ))}
        </ul>
      </div>
      <button className="btn-blood w-full" disabled={view.me.bellUsed || !!view.council} onClick={onBell}>
        {view.me.bellUsed ? "Cloche déjà sonnée" : "Cloche d'urgence"}
      </button>
    </div>
  );
}

function SpiritPanel({ view }: { view: V }) {
  return (
    <div className="space-y-4 text-center">
      <div className="card border-violet/60">
        <p className="font-gothic text-4xl text-violet">Esprit</p>
        <p className="mt-3 text-lg">{view.texts.spirit}</p>
        <p className="mt-2 text-sm opacity-70">Tu étais {view.role.name}.</p>
      </div>
    </div>
  );
}

function ScanPanel({ onScan }: { onScan: (code: string) => void }) {
  const [manual, setManual] = useState("");
  return (
    <div className="space-y-4">
      <Scanner onScan={onScan} />
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) onScan(manual.trim()); setManual(""); }}>
        <input className="input" placeholder="Code (ex. B07, M-BIB-1)" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button className="btn">OK</button>
      </form>
    </div>
  );
}

function MissionsPanel({ view, now, onScan }: { view: V; now: number; onScan: (c: string) => void }) {
  const byZone = new Map<string, typeof view.missions>();
  for (const m of view.missions) {
    const z = m.zone ?? "Au-delà";
    byZone.set(z, [...(byZone.get(z) ?? []), m]);
  }
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex justify-between text-sm"><span>Jauge des missions</span><span>{Math.round(view.gauge * 100)} %</span></div>
        <div className="mt-2 h-2 rounded bg-white/10"><div className="h-2 rounded bg-gold" style={{ width: `${view.gauge * 100}%` }} /></div>
      </div>
      {[...byZone].map(([zone, ms]) => (
        <div key={zone} className="card">
          <h3 className="font-title text-gold">{view.zones.find((z) => z.code === zone)?.name ?? zone}</h3>
          <ul className="mt-2 divide-y divide-white/5">
            {ms.map((m) => (
              <li key={m.code} className="flex items-center justify-between py-2">
                <span className={m.validated ? "opacity-50" : ""}>{m.code}</span>
                {m.validated ? <span className="text-gold">✓ validée</span>
                  : m.lockedUntil > now ? <span className="text-sm text-blood">verrou {fmt(m.lockedUntil - now)}</span>
                  : <button className="text-sm underline opacity-70" onClick={() => onScan(m.code)}>ouvrir</button>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-center text-sm opacity-50">Scanne le QR d&apos;une mission sur place pour la résoudre.</p>
    </div>
  );
}

function VotePanel({ view, onVoted, flash }: { view: V; onVoted: () => void; flash: (m: string) => void }) {
  const c = view.council!;
  if (!c.canVote) {
    return <p className="mt-10 text-center text-lg opacity-80">{c.stage === "vote" ? "Tu ne votes pas." : "Le vote s\u2019ouvrira après le débat."}</p>;
  }
  const choose = async (badge: string | null) => {
    const r = await post("/api/me/vote", { badge });
    if (r.error) flash(r.error); else onVoted();
  };
  const mine = c.myVote?.badge ?? (c.myVote ? null : undefined);
  return (
    <div className="space-y-2">
      <h2 className="mb-3 text-center font-title text-xl text-gold">Qui doit être expulsé ?</h2>
      {c.candidates.map((p) => (
        <button key={p.badge} onClick={() => choose(p.badge)} className={`w-full rounded-lg border px-4 py-3 text-left text-lg ${mine === p.badge ? "border-blood bg-blood/30" : "border-white/15"}`}>
          {p.name}
        </button>
      ))}
      <button onClick={() => choose(null)} className={`w-full rounded-lg border px-4 py-3 text-lg ${mine === null ? "border-gold bg-gold/20" : "border-white/15"}`}>
        Personne
      </button>
      {mine !== undefined && <p className="pt-2 text-center text-sm opacity-60">Vote enregistré. Tu peux en changer jusqu&apos;à la fin.</p>}
    </div>
  );
}

function ScanSheet({ result, missions, now, onClose, flash, reload }: {
  result: ScanResult & { code: string }; missions: V["missions"]; now: number; onClose: () => void; flash: (m: string) => void; reload: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [missionState, setMissionState] = useState<string | null>(null);

  async function act(action: "kill" | "report", badge: string) {
    if (action === "kill" && !confirm("Confirmer ?")) return;
    setBusy(true);
    const r = await post<{ message?: string }>(`/api/me/${action}`, { badge });
    setBusy(false);
    if (r.error) return flash(r.error);
    flash(action === "kill" ? (r.message ?? "Fait.") : "Le glas sonne…");
    reload();
    onClose();
  }

  async function submit(code: string) {
    setBusy(true);
    const r = await post<{ status: string; attemptsLeft?: number; correct?: boolean }>("/api/me/mission", { code, answer });
    setBusy(false);
    if (r.error) return setMissionState(r.error);
    reload();
    setMissionState(
      r.status === "validated" ? "✓ Mission validée !"
      : r.status === "already" ? "Déjà validée."
      : r.status === "not_counted" ? "Réponse enregistrée (elle ne compte pas pour toi)."
      : r.status === "locked" ? "Trop d'essais : mission verrouillée 2 min."
      : `Mauvaise réponse. Essais restants : ${r.attemptsLeft}`,
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70" onClick={onClose}>
      <div className="w-full rounded-t-2xl border-t border-gold/40 bg-ink p-5 pb-10" onClick={(e) => e.stopPropagation()}>
        {result.kind === "player" && (
          <>
            <h3 className="font-title text-2xl text-gold">{result.target.name}</h3>
            <div className="mt-4 space-y-2">
              {result.actions.length === 0 && <p className="opacity-70">Aucune action possible.</p>}
              {result.actions.map((a) => (
                <div key={a.id}>
                  <button className={a.id === "kill" ? "btn-blood w-full" : "btn w-full"} disabled={!a.enabled || busy} onClick={() => act(a.id, result.target.badge)}>
                    {a.label}
                  </button>
                  {a.reason && <p className="mt-1 text-sm opacity-60">{a.reason}</p>}
                </div>
              ))}
            </div>
          </>
        )}
        {result.kind === "mission" && (
          <>
            <h3 className="font-title text-xl text-gold">{result.code}</h3>
            {result.validated ? <p className="mt-3">Mission déjà validée.</p>
              : result.lockedUntil > now ? <p className="mt-3 text-blood">Verrouillée encore {fmt(result.lockedUntil - now)}.</p>
              : (
                <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(result.code); }}>
                  {(() => {
                    const m = missions.find((x) => x.code === result.code);
                    return m && <div><p className="font-semibold">{m.title}</p><p className="opacity-80">{m.statement}</p></div>;
                  })()}
                  <input className="input" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Ta réponse" autoFocus />
                  <button className="btn w-full" disabled={busy || !answer.trim()}>Valider</button>
                </form>
              )}
            {missionState && <p className="mt-3 text-center">{missionState}</p>}
          </>
        )}
        {result.kind === "info" && <p className="text-lg">{result.message}</p>}
        <button className="mt-6 w-full py-2 text-sm opacity-60" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

function Death({ view, onDone }: { view: V; onDone: () => void }) {
  const [sent, setSent] = useState(!view.me.deathZonePending);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-black p-6 text-center">
      <p className="font-gothic text-5xl leading-tight text-blood">{view.texts.death}</p>
      {!sent && (
        <div className="mt-10 w-full max-w-sm">
          <p className="mb-3 text-lg">{view.texts.deathZone}</p>
          <div className="grid grid-cols-2 gap-2">
            {view.zones.map((z) => (
              <button key={z.code} className={`btn ${view.me.zone === z.code ? "bg-gold/20" : ""}`} onClick={async () => {
                await post("/api/me/death-zone", { zone: z.code });
                setSent(true);
                onDone();
              }}>
                {z.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
