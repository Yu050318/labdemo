import { App } from "../features/g3-static/design/App";
import { normalizeVisualQuery } from "../features/g3-static/visual-query";

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function G3StaticPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<RawSearchParams>;
} = {}) {
  const raw = await searchParams;
  const params = new URLSearchParams();

  for (const key of ["page", "state", "qa"] as const) {
    const value = firstValue(raw[key]);
    if (value !== undefined) params.set(key, value);
  }

  return <App initialQuery={normalizeVisualQuery(params.toString())} />;
}
