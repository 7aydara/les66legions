"use client";
import { useEffect, useState } from "react";
import { fmt, post, useGameNow, useLive } from "@/components/useLive";
import type { mjView } from "@/lib/game/views";
import { ROLES } from "@/content/roles";
import { DEFAULT_SETTINGS, type SettingKey } from "@/lib/game/settings";

// Dupliqué de lib/game/engine.ts (module serveur, non importable côté client).
const VICTORY_ALERTS = ["legion_win", "witness_win"];

type MV = Awaited<ReturnType<typeof mjView>>;

export default function Mj() {
  const live = useLive<MV>("/api/mj", (d) => (d ? ["screen", d.mjChannel] : []), 2000);
  const [err, setErr] = useState<string | null>(null);
  const [tickOk, setTickOk] = useState<boolean | null>(null);
  const d = live.data;
  const now = useGameNow(d?.clock, live.fetchedAt);

  // Horloge du jeu : le panneau MJ appelle /api/tick chaque seconde.
  useEffect(() => {
    if (live.status !== 200) return;
    const id = setInterval(async () => {
      const r = await fetch("/api/tick", { method: "POST" }).catch(() => null);
      setTickOk(!!r?.ok);
    }, 1000);
    return () => clearInterval(id);
  }, [live.status]);

  if (live.status === 401) return <Login onDone={live.reload} />;
  if (!d) return <div className="p-8 text-gold">{live.error ?? "…"}</div>;

  const call = async (op: string, payload: Record<string, unknown> = {}, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    const r = await post(`/api/mj/${op}`, payload);
    setErr(r.error ?? null);
    live.reload();
  };

  const bound = d.players.filter((p) => p.bound);
  const inGame = d.players.filter((p) => p.role);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 font-sans text-sm">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="font-gothic text-4xl text-gold">MJ</h1>
        <span className="rounded bg-white/10 px-3 py-1 font-mono">T+{fmt(now)}</span>
        <span className="rounded bg-white/10 px-3 py-1">{d.clock.phase}{d.clock.paused ? " · PAUSE" : ""}</span>
        <span className={`rounded px-3 py-1 ${tickOk ? "bg-green-900" : "bg-blood"}`}>tick {tickOk ? "OK" : "…"}</span>
        <span className="rounded bg-white/10 px-3 py-1">Missions {Math.round(d.gauge * 100)} %</span>
        <span className="rounded bg-white/10 px-3 py-1">
          Conclave : {!d.killsOpen ? "meurtres fermés" : d.cooldownUntil > now ? `recharge ${fmt(d.cooldownUntil - now)}` : "meurtre dispo"}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {!d.clock.launched && <button className="btn" onClick={() => call("launch", {}, "Lancer la partie ? (début de la vidéo d'intro)")}>Lancer</button>}
          {d.clock.launched && !d.clock.paused && <button className="btn" onClick={() => call("pause")}>Pause</button>}
          {d.clock.launched && d.clock.paused && <button className="btn" onClick={() => call("resume")}>Reprendre</button>}
          <button className="btn" onClick={() => call("reset", { keepPlayers: true }, "Réinitialiser la partie en GARDANT les joueurs (badges + prénoms) ?")}>Reset (garder joueurs)</button>
          <button className="btn-blood" onClick={() => call("reset", { keepPlayers: false }, "TOUT effacer ? Les téléphones devront re-scanner leur badge.")}>Reset total</button>
        </div>
      </header>
      {err && <div className="rounded bg-blood/40 p-3">{err}</div>}
      {d.alerts.map((a) => (
        <div key={a.kind} className={`flex flex-wrap items-center gap-3 rounded border p-3 ${a.decision ? "border-white/10 opacity-60" : "border-gold bg-gold/10 text-gold"}`}>
          <span className="flex-1">⚠ T+{fmt(a.at)} — {a.text}</span>
          {a.decision ? (
            <span>{a.decision === "verdict" ? "→ passage au verdict" : "→ la partie continue"} (T+{fmt(a.decidedAt ?? a.at)})</span>
          ) : (
            <>
              <button className="btn" onClick={() => call("alert", { kind: a.kind, decision: "continue" })}>
                {VICTORY_ALERTS.includes(a.kind) ? "Continuer" : "Vu"}
              </button>
              {VICTORY_ALERTS.includes(a.kind) && (
                <button className="btn-blood" onClick={() => call("alert", { kind: a.kind, decision: "verdict" }, "Passer directement au verdict ? Les événements restants seront annulés.")}>
                  Passer au verdict
                </button>
              )}
            </>
          )}
        </div>
      ))}

      {!d.clock.launched && <RolesPanel d={d} call={call} count={bound.length} />}

      <Council d={d} now={now} call={call} />

      <section className="card overflow-x-auto">
        <h2 className="mb-3 font-title text-lg text-gold">Joueurs ({inGame.length} en jeu, {bound.length} badges liés)</h2>
        <table className="w-full text-left">
          <thead className="opacity-60"><tr><th>Badge</th><th>Prénom</th><th>Rôle</th><th>Camp</th><th>Statut</th><th>Zone</th><th>Cloche</th><th /></tr></thead>
          <tbody>
            {d.players.filter((p) => p.bound || p.role).map((p) => (
              <tr key={p.id} className="border-t border-white/5">
                <td className="py-1 font-mono">{p.badge}</td>
                <td>{p.name ?? <i className="opacity-50">sans prénom</i>}</td>
                <td>
                  <select className="bg-black" value={p.role ?? ""} onChange={(e) => call("set-role", { playerId: p.id, role: e.target.value }, `Changer le rôle de ${p.name} ?`)}>
                    <option value="" disabled>—</option>
                    {ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </td>
                <td className={p.camp === "legion" ? "text-blood" : p.camp === "neutral" ? "text-violet" : ""}>{p.camp ?? ""}</td>
                <td>{p.status}{p.deathCause ? ` (${p.deathCause})` : ""}</td>
                <td>{p.zone ?? ""}</td>
                <td>{p.bellUsed ? "✓" : ""}</td>
                <td className="space-x-2 whitespace-nowrap text-right">
                  {p.role && p.status === "alive" && <button className="underline" onClick={() => call("kill", { playerId: p.id }, `Tuer ${p.name} (corps immédiat) ?`)}>tuer</button>}
                  {p.role && p.status !== "alive" && <button className="underline" onClick={() => call("revive", { playerId: p.id }, `Ressusciter ${p.name} ?`)}>ressusciter</button>}
                  {!d.clock.launched && <button className="underline opacity-60" onClick={() => call("unbind", { playerId: p.id }, `Délier le badge ${p.badge} ?`)}>délier</button>}
                  <button className="underline opacity-60" onClick={() => {
                    const badge = prompt(`Transférer ${p.name} vers quel badge libre ? (ex. B31)`);
                    if (badge) void call("transfer", { playerId: p.id, badge: badge.trim().toUpperCase() });
                  }}>transférer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Timeline d={d} now={now} call={call} />
        <div className="space-y-6">
          <ScreenPilot d={d} call={call} />
          <SettingsPanel d={d} call={call} />
          <section className="card">
            <h2 className="mb-2 font-title text-lg text-gold">Meurtres</h2>
            <ul className="space-y-1">
              {d.kills.map((k) => (
                <li key={k.id}>T+{fmt(k.scanned_at)} {k.killer} → {k.victim} · meurt T+{fmt(k.dies_at)} · {k.zone ?? "?"} {k.resolved ? "✓" : "⏳"} {k.blocked_reason ?? ""}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <section className="card">
        <h2 className="mb-2 font-title text-lg text-gold">Journal</h2>
        <ul className="max-h-96 space-y-0.5 overflow-y-auto font-mono text-xs">
          {d.log.map((l) => (
            <li key={l.id}><span className="opacity-50">{l.at != null ? `T+${fmt(l.at)}` : new Date(l.wall_at).toLocaleTimeString()}</span> <b>{l.kind}</b> {l.actor ?? ""} <span className="opacity-60">{JSON.stringify(l.payload)}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}

type Call = (op: string, payload?: Record<string, unknown>, confirmText?: string) => Promise<void>;

function Login({ onDone }: { onDone: () => void }) {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="mx-auto mt-32 max-w-sm space-y-4 p-6" onSubmit={async (e) => {
      e.preventDefault();
      const r = await post("/api/mj/login", { password: pwd });
      if (r.error) setErr(r.error); else onDone();
    }}>
      <h1 className="font-gothic text-4xl text-gold">Panneau MJ</h1>
      <input type="password" className="input" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Mot de passe" autoFocus />
      <button className="btn w-full">Entrer</button>
      {err && <p className="text-blood">{err}</p>}
    </form>
  );
}

function RolesPanel({ d, call, count }: { d: MV; call: Call; count: number }) {
  const [manual, setManual] = useState<Set<string> | null>(null);
  return (
    <section className="card space-y-3">
      <h2 className="font-title text-lg text-gold">Attribution des rôles — {count} joueurs</h2>
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => call("assign-roles", {}, `Tirer ${count} rôles au hasard ?`)}>Attribution auto (22 à 30)</button>
        <button className="btn" onClick={() => setManual(manual ? null : new Set(ROLES.map((r) => r.id)))}>Sélection manuelle…</button>
        {d.clock.phase === "roles" && <span className="self-center text-gold">Rôles attribués — prêt à lancer.</span>}
      </div>
      {manual && (
        <div>
          <div className="grid grid-cols-2 gap-1 md:grid-cols-5">
            {ROLES.map((r) => (
              <label key={r.id} className="flex items-center gap-2">
                <input type="checkbox" checked={manual.has(r.id)} onChange={(e) => {
                  const s = new Set(manual);
                  if (e.target.checked) s.add(r.id); else s.delete(r.id);
                  setManual(s);
                }} />
                <span className={r.camp === "legion" ? "text-blood" : r.camp === "neutral" ? "text-violet" : ""}>{r.name}</span>
              </label>
            ))}
          </div>
          <button className="btn mt-3" disabled={manual.size !== count} onClick={() => call("assign-roles", { roles: [...manual] })}>
            Distribuer ces {manual.size} rôles au hasard ({count} joueurs)
          </button>
        </div>
      )}
    </section>
  );
}

function Council({ d, now, call }: { d: MV; now: number; call: Call }) {
  const c = d.council;
  return (
    <section className="card">
      <div className="flex items-center gap-4">
        <h2 className="font-title text-lg text-gold">Conseil</h2>
        {c ? (
          <>
            <span>{c.trigger}{c.caller ? ` par ${c.caller}` : ""} · <b>{c.stage}</b> · {fmt(c.stage_ends_at - now)}</span>
            <button className="btn ml-auto" onClick={() => call("council-skip")}>Étape suivante</button>
          </>
        ) : (
          <button className="btn ml-auto" disabled={!d.clock.launched} onClick={() => call("council", {}, "Convoquer un conseil maintenant ?")}>Convoquer un conseil</button>
        )}
      </div>
      {c && (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <ul>{c.votes.map((v) => <li key={v.voter}>{v.voter} → {v.target}{v.weight > 1 ? ` (×${v.weight})` : ""}</li>)}</ul>
          {c.result && <pre className="text-xs opacity-80">{JSON.stringify(c.result, null, 1)}</pre>}
        </div>
      )}
    </section>
  );
}

function Timeline({ d, now, call }: { d: MV; now: number; call: Call }) {
  return (
    <section className="card">
      <h2 className="mb-2 font-title text-lg text-gold">Timeline</h2>
      <ul className="space-y-1">
        {d.events.map((e) => (
          <li key={e.id} className={`flex items-center gap-2 ${e.status !== "pending" ? "opacity-40" : e.at <= now ? "text-gold" : ""}`}>
            <span className="w-16 font-mono">T+{fmt(e.at)}</span>
            <span className="flex-1">{e.label} {e.status !== "pending" && `(${e.status}${e.note ? ` : ${e.note}` : ""})`}</span>
            {e.status === "pending" && (
              <span className="space-x-2 whitespace-nowrap">
                <button className="underline" onClick={() => call("event", { eventId: e.id, action: "shift", seconds: -60 })}>−1′</button>
                <button className="underline" onClick={() => call("event", { eventId: e.id, action: "shift", seconds: 60 })}>+1′</button>
                <button className="underline" onClick={() => call("event", { eventId: e.id, action: "shift", seconds: 300 })}>+5′</button>
                <button className="underline" onClick={() => call("event", { eventId: e.id, action: "now" }, `Déclencher « ${e.label} » maintenant ?`)}>maintenant</button>
                <button className="underline opacity-60" onClick={() => call("event", { eventId: e.id, action: "cancel" }, `Annuler « ${e.label} » ?`)}>annuler</button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScreenPilot({ d, call }: { d: MV; call: Call }) {
  const [text, setText] = useState("");
  return (
    <section className="card space-y-2">
      <h2 className="font-title text-lg text-gold">Écran</h2>
      <p>{d.forced ? `Forcé : ${d.forced.mode}${d.forced.text ? ` — « ${d.forced.text} »` : ""}` : "Automatique"}</p>
      <input className="input text-sm" placeholder="Texte libre à afficher (mode veille)" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => call("screen", { mode: "veille", text: text || undefined })}>Forcer veille{text ? " + texte" : ""}</button>
        <button className="btn" onClick={() => call("screen", {})}>Retour auto</button>
      </div>
    </section>
  );
}

const SETTING_LABELS: Partial<Record<SettingKey, string>> = {
  conclaveCooldown: "Recharge du Conclave (s)",
  deathDelay: "Délai de mort (s)",
  debateDuration: "Débat (s)",
  accusationDebateDuration: "Débat de l'Accusation (s)",
  voteDuration: "Vote (s)",
};

function SettingsPanel({ d, call }: { d: MV; call: Call }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  return (
    <section className="card space-y-2">
      <h2 className="font-title text-lg text-gold">Réglages</h2>
      {(Object.keys(SETTING_LABELS) as SettingKey[]).map((k) => (
        <label key={k} className="flex items-center justify-between gap-2">
          <span>{SETTING_LABELS[k]} <span className="opacity-40">(défaut {DEFAULT_SETTINGS[k]})</span></span>
          <input className="w-24 rounded border border-white/20 bg-black px-2 py-1" value={vals[k] ?? String(d.settings[k])} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
        </label>
      ))}
      <button className="btn" onClick={() => {
        const patch = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v)]));
        void call("settings", { settings: patch }).then(() => setVals({}));
      }}>Enregistrer</button>
    </section>
  );
}
