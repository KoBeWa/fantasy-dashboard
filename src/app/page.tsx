"use client";
import { useEffect, useMemo, useState } from "react";
import Nav from "../components/Nav"; // ggf. entfernen, wenn du Nav nicht nutzt
import { loadJSON, loadTSV } from "@/lib/data";
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  LineController,
  LineElement,
  PointElement,
} from "chart.js";
Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  LineController,
  LineElement,
  PointElement
);

/* ===================== Types ===================== */
type TeamSeason = {
  season?: number;
  team?: string;
  owner?: string;
  manager?: string;
  wins?: number | string;
  losses?: number | string;
  ties?: number | string;
  pf?: number | string;
  pa?: number | string;
};

type RegFinalRow = {
  team?: string;
  regular_rank?: number | null;
  playoff_rank?: number | null;
  manager?: string | null;
};

type AggRow = {
  TeamName?: string;
  ManagerName?: string;
  Moves?: string;
  Trades?: string;
  Championships?: string;
  Playoffs?: string;
  Finals?: string;
  Toiletbowls?: string;
  Sackos?: string;
};

type EloPoint = {
  Season: number;
  Week: number;
  Team: string;
  Elo: number;
  IsPlayoff: number;
};

/* ===================== Utils ===================== */
const SEASONS = Array.from({ length: 2025 - 2015 + 1 }, (_, i) => 2015 + i);

function norm(s: string | null | undefined) {
  return (s ?? "")
    .toLowerCase()
    .replace(/[\s._\-’'`"]/g, "")
    .trim();
}

function toNum(x: any): number {
  if (x == null) return 0;
  if (typeof x === "number") return x;
  const s = String(x).replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Holt robust ein Label aus einem TeamSeason-Objekt (Team/Owner/Manager) */
function getDisplayLabel(row: any): string {
  return (
    row?.team ??
    row?.Team ??
    row?.owner ??
    row?.Owner ??
    row?.manager ??
    row?.Manager ??
    ""
  );
}

/** Liefert den Aggregations-Key (normalisiert) oder "" wenn nichts Sinnvolles da ist */
function getKeyForRow(row: any): string {
  const lbl = getDisplayLabel(row);
  return norm(lbl);
}

/* ===================== Component ===================== */
export default function Page() {
  const [season, setSeason] = useState<number>(2015);

  // Saison-spezifisch
  const [teams, setTeams] = useState<TeamSeason[]>([]);
  const [finals, setFinals] = useState<RegFinalRow[] | null>(null);

  // All-Time Basis
  const [allSeasonsTeams, setAllSeasonsTeams] = useState<TeamSeason[]>([]);
  const [aggRows, setAggRows] = useState<AggRow[] | null>(null);

  // Elo
  const [elo, setElo] = useState<EloPoint[] | null>(null);

  /* -------- Saison-Daten laden -------- */
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadJSON<TeamSeason[]>(`data/processed/seasons/${season}/teams.json`),
      loadJSON<RegFinalRow[]>(
        `data/processed/seasons/${season}/regular_final_standings.json`
      ).catch(() => null),
    ])
      .then(([t, f]) => {
        if (!cancelled) {
          setTeams(t ?? []);
          setFinals(f);
        }
      })
      .catch(() => {
        setTeams([]);
        setFinals(null);
      });
    return () => {
      cancelled = true;
    };
  }, [season]);

  /* -------- Alle Saisons (All-Time) -------- */
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      SEASONS.map((y) =>
        loadJSON<TeamSeason[]>(`data/processed/seasons/${y}/teams.json`).catch(
          () => null
        )
      )
    ).then((arr) => {
      if (cancelled) return;
      const all = arr.filter((x): x is TeamSeason[] => Array.isArray(x)).flat();
      setAllSeasonsTeams(all);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* -------- Aggregated TSV (Moves/Trades/…) -------- */
  useEffect(() => {
    let cancelled = false;
    loadTSV(`data/league/aggregated_standings.tsv`)
      .then((rows) => {
        if (!cancelled) setAggRows(rows as AggRow[]);
      })
      .catch(() => setAggRows(null));
    return () => {
      cancelled = true;
    };
  }, []);

  /* -------- Elo JSON laden (robust mappen) -------- */
  useEffect(() => {
    let cancelled = false;
    loadJSON<any[]>("data/league/elo_history.json")
      .then((raw) => {
        if (cancelled || !Array.isArray(raw)) return;
        const normed: EloPoint[] = raw
          .map((r) => ({
            Season: Number(r.Season ?? r.season ?? r.YEAR ?? r.year),
            Week: Number(r.Week ?? r.week),
            Team: String(r.Team ?? r.team ?? r.Owner ?? r.owner ?? ""),
            Elo: Number(r.Elo ?? r.elo),
            IsPlayoff: Number(r.IsPlayoff ?? r.isPlayoff ?? r.is_playoff ?? 0),
          }))
          .filter((r) => r.Season && r.Week && r.Team && Number.isFinite(r.Elo));
        setElo(normed);
      })
      .catch(() => setElo(null));
    return () => {
      cancelled = true;
    };
  }, []);

  /* -------- Endplatzierung (Playoff>Regular) Mapping -------- */
  const endRankByKey = useMemo(() => {
    const m = new Map<string, number>();
    if (finals) {
      for (const r of finals) {
        const end =
          (r.playoff_rank ?? undefined) ?? (r.regular_rank ?? undefined);
        if (end == null) continue;
        if (r.team) m.set(norm(r.team), end);
        if (r.manager) m.set(norm(r.manager), end);
      }
    }
    return m;
  }, [finals]);

  function getEndRankForLabel(label: string): number | undefined {
    const key = norm(label);
    let hit = endRankByKey.get(key);
    if (hit != null) return hit;
    for (const part of label.split(/[|/()\[\],]+/)) {
      const k = norm(part);
      if (!k) continue;
      hit = endRankByKey.get(k);
      if (hit != null) return hit;
    }
    return undefined;
  }

  /* -------- Dashboard-Tabelle: nach Endplatzierung sortiert -------- */
  const tableRows = useMemo(() => {
    const rows = [...teams];
    rows.sort((a, b) => {
      const ra = getEndRankForLabel(getDisplayLabel(a)) ?? Number.POSITIVE_INFINITY;
      const rb = getEndRankForLabel(getDisplayLabel(b)) ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return getDisplayLabel(a).localeCompare(getDisplayLabel(b));
    });
    return rows;
  }, [teams, endRankByKey]);

  /* -------- PF/PA Bar-Chart (nebeneinander) -------- */
  useEffect(() => {
    const el = document.getElementById("pfpaChart") as HTMLCanvasElement | null;
    if (!el || tableRows.length === 0) return;

    const labels = tableRows.map((t) => getDisplayLabel(t));
    const pfData = tableRows.map((t) => toNum(t.pf));
    const paData = tableRows.map((t) => toNum(t.pa));

    const chart = new Chart(el, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "PF",
            data: pfData,
            backgroundColor: "rgba(34,197,94,0.6)", // grün
            borderColor: "rgba(34,197,94,1)",
            borderWidth: 1,
          },
          {
            label: "PA",
            data: paData,
            backgroundColor: "rgba(239,68,68,0.6)", // rot
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

  /* -------- Aggregated Map (Moves/Trades/Champs/…) -------- */
  const aggByKey = useMemo(() => {
    const m = new Map<
      string,
      {
        moves: number;
        trades: number;
        championships: number;
        playoffs: number;
        finals: number;
        toiletbowls: number;
        sackos: number;
      }
    >();
    if (!aggRows) return m;
    for (const r of aggRows) {
      const obj = {
        moves: toNum(r.Moves),
        trades: toNum(r.Trades),
        championships: toNum(r.Championships),
        playoffs: toNum(r.Playoffs),
        finals: toNum(r.Finals),
        toiletbowls: toNum(r.Toiletbowls),
        sackos: toNum(r.Sackos),
      };
      const t = norm(r.TeamName ?? "");
      const mg = norm(r.ManagerName ?? "");
      if (t) m.set(t, obj);
      if (mg) m.set(mg, obj);
    }
    return m;
  }, [aggRows]);

  /* -------- All-Time Aggregation (robust) -------- */
  type AllTimeRow = {
    key: string;
    display: string;
    wins: number;
    losses: number;
    ties: number;
    pf: number;
    pa: number;
    moves?: number;
    trades?: number;
    championships?: number;
    playoffs?: number;
    finals?: number;
    toiletbowls?: number;
    sackos?: number;
  };

  const allTimeRows: AllTimeRow[] = useMemo(() => {
    const agg = new Map<string, AllTimeRow>();

    for (const t of allSeasonsTeams) {
      const key = getKeyForRow(t);
      if (!key) continue; // leere Labels überspringen
      const display = getDisplayLabel(t) || "(unbenannt)";
      const it =
        agg.get(key) ??
        {
          key,
          display,
          wins: 0,
          losses: 0,
          ties: 0,
          pf: 0,
          pa: 0,
        };

      it.display = display;
      it.wins += toNum(t.wins);
      it.losses += toNum(t.losses);
      it.ties += toNum(t.ties);
      it.pf += toNum(t.pf);
      it.pa += toNum(t.pa);

      agg.set(key, it);
    }

    // Merge mit Aggregated-TSV
    for (const r of agg.values()) {
      const extra =
        aggByKey.get(r.key) || aggByKey.get(norm(r.display)); // zweiter Versuch
      if (extra) {
        r.moves = extra.moves;
        r.trades = extra.trades;
        r.championships = extra.championships;
        r.playoffs = extra.playoffs;
        r.finals = extra.finals;
        r.toiletbowls = extra.toiletbowls;
        r.sackos = extra.sackos;
      }
      r.pf = parseFloat(r.pf.toFixed(2));
      r.pa = parseFloat(r.pa.toFixed(2));
    }

    const out = Array.from(agg.values());
    out.sort(
      (a, b) =>
        b.wins - a.wins || b.pf - a.pf || a.display.localeCompare(b.display)
    );
    return out;
  }, [allSeasonsTeams, aggByKey]);

  /* -------- Elo-Serien vorbereiten -------- */
  const eloSeries = useMemo(() => {
    if (!elo || elo.length === 0) return null;
    const minSeason = Math.min(...elo.map((e) => e.Season));
    const byTeam = new Map<string, { x: number; y: number }[]>();
    for (const r of elo) {
      const x = (r.Season - minSeason) * 20 + r.Week; // 17 Reg + ~3 PO
      const arr = byTeam.get(r.Team) ?? [];
      arr.push({ x, y: r.Elo });
      byTeam.set(r.Team, arr);
    }
    for (const arr of byTeam.values()) arr.sort((a, b) => a.x - b.x);
    return Array.from(byTeam.entries());
  }, [elo]);

  /* -------- Elo-Chart rendern -------- */
  useEffect(() => {
    const el = document.getElementById("eloChart") as HTMLCanvasElement | null;
    if (!el || !eloSeries || eloSeries.length === 0) return;

    const datasets = eloSeries.map(([team, pts]) => ({
      label: team,
      data: pts.map((p) => ({ x: p.x, y: p.y })),
      borderWidth: 1,
      pointRadius: 0,
      fill: false,
      tension: 0.15,
    }));

    const chart = new Chart(el, {
      type: "line",
      data: { datasets },
      options: {
        parsing: false,
        responsive: true,
        plugins: {
          legend: { display: true, position: "bottom", labels: { boxWidth: 18 } },
          tooltip: {
            enabled: true,
            callbacks: {
              label: (item) => {
                const d = item.raw as { x: number; y: number };
                return `${item.dataset.label}: ${d.y.toFixed(0)}`;
              },
            },
          },
        },
        scales: {
          x: { type: "linear", title: { display: true, text: "Woche (2015 → heute)" } },
          y: { title: { display: true, text: "Elo" } },
        },
      },
    });

    return () => chart.destroy();
  }, [eloSeries]);

  const seasons = useMemo(() => SEASONS, []);

  /* ===================== Render ===================== */
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
              {tableRows.map((r, idx) => (
                <tr key={`${getDisplayLabel(r)}-${idx}`} className="border-t">
                  <td>{getDisplayLabel(r)}</td>
                  <td className="text-center">{toNum(r.wins)}</td>
                  <td className="text-center">{toNum(r.losses)}</td>
                  <td className="text-right font-medium text-green-600">{toNum(r.pf).toFixed(2)}</td>
                  <td className="text-right font-medium text-red-600">{toNum(r.pa).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {finals && endRankByKey.size === 0 && (
            <p className="text-xs text-gray-600 mt-2">
              Hinweis: Keine finalen Platzierungen gemappt. Prüfe <code>regular_final_standings.json</code> und die Team-/Manager-Namen in <code>teams.json</code>.
            </p>
          )}
        </article>

        {/* All-Time Tabelle */}
        <article className="border rounded p-4 xl:col-span-2">
          <h2 className="font-semibold mb-2">All-Time (2015–2025)</h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Team</th>
                  <th>W</th>
                  <th>L</th>
                  <th>T</th>
                  <th>PF</th>
                  <th>PA</th>
                  <th>Moves</th>
                  <th>Trades</th>
                  <th>Champs</th>
                  <th>Playoffs</th>
                  <th>Finals</th>
                  <th>Toilet</th>
                  <th>Sacko</th>
                </tr>
              </thead>
              <tbody>
                {allTimeRows.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td>{r.display}</td>
                    <td className="text-center">{r.wins}</td>
                    <td className="text-center">{r.losses}</td>
                    <td className="text-center">{r.ties}</td>
                    <td className="text-right font-medium text-green-600">{r.pf.toFixed(2)}</td>
                    <td className="text-right font-medium text-red-600">{r.pa.toFixed(2)}</td>
                    <td className="text-center">{r.moves ?? ""}</td>
                    <td className="text-center">{r.trades ?? ""}</td>
                    <td className="text-center">{r.championships ?? ""}</td>
                    <td className="text-center">{r.playoffs ?? ""}</td>
                    <td className="text-center">{r.finals ?? ""}</td>
                    <td className="text-center">{r.toiletbowls ?? ""}</td>
                    <td className="text-center">{r.sackos ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {aggRows == null && (
            <p className="text-xs text-gray-600 mt-2">
              Hinweis: <code>aggregated_standings.tsv</code> wurde nicht gefunden. Kopiere sie im Build nach{" "}
              <code>public/data/league/aggregated_standings.tsv</code>.
            </p>
          )}
        </article>

        {/* All-Time Elo Chart */}
        <article className="border rounded p-4 xl:col-span-2">
          <h2 className="font-semibold mb-2">All-Time Elo (wöchentlich)</h2>
          <canvas id="eloChart" />
          {!elo && (
            <p className="text-sm text-gray-600 mt-2">
              Keine Elo-Daten gefunden. Stelle sicher, dass <code>public/data/league/elo_history.json</code> existiert.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}

