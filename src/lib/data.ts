// src/lib/data.ts
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export async function loadJSON<T>(path: string): Promise<T> {
  // immer als absolute URL relativ zur Site-Root inkl. basePath
  const url = `${BASE}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} (${res.status})`);
  }
  return res.json() as Promise<T>;
}
