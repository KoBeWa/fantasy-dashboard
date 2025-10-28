"use client";
import { useEffect, useMemo, useState } from "react";
import { loadJSON } from "@/lib/data";
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from "chart.js";
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

type TeamSeason = { season:number; team:string; wins:number; losses:number; ties?:number; pf:number; pa:number; luck?:number };

export default function Page() {
  const [season, setSeason] = useState<number>(2024);
  const [teams, setTeams] = useState<TeamSeason[]>([]);

  useEffect(() => {
    loadJSON<TeamSeason[]>(`/data/processed/seasons/${season}/teams.json`).then(setTeams).catch(console.error);
  }, [season]);

  useEffect(() => {
    const el = document.getElementById("pfChart") as HTMLCanvasElement | null;
    if (!el || teams.length === 0) return;
    const top = [...teams].sort((a,b)=>b.pf-a.pf).slice(0,8);
    const chart = new Chart(el, {
      type: "bar",
      data: { labels: top.map(t=>t.team), datasets: [{ label: "PF", data: top.map(t=>t.pf) }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
    return () => chart.destroy();
  }, [teams]);

  const seasons = useMemo(()=>Array.from({length:(2025-2015+1)},(_,i)=>2015+i),[]);
  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Fantasy Dashboard</h1>
        <select className="border rounded px-2 py-1" value={season} onChange={e=>setSeason(+e.target.value)}>
          {seasons.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Top Punkte (PF)</h2>
          <canvas id="pfChart" />
        </article>

        <article className="border rounded p-4">
          <h2 className="font-semibold mb-2">Teams (Saison)</h2>
          <table className="w-full text-sm">
            <thead><tr>
              <th className="text-left">Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th>
            </tr></thead>
            <tbody>
              {teams.map(r=>(
                <tr key={`${r.team}-${r.season}`} className="border-t">
                  <td>{r.team}</td>
                  <td className="text-center">{r.wins}</td>
                  <td className="text-center">{r.losses}</td>
                  <td className="text-right">{r.pf.toFixed(2)}</td>
                  <td className="text-right">{r.pa.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>
    </main>
  );
}
