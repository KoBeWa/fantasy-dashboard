// src/lib/data.ts
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export async function loadJSON<T>(path: string): Promise<T> {
  const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const url = `${BASE}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
  return res.json() as Promise<T>;
}

export async function loadTSV(path: string): Promise<Record<string, string>[]> {
  const url = `${BASE}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = lines[0].split("\t");
  return lines.slice(1).filter(l => l.trim() !== "").map(line => {
    const cells = line.split("\t");
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ""));
    return obj;
  });
}
