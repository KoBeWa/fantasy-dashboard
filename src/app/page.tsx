"use client";
import { useEffect, useMemo, useState } from "react";
import Nav from "../components/Nav"; // ggf. entfernen, wenn du Nav nicht nutzt
import { loadJSON } from "@/lib/data";
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

type TeamSeason = {
  season: number;
  team: string;
  wins: number;
  losses: number;
  ties?: number;
  pf: number;
  pa: number;
};

type RegFinalRow = {
  team: string;
  regular_rank: number | null;
  playoff_rank?: number | null;
};

export default function Page() {
  const [season, setSeason] = useState<number>(2015);
  const [teams, setTeams] = useState<TeamSeason[]>([]);
  const [finals, setFinals] = useState<RegFinalRow[] | null>(null);

  // Daten laden
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

  // Endplatzierung (Playoff>Regular)
  const endRankMap = useMemo(() => {
    const m = new Map<string, number>();
    if (finals) {
      for (const r of finals) {
        const end = (r.playoff_rank ?? undefined) ?? (r.regular_rank ?? undefined);
        if (end !== undefined && end !== null) m.set(r.team, end);
      }
    }
    return m;
  }, [finals]);

  // Tabelle nach Endplatzierung sortieren (nur Anzeige)
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

  // Chart: PF & PA nebeneinander, Reihenfolge = Tabelle (Endplatzierung)
  useEffect(() => {
    const el = document.getElementById("pfpaChart") as HTMLCanvasElement | null;
    if (!el || tableRows.length === 0) return;

    const labels = tableRows.map(t => t.team);
    const pfData = tableRows.map(t => t.pf);
    const paData = tableRows.map(t => t.pa);

    const chart = new Chart(el, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "PF", data: pfData },
          { label: "PA", data: paData },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true, position: "top" },
          tooltip: { enabled: true },
        },
        scales: {
          x: { stacked: false },
          y: { stacked: false, beginAtZero: true },
        },
      },
    });

    return () => chart.destroy();
  }, [tableRows]);

  const seasons = useMemo(
    () => Array.from({ length: 2025 - 2015 + 1 }, (_, i) => 2015 + i),
    []
  );

  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Fantasy Dashboard</h1>
        <Nav />
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
        {/* PF & PA Chart (geordnet nach Endplatzierung) */}
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Points For & Against (nach Endplatzierung)</h2>
          <canvas id="pfpaChart" />
        </article>

        {/* Standings-Tabelle (nach Playoffs / Regular-Endrank sortiert) */}
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
                  <td className="text-right font-medium text-green-600">{r.pf.toFixed(2)}</td>
                  <td className="text-right font-medium text-red-600">{r.pa.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {endRankMap.size === 0 && (
            <p className="text-xs text-gray-600 mt-2">
              Hinweis: Keine finalen Platzierungen gefunden. Die Tabelle (und Chart-Reihenfolge)
              nutzen dann eine Fallback-Sortierung. Stelle sicher, dass{" "}
              <code>regular_final_standings.json</code> für {season} vorhanden ist.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
