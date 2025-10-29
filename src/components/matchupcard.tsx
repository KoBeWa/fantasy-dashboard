"use client";
import React from "react";

type LineupEntry = {
  slot: string;          // z.B. "RB", "WR", "W/R", "K", "QB", "DEF", "BN"
  player_raw: string;    // "P. Manning QB - DEN"
  pos?: string | null;   // "QB", "RB" ...
  points: number | null; // 0-xxx
};

export type Matchup = {
  season: number;
  week: number;
  is_playoff?: boolean;
  home_team: string;
  away_team: string;
  home_points: number | null;
  away_points: number | null;
  home_lineup: { starters: LineupEntry[]; bench: LineupEntry[] };
  away_lineup: { starters: LineupEntry[]; bench: LineupEntry[] };
};

function fmtPts(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

// Wir labeln doppelte Slots (RB/WR) als RB1/RB2, WR1/WR2 etc. für sauberes Alignment
function labelStarters(starters: LineupEntry[]) {
  const counters: Record<string, number> = {};
  return starters.map((e) => {
    const key = e.slot.toUpperCase();
    const idx = (counters[key] = (counters[key] ?? 0) + 1);
    let label = key;
    if (key === "RB" || key === "WR") label = `${key}${idx}`; // RB1, RB2 / WR1, WR2
    return { ...e, _label: label };
  }) as (LineupEntry & { _label: string })[];
}

const STARTER_ORDER = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "W/R", "K", "DEF"];

function mergedStarterLabels(
  left: (LineupEntry & { _label: string })[],
  right: (LineupEntry & { _label: string })[]
) {
  const set = new Set<string>();
  left.forEach((e) => set.add(e._label));
  right.forEach((e) => set.add(e._label));
  return Array.from(set).sort((a, b) => {
    const ia = STARTER_ORDER.indexOf(a);
    const ib = STARTER_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

function BenchList({ list }: { list: LineupEntry[] }) {
  if (!list?.length) return <div className="text-sm text-gray-500">—</div>;
  return (
    <ul className="space-y-1">
      {list.map((e, i) => (
        <li key={i} className="flex items-center justify-between text-sm">
          <span className="truncate">{e.player_raw || e.slot}</span>
          <span className="tabular-nums">{fmtPts(e.points)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function MatchupCard({ m }: { m: Matchup }) {
  const left = labelStarters(m.home_lineup.starters || []);
  const right = labelStarters(m.away_lineup.starters || []);
  const labels = mergedStarterLabels(left, right);

  const leftBy = Object.fromEntries(left.map((e) => [e._label, e]));
  const rightBy = Object.fromEntries(right.map((e) => [e._label, e]));

  const isHomeWin =
    (m.home_points ?? -Infinity) > (m.away_points ?? -Infinity);
  const isAwayWin =
    (m.away_points ?? -Infinity) > (m.home_points ?? -Infinity);

  return (
    <article className="rounded-xl border p-4">
      <header className="mb-3 flex flex-wrap items-end gap-3">
        <span className="text-xs rounded bg-gray-100 px-2 py-1">
          {m.is_playoff ? "Playoffs" : `Week ${m.week}`}
        </span>
        <h3 className="text-lg font-semibold">
          {m.home_team} <span className="font-normal">vs</span> {m.away_team}
        </h3>
        <div className="ml-auto flex items-center gap-4 text-right">
          <div className={`text-base tabular-nums ${isHomeWin ? "font-bold" : ""}`}>
            {fmtPts(m.home_points)}
          </div>
          <div className={`text-base tabular-nums ${isAwayWin ? "font-bold" : ""}`}>
            {fmtPts(m.away_points)}
          </div>
        </div>
      </header>

      {/* Starters – side-by-side */}
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left w-[90px]">Slot</th>
              <th className="text-left">Team 1: {m.home_team}</th>
              <th className="text-right w-[80px]">Pts</th>
              <th className="text-left w-[90px]">Slot</th>
              <th className="text-left">Team 2: {m.away_team}</th>
              <th className="text-right w-[80px]">Pts</th>
            </tr>
          </thead>
          <tbody>
            {labels.map((lab) => {
              const L = leftBy[lab];
              const R = rightBy[lab];
              return (
                <tr key={lab} className="border-t">
                  <td className="text-xs text-gray-500">{lab}</td>
                  <td className="pr-3">
                    <div className="truncate">{L?.player_raw ?? "—"}</div>
                  </td>
                  <td className="text-right tabular-nums">{fmtPts(L?.points ?? null)}</td>

                  <td className="text-xs text-gray-500">{lab}</td>
                  <td className="pr-3">
                    <div className="truncate">{R?.player_raw ?? "—"}</div>
                  </td>
                  <td className="text-right tabular-nums">{fmtPts(R?.points ?? null)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bench */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-1 font-medium">Bench – {m.home_team}</h4>
          <BenchList list={m.home_lineup.bench || []} />
        </div>
        <div>
          <h4 className="mb-1 font-medium">Bench – {m.away_team}</h4>
          <BenchList list={m.away_lineup.bench || []} />
        </div>
      </div>
    </article>
  );
}
