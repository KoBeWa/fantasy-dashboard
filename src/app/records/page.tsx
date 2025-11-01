"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

/** ---------------------------------------------------------
 *  Datenquelle
 *  Wir laden die Week-CSV direkt aus FF-Scraping (raw.githubusercontent).
 *  Erwartetes Schema pro Zeile:
 *    Owner,Rank, ..., Total,Opponent,Opponent Total
 *  Die Datei existiert für: output/teamgamecenter/<season>/<week>.csv
 *  --------------------------------------------------------- */

const SEASONS = Array.from({ length: 2025 - 2015 + 1 }, (_, i) => 2015 + i);
const WEEKS = Array.from({ length: 16 }, (_, i) => i + 1); // 1..16 (inkl. Playoffs >14)

type WeekRow = {
  season: number;
  week: number;
  owner: string;
  total: number;
  opponent: string;
  opponentTotal: number;
};

type MatchKey = string; // canonical "season|week|A_vs_B" mit A<B

function canonicalPair(a: string, b: string) {
  return (a || "") <= (b || "") ? `${a}__vs__${b}` : `${b}__vs__${a}`;
}

async function fetchWeekCSV(season: number, week: number): Promise<WeekRow[] | null> {
  const url = `https://raw.githubusercontent.com/KoBeWa/FF-Scraping/master/output/teamgamecenter/${season}/${week}.csv`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return null;
  const text = await r.text();

  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  const idx = (name: string) =>
    headers.findIndex((h) => h.trim().toLowerCase() === name.trim().toLowerCase());

  const iOwner = idx("Owner");
  const iTotal = idx("Total");
  const iOpp = idx("Opponent");
  const iOppTotal = headers.findIndex(
    (h) => h.replace(/\s+/g, "").toLowerCase() === "opponenttotal"
  );

  const out: WeekRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = parseCSVLine(lines[i], headers.length);
    if (!raw) continue;
    const owner = (raw[iOwner] ?? "").trim();
    const opp = (raw[iOpp] ?? "").trim();
    const total = toNum(raw[iTotal]);
    const oppTotal = toNum(raw[iOppTotal]);
    if (!owner) continue;
    out.push({ season, week, owner, total, opponent: opp, opponentTotal: oppTotal });
  }
  return out;
}

// CSV-Zeile robust splitten (unterstützt komma-getrennt, evtl. Anführungszeichen)
function parseCSVLine(line: string, expectedCols: number): string[] | null {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);

  // ggf. auf expectedCols auffüllen
  while (cells.length < expectedCols) cells.push("");
  return cells;
}

function toNum(x: any): number {
  if (x == null) return 0;
  const s = String(x).replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/* ===================== UI Helpers ===================== */
function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="border rounded-xl p-4 bg-white/70 shadow-sm">
      <h3 className="font-semibold mb-2">{title}</h3>
      {children}
    </article>
  );
}

function StatLine({
  primary,
  secondary,
  right,
}: {
  primary: string;
  secondary?: string;
  right?: string;
}) {
  return (
    <div className="flex items-center justify-between border-t first:border-t-0 py-1.5 text-sm">
      <div className="min-w-0">
        <div className="font-medium truncate">{primary}</div>
        {secondary && <div className="text-xs text-gray-600">{secondary}</div>}
      </div>
      {right && <div className="ml-3 font-semibold tabular-nums">{right}</div>}
    </div>
  );
}

/* ===================== Seite ===================== */
export default function RecordsPage() {
  const [rows, setRows] = useState<WeekRow[] | null>(null);

  // Laden: alle Seasons/Weeks (nur vorhandene)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all: WeekRow[] = [];
      for (const season of SEASONS) {
        for (const week of WEEKS) {
          try {
            const w = await fetchWeekCSV(season, week);
            if (w && w.length) all.push(...w);
          } catch {
            // ignorieren
          }
        }
      }
      if (!cancelled) setRows(all);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const data = rows ?? [];

  // Für Matchup-basierte Rekorde: nur 1 Zeile pro Matchup
  const matchups = useMemo(() => {
    const seen = new Set<MatchKey>();
    const out: WeekRow[] = [];
    for (const r of data) {
      const key: MatchKey = `${r.season}|${r.week}|${canonicalPair(r.owner, r.opponent)}`;
      if (seen.has(key)) continue;
      // wir behalten die Zeile des Owners; Werte für beide Teams sind vorhanden
      out.push(r);
      seen.add(key);
    }
    return out;
  }, [data]);

  // Helper: sortierbarer Labeltext
  const labelWeek = (r: WeekRow) => `S${r.season} • W${r.week}`;
  const labelPair = (r: WeekRow) => `${r.owner} vs. ${r.opponent}`;

  /* ---------------------- 1) Highest / Lowest scoring week ---------------------- */
  const highestWeek = useMemo(() => {
    if (!data.length) return null;
    return [...data].sort((a, b) => b.total - a.total)[0];
  }, [data]);

  const lowestWeek = useMemo(() => {
    if (!data.length) return null;
    return [...data].sort((a, b) => a.total - b.total)[0];
  }, [data]);

  /* ---------------------- 2) Season high points (PF je Season) ---------------------- */
  // Wir aggregieren PF je Season aus WeekRows (sum = Season PF je Owner) und picken den Max je Season.
  const seasonHighPF = useMemo(() => {
    const bySeasonOwner = new Map<string, number>(); // `${season}|${owner}` → PF
    for (const r of data) {
      const k = `${r.season}|${r.owner}`;
      bySeasonOwner.set(k, (bySeasonOwner.get(k) ?? 0) + r.total);
    }
    const best: { season: number; owner: string; pf: number }[] = [];
    for (const season of SEASONS) {
      let winner: { owner: string; pf: number } | null = null;
      for (const [k, v] of bySeasonOwner.entries()) {
        const [s, owner] = k.split("|");
        if (Number(s) !== season) continue;
        if (!winner || v > winner.pf) winner = { owner, pf: v };
      }
      if (winner) best.push({ season, owner: winner.owner, pf: round2(winner.pf) });
    }
    return best.filter(Boolean);
  }, [data]);

  /* ---------------------- 3) Biggest blowouts ---------------------- */
  const blowouts = useMemo(() => {
    return [...matchups]
      .map((r) => ({
        ...r,
        diff: Math.abs(r.total - r.opponentTotal),
      }))
      .filter((r) => Number.isFinite(r.diff))
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 10);
  }, [matchups]);

  /* ---------------------- 4) Highest & Lowest combined score ---------------------- */
  const combinedTop = useMemo(() => {
    if (!matchups.length) return null;
    return [...matchups]
      .map((r) => ({ ...r, sum: r.total + r.opponentTotal }))
      .filter((r) => Number.isFinite(r.sum))
      .sort((a, b) => b.sum - a.sum)[0];
  }, [matchups]);

  const combinedLow = useMemo(() => {
    if (!matchups.length) return null;
    return [...matchups]
      .map((r) => ({ ...r, sum: r.total + r.opponentTotal }))
      .filter((r) => Number.isFinite(r.sum))
      .sort((a, b) => a.sum - b.sum)[0];
  }, [matchups]);

  /* ---------------------- 5) Streaks (über Saisons hinweg) ---------------------- */
  // Wir sortieren chronologisch und zählen pro Owner Win/Lose-Sequenzen.
  const { bestWinStreak, bestLoseStreak } = useMemo(() => {
    const bySeasonWeek = [...matchups].sort(
      (a, b) => a.season - b.season || a.week - b.week
    );

    const curWin = new Map<string, number>();
    const curLose = new Map<string, number>();
    const maxWin = new Map<string, number>();
    const maxLose = new Map<string, number>();

    const bump = (m: Map<string, number>, key: string) =>
      m.set(key, (m.get(key) ?? 0) + 1);

    const reset = (m: Map<string, number>, key: string) => m.set(key, 0);

    for (const g of bySeasonWeek) {
      // Gewinner/Verlierer bestimmen
      let a = g.owner,
        b = g.opponent,
        aPts = g.total,
        bPts = g.opponentTotal;
      if (!a || !b || !Number.isFinite(aPts) || !Number.isFinite(bPts)) continue;
      if (aPts === bPts) {
        // Gleichstand: beide Streaks unterbrechen
        reset(curWin, a);
        reset(curWin, b);
        reset(curLose, a);
        reset(curLose, b);
        continue;
      }
      const winner = aPts > bPts ? a : b;
      const loser = aPts > bPts ? b : a;

      // Winner
      bump(curWin, winner);
      maxWin.set(winner, Math.max(maxWin.get(winner) ?? 0, curWin.get(winner) ?? 0));
      reset(curLose, winner);

      // Loser
      bump(curLose, loser);
      maxLose.set(loser, Math.max(maxLose.get(loser) ?? 0, curLose.get(loser) ?? 0));
      reset(curWin, loser);
    }

    const bestWin =
      Array.from(maxWin.entries()).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    const bestLose =
      Array.from(maxLose.entries()).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];

    return {
      bestWinStreak: { owner: bestWin[0], streak: bestWin[1] },
      bestLoseStreak: { owner: bestLose[0], streak: bestLose[1] },
    };
  }, [matchups]);

  /* ---------------------- 6) High scores / Top3 counts pro Woche ---------------------- */
  const hiScoresCount = useMemo(() => {
    const map = new Map<string, number>();
    const key = (o: string) => o || "";
    // Für jede (season, week): höchster Team-Score finden, alle Ties zählen
    const bySW = groupBy(data, (r) => `${r.season}|${r.week}`);
    for (const arr of bySW.values()) {
      const max = Math.max(...arr.map((x) => x.total));
      for (const r of arr) if (r.total === max) map.set(key(r.owner), (map.get(key(r.owner)) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([owner, count]) => ({ owner, count }))
      .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
      .slice(0, 20);
  }, [data]);

  const top3Count = useMemo(() => {
    const map = new Map<string, number>();
    const key = (o: string) => o || "";
    const bySW = groupBy(data, (r) => `${r.season}|${r.week}`);
    for (const arr of bySW.values()) {
      // Top-3 Ränge mit Ties: wir nehmen die 3 höchsten distinct Totals
      const distinctTotals = Array.from(new Set(arr.map((x) => x.total))).sort(
        (a, b) => b - a
      );
      const cutoff = distinctTotals.slice(0, 3);
      for (const r of arr) {
        if (cutoff.includes(r.total)) map.set(key(r.owner), (map.get(key(r.owner)) ?? 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([owner, count]) => ({ owner, count }))
      .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
      .slice(0, 20);
  }, [data]);

  /* ---------------------- Render ---------------------- */
  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Records</h1>
        <Link
          href="/"
          className="ml-auto text-sm underline decoration-dotted hover:decoration-solid"
        >
          ← zurück zum Dashboard
        </Link>
      </header>

      {!rows && <p className="text-sm text-gray-600">Lade Week-Daten…</p>}

      {/* Top-Kacheln */}
      <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card title="Highest scoring week">
          {highestWeek ? (
            <StatLine
              primary={`${highestWeek.owner}`}
              secondary={`${labelWeek(highestWeek)} • ${labelPair(highestWeek)}`}
              right={`${highestWeek.total.toFixed(2)}`}
            />
          ) : (
            <Empty />
          )}
        </Card>

        <Card title="Lowest scoring week">
          {lowestWeek ? (
            <StatLine
              primary={`${lowestWeek.owner}`}
              secondary={`${labelWeek(lowestWeek)} • ${labelPair(lowestWeek)}`}
              right={`${lowestWeek.total.toFixed(2)}`}
            />
          ) : (
            <Empty />
          )}
        </Card>

        <Card title="Highest combined score">
          {combinedTop ? (
            <StatLine
              primary={`${labelPair(combinedTop)}`}
              secondary={`${labelWeek(combinedTop)}`}
              right={`${(combinedTop.total + combinedTop.opponentTotal).toFixed(2)}`}
            />
          ) : (
            <Empty />
          )}
        </Card>

        <Card title="Lowest combined score">
          {combinedLow ? (
            <StatLine
              primary={`${labelPair(combinedLow)}`}
              secondary={`${labelWeek(combinedLow)}`}
              right={`${(combinedLow.total + combinedLow.opponentTotal).toFixed(2)}`}
            />
          ) : (
            <Empty />
          )}
        </Card>

        <Card title="Highest winning streak (all time)">
          {bestWinStreak?.owner ? (
            <StatLine
              primary={bestWinStreak.owner}
              right={`${bestWinStreak.streak} wins`}
            />
          ) : (
            <Empty />
          )}
        </Card>

        <Card title="Highest losing streak (all time)">
          {bestLoseStreak?.owner ? (
            <StatLine
              primary={bestLoseStreak.owner}
              right={`${bestLoseStreak.streak} losses`}
            />
          ) : (
            <Empty />
          )}
        </Card>
      </section>

      {/* Biggest blowouts */}
      <section className="grid grid-cols-1 gap-4">
        <Card title="Biggest blowouts (Top 10)">
          {blowouts.length ? (
            <div>
              {blowouts.map((r, i) => (
                <StatLine
                  key={`${r.season}-${r.week}-${i}`}
                  primary={`${labelPair(r)}`}
                  secondary={`${labelWeek(r)}`}
                  right={`${Math.abs(r.total - r.opponentTotal).toFixed(2)}`}
                />
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Card>
      </section>

      {/* Season High PF je Season (Liste) */}
      <section className="grid grid-cols-1 gap-4">
        <Card title="Season high points (PF per Season)">
          {seasonHighPF.length ? (
            <div>
              {seasonHighPF.map((r) => (
                <StatLine
                  key={r.season}
                  primary={`${r.season} • ${r.owner}`}
                  right={`${r.pf.toFixed(2)}`}
                />
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Card>
      </section>

      {/* High scores / Top 3 counts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="High scores (Anzahl Wochen-Siege)">
          {hiScoresCount.length ? (
            <TableCounts rows={hiScoresCount} />
          ) : (
            <Empty />
          )}
        </Card>
        <Card title="Top 3 scores (Anzahl Top-3 je Woche)">
          {top3Count.length ? (
            <TableCounts rows={top3Count} />
          ) : (
            <Empty />
          )}
        </Card>
      </section>
    </main>
  );
}

/* ===================== kleine Sub-Components ===================== */
function Empty() {
  return <p className="text-sm text-gray-600">—</p>;
}

function TableCounts({ rows }: { rows: { owner: string; count: number }[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="text-left">Owner</th>
          <th className="text-right">Count</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.owner} className="border-t">
            <td>{r.owner}</td>
            <td className="text-right font-semibold">{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ===================== Utils ===================== */
function groupBy<T>(arr: T[], keyFn: (v: T) => string) {
  const m = new Map<string, T[]>();
  for (const v of arr) {
    const k = keyFn(v);
    const a = m.get(k);
    if (a) a.push(v);
    else m.set(k, [v]);
  }
  return m;
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}
