"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

/**
 * This page loads:
 *  - Weekly matchups:   data/teamgamecenter/<YEAR>/<WEEK>.csv
 *  - Season totals:     data/processed/seasons/<YEAR>/teams.json
 *
 * Records shown:
 *  - Top 5 highest scoring week  (single team)
 *  - Top 5 lowest  scoring week  (single team)
 *  - Top 5 season high points    (PF per season + avg / game)
 *  - Top 5 season low  points    (PF per season + avg / game)
 *  - Top 5 biggest blowouts      (win margin)
 *  - Top 5 highest combined      (A+B)
 *  - Top 5 lowest  combined      (A+B)
 *  - Highest winning streak      (across seasons)
 *  - Highest losing  streak      (across seasons)
 *  - High scores count           (# of weekly #1s per owner)
 *  - Top 3 scores count          (# of weekly top-3 per owner)
 */

// ---------- Config ----------
const FIRST_SEASON = 2015;
const LAST_SEASON = 2025;   // adjust if needed
const MAX_WEEK = 16;        // Sleeper/your export uses 1..16
const BASE_PATH =
  (process.env.NEXT_PUBLIC_BASE_PATH && process.env.NEXT_PUBLIC_BASE_PATH !== "/")
    ? process.env.NEXT_PUBLIC_BASE_PATH.replace(/\/+$/, "")
    : "";

// ---------- Helpers ----------
function buildUrl(p: string) {
  const clean = p.replace(/^\/+/, "");
  return `${BASE_PATH}/${clean}`;
}
// Robust: erkennt 1.234,56  |  1,234.56  |  174.76  |  174,76
function toNum(x: any): number {
  if (x == null) return 0;
  if (typeof x === "number") return x;
  let s = String(x).trim();

  // 1) Reine Komma-Decimalzahlen (keine Punkte):  "174,76" -> 174.76
  if (s.includes(",") && !s.includes(".")) {
    return Number(s.replace(/\s/g, "").replace(",", "."));
  }

  // 2) Klassisch deutsch: "1.234,56"
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
    return Number(s);
  }

  // 3) Klassisch US: "1,234.56"
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, "");
    return Number(s);
  }

  // 4) Nur Punkt als Dezimaltrenner: "174.76"
  if (/^\d+(\.\d+)?$/.test(s)) {
    return Number(s);
  }

  // Fallback: alles Nicht-Ziffern außer . und - entfernen
  s = s.replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number, digits = 2) {
  return n.toFixed(digits);
}

// CSV parser (very small, good enough for your matchups)
async function fetchCSV(path: string): Promise<string[][]> {
  const res = await fetch(buildUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  const rows = lines.map((line) => {
    // split by comma, but keep simple (your fields don't contain quoted commas except names, which are fine)
    return line.split(",").map((c) => c.trim());
  });
  return rows;
}

// JSON loader
async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(buildUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return (await res.json()) as T;
}

// ---------- Types ----------
type TeamsJsonRow = {
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

type WeeklyEntry = {
  season: number;
  week: number;
  owner: string;
  total: number;
  opponent: string;
  opponentTotal: number;
  matchupIdKey: string; // stable key to group pairs
};

type Matchup = {
  season: number;
  week: number;
  aOwner: string;
  aPts: number;
  bOwner: string;
  bPts: number;
  winner: string;
  loser: string;
  margin: number;
  combined: number;
};

// ---------- Main component ----------
export default function RecordsPage() {
  const [loading, setLoading] = useState(true);
  const [weekly, setWeekly] = useState<WeeklyEntry[]>([]);
  const [seasonTeams, setSeasonTeams] = useState<TeamsJsonRow[]>([]);

  // Load all seasons weekly CSVs + all seasons teams.json
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const seasons = Array.from({ length: LAST_SEASON - FIRST_SEASON + 1 }, (_, i) => FIRST_SEASON + i);

        // --- load weekly CSVs ---
        const weeklyAll: WeeklyEntry[] = [];
        for (const y of seasons) {
          for (let w = 1; w <= MAX_WEEK; w++) {
            try {
              const rows = await fetchCSV(`data/teamgamecenter/${y}/${w}.csv`);
              if (!rows || rows.length < 2) continue;
              const header = rows[0];
              // find columns robustly
              const findCol = (name: string) => {
                const target = name.replace(/\s+/g, "").toLowerCase();
                let idx = header.findIndex((h) => h.replace(/\s+/g, "").toLowerCase() === target);
                if (idx === -1 && name === "Opponent Total") {
                  // some files might use 'OpponentTotal'
                  idx = header.findIndex((h) => h.replace(/\s+/g, "").toLowerCase() === "opponenttotal");
                }
                return idx;
              };
              const cOwner = findCol("Owner");
              const cTotal = findCol("Total");
              const cOpp   = findCol("Opponent");
              const cOppT  = findCol("Opponent Total");

              if ([cOwner, cTotal, cOpp, cOppT].some((x) => x < 0)) continue;

              // parse rows
              // We’ll create one entry per row, then pair them by (owner, opponent) unique key
              for (let i = 1; i < rows.length; i++) {
                const r = rows[i];
                const owner = r[cOwner] ?? "";
                const opp = r[cOpp] ?? "";
                const tot = toNum(r[cTotal]);
                const oppTot = toNum(r[cOppT]);

                if (!owner || !opp) continue;

                const key = [owner, opp].sort().join("::");
                weeklyAll.push({
                  season: y,
                  week: w,
                  owner,
                  total: tot,
                  opponent: opp,
                  opponentTotal: oppTot,
                  matchupIdKey: key,
                });
              }
            } catch {
              // file missing → skip silently
            }
          }
        }

        // --- load teams.json for all seasons ---
        const teamsAll: TeamsJsonRow[] = [];
        for (const y of seasons) {
          try {
            const arr = await fetchJSON<TeamsJsonRow[]>(`data/processed/seasons/${y}/teams.json`);
            teamsAll.push(...arr.map((t) => ({ ...t, season: y })));
          } catch {
            // missing: skip
          }
        }

        if (!cancelled) {
          setWeekly(weeklyAll);
          setSeasonTeams(teamsAll);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setWeekly([]);
          setSeasonTeams([]);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Build unique matchups from weekly rows
  const matchups: Matchup[] = useMemo(() => {
    const out: Matchup[] = [];
    // group by season/week/key
    const map = new Map<string, WeeklyEntry[]>();
    for (const r of weekly) {
      const k = `${r.season}-${r.week}-${r.matchupIdKey}`;
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
    for (const [k, arr] of map.entries()) {
      if (arr.length === 2) {
        const A = arr[0], B = arr[1];
        const winner = A.total >= B.total ? A.owner : B.owner;
        const loser  = A.total >= B.total ? B.owner : A.owner;
        const margin = Math.abs(A.total - B.total);
        const combined = A.total + B.total;
        out.push({
          season: A.season,
          week: A.week,
          aOwner: A.owner, aPts: A.total,
          bOwner: B.owner, bPts: B.total,
          winner, loser, margin, combined
        });
      } else if (arr.length === 1) {
        const A = arr[0];
        out.push({
          season: A.season,
          week: A.week,
          aOwner: A.owner, aPts: A.total,
          bOwner: A.opponent, bPts: A.opponentTotal,
          winner: A.total >= A.opponentTotal ? A.owner : A.opponent,
          loser:  A.total >= A.opponentTotal ? A.opponent : A.owner,
          margin: Math.abs(A.total - A.opponentTotal),
          combined: A.total + A.opponentTotal
        });
      }
    }
    // sort chronologically
    out.sort((a,b) => a.season - b.season || a.week - b.week);
    return out;
  }, [weekly]);

  // Highest/Lowest scoring week (single team)
  const allSingleScores = useMemo(() => {
    const arr: { season:number; week:number; owner:string; points:number }[] = [];
    for (const m of matchups) {
      arr.push({ season: m.season, week: m.week, owner: m.aOwner, points: m.aPts });
      arr.push({ season: m.season, week: m.week, owner: m.bOwner, points: m.bPts });
    }
    return arr;
  }, [matchups]);

  const top5HighWeek = useMemo(() => {
    return [...allSingleScores].sort((a,b) => b.points - a.points).slice(0,5);
  }, [allSingleScores]);
  const top5LowWeek = useMemo(() => {
    return [...allSingleScores].sort((a,b) => a.points - b.points).slice(0,5);
  }, [allSingleScores]);

  // Season PF high/low + average per week
  type SeasonPF = { season:number; owner:string; team?:string; games:number; pf:number; avg:number };
  const seasonPF: SeasonPF[] = useMemo(() => {
    const out: SeasonPF[] = [];
    for (const t of seasonTeams) {
      const owner = (t.team ?? t.owner ?? t.manager ?? "") as string;
      const wins = toNum(t.wins);
      const losses = toNum(t.losses);
      const ties = toNum((t as any).ties);
      const games = Math.max(1, wins + losses + ties);
      const pf = toNum(t.pf);
      out.push({
        season: toNum(t.season),
        owner,
        team: t.team,
        games,
        pf,
        avg: pf / games
      });
    }
    return out;
  }, [seasonTeams]);

  const top5SeasonHigh = useMemo(() => {
    return [...seasonPF].sort((a,b) => b.pf - a.pf).slice(0,5);
  }, [seasonPF]);
  const top5SeasonLow = useMemo(() => {
    return [...seasonPF].sort((a,b) => a.pf - b.pf).slice(0,5);
  }, [seasonPF]);

  // Biggest blowouts / combined highs / combined lows
  const top5Blowouts = useMemo(() => {
    return [...matchups].sort((a,b) => b.margin - a.margin).slice(0,5);
  }, [matchups]);
  const top5CombinedHigh = useMemo(() => {
    return [...matchups].sort((a,b) => b.combined - a.combined).slice(0,5);
  }, [matchups]);
  const top5CombinedLow = useMemo(() => {
    return [...matchups].sort((a,b) => a.combined - b.combined).slice(0,5);
  }, [matchups]);

  // Streaks (across seasons)
  type Result = { owner:string; win:boolean; season:number; week:number };
  const streaks = useMemo(() => {
    const res: Result[] = [];
    for (const m of matchups) {
      res.push({ owner: m.winner, win: true,  season: m.season, week: m.week });
      res.push({ owner: m.loser,  win: false, season: m.season, week: m.week });
    }
    // group per owner chronologically
    const byOwner = new Map<string, Result[]>();
    for (const r of res) {
      const arr = byOwner.get(r.owner) ?? [];
      arr.push(r);
      byOwner.set(r.owner, arr);
    }
    for (const arr of byOwner.values()) {
      arr.sort((a,b) => a.season - b.season || a.week - b.week);
    }
    // compute max win/lose streak per owner
    let bestWin = { owner:"", len:0 };
    let bestLose= { owner:"", len:0 };
    for (const [owner, arr] of byOwner.entries()) {
      let curW=0, maxW=0, curL=0, maxL=0;
      for (const r of arr) {
        if (r.win) { curW++; maxW = Math.max(maxW, curW); curL = 0; }
        else       { curL++; maxL = Math.max(maxL, curL); curW = 0; }
      }
      if (maxW > bestWin.len) bestWin = { owner, len: maxW };
      if (maxL > bestLose.len) bestLose= { owner, len: maxL };
    }
    return { bestWin, bestLose };
  }, [matchups]);

  // Weekly #1 (high score) count and weekly top-3 count
  const weeklyAwards = useMemo(() => {
    // build per season/week list of scores
    const swMap = new Map<string, { owner:string; points:number }[]>();
    for (const s of allSingleScores) {
      const key = `${s.season}-${s.week}`;
      const arr = swMap.get(key) ?? [];
      arr.push({ owner: s.owner, points: s.points });
      swMap.set(key, arr);
    }
    const highCount = new Map<string, number>();
    const top3Count = new Map<string, number>();

    for (const [k, arr] of swMap.entries()) {
      arr.sort((a,b) => b.points - a.points);
      const tops = arr;
      if (tops.length > 0) {
        const maxPoints = tops[0].points;
        // all owners tied for #1 count
        for (const e of tops) {
          if (e.points === maxPoints) {
            highCount.set(e.owner, (highCount.get(e.owner) ?? 0) + 1);
          } else break;
        }
      }
      // top-3 (including ties around 3rd cutoff)
      const top3 = tops.slice(0, Math.min(3, tops.length));
      let cutoff = top3.length ? top3[top3.length - 1].points : -Infinity;
      for (const e of tops) {
        if (e.points >= cutoff) {
          top3Count.set(e.owner, (top3Count.get(e.owner) ?? 0) + 1);
        } else {
          break;
        }
      }
    }

    // build sorted arrays
    const highArr = Array.from(highCount.entries()).map(([owner, count]) => ({ owner, count }));
    highArr.sort((a,b) => b.count - a.count || a.owner.localeCompare(b.owner));

    const top3Arr = Array.from(top3Count.entries()).map(([owner, count]) => ({ owner, count }));
    top3Arr.sort((a,b) => b.count - a.count || a.owner.localeCompare(b.owner));

    return { highArr, top3Arr };
  }, [allSingleScores]);

  // ---------- UI helpers ----------
  function Table<T>({ rows, header, render }: {
    rows: T[];
    header: React.ReactNode;
    render: (row: T, idx: number) => React.ReactNode;
  }) {
    return (
      <table className="w-full text-sm">
        <thead className="text-left">
          {header}
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">{render(r, i)}</tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (loading) {
    return (
      <main className="p-6">
        <header className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Records</h1>
          <Link href="/" className="ml-auto text-sm underline">← Dashboard</Link>
        </header>
        <p className="mt-4 text-sm text-gray-600">Lade Daten…</p>
      </main>
    );
  }

  return (
    <main className="p-6 space-y-8">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Records</h1>
        <Link href="/" className="ml-auto text-sm underline decoration-dotted hover:decoration-solid">← Dashboard</Link>
      </header>

      {/* High/Low single weeks */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Top 5 – Highest Scoring Week</h2>
          <Table
            rows={top5HighWeek}
            header={
              <tr>
                <th>Owner</th><th>Pts</th><th>Season</th><th>Week</th>
              </tr>
            }
            render={(r) => (
              <>
                <td>{r.owner}</td>
                <td className="text-right font-medium">{fmt(r.points)}</td>
                <td>{r.season}</td>
                <td>{r.week}</td>
              </>
            )}
          />
        </article>
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Top 5 – Lowest Scoring Week</h2>
          <Table
            rows={top5LowWeek}
            header={
              <tr>
                <th>Owner</th><th>Pts</th><th>Season</th><th>Week</th>
              </tr>
            }
            render={(r) => (
              <>
                <td>{r.owner}</td>
                <td className="text-right font-medium">{fmt(r.points)}</td>
                <td>{r.season}</td>
                <td>{r.week}</td>
              </>
            )}
          />
        </article>
      </section>

      {/* Season PF high/low */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Top 5 – Season High Points (PF)</h2>
          <Table
            rows={top5SeasonHigh}
            header={
              <tr>
                <th>Season</th><th>Owner</th><th>PF</th><th>Avg / wk</th><th>Games</th>
              </tr>
            }
            render={(r) => (
              <>
                <td>{r.season}</td>
                <td>{r.owner}</td>
                <td className="text-right font-medium">{fmt(r.pf)}</td>
                <td className="text-right">{fmt(r.avg)}</td>
                <td className="text-center">{r.games}</td>
              </>
            )}
          />
        </article>
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Top 5 – Season Low Points (PF)</h2>
          <Table
            rows={top5SeasonLow}
            header={
              <tr>
                <th>Season</th><th>Owner</th><th>PF</th><th>Avg / wk</th><th>Games</th>
              </tr>
            }
            render={(r) => (
              <>
                <td>{r.season}</td>
                <td>{r.owner}</td>
                <td className="text-right font-medium">{fmt(r.pf)}</td>
                <td className="text-right">{fmt(r.avg)}</td>
                <td className="text-center">{r.games}</td>
              </>
            )}
          />
        </article>
      </section>

      {/* Matchup based */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Top 5 – Biggest Blowouts</h2>
          <Table
            rows={top5Blowouts}
            header={
              <tr>
                <th>Season</th><th>Week</th><th>Winner</th><th>Loser</th><th>Margin</th>
              </tr>
            }
            render={(m) => (
              <>
                <td>{m.season}</td>
                <td>{m.week}</td>
                <td>{m.winner}</td>
                <td>{m.loser}</td>
                <td className="text-right font-medium">{fmt(m.margin)}</td>
              </>
            )}
          />
        </article>
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Top 5 – Highest Combined</h2>
          <Table
            rows={top5CombinedHigh}
            header={
              <tr>
                <th>Season</th><th>Week</th><th>A</th><th>B</th><th>Combined</th>
              </tr>
            }
            render={(m) => (
              <>
                <td>{m.season}</td>
                <td>{m.week}</td>
                <td>{m.aOwner} {fmt(m.aPts)}</td>
                <td>{m.bOwner} {fmt(m.bPts)}</td>
                <td className="text-right font-medium">{fmt(m.combined)}</td>
              </>
            )}
          />
        </article>
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Top 5 – Lowest Combined</h2>
          <Table
            rows={top5CombinedLow}
            header={
              <tr>
                <th>Season</th><th>Week</th><th>A</th><th>B</th><th>Combined</th>
              </tr>
            }
            render={(m) => (
              <>
                <td>{m.season}</td>
                <td>{m.week}</td>
                <td>{m.aOwner} {fmt(m.aPts)}</td>
                <td>{m.bOwner} {fmt(m.bPts)}</td>
                <td className="text-right font-medium">{fmt(m.combined)}</td>
              </>
            )}
          />
        </article>
      </section>

      {/* Streaks & weekly awards */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Highest Winning / Losing Streak</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-t">
                <td>Winning</td>
                <td className="text-right font-medium">{streaks.bestWin.owner}</td>
                <td className="text-right">{streaks.bestWin.len}</td>
              </tr>
              <tr className="border-t">
                <td>Losing</td>
                <td className="text-right font-medium">{streaks.bestLose.owner}</td>
                <td className="text-right">{streaks.bestLose.len}</td>
              </tr>
            </tbody>
          </table>
        </article>
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Weekly Awards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold mb-1">High Scores (#1 per week)</h3>
              <Table
                rows={weeklyAwards.highArr.slice(0,10)}
                header={<tr><th>Owner</th><th>#</th></tr>}
                render={(r) => (<><td>{r.owner}</td><td className="text-right">{r.count}</td></>)}
              />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Top 3 per week</h3>
              <Table
                rows={weeklyAwards.top3Arr.slice(0,10)}
                header={<tr><th>Owner</th><th>#</th></tr>}
                render={(r) => (<><td>{r.owner}</td><td className="text-right">{r.count}</td></>)}
              />
            </div>
          </div>
        </article>
      </section>

      {/* Data missing hint */}
      {(weekly.length === 0 || seasonTeams.length === 0) && (
        <p className="text-xs text-gray-600">
          Hinweis: Stelle sicher, dass die Build-Pipeline die Dateien nach <code>public/data</code> kopiert:
          <code> data/teamgamecenter/&lt;YEAR&gt;/&lt;WEEK&gt;.csv</code> und
          <code> data/processed/seasons/&lt;YEAR&gt;/teams.json</code>.
        </p>
      )}
    </main>
  );
}
