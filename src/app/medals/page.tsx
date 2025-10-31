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

// ——— Owner-Farben (manuell steuerbar) ———
const COLOR_MAP: Record<string, { bg: string; fg: string; ring?: string }> = {
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
  const c = COLOR_MAP[owner] ?? { bg: "#999", fg: "#fff" };
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
        <span className="text-lg" aria-hidden>
          {emoji}
        </span>
        <span className="text-xs font-semibold text-gray-500 w-10">{pos}</span>
        <span className="truncate">{player}</span>
      </div>
      <OwnerPill owner={owner} />
    </div>
  );
}

export default function MedalsPage() {
  const [rows, setRows] = useState<MedalRow[]>([]);

  useEffect(() => {
    let off = false;
    loadTSV("data/league/players.tsv")
      .then((data) => {
        if (off) return;
        // TSV -> typisieren + trimmen
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

  // Neueste Jahre zuerst
  const yearsSorted = useMemo(() => {
    return [...rows].sort((a, b) => Number(b.Year) - Number(a.Year));
  }, [rows]);

  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Medals</h1>
        <Link
          href="/"
          className="ml-auto text-sm underline decoration-dotted hover:decoration-solid"
        >
          ← zurück zum Dashboard
        </Link>
      </header>

      {/* Legende */}
      <section className="text-sm text-gray-600">
        <p>
          Pro Jahr die Top-Spieler nach Position. Rechts steht, wem der Spieler in deiner Liga gehörte.
        </p>
      </section>

      {/* Grid der Jahre */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {yearsSorted.map((y) => (
          <article
            key={y.Year}
            className="border rounded-xl p-4 shadow-sm bg-white/70"
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">{y.Year}</h2>
              <span className="text-xl" title="Season medals" aria-hidden>
                🏅
              </span>
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
