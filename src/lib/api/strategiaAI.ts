export async function fetchStrategiaAI(coin: string, timeframes: string[]): Promise<any> {
  const q = new URLSearchParams();
  q.set("coin", coin);
  timeframes.forEach((tf) => q.append("timeframes", tf));
  const res = await fetch(`/api/analisi_light?${q.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("fetchStrategiaAI failed");
  const json = await res.json();
  return json?.strategia_ai || [];
}