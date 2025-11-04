"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type DraftRow = {
  Year: number;
  Owner: string;
  Player: string;
  Pos: string;
  Pick: number;
  Draft_Pos_Rank?: number;
  Final_Pos_Rank?: number;
  Delta_Pos_Rank?: number;
  Points: number;
  Score: number;
};

// TSV Parser
function parseTSV(text: string): DraftRow[] {
  const [headerLine, ...lines] = text.trim().split("\n");
  const headers = headerLine.split("\t").map((h) => h.trim());
  return lines.map((line) => {
    const values = line.split("\t").map((v) => v.trim());
    const row: any = {};
    headers.forEach((h, i) => (row[h] = values[i]));
    return {
      Year: Number(row.Year),
      Owner: row.Owner,
      Player: row.Player,
      Pos: row.Pos,
      Pick: Number(row.Pick),
      Draft_Pos_Rank: Number(row.Draft_Pos_Rank),
      Final_Pos_Rank: Number(row.Final_Pos_Rank),
      Delta_Pos_Rank: Number(row.Delta_Pos_Rank),
      Points: Number(row.Points),
      Score: Number(row.Score),
    };
  });
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);

  useEffect(() => {
    fetch("/fantasy-dashboard/data/league/draft_scores.tsv")
      .then((res) => res.text())
      .then((txt) => setDrafts(parseTSV(txt)))
      .catch((err) => console.error("Failed to load draft_scores.tsv:", err));
  }, []);

  if (drafts.length === 0)
    return <div className="p-6 text-center">Loading draft data…</div>;

  // === Filterung und Vorbereitung ===
  const EXCLUDE_YEARS = new Set<number>([2025]);
  const filtered = drafts.filter((d) => !EXCLUDE_YEARS.has(Number(d.Year)));

  // Aggregation pro (Owner, Year)
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

  // Top 5 Best & Worst Overall Drafts
  const bestDrafts = [...byOwnerYear].sort((a, b) => b.avg - a.avg).slice(0, 5);
  const worstDrafts = [...byOwnerYear].sort((a, b) => a.avg - b.avg).slice(0, 5);

  // Best Picks (Top Scores)
  const bestPicks = [...filtered]
    .sort((a, b) => Number(b.Score) - Number(a.Score))
    .slice(0, 5);

  // Worst Picks (Top 20 ihrer Position gedraftet, keine K/DST, keine 0-Punkte; Ausnahme Andrew Luck 2019)
  const worstPicks = [...filtered]
    .filter((p) => {
      const pos = p.Pos.toUpperCase();
      if (pos === "K" || pos === "DST") return false;        // K/DST raus
  
      const year = Number(p.Year);
      const pts = Number(p.Points) || 0;
      const isAndrewLuck2019 =
        p.Player.toLowerCase().includes("andrew luck") && year === 2019;
  
      // 0-Punkte raus (außer Andrew Luck 2019)
      if (!isAndrewLuck2019 && pts <= 0) return false;
  
      // Nur Picks, die innerhalb Top 20 der Positions-Ränge gedraftet wurden
      const draftPosRank = Number(p.Draft_Pos_Rank ?? 999);
      if (!Number.isFinite(draftPosRank) || draftPosRank > 10) return false;
  
      return true;
    })
    // schlechteste Scores zuerst
    .sort((a, b) => Number(a.Score) - Number(b.Score))
    .slice(0, 5);


  // Alle First Overall Picks
  const firstOverall = filtered.filter((d) => Number(d.Pick) === 1);

  // === Render ===
  const Table = ({
    title,
    rows,
    columns,
  }: {
    title: string;
    rows: any[];
    columns: { key: string; label: string }[];
  }) => (
    <div className="mb-8">
      <h2 className="text-xl font-bold mb-2">{title}</h2>
      <table className="w-full border border-gray-400 text-sm">
        <thead>
          <tr className="bg-gray-100">
            {columns.map((c) => (
              <th
                key={c.key}
                className="border border-gray-400 px-2 py-1 text-center"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-white even:bg-gray-50">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className="border border-gray-300 px-2 py-1 text-center"
                >
                  {r[c.key as keyof typeof r]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="p-6">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-bold mb-6">Draft Analytics</h1>
        <Link
          href="/"
          className="ml-auto text-sm underline decoration-dotted hover:decoration-solid"
        >
          ← zurück zum Dashboard
        </Link>
      </header>
      
      <Table
        title="🏆 Best Overall Drafts"
        rows={bestDrafts.map((d) => ({
          Owner: d.owner,
          Year: d.year,
          AvgScore: d.avg.toFixed(2),
          Picks: d.n,
        }))}
        columns={[
          { key: "Owner", label: "Owner" },
          { key: "Year", label: "Year" },
          { key: "AvgScore", label: "Ø Score" },
          { key: "Picks", label: "# Picks" },
        ]}
      />

      <Table
        title="💀 Worst Overall Drafts"
        rows={worstDrafts.map((d) => ({
          Owner: d.owner,
          Year: d.year,
          AvgScore: d.avg.toFixed(2),
          Picks: d.n,
        }))}
        columns={[
          { key: "Owner", label: "Owner" },
          { key: "Year", label: "Year" },
          { key: "AvgScore", label: "Ø Score" },
          { key: "Picks", label: "# Picks" },
        ]}
      />

      <Table
        title="🔥 Best Draft Picks"
        rows={bestPicks.map((p) => ({
          Year: p.Year,
          Owner: p.Owner,
          Player: p.Player,
          Pos: p.Pos,
          Pick: p.Pick,
          Score: p.Score.toFixed(2),
        }))}
        columns={[
          { key: "Year", label: "Year" },
          { key: "Owner", label: "Owner" },
          { key: "Player", label: "Player" },
          { key: "Pos", label: "Pos" },
          { key: "Pick", label: "Pick" },
          { key: "Score", label: "Score" },
        ]}
      />

      <Table
        title="💩 Worst Draft Picks"
        rows={worstPicks.map((p) => ({
          Year: p.Year,
          Owner: p.Owner,
          Player: p.Player,
          Pos: p.Pos,
          Pick: p.Pick,
          Score: p.Score.toFixed(2),
        }))}
        columns={[
          { key: "Year", label: "Year" },
          { key: "Owner", label: "Owner" },
          { key: "Player", label: "Player" },
          { key: "Pos", label: "Pos" },
          { key: "Pick", label: "Pick" },
          { key: "Score", label: "Score" },
        ]}
      />

      <Table
        title="🥇 First Overall Picks"
        rows={firstOverall.map((p) => ({
          Year: p.Year,
          Owner: p.Owner,
          Player: p.Player,
          Pos: p.Pos,
          Score: p.Score.toFixed(2),
        }))}
        columns={[
          { key: "Year", label: "Year" },
          { key: "Owner", label: "Owner" },
          { key: "Player", label: "Player" },
          { key: "Pos", label: "Pos" },
          { key: "Score", label: "Score" },
        ]}
      />
    </div>
  );
}
