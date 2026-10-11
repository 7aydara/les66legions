"use client";
import { useEffect, useRef, useState } from "react";

/** Caméra + lecture QR (html5-qrcode), chargée uniquement côté client. */
export default function Scanner({ onScan }: { onScan: (text: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const cb = useRef(onScan);
  useEffect(() => {
    cb.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let stopped = false;
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    void import("html5-qrcode").then(async ({ Html5Qrcode }) => {
      if (stopped || !ref.current) return;
      scanner = new Html5Qrcode(ref.current.id, { verbose: false });
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            const t = Date.now();
            if (text === last.current.text && t - last.current.at < 3000) return; // anti-rebond
            last.current = { text, at: t };
            cb.current(text);
          },
          () => {},
        );
      } catch {
        setError("Caméra indisponible : autorise l'accès, ou saisis le code à la main.");
      }
    });
    return () => {
      stopped = true;
      if (scanner?.isScanning) void scanner.stop().catch(() => {});
    };
  }, []);

  return (
    <div>
      <div id="l66-scanner" ref={ref} className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-black" />
      {error && <p className="mt-2 text-center text-sm text-blood">{error}</p>}
    </div>
  );
}
