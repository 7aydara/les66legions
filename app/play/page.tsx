import Play from "./Play";

export default async function Page({ searchParams }: PageProps<"/play">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <Play initialNotice={one(sp.notice)} initialScan={one(sp.scan)} />;
}
