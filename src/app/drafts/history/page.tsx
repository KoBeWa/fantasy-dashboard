"use client";

import { useEffect, useMemo, useState } from "react";

// ---------- Types ----------
type ScoreRow = {
  Year: number;
  Owner: string;
  Player: string;
  Pos: string;
  Pick: number;
  Final_Pos_Rank: number | null;
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

type JoinedRow = {
  Round: number;
  Pick: string;
  Manager: string;
  Player: string;
  Pos: string;
  EndOfSeasonRank: string;
  Score?: number;
  DraftPos?: number;
  FinalPos: number | null;
  DeltaPos?: number;
  heat?: string;
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
function numOrNull(x: any): number | null {
  const s = String(x ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
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

// Draft-Positionsränge je Position zählen (RB1, WR12, …)
function computeDraftPosRanks(rows: DraftRow[]): Map<number, number> {
  const sortedIdx = rows
    .map((r, i) => ({ i, ov: r.Overall }))
    .sort((a, b) => a.ov - b.ov)
    .map((x) => x.i);
  const counters: Record<string, number> = {};
  const res = new Map<number, number>();
  for (const idx of sortedIdx) {
    const pos = rows[idx].Pos;
    counters[pos] = (counters[pos] ?? 0) + 1;
    res.set(idx, counters[pos]); // z. B. WR → 1,2,3…
  }
  return res;
}

// Heatmap-Farbe pro Runde anhand Score
function scoreHeat(score: number, min: number, max: number) {
  if (!Number.isFinite(score) || max <= min) return "";
  const t = Math.max(0, Math.min(1, (score - min) / (max - min)));
  if (t < 0.2) return "bg-red-100";
  if (t < 0.4) return "bg-orange-100";
  if (t < 0.6) return "bg-yellow-100";
  if (t < 0.8) return "bg-lime-100";
  return "bg-green-100";
}

export default function DraftHistoryPage() {
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<boolean>(true);

  // 1) Scores laden
  useEffect(() => {
    fetch("/fantasy-dashboard/data/league/draft_scores.tsv")
      .then((r) => r.text())
      .then((txt) => {
        const rows = parseTSV<Record<string, any>>(txt).map((r) => {
          const fpr = numOrNull(r.Final_Pos_Rank);
          return {
            Year: num(r.Year),
            Owner: String(r.Owner ?? ""),
            Player: String(r.Player ?? ""),
            Pos: up(r.Pos),
            Pick: num(r.Pick),
            Final_Pos_Rank: fpr,
            Score: num(r.Score),
          } as ScoreRow;
        });
        setScores(rows);
        const years = Array.from(new Set(rows.map((x) => x.Year))).sort((a, b) => a - b);
        setYear(years.at(-1) ?? null);
      })
      .catch(() => setError("Konnte draft_scores.tsv nicht laden"));
  }, []);

  // 2) Draft pro Jahr laden (aus public/data/drafts/YYYY-draft.tsv)
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
        rows.sort((a, b) => a.Overall - b.Overall);
        setDraft(rows);
      })
      .catch(() =>
        setError(
          `Draft-Datei für ${year} nicht gefunden. Stelle sicher, dass sie unter public/data/drafts/${year}-draft.tsv liegt.`
        )
      );
  }, [year]);

  // 3) Join Draft <-> Scores + Heatmap je Runde
  const joined = useMemo<JoinedRow[]>(() => {
    if (!draft || !scores || !year) return [];

    const yearScores = scores.filter((s) => s.Year === year);

    const byComposite = new Map<string, ScoreRow[]>();
    const byPick = new Map<number, ScoreRow[]>();
    for (const s of yearScores) {
      const key = `${normName(s.Owner)}__${normName(s.Player)}__${s.Pos}`;
      const a = byComposite.get(key) ?? [];
      a.push(s);
      byComposite.set(key, a);

      const b = byPick.get(s.Pick) ?? [];
      b.push(s);
      byPick.set(s.Pick, b);
    }

    const draftPosRanks = computeDraftPosRanks(draft);
    const roundStats = new Map<number, { min: number; max: number }>();

    const rows: JoinedRow[] = draft.map((d, idx) => {
      const key = `${normName(d.ManagerName)}__${normName(d.Player)}__${d.Pos}`;
      let match = (byComposite.get(key) ?? [])[0];
      if (!match) {
        const arr = byPick.get(d.Overall) ?? [];
        match = arr.find((x) => x.Pos === d.Pos) ?? arr[0];
      }

      const finalPos: number | null =
        match && match.Final_Pos_Rank !== null ? Number(match.Final_Pos_Rank) : null;

      const finalRank = finalPos !== null ? `${match!.Pos}#${finalPos}` : "-";
      const scoreNum = match ? match.Score : NaN;

      if (Number.isFinite(scoreNum)) {
        const rs = roundStats.get(d.Round) ?? { min: scoreNum, max: scoreNum };
        rs.min = Math.min(rs.min, scoreNum);
        rs.max = Math.max(rs.max, scoreNum);
        roundStats.set(d.Round, rs);
      }

      const draftPos = draftPosRanks.get(idx);
      const deltaPos =
        Number.isFinite(draftPos as any) && finalPos !== null
          ? Number(draftPos) - Number(finalPos)
          : undefined;

      return {
        Round: d.Round,
        Pick: pickLabel(d.Round, d.PickInRound),
        Manager: d.ManagerName,
        Player: d.Player,
        Pos: d.Pos,
        EndOfSeasonRank: finalRank,
        Score: Number.isFinite(scoreNum) ? Number(scoreNum) : undefined,
        DraftPos: draftPos,
        FinalPos: finalPos,
        DeltaPos: deltaPos,
      };
    });

    // Heatmap-Klasse je Zeile
    const withHeat = rows.map((r) => {
      if (!Number.isFinite(r.Score as any)) return { ...r, heat: "" };
      const stat = roundStats.get(r.Round);
      const cls = stat ? scoreHeat(Number(r.Score), stat.min, stat.max) : "";
      return { ...r, heat: cls };
    });

    return withHeat;
  }, [draft, scores, year]);

  const years = useMemo(() => {
    const ys = Array.from(new Set(scores.map((x) => x.Year))).sort((a, b) => a - b);
    return ys;
  }, [scores]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Draft History</h1>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={compareMode}
            onChange={(e) => setCompareMode(e.target.checked)}
          />
          Compare Mode (Δ & Heatmap)
        </label>
      </div>

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
        <>
          <table className="w-full border border-gray-300 text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-2 py-1 text-center">Pick</th>
                <th className="border px-2 py-1 text-center">Manager</th>
                <th className="border px-2 py-1 text-center">Player</th>
                <th className="border px-2 py-1 text-center">Pos</th>
                {compareMode && (
                  <>
                    <th className="border px-2 py-1 text-center">DraftPos</th>
                    <th className="border px-2 py-1 text-center">FinalPos</th>
                    <th className="border px-2 py-1 text-center">ΔPos</th>
                  </>
                )}
                <th className="border px-2 py-1 text-center">EndOfSeasonRank</th>
                <th className="border px-2 py-1 text-center">Score</th>
              </tr>
            </thead>
            <tbody>
              {joined.map((r, i) => (
                <tr key={i} className={`odd:bg-white even:bg-gray-50`}>
                  <td className="border px-2 py-1 text-center">{r.Pick}</td>
                  <td className="border px-2 py-1 text-center">{r.Manager}</td>
                  <td className="border px-2 py-1 text-center">{r.Player}</td>
                  <td className="border px-2 py-1 text-center">{r.Pos}</td>
                  {compareMode && (
                    <>
                      <td className="border px-2 py-1 text-center">
                        {Number.isFinite(r.DraftPos as any) ? `${r.Pos}${r.DraftPos}` : "-"}
                      </td>
                      <td className="border px-2 py-1 text-center">
                        {r.FinalPos !== null ? `${r.Pos}${r.FinalPos}` : "-"}
                      </td>
                      <td
                        className={`border px-2 py-1 text-center ${
                          Number(r.DeltaPos) > 0
                            ? "text-green-700"
                            : Number(r.DeltaPos) < 0
                            ? "text-red-700"
                            : ""
                        }`}
                      >
                        {Number.isFinite(r.DeltaPos as any)
                          ? `${(r.DeltaPos as number) > 0 ? "+" : ""}${r.DeltaPos}`
                          : "-"}
                      </td>
                    </>
                  )}
                  <td className="border px-2 py-1 text-center">{r.EndOfSeasonRank}</td>
                  <td className={`border px-2 py-1 text-center font-medium ${compareMode ? r.heat : ""}`}>
                    {Number.isFinite(r.Score as any) ? Number(r.Score).toFixed(2) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {compareMode && (
            <div className="mt-3 text-xs text-gray-600">
              <div className="inline-flex items-center gap-2">
                <span className="px-2 py-1 bg-red-100 border rounded">schwacher Pick (Runden-Vergleich)</span>
                <span className="px-2 py-1 bg-green-100 border rounded">starker Pick (Runden-Vergleich)</span>
                <span className="ml-3">ΔPos = DraftPos − FinalPos (positiv = Steal)</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
