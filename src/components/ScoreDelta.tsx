"use client";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

export default function ScoreDelta({
  punteggio,
  delta_score,
  direzione,
}: {
  punteggio: number;
  delta_score: number;
  direzione: "long" | "short" | "neutro";
}) {
  const tint =
    direzione === "long" ? "bg-emerald-500" :
    direzione === "short" ? "bg-rose-500" : "bg-zinc-400";

  const Arrow = direzione === "long" ? ArrowUpRight : direzione === "short" ? ArrowDownRight : Minus;

  return (
    <div className="flex items-center justify-center gap-4 mb-4">
      <div className="relative h-20 w-16 rounded-xl bg-white/10 grid place-items-center text-2xl font-bold">
        {punteggio}
        <span className={`absolute -top-2 -right-2 h-6 w-6 rounded-full grid place-items-center ${tint}`}>
          <Arrow className="h-4 w-4 text-white" />
        </span>
      </div>

      <div
        className={`flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 ${
          delta_score > 0 ? "text-emerald-400" : delta_score < 0 ? "text-rose-400" : "text-zinc-300"
        }`}
        title="Variazione rispetto a 24 ore fa"
      >
        <span className="text-sm">
          {delta_score >= 0 ? `+${delta_score}` : delta_score} rispetto a ieri
        </span>
      </div>
    </div>
  );
}
