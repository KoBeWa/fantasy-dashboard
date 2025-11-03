"use client";

import { useEffect, useMemo, useState } from "react";

// ---------- Types ----------
type ScoreRow = {
  Year: number;
  Owner: string;
  Player: string;
  Pos: string;
  Pick: number;
  Final_Pos_Rank?: number;
  Score: number;
};

type DraftRow = {
  Round: number;
  Overall: number;
  PickInRound: number;
  ManagerName: string;
  Player: string;
  Pos: string;
  NFLTeam?: string;
};

// ---------- Utils ----------
function parseTSV<T extends Record<string, any>>(text: string): T[] {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift()!.split("\t").map((h) => h.trim());
  return lines.map((line) => {
    const cols = line.split("\t").map((v) => v.trim());
    const obj: any = {};
    headers.forEach((h, i) => (obj[h] = cols[i]));
    return obj as T;
  });
}

function num(x: any, fallback = 0) {
  const n = Number(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function up(x: any) {
  return String(x ?? "").toUpperCase();
}

function normName(s: string) {
  return s
    .toLowerCase()
    .replace(/[.\-'\u2019]/g, "")
    .replace(/\b(jr|sr|iii|ii|iv)\b/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function pickLabel(round: number, pir: number) {
  return `${round}.${String(pir).padStart(2, "0")}`;
}

// ---------- Component ----------
export default function DraftHistoryPage() {
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1) Scores laden (alle Jahre in einer Datei)
  useEffect(() => {
    fetch("/fantasy-dashboard/data/league/draft_scores.tsv")
      .then((r) => r.text())
      .then((txt) => {
        const rows = parseTSV<Record<string, any>>(txt).map((r) => ({
          Year: num(r.Year),
          Owner: String(r.Owner ?? ""),
          Player: String(r.Player ?? ""),
          Pos: up(r.Pos),
          Pick: num(r.Pick),
          Final_Pos_Rank: num(r.Final_Pos_Rank, undefined),
          Score: num(r.Score),
        })) as ScoreRow[];

        setScores(rows);

        // default: jüngstes Jahr mit Scores (2025 ist bei dir ausgeschlossen)
        const years = Array.from(new Set(rows.map((x) => x.Year))).sort((a, b) => a - b);
        setYear(years.at(-1) ?? null);
      })
      .catch((e) => setError("Konnte draft_scores.tsv nicht laden"));
  }, []);

  // 2) Draft-Datei für das gewählte Jahr laden
  useEffect(() => {
    if (!year) return;

    setDraft(null);
    setError(null);

    fetch(`/fantasy-dashboard/data/drafts/${year}-draft.tsv`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.text();
      })
      .then((txt) => {
        const rows = parseTSV<Record<string, any>>(txt).map((r) => ({
          Round: num(r.Round),
          Overall: num(r.Overall ?? r.OverallPick ?? r.Pick),
          PickInRound: num(r.PickInRound),
          ManagerName: String(r.ManagerName ?? r.Owner ?? ""),
          Player: String(r.Player ?? ""),
          Pos: up(r.Pos ?? r.Position),
          NFLTeam: r.NFLTeam ? String(r.NFLTeam) : undefined,
        })) as DraftRow[];

        // sortiere nach Overall für stabile Reihenfolge
        rows.sort((a, b) => a.Overall - b.Overall);
        setDraft(rows);
      })
      .catch(() =>
        setError(
          `Draft-Datei für ${year} nicht gefunden. Stelle sicher, dass sie unter public/data/drafts/${year}-draft.tsv liegt.`
        )
      );
  }, [year]);

  // 3) Join Draft <-> Scores (Year + (Owner≈Manager) + Player≈Player + Pos; Fallback Pick)
  const joined = useMemo(() => {
    if (!draft || !scores || !year) return [];

    const scoreRows = scores.filter((s) => s.Year === year);

    // Indexe für schnelles Matching
    const byComposite = new Map<string, ScoreRow[]>();
    for (const s of scoreRows) {
      const key = `${normName(s.Owner)}__${normName(s.Player)}__${s.Pos}`;
      const arr = byComposite.get(key) ?? [];
      arr.push(s);
      byComposite.set(key, arr);
    }
    const byPick = new Map<number, ScoreRow[]>();
    for (const s of scoreRows) {
      const arr = byPick.get(s.Pick) ?? [];
      arr.push(s);
      byPick.set(s.Pick, arr);
    }

    return draft.map((d) => {
      const key = `${normName(d.ManagerName)}__${normName(d.Player)}__${d.Pos}`;
      let match = (byComposite.get(key) ?? [])[0];

      if (!match) {
        // Fallback: per Overall Pick
        const arr = byPick.get(d.Overall) ?? [];
        // wenn mehrere, versuche Positionsgleichheit
        match = arr.find((x) => x.Pos === d.Pos) ?? arr[0];
      }

      const finalRank =
        match && Number.isFinite(match.Final_Pos_Rank as any)
          ? `${match.Pos}#${match.Final_Pos_Rank}`
          : "-";

      return {
        Pick: pickLabel(d.Round, d.PickInRound),
        Manager: d.ManagerName,
        Player: d.Player,
        Pos: d.Pos,
        EndOfSeasonRank: finalRank,
        Score: match ? match.Score.toFixed(2) : "-",
      };
    });
  }, [draft, scores, year]);

  const years = useMemo(() => {
    const ys = Array.from(new Set(scores.map((x) => x.Year))).sort((a, b) => a - b);
    return ys;
  }, [scores]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Draft History</h1>

      {/* Year Picker */}
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm font-medium">Season:</label>
        <select
          value={year ?? ""}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border px-2 py-1 rounded"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 p-3 border border-red-300 bg-red-50 rounded text-sm">
          {error}
        </div>
      )}

      {!draft ? (
        <div className="p-4">Lade Draft {year}…</div>
      ) : (
        <table className="w-full border border-gray-300 text-sm">
          <thead>
            <tr className="bg-gray-100">
              {["Pick", "Manager", "Player", "Pos", "EndOfSeasonRank", "Score"].map((h) => (
                <th key={h} className="border px-2 py-1 text-center">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {joined.map((r, i) => (
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                <td className="border px-2 py-1 text-center">{r.Pick}</td>
                <td className="border px-2 py-1 text-center">{r.Manager}</td>
                <td className="border px-2 py-1 text-center">{r.Player}</td>
                <td className="border px-2 py-1 text-center">{r.Pos}</td>
                <td className="border px-2 py-1 text-center">{r.EndOfSeasonRank}</td>
                <td className="border px-2 py-1 text-center">{r.Score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
