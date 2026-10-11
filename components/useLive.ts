"use client";
// Données « live » : fetch d'une vue filtrée + rechargement sur signal Realtime (Supabase Broadcast)
// + sondage de secours. Les messages Realtime ne contiennent jamais de données de jeu.
import { useCallback, useEffect, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;
function supa() {
  if (client === undefined) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }
  return client;
}

export interface Live<T> {
  data: T | null;
  error: string | null;
  status: number;
  /** Décalage pour estimer l'heure de jeu courante : now = data.clock.now + (Date.now() - fetchedAt) / 1000. */
  fetchedAt: number;
  reload: () => void;
}

export function useLive<T>(url: string, channels: (data: T | null) => string[], pollMs = 3000): Live<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; status: number; fetchedAt: number }>({
    data: null, error: null, status: 0, fetchedAt: 0,
  });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        setState((s) => res.ok
          ? { data: json as T, error: null, status: res.status, fetchedAt: Date.now() }
          : { ...s, error: json.error ?? `Erreur ${res.status}`, status: res.status });
      })
      .catch(() => { if (!cancelled) setState((s) => ({ ...s, error: "Hors ligne" })); });
    return () => { cancelled = true; };
  }, [url, version]);

  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") reload(); }, supa() ? pollMs * 3 : pollMs);
    const onVis = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [reload, pollMs]);

  const topics = channels(state.data).join("|");
  useEffect(() => {
    const s = supa();
    if (!s || !topics) return;
    const subs = topics.split("|").map((t) => s.channel(t).on("broadcast", { event: "refresh" }, () => reload()).subscribe());
    return () => { subs.forEach((c) => void s.removeChannel(c)); };
  }, [topics, reload]);

  return { ...state, reload };
}

/** Heure de jeu estimée côté client, rafraîchie 4 fois par seconde. */
export function useGameNow(clock: { now: number; paused: boolean } | undefined, fetchedAt: number) {
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  if (!clock) return 0;
  return clock.paused ? clock.now : clock.now + Math.max(0, nowMs - fetchedAt) / 1000;
}

export function fmt(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export async function post<T = Record<string, unknown>>(url: string, payload: unknown = {}): Promise<T & { error?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return res.json().catch(() => ({ error: `Erreur ${res.status}` }));
}
