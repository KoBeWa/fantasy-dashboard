"use client";
import { useEffect, useMemo, useState } from "react";
import Nav from "../components/Nav"; // entferne diesen Import + <Nav/> unten, falls du die Navi nicht nutzt
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
  team: string;   // Label in teams.json (meist Manager/Teamname)
  wins: number;
  losses: number;
  ties?: number;
  pf: number;
  pa: number;
};

type RegFinalRow = {
  team: string;                 // TeamName aus TSV/JSON
  regular_rank: number | null;
  playoff_rank?: number | null;
  manager?: string | null;
};

// —— Utils ——
const SEASONS = Array.from({ length: 2025 - 2015 + 1 }, (_, i) => 2015 + i);

function norm(s: string | null | undefined) {
  return (s ?? "")
    .toLowerCase()
    .replace(/[\s._\-’'`"]/g, "")
    .trim();
}

export default function Page() {
  const [season, setSeason] = useState<number>(2015);
  const [teams, setTeams] = useState<TeamSeason[]>([]);
  const [finals, setFinals] = useState<RegFinalRow[] | null>(null);

  // Für All-Time: alle Teams aller Saisons (einmalig laden)
  const [allSeasonsTeams, setAllSeasonsTeams] = useState<TeamSeason[]>([]);

  // ---- Daten laden (abhängig von Season) ----
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
    return () => { cancelled = true; };
  }, [season]);

  // ---- Alle Saisons (für All-Time) einmalig laden ----
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      SEASONS.map(y =>
        loadJSON<TeamSeason[]>(`data/processed/seasons/${y}/teams.json`).catch(() => null)
      )
    ).then((arr) => {
      if (cancelled) return;
      const all = arr.filter((x): x is TeamSeason[] => Array.isArray(x)).flat();
      setAllSeasonsTeams(all);
    });
    return () => { cancelled = true; };
  }, []);

  // ---- Endplatzierung (Playoff > Regular) für die aktuelle Saison (robustes Matching) ----
  const endRankByKey = useMemo(() => {
    const m = new Map<string, number>();
    if (finals) {
      for (const r of finals) {
        const end = (r.playoff_rank ?? undefined) ?? (r.regular_rank ?? undefined);
        if (end == null) continue;
        if (r.team)    m.set(norm(r.team), end);
        if (r.manager) m.set(norm(r.manager), end);
      }
    }
    return m;
  }, [finals]);

  function getEndRankForLabel(label: string): number | undefined {
    const key = norm(label);
    let hit = endRankByKey.get(key);
    if (hit != null) return hit;
    // Fallback: split bei Sonderzeichen
    for (const part of label.split(/[|/()\[\],]+/)) {
      const k = norm(part);
      if (!k) continue;
      hit = endRankByKey.get(k);
      if (hit != null) return hit;
    }
    return undefined;
  }

  // ---- Tabelle (rechte Spalte) nach Endplatzierung sortieren ----
  const tableRows = useMemo(() => {
    const rows = [...teams];
    rows.sort((a, b) => {
      const ra = getEndRankForLabel(a.team) ?? Number.POSITIVE_INFINITY;
      const rb = getEndRankForLabel(b.team) ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return a.team.localeCompare(b.team);
    });
    return rows;
  }, [teams, endRankByKey]);

  // ---- Chart: PF(grün) & PA(rot) nebeneinander; Reihenfolge = Endplatzierung ----
  useEffect(() => {
    const el = document.getElementById("pfpaChart") as HTMLCanvasElement | null;
    if (!el || tableRows.length === 0) return;

    const labels = tableRows.map((t) => t.team);
    const pfData = tableRows.map((t) => t.pf);
    const paData = tableRows.map((t) => t.pa);

    const chart = new Chart(el, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "PF",
            data: pfData,
            backgroundColor: "rgba(34,197,94,0.6)",   // grün
            borderColor: "rgba(34,197,94,1)",
            borderWidth: 1,
          },
          {
            label: "PA",
            data: paData,
            backgroundColor: "rgba(239,68,68,0.6)",   // rot
            borderColor: "rgba(239,68,68,1)",
            borderWidth: 1,
          },
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

  // ---- All-Time Aggregation über alle Saisons ----
  type AllTimeRow = { key: string; display: string; wins: number; losses: number; ties: number; pf: number; pa: number };
  const allTimeRows: AllTimeRow[] = useMemo(() => {
    // Aggregation nach normalisiertem Label
    const agg = new Map<string, AllTimeRow>();
    // Wir merken uns den „repräsentativen“ Anzeigenamen als der zuletzt gesehene (könnte man auch häufigkeitsbasiert machen)
    for (const t of allSeasonsTeams) {
      const k = norm(t.team);
      const item = agg.get(k) ?? { key: k, display: t.team, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 };
      item.display = t.team || item.display;
      item.wins   += t.wins || 0;
      item.losses += t.losses || 0;
      item.ties   += t.ties || 0;
      item.pf     += t.pf || 0;
      item.pa     += t.pa || 0;
      agg.set(k, item);
    }
    const res = Array.from(agg.values());
    // Sortierung: Wins ↓, PF ↓, Name ↑
    res.sort((a, b) => (b.wins - a.wins) || (b.pf - a.pf) || a.display.localeCompare(b.display));
    // runde PF/PA hübsch auf 2 Nachkommastellen
    res.forEach(r => {
      r.pf = parseFloat(r.pf.toFixed(2));
      r.pa = parseFloat(r.pa.toFixed(2));
    });
    return res;
  }, [allSeasonsTeams]);

  const seasons = useMemo(() => SEASONS, []);

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

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* PF & PA Chart (geordnet nach Endplatzierung) */}
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Points For & Against (nach Endplatzierung)</h2>
          <canvas id="pfpaChart" />
        </article>

        {/* Standings-Tabelle (nach Playoffs/Regular-Endrank sortiert) */}
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Teams – {season}</h2>
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

          {finals && endRankByKey.size === 0 && (
            <p className="text-xs text-gray-600 mt-2">
              Hinweis: Keine finalen Platzierungen gemappt. Prüfe, ob die Datei{" "}
              <code>regular_final_standings.json</code> für {season} existiert und die Team-/Manager-Namen
              zu den Labels in <code>teams.json</code> passen.
            </p>
          )}
        </article>

        {/* All-Time Tabelle */}
        <article className="border rounded p-4 xl:col-span-2">
          <h2 className="font-semibold mb-2">All-Time (2015–2025)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Team</th>
                <th>W</th>
                <th>L</th>
                <th>T</th>
                <th>PF</th>
                <th>PA</th>
              </tr>
            </thead>
            <tbody>
              {allTimeRows.map(r => (
                <tr key={r.key} className="border-t">
                  <td>{r.display}</td>
                  <td className="text-center">{r.wins}</td>
                  <td className="text-center">{r.losses}</td>
                  <td className="text-center">{r.ties}</td>
                  <td className="text-right font-medium text-green-600">{r.pf.toFixed(2)}</td>
                  <td className="text-right font-medium text-red-600">{r.pa.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {allSeasonsTeams.length === 0 && (
            <p className="text-xs text-gray-600 mt-2">
              Keine All-Time-Daten gefunden. Stelle sicher, dass <code>teams.json</code> für die Saisons
              vorhanden ist.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
