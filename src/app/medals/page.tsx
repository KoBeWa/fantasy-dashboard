"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadTSV } from "@/lib/data";

/** TSV-Schema:
Year	QB	OwnerQB	RB	OwnerRB	WR	OwnerWR	TE	OwnerTE
*/
type MedalRow = {
  Year: string;
  QB: string; OwnerQB: string;
  RB: string; OwnerRB: string;
  WR: string; OwnerWR: string;
  TE: string; OwnerTE: string;
};

const POS_COLORS: Record<"QB"|"RB"|"WR"|"TE", string> = {
  QB: "#ef4444", // rot
  RB: "#3b82f6", // blau
  WR: "#22c55e", // grün
  TE: "#f59e0b", // orange
};

// Owner-Farben (für Badges im Jahres-Grid – optional)
const OWNER_COLORS: Record<string, { bg: string; fg: string }> = {
  Benni:   { bg: "#00B050", fg: "#ffffff" },
  Simi:    { bg: "#0070C0", fg: "#ffffff" },
  Kessi:   { bg: "#FFC000", fg: "#000000" },
  Tommy:   { bg: "#7030A0", fg: "#ffffff" },
  Ritz:    { bg: "#FF0000", fg: "#ffffff" },
  Marv:    { bg: "#00B0F0", fg: "#000000" },
  Erik:    { bg: "#92D050", fg: "#000000" },
  Juschka: { bg: "#C00000", fg: "#ffffff" },
};

function OwnerPill({ owner }: { owner: string }) {
  const c = OWNER_COLORS[owner] ?? { bg: "#999", fg: "#fff" };
  return (
    <span
      className="inline-block px-2 py-0.5 text-xs rounded-full"
      style={{ backgroundColor: c.bg, color: c.fg }}
      title={owner}
    >
      {owner}
    </span>
  );
}

function MedalItem({
  pos,
  player,
  owner,
  emoji,
}: {
  pos: "QB" | "RB" | "WR" | "TE";
  player: string;
  owner: string;
  emoji: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t py-2 first:border-t-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg">{emoji}</span>
        <span className="text-xs font-semibold text-gray-500 w-10">{pos}</span>
        <span className="truncate">{player}</span>
      </div>
      <OwnerPill owner={owner} />
    </div>
  );
}

// kleine runde Farbpunkte für den Tracker
function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export default function MedalsPage() {
  const [rows, setRows] = useState<MedalRow[]>([]);

  useEffect(() => {
    let off = false;
    loadTSV("data/league/players.tsv")
      .then((data) => {
        if (off) return;
        const mapped = (data as any[]).map((r) => ({
          Year: String(r.Year ?? "").trim(),
          QB: String(r.QB ?? "").trim(),
          OwnerQB: String(r.OwnerQB ?? "").trim(),
          RB: String(r.RB ?? "").trim(),
          OwnerRB: String(r.OwnerRB ?? "").trim(),
          WR: String(r.WR ?? "").trim(),
          OwnerWR: String(r.OwnerWR ?? "").trim(),
          TE: String(r.TE ?? "").trim(),
          OwnerTE: String(r.OwnerTE ?? "").trim(),
        })) as MedalRow[];
        setRows(mapped);
      })
      .catch(() => setRows([]));
    return () => {
      off = true;
    };
  }, []);

  // --- Tracker-Daten aggregieren ---
  type Totals = { owner: string; total: number; byPos: Record<"QB"|"RB"|"WR"|"TE", number> };

  const tracker: Totals[] = useMemo(() => {
    const map = new Map<string, Totals>();
    const add = (owner: string, pos: "QB"|"RB"|"WR"|"TE") => {
      if (!owner) return;
      const t = map.get(owner) ?? { owner, total: 0, byPos: { QB: 0, RB: 0, WR: 0, TE: 0 } };
      t.total += 1;
      t.byPos[pos] += 1;
      map.set(owner, t);
    };
    for (const r of rows) {
      add(r.OwnerQB, "QB");
      add(r.OwnerRB, "RB");
      add(r.OwnerWR, "WR");
      add(r.OwnerTE, "TE");
    }
    const list = Array.from(map.values());
    list.sort((a, b) => b.total - a.total || a.owner.localeCompare(b.owner));
    return list;
  }, [rows]);

  // 2-Spalten-Layout wie im Screenshot
  const splitTracker = useMemo(() => {
    const half = Math.ceil(tracker.length / 2);
    return [tracker.slice(0, half), tracker.slice(half)];
  }, [tracker]);

  const yearsSorted = useMemo(() => {
    return [...rows].sort((a, b) => Number(b.Year) - Number(a.Year));
  }, [rows]);

  return (
    <main className="p-6 space-y-8">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-wide">MEDAL TRACKER</h1>
        <Link
          href="/"
          className="ml-auto text-sm underline decoration-dotted hover:decoration-solid"
        >
          ← zurück zum Dashboard
        </Link>
      </header>

      {/* Legende */}
      <section className="space-y-2">
        <div className="flex items-center gap-3 text-xs font-semibold">
          <span className="px-2 py-0.5 rounded" style={{ background: POS_COLORS.QB, color: "#fff" }}>QB</span>
          <span className="px-2 py-0.5 rounded" style={{ background: POS_COLORS.RB, color: "#fff" }}>RB</span>
          <span className="px-2 py-0.5 rounded" style={{ background: POS_COLORS.WR, color: "#fff" }}>WR</span>
          <span className="px-2 py-0.5 rounded" style={{ background: POS_COLORS.TE, color: "#fff" }}>TE</span>
        </div>
        <p className="text-sm text-gray-600">
          Medals gehen an den Manager, der in Week 16 den punktbesten QB, RB, WR oder TE besitzt.
        </p>
      </section>

      {/* Tracker Rangliste */}
      <section className="border-t pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {splitTracker.map((col, colIdx) => (
            <div key={colIdx} className="space-y-3">
              {col.map((t, i) => {
                const rank = (colIdx === 0 ? 1 : Math.ceil(tracker.length / 2) + 1) + i;
                return (
                  <div key={t.owner} className="flex items-center justify-between gap-3">
                    {/* Rank + Name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center font-bold">
                        {rank}
                      </div>
                      <div className="font-extrabold tracking-wide uppercase truncate">{t.owner}</div>
                      {/* Dots pro Position */}
                      <div className="flex items-center gap-1 ml-1">
                        {Array.from({ length: t.byPos.QB }).map((_, k) => (<Dot key={`qb-${k}`} color={POS_COLORS.QB} />))}
                        {Array.from({ length: t.byPos.RB }).map((_, k) => (<Dot key={`rb-${k}`} color={POS_COLORS.RB} />))}
                        {Array.from({ length: t.byPos.WR }).map((_, k) => (<Dot key={`wr-${k}`} color={POS_COLORS.WR} />))}
                        {Array.from({ length: t.byPos.TE }).map((_, k) => (<Dot key={`te-${k}`} color={POS_COLORS.TE} />))}
                      </div>
                    </div>
                    {/* Medal Count Badge */}
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-yellow-300 border-4 border-yellow-500/60 flex items-center justify-center font-bold">
                        {t.total}
                      </div>
                      <span className="text-xs font-semibold text-gray-600 uppercase">Medals</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* Jahres-Grid (wie zuvor) */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {yearsSorted.map((y) => (
          <article key={y.Year} className="border rounded-xl p-4 shadow-sm bg-white/70">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">{y.Year}</h2>
              <span className="text-xl" aria-hidden>🏅</span>
            </div>
            <MedalItem pos="QB" player={y.QB} owner={y.OwnerQB} emoji="🥇" />
            <MedalItem pos="RB" player={y.RB} owner={y.OwnerRB} emoji="🥇" />
            <MedalItem pos="WR" player={y.WR} owner={y.OwnerWR} emoji="🥇" />
            <MedalItem pos="TE" player={y.TE} owner={y.OwnerTE} emoji="🥇" />
          </article>
        ))}
      </section>

      {rows.length === 0 && (
        <p className="text-sm text-gray-600">
          Keine Daten gefunden. Prüfe, ob <code>public/data/league/players.tsv</code> im Build vorhanden ist.
        </p>
      )}
    </main>
  );
}
