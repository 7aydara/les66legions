import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 text-center">
      <h1 className="font-gothic text-6xl text-gold">Les 66 Légions</h1>
      <p className="max-w-md text-lg opacity-80">Scanne ton badge avec l&apos;appareil photo de ton téléphone pour entrer dans la partie.</p>
      <nav className="flex gap-6 text-sm opacity-50">
        <Link href="/play">Joueur</Link>
        <Link href="/screen">Écran</Link>
        <Link href="/mj">MJ</Link>
      </nav>
    </main>
  );
}
