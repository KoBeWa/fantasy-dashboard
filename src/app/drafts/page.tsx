"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { loadTSV } from "@/lib/data";

  // ----- Typen -----
  type DraftRow = {
    Year: number | string;
    Owner: string;
    Player: string;
    Pos: string;
    Pick: number | string;
    Draft_Pos_Rank?: number | string;
    Final_Pos_Rank?: number | string;
    Delta_Pos_Rank?: number | string;
    Points: number | string;
    Score: number | string;
  };
  
  // ... nachdem du `drafts` aus TSV geladen hast:
  
  // 1) Parsing/Normalisierung
  const parsed: DraftRow[] = (drafts as any[]).map((d) => ({
    ...d,
    Year: Number(d.Year),
    Pick: Number(d.Pick),
    Points: Number(d.Points ?? 0),
    Score: Number(d.Score ?? 0),
    Pos: String(d.Pos ?? "").toUpperCase(),
    Player: String(d.Player ?? ""),
    Owner: String(d.Owner ?? "")
  }));
  
  // 2) Jahre ohne Endrankings ausschließen (z. B. 2025)
  const EXCLUDE_YEARS = new Set<number>([2025]);
  const filtered = parsed.filter((d) => !EXCLUDE_YEARS.has(Number(d.Year)));
  
  // 3) Aggregation: Durchschnitt pro (Owner, Year)
  const byOwnerYear = (() => {
    const map = new Map<string, { owner: string; year: number; avg: number; n: number }>();
    for (const d of filtered) {
      const key = `${d.Owner}__${d.Year}`;
      const prev = map.get(key) ?? { owner: d.Owner, year: Number(d.Year), avg: 0, n: 0 };
      const score = Number(d.Score) || 0;
      const n = prev.n + 1;
      const avg = (prev.avg * prev.n + score) / n;
      map.set(key, { owner: d.Owner, year: Number(d.Year), avg, n });
    }
    return Array.from(map.values());
  })();
  
  // 4) Best/Worst Overall Drafts (Owner-Year, nach Durchschnitt)
  const bestDrafts = [...byOwnerYear].sort((a, b) => b.avg - a.avg).slice(0, 5);
  const worstDrafts = [...byOwnerYear].sort((a, b) => a.avg - b.avg).slice(0, 5);
  
  // 5) Best Picks (Top Scores)
  const bestPicks = [...filtered].sort((a, b) => Number(b.Score) - Number(a.Score)).slice(0, 5);
  
  // 6) Worst Picks (keine K/DST, keine 0-Punkte; Ausnahme Andrew Luck 2019 zulassen)
  const worstPicks = [...filtered]
    .filter((p) => p.Pos !== "K" && p.Pos !== "DST")
    .filter((p) => {
      const year = Number(p.Year);
      const pts = Number(p.Points) || 0;
      const isAndrewLuck2019 = p.Player.toLowerCase() === "andrew luck" && year === 2019;
      return isAndrewLuck2019 || pts > 0; // 0-Punkte-Spieler raus, außer AL2019
    })
    .sort((a, b) => Number(a.Score) - Number(b.Score))
    .slice(0, 5);
  
  // 7) First overall picks
  const firstOverall = filtered.filter((d) => Number(d.Pick) === 1);


  return (
    <main className="p-6 space-y-8">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Drafts</h1>
        <Link href="/" className="ml-auto text-sm underline decoration-dotted hover:decoration-solid">
          ← zurück zum Dashboard
        </Link>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">🏆 Best Overall Drafts</h2>
          <Table
            rows={topDrafts}
            header={<tr><th>Season</th><th>Owner</th><th>Ø Score</th><th>Picks</th></tr>}
            render={(r) => (
              <>
                <td>{r.year}</td>
                <td>{r.owner}</td>
                <td>{r.avg.toFixed(2)}</td>
                <td>{r.count}</td>
              </>
            )}
          />
        </article>

        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">💀 Worst Overall Drafts</h2>
          <Table
            rows={worstDrafts}
            header={<tr><th>Season</th><th>Owner</th><th>Ø Score</th><th>Picks</th></tr>}
            render={(r) => (
              <>
                <td>{r.year}</td>
                <td>{r.owner}</td>
                <td>{r.avg.toFixed(2)}</td>
                <td>{r.count}</td>
              </>
            )}
          />
        </article>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">⭐ Best Draft Selections</h2>
          <Table
            rows={bestPicks}
            header={<tr><th>Year</th><th>Owner</th><th>Player</th><th>Pos</th><th>Pick</th><th>EndRank</th><th>Score</th></tr>}
            render={(r) => (
              <>
                <td>{r.Year}</td>
                <td>{r.Owner}</td>
                <td>{r.Player}</td>
                <td>{r.Pos}</td>
                <td>{r.Pick}</td>
                <td>{r.EndRank}</td>
                <td>{Number(r.Score).toFixed(2)}</td>
              </>
            )}
          />
        </article>

        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">☠️ Worst Draft Selections</h2>
          <Table
            rows={worstPicks}
            header={<tr><th>Year</th><th>Owner</th><th>Player</th><th>Pos</th><th>Pick</th><th>EndRank</th><th>Score</th></tr>}
            render={(r) => (
              <>
                <td>{r.Year}</td>
                <td>{r.Owner}</td>
                <td>{r.Player}</td>
                <td>{r.Pos}</td>
                <td>{r.Pick}</td>
                <td>{r.EndRank}</td>
                <td>{Number(r.Score).toFixed(2)}</td>
              </>
            )}
          />
        </article>
      </section>

      <section>
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">🥇 First Overall Picks</h2>
          <Table
            rows={firstPicks}
            header={<tr><th>Year</th><th>Owner</th><th>Player</th><th>Pos</th><th>Score</th></tr>}
            render={(r) => (
              <>
                <td>{r.Year}</td>
                <td>{r.Owner}</td>
                <td>{r.Player}</td>
                <td>{r.Pos}</td>
                <td>{Number(r.Score).toFixed(2)}</td>
              </>
            )}
          />
        </article>
      </section>
    </main>
  );
}
