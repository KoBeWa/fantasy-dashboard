"use client";
import { useEffect, useMemo, useState } from "react";
import { loadJSON } from "@/lib/data";

type WeeklyRow = { team:string; wins:number; losses:number; ties?:number; pf:number; pa:number; pct:number; rank:number };
type Weekly = { week:number; rows:WeeklyRow[] };

type RegFinalRow = { team:string; regular_rank:number|null; record:string; pf:number|null; pa:number|null };
type PlayoffRow  = { team:string; playoff_rank:number|null; manager?:string|null; seed?:number|null; week15?:number|null; week16?:number|null };

export default function SeasonsPage() {
  const [season, setSeason] = useState<number>(2024);
  const [mode, setMode] = useState<"weekly"|"playoffs"|"regular">("weekly");
  const [week, setWeek] = useState<number>(1);

  const [weekly, setWeekly] = useState<Weekly[]|null>(null);
  const [regFinal, setRegFinal] = useState<RegFinalRow[]|null>(null);
  const [playoffs, setPlayoffs] = useState<PlayoffRow[]|null>(null);

  useEffect(() => {
    // lade alles parallel (relativer Pfad wichtig für GitHub Pages!)
    Promise.all([
      loadJSON<Weekly[]>(`data/processed/seasons/${season}/weekly_standings.json`).catch(()=>null),
      loadJSON<RegFinalRow[]>(`data/processed/seasons/${season}/regular_final_standings.json`).catch(()=>null),
      loadJSON<PlayoffRow[]>(`data/processed/seasons/${season}/playoffs_standings.json`).catch(()=>null),
    ]).then(([w, r, p]) => {
      setWeekly(w); setRegFinal(r); setPlayoffs(p);
      // default week = 1 oder erste vorhandene
      if (w && w.length>0) setWeek(w[0].week);
    });
  }, [season]);

  const weeks = useMemo(()=>{
    return weekly?.map(x=>x.week) ?? [];
  }, [weekly]);

  const currentRows = useMemo(()=>{
    if (mode === "weekly") {
      const block = weekly?.find(x => x.week === week);
      return block?.rows ?? [];
    }
    if (mode === "playoffs") return playoffs ?? [];
    return regFinal ?? [];
  }, [mode, week, weekly, playoffs, regFinal]);

  const seasons = useMemo(()=>Array.from({length:(2025-2015+1)},(_,i)=>2015+i),[]);

  return (
    <main className="p-6 space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Seasons</h1>
        <select className="border rounded px-2 py-1" value={season} onChange={e=>setSeason(+e.target.value)}>
          {seasons.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <nav className="flex items-center gap-2 ml-2">
          <button onClick={()=>setMode("weekly")}   className={`px-3 py-1 rounded border ${mode==="weekly"?"bg-black text-white":"bg-white"}`}>Weekly</button>
          <button onClick={()=>setMode("regular")}  className={`px-3 py-1 rounded border ${mode==="regular"?"bg-black text-white":"bg-white"}`}>Regular (Final)</button>
          <button onClick={()=>setMode("playoffs")} className={`px-3 py-1 rounded border ${mode==="playoffs"?"bg-black text-white":"bg-white"}`}>Playoffs</button>
        </nav>

        {mode==="weekly" && weeks.length>0 && (
          <select className="border rounded px-2 py-1 ml-auto" value={week} onChange={e=>setWeek(+e.target.value)}>
            {weeks.map(w => <option key={w} value={w}>Week {w}</option>)}
          </select>
        )}
      </header>

      {/* Tabelle */}
      {mode==="weekly" && (
        <section className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">#</th>
                <th className="text-left">Team</th>
                <th>W</th><th>L</th><th>T</th>
                <th>PF</th><th>PA</th><th>Pct</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((r:any)=>(
                <tr key={r.team} className="border-t">
                  <td>{r.rank}</td>
                  <td className="font-medium">{r.team}</td>
                  <td className="text-center">{r.wins}</td>
                  <td className="text-center">{r.losses}</td>
                  <td className="text-center">{r.ties ?? 0}</td>
                  <td className="text-right">{r.pf?.toFixed(2)}</td>
                  <td className="text-right">{r.pa?.toFixed(2)}</td>
                  <td className="text-right">{(r.pct*100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {mode==="regular" && (
        <section className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">#</th>
                <th className="text-left">Team</th>
                <th>Record</th><th>PF</th><th>PA</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((r:any)=>(
                <tr key={r.team} className="border-t">
                  <td>{r.regular_rank}</td>
                  <td className="font-medium">{r.team}</td>
                  <td className="text-center">{r.record}</td>
                  <td className="text-right">{r.pf ?? ""}</td>
                  <td className="text-right">{r.pa ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {mode==="playoffs" && (
        <section className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">#</th>
                <th className="text-left">Team</th>
                <th>Seed</th><th>Manager</th>
                <th>W15</th><th>W16</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((r:any)=>(
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
