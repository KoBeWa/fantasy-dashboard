"use client";
import { useEffect, useMemo, useState } from "react";
import { loadJSON } from "@/lib/data";
import MatchupCard, { type Matchup } from "../../components/MatchupCard";

// ---------- Typen ----------
type WeeklyRow = {
  team: string;
  wins: number;
  losses: number;
  ties?: number;
  pf: number;
  pa: number;
  pct: number;
  rank: number;
};
type Weekly = { week: number; rows: WeeklyRow[] };

type RegFinalRow = {
  team: string;
  regular_rank: number | null;
  record: string;
  wins?: number | null;
  losses?: number | null;
  ties?: number | null;
  pf: number | null;
  pa: number | null;
  playoff_rank?: number | null;
  manager?: string | null;
  moves?: number | null;
  trades?: number | null;
  draft_position?: number | null;
};

type PlayoffRow = {
  team: string;
  playoff_rank: number | null;
  manager?: string | null;
  seed?: number | null;
  week15?: number | null;
  week16?: number | null;
};

// ---------- Hilfsfunktionen für kumulative Tabelle & Tiebreaker ----------
type CumAgg = { wins: number; losses: number; ties: number; pf: number; pa: number };
type CumRow = {
  team: string;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  pct: number;
  rank: number;
  delta?: number | null; // vs. Vorwoche
};

/** Baue kumulative Zahlen (W/L/T, PF/PA) bis inkl. uptoWeek aus den weekly-Snapshots. */
function buildCumBase(weekly: Weekly[] | null, uptoWeek: number): CumRow[] {
  if (!weekly || weekly.length === 0) return [];
  const agg = new Map<string, CumAgg>();

  for (const block of weekly) {
    if (block.week > uptoWeek) continue;
    for (const r of block.rows) {
      const a = agg.get(r.team) ?? { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 };
      a.wins += r.wins || 0;
      a.losses += r.losses || 0;
      a.ties += r.ties || 0;
      a.pf += r.pf || 0;
      a.pa += r.pa || 0;
      agg.set(r.team, a);
    }
  }

  const rows: CumRow[] = Array.from(agg.entries()).map(([team, v]) => {
    const games = v.wins + v.losses + v.ties;
    const pct = games > 0 ? (v.wins + 0.5 * v.ties) / games : 0;
    return {
      team,
      wins: v.wins,
      losses: v.losses,
      ties: v.ties,
      pf: parseFloat(v.pf.toFixed(2)),
      pa: parseFloat(v.pa.toFixed(2)),
      pct: parseFloat(pct.toFixed(4)),
      rank: 0
    };
  });

  return rows;
}

/** Liefert Map team->Siege in der Mini-Liga (nur vs. groupTeams) bis inkl. uptoWeek. */
function computeH2HWinsMap(
  groupTeams: string[],
  matchups: Matchup[] | null,
  uptoWeek: number
): Map<string, number> {
  const set = new Set(groupTeams);
  const wins = new Map<string, number>();
  groupTeams.forEach(t => wins.set(t, 0));

  if (!matchups) return wins;

  for (const m of matchups) {
    if (m.is_playoff) continue; // nur Regular Season
    if (m.week > uptoWeek) continue;
    const { home_team: ht, away_team: at } = m;
    if (!set.has(ht) || !set.has(at)) continue;

    const hp = m.home_points ?? 0;
    const ap = m.away_points ?? 0;
    if (hp === ap) continue; // Unentschieden zählt hier nicht als Sieg

    if (hp > ap) wins.set(ht, (wins.get(ht) ?? 0) + 1);
    else wins.set(at, (wins.get(at) ?? 0) + 1);
  }

  return wins;
}

/** Sortiert rows nach Season-Regeln:
 * - 2015–2021: Wins ↓, dann Head-to-Head (Mini-Liga-Siege) ↓, dann PF ↓, dann Name ↑
 * - ab 2022  : Wins ↓, dann PF ↓, dann Name ↑
 */
function sortWithLeagueRules(
  rows: CumRow[],
  season: number,
  matchups: Matchup[] | null,
  uptoWeek: number
): CumRow[] {
  // Grundsortierung nach Wins ↓ (damit wir Tie-Gruppen finden)
  rows.sort((a, b) => b.wins - a.wins || b.pf - a.pf || a.team.localeCompare(b.team));

  if (season >= 2022) {
    // ab 2022: Wins ↓, PF ↓, Name ↑ (ist durch Grundsort schon so)
    return rows;
  }

  // 2015–2021: Gewinne → Head-to-Head innerhalb Tie-Gruppe → PF → Name
  // Finde Gruppen mit identischen Wins
  let i = 0;
  const out: CumRow[] = [];
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && rows[j].wins === rows[i].wins) j++;

    const group = rows.slice(i, j);
    if (group.length === 1) {
      out.push(group[0]);
    } else {
      const teams = group.map(g => g.team);
      const h2hWins = computeH2HWinsMap(teams, matchups, uptoWeek);

      group.sort((a, b) => {
        // zuerst Head-to-Head-Siege innerhalb der Gruppe
        const aw = h2hWins.get(a.team) ?? 0;
        const bw = h2hWins.get(b.team) ?? 0;
        if (bw !== aw) return bw - aw;
        // dann PF
        if (b.pf !== a.pf) return b.pf - a.pf;
        // dann Name
        return a.team.localeCompare(b.team);
      });

      out.push(...group);
    }
    i = j;
  }

  return out;
}

function annotateDelta(curr: CumRow[], prev: CumRow[] | null): CumRow[] {
  if (!prev || prev.length === 0) return curr.map((r) => ({ ...r, delta: null }));
  const prevRank = new Map(prev.map((r) => [r.team, r.rank]));
  return curr.map((r) => {
    const pr = prevRank.get(r.team);
    return { ...r, delta: pr != null ? pr - r.rank : null };
  });
}

export default function SeasonsPage() {
  // Auswahlzustand
  const [season, setSeason] = useState<number>(2015);
  const [mode, setMode] = useState<"weekly" | "playoffs" | "regular">("weekly");
  const [week, setWeek] = useState<number>(1);

  // Datenstate
  const [weekly, setWeekly] = useState<Weekly[] | null>(null);
  const [regFinal, setRegFinal] = useState<RegFinalRow[] | null>(null);
  const [playoffs, setPlayoffs] = useState<PlayoffRow[] | null>(null);
  const [matchups, setMatchups] = useState<Matchup[] | null>(null);

  // Daten laden, sobald Season wechselt
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadJSON<Weekly[]>(`data/processed/seasons/${season}/weekly_standings.json`).catch(() => null),
      loadJSON<RegFinalRow[]>(`data/processed/seasons/${season}/regular_final_standings.json`).catch(() => null),
      loadJSON<PlayoffRow[]>(`data/processed/seasons/${season}/playoffs_standings.json`).catch(() => null),
      loadJSON<Matchup[]>(`data/processed/seasons/${season}/matchups.json`).catch(() => null),
    ]).then(([w, r, p, m]) => {
      if (cancelled) return;
      setWeekly(w);
      setRegFinal(r);
      setPlayoffs(p);
      setMatchups(m);
      if (w && w.length > 0) setWeek(w[0].week);
    });
    return () => {
      cancelled = true;
    };
  }, [season]);

  // Hilfsableitungen (klar typisiert)
  const weeks: number[] = useMemo(() => weekly?.map((x) => x.week) ?? [], [weekly]);

  const weeklyRows: WeeklyRow[] = useMemo(() => {
    if (!weekly) return [];
    const block = weekly.find((x) => x.week === week);
    return block?.rows ?? [];
  }, [weekly, week]);

  const regRows: RegFinalRow[] = useMemo(() => regFinal ?? [], [regFinal]);
  const poRows: PlayoffRow[] = useMemo(() => playoffs ?? [], [playoffs]);

  const weekMatchups: Matchup[] = useMemo(() => {
    return (matchups ?? []).filter((m) => m.week === week && !m.is_playoff);
  }, [matchups, week]);

  // Kumulativ + Sortierlogik je Saison + Delta
  const cumRows: CumRow[] = useMemo(() => {
    // Basiszahlen bis inkl. Week
    const base = buildCumBase(weekly, week);
    // Sortierung je Saisonregel, inkl. Head-to-Head (2015–2021)
    const sorted = sortWithLeagueRules(base, season, matchups, week);
    // Ränge vergeben
    sorted.forEach((r, i) => (r.rank = i + 1));
    // Vergleich zur Vorwoche (mit derselben Sortierlogik)
    const prevBase = week > 1 ? buildCumBase(weekly, week - 1) : null;
    let prevSorted: CumRow[] | null = null;
    if (prevBase) {
      prevSorted = sortWithLeagueRules(prevBase, season, matchups, week - 1);
      prevSorted.forEach((r, i) => (r.rank = i + 1));
    }
    return annotateDelta(sorted, prevSorted);
  }, [weekly, week, season, matchups]);

  const seasons = useMemo(() => Array.from({ length: 2025 - 2015 + 1 }, (_, i) => 2015 + i), []);

  return (
    <main className="p-6 space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Seasons</h1>
        <Nav /> {/* NEU */}
        {/* Season-Auswahl */}
        <select
          className="border rounded px-2 py-1"
          value={season}
          onChange={(e) => setSeason(+e.target.value)}
        >
          {seasons.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        {/* Tabs */}
        <nav className="flex items-center gap-2 ml-2">
          <button
            onClick={() => setMode("weekly")}
            className={`px-3 py-1 rounded border ${mode === "weekly" ? "bg-black text-white" : "bg-white"}`}
          >
            Weekly
          </button>
          <button
            onClick={() => setMode("regular")}
            className={`px-3 py-1 rounded border ${mode === "regular" ? "bg-black text-white" : "bg-white"}`}
          >
            Regular (Final)
          </button>
          <button
            onClick={() => setMode("playoffs")}
            className={`px-3 py-1 rounded border ${mode === "playoffs" ? "bg-black text-white" : "bg-white"}`}
          >
            Playoffs
          </button>
        </nav>

        {/* Week-Auswahl nur im Weekly-Tab */}
        {mode === "weekly" && weeks.length > 0 && (
          <select
            className="border rounded px-2 py-1 ml-auto"
            value={week}
            onChange={(e) => setWeek(+e.target.value)}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        )}
      </header>

      {/* WEEKLY */}
      {mode === "weekly" && (
        <>
          {/* Kumulative Tabelle bis inkl. Week */}
          <section className="overflow-auto">
            <h2 className="text-lg font-semibold mb-2">Cumulative Standings (≤ Week {week})</h2>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">#</th>
                  <th className="text-left">Team</th>
                  <th>W</th>
                  <th>L</th>
                  <th>T</th>
                  <th>PF</th>
                  <th>PA</th>
                  <th>Pct</th>
                </tr>
              </thead>
              <tbody>
                {cumRows.map((r) => {
                  const delta = r.delta ?? 0;
                  const showDelta = delta !== 0;
                  const sign = delta > 0 ? "+" : "";
                  return (
                    <tr key={`cum-${r.team}`} className="border-t">
                      <td>{r.rank}</td>
                      <td className="font-medium">
                        {r.team}{" "}
                        {showDelta && (
                          <span className={`text-xs ${delta > 0 ? "text-green-600" : "text-red-600"}`}>
                            ({sign}{delta})
                          </span>
                        )}
                      </td>
                      <td className="text-center">{r.wins}</td>
                      <td className="text-center">{r.losses}</td>
                      <td className="text-center">{r.ties}</td>
                      <td className="text-right">{r.pf.toFixed(2)}</td>
                      <td className="text-right">{r.pa.toFixed(2)}</td>
                      <td className="text-right">{(r.pct * 100).toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Snapshot nur der ausgewählten Woche */}
          <section className="overflow-auto">
            <h2 className="text-lg font-semibold mb-2">Week {week} Snapshot</h2>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">#</th>
                  <th className="text-left">Team</th>
                  <th>W</th>
                  <th>L</th>
                  <th>T</th>
                  <th>PF</th>
                  <th>PA</th>
                  <th>Pct</th>
                </tr>
              </thead>
              <tbody>
                {weeklyRows.map((r) => (
                  <tr key={`w-${r.team}`} className="border-t">
                    <td>{r.rank}</td>
                    <td className="font-medium">{r.team}</td>
                    <td className="text-center">{r.wins}</td>
                    <td className="text-center">{r.losses}</td>
                    <td className="text-center">{r.ties ?? 0}</td>
                    <td className="text-right">{r.pf?.toFixed(2)}</td>
                    <td className="text-right">{r.pa?.toFixed(2)}</td>
                    <td className="text-right">{(r.pct * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* WEEKLY – Matchups der Woche */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Matchups – Week {week}</h2>
            {weekMatchups.length === 0 && (
              <p className="text-sm text-gray-600">Keine Matchups gefunden.</p>
            )}
            {weekMatchups.map((m) => (
              <MatchupCard key={`${m.week}-${m.home_team}-${m.away_team}`} m={m} />
            ))}
          </section>
        </>
      )}

      {/* REGULAR (FINAL) */}
      {mode === "regular" && (
        <section className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">#</th>
                <th className="text-left">Team</th>
                <th>Record</th>
                <th>PF</th>
                <th>PA</th>
                <th>Playoff</th>
                <th>Manager</th>
                <th>Moves</th>
                <th>Trades</th>
                <th>DraftPos</th>
              </tr>
            </thead>
            <tbody>
              {(regRows).map((r) => (
                <tr key={r.team} className="border-t">
                  <td>{r.regular_rank ?? ""}</td>
                  <td className="font-medium">{r.team}</td>
                  <td className="text-center">{r.record}</td>
                  <td className="text-right">{r.pf ?? ""}</td>
                  <td className="text-right">{r.pa ?? ""}</td>
                  <td className="text-center">{r.playoff_rank ?? ""}</td>
                  <td className="text-center">{r.manager ?? ""}</td>
                  <td className="text-center">{r.moves ?? ""}</td>
                  <td className="text-center">{r.trades ?? ""}</td>
                  <td className="text-center">{r.draft_position ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* PLAYOFFS */}
      {mode === "playoffs" && (
        <section className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">#</th>
                <th className="text-left">Team</th>
                <th>Seed</th>
                <th>Manager</th>
                <th>W15</th>
                <th>W16</th>
              </tr>
            </thead>
            <tbody>
              {poRows.map((r) => (
                <tr key={r.team} className="border-t">
                  <td>{r.playoff_rank}</td>
                  <td className="font-medium">{r.team}</td>
                  <td className="text-center">{r.seed ?? ""}</td>
                  <td className="text-center">{r.manager ?? ""}</td>
                  <td className="text-right">{r.week15 ?? ""}</td>
                  <td className="text-right">{r.week16 ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

