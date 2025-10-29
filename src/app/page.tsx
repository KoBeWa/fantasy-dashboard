"use client";
import { useEffect, useMemo, useState } from "react";
import Nav from "../components/Nav";
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
  team: string;
  wins: number;
  losses: number;
  ties?: number;
  pf: number;
  pa: number;
  luck?: number;
};

type RegFinalRow = {
  team: string;
  regular_rank: number | null;
  playoff_rank?: number | null;
};

export default function Page() {
  const [season, setSeason] = useState<number>(2015);
  const [teams, setTeams] = useState<TeamSeason[]>([]);
  const [finals, setFinals] = useState<RegFinalRow[] | null>(null);

  // Teams + finale Platzierungen laden
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
    return () => {
      cancelled = true;
    };
  }, [season]);

  // Map: Team -> End-Rank (Playoff bevorzugt, sonst Regular)
  const endRankMap = useMemo(() => {
    const m = new Map<string, number>();
    if (finals) {
      for (const r of finals) {
        const end = (r.playoff_rank ?? undefined) ?? (r.regular_rank ?? undefined);
        if (end !== undefined && end !== null) m.set(r.team, end);
      }
    }
    return m;
  }, [finals]);

  // Tabelle: nach End-Rank (Platz 1 oben). Fallback: alphabetisch.
  const tableRows = useMemo(() => {
    const rows = [...teams];
    rows.sort((a, b) => {
      const ra = endRankMap.get(a.team) ?? Number.POSITIVE_INFINITY;
      const rb = endRankMap.get(b.team) ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return a.team.localeCompare(b.team);
    });
    return rows;
  }, [teams, endRankMap]);

  // Chart: gruppierte Balken PF & PA nebeneinander (alle Teams, nach PF
