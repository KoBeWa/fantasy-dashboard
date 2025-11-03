"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { loadTSV } from "@/lib/data";

type DraftScore = {
  Year: string;
  Owner: string;
  Player: string;
  Pos: string;
  Pick: string;
  EndRank: string;
  Score: string;
};

function Table<T>({ rows, header, render }: {
  rows: T[];
  header: React.ReactNode;
  render: (row: T, i: number) => React.ReactNode;
}) {
  return (
    <table className="w-full text-sm text-center border-collapse">
      <thead className="bg-gray-50 font-semibold border-b">{header}</thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t hover:bg-gray-50">
            {render(r, i)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<DraftScore[]>([]);

  useEffect(() => {
    loadTSV("data/league/draft_scores.tsv").then((rows) => {
      setDrafts(rows as DraftScore[]);
    });
  }, []);

  const byOwner = useMemo(() => {
    const map = new Map<string, DraftScore[]>();
    for (const d of drafts) {
      const key = `${d.Owner}-${d.Year}`;
      map.set(key, [...(map.get(key) || []), d]);
    }
    const agg = Array.from(map.entries()).map(([key, vals]) => {
      const [owner, year] = key.split("-");
      const avg = vals.length ? vals.reduce((s, v) => s + Number(v.Score), 0) / vals.length : 0;
      return { owner, year, avg: Number(avg.toFixed(2)), count: vals.length };
    });
    return agg;
  }, [drafts]);

  const topDrafts = [...byOwner].sort((a,b)=>b.avg - a.avg).slice(0,5);
  const worstDrafts = [...byOwner].sort((a,b)=>a.avg - b.avg).slice(0,5);

  const bestPicks = [...drafts].sort((a,b)=>Number(b.Score)-Number(a.Score)).slice(0,5);
  // Beispiel (React/Next.js, auf deiner drafts page)
  const worstPicks = allPicks
    .filter(p => p.Pos !== "K" && p.Pos !== "DST") // keine Kicker/Defenses
    .filter(p => p.Points > 0)                     // keine 0-Punkte-Spieler
    .sort((a, b) => a.Score - b.Score)
    .slice(0, 5);


  const firstPicks = [...drafts].filter(d=>Number(d.Pick)===1);

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
