"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Nav from "../components/Nav"; // falls du Nav noch nicht nutzt, kannst du diese Zeile entfernen
import { loadJSON } from "@/lib/data";
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from "chart.js";
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

type TeamSeason = {
  season: number;
  team: string;
  wins: number;
  losses: number;
  ties?: number;
  pf: number;
  pa: number;
  luck?: number;
};

type RegFinalRow = {
  team: string;
  regular_rank: number | null;
  playoff_rank?: number | null;
  // weitere Felder sind ok, werden hier nicht benötigt
};

export default function Page() {
  const [season, setSeason] = useState<number>(2015);
  const [teams, setTeams] = useState<TeamSeason[]>([]);
  const [finals, setFinals] = useState<RegFinalRow[] | null>(null);

  // Daten laden: Teams + finale Standings der Saison
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadJSON<TeamSeason[]>(`data/processed/seasons/${season}/teams.json`),
      loadJSON<RegFinalRow[]>(
        `data/processed/seasons/${season}/regular_final_standings.json`
      ).catch(() => null),
    ])
      .then(([t, f]) => {
        if (cancelled) return;
        setTeams(t);
        setFinals(f);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [season]);

  // Rank-Map: Team -> Endrank (Playoff bevorzugt, sonst Regular)
  const endRankMap = useMemo(() => {
    const m = new Map<string, number>();
    if (finals) {
      for (const r of finals) {
        const pr = r.playoff_rank ?? undefined;
        const rr = r.regular_rank ?? undefined;
        const end = pr ?? rr;
        if (end !== undefined && end !== null) m.set(r.team, end);
      }
    }
    return m;
  }, [finals]);

  // Tabelle: Teams nach Endplatzierung sortieren (nur Anzeige; Daten bleiben unverändert)
  const tableRows = useMemo(() => {
    const rows = [...teams];
    rows.sort((a, b) => {
      const ra = endRankMap.get(a.team) ?? Number.POSITIVE_INFINITY;
      const rb = endRankMap.get(b.team) ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return a.team.localeCompare(b.team);
    });
    return rows;
  }, [teams, endRankMap]);

  // Chart: Top-8 PF (unabhängig von Endrank)
  useEffect(() => {
    const el = document.getElementById("pfChart") as HTMLCanvasElement | null;
    if (!el || teams.length === 0) return;
    const top = [...teams].sort((a, b) => b.pf - a.pf).slice(0, 8);
    const chart = new Chart(el, {
      type: "bar",
      data: {
        labels: top.map((t) => t.team),
        datasets: [{ label: "PF", data: top.map((t) => t.pf) }],
      },
      options: { responsive: true, plugins: { legend: { display: false } } },
    });
    return () => chart.destroy();
  }, [teams]);

  const seasons = useMemo(
    () => Array.from({ length: 2025 - 2015 + 1 }, (_, i) => 2015 + i),
    []
  );

  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Fantasy Dashboard</h1>
        {/* Navigation (optional) */}
        <Nav />
        {/* Fallback-Link, falls du Nav nicht nutzt: */}
        {/* <Link className="underline" href="/seasons">Seasons</Link> */}

        <select
          className="ml-auto border rounded px-2 py-1"
          value={season}
          onChange={(e) => setSeason(+e.target.value)}
        >
          {seasons.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PF-Chart */}
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Top Punkte (PF)</h2>
          <canvas id="pfChart" />
        </article>

        {/* Standings-Tabelle (nach Endplatzierung sortiert) */}
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Teams (Saison)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Team</th>
                <th>W</th>
                <th>L</th>
                <th>PF</th>
                <th>PA</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={`${r.team}-${r.season}`} className="border-t">
                  <td>{r.team}</td>
                  <td className="text-center">{r.wins}</td>
                  <td className="text-center">{r.losses}</td>
                  <td className="text-right font-medium text-green-600">
                    {r.pf.toFixed(2)}
                  </td>
                  <td className="text-right font-medium text-red-600">
                    {r.pa.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Hinweis, falls keine finalen Ranks vorhanden sind */}
          {endRankMap.size === 0 && (
            <p className="text-xs text-gray-600 mt-2">
              Hinweis: Keine finalen Platzierungen gefunden. Die Tabelle ist dann
              alphabetisch sortiert. Stelle sicher, dass{" "}
              <code>regular_final_standings.json</code> für {season} vorhanden
              ist.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
