import { Button } from "@/components/ui/button"

interface Props {
  coin: string
  timeframes: string[]
  onStrategiaClick: () => void
}

export default function HeaderCoin({ coin, timeframes, onStrategiaClick }: Props) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-semibold">{coin.toUpperCase()} [{timeframes.join(", ")}]</h2>
      <Button variant="outline" onClick={onStrategiaClick}>🧠 Strategia AI</Button>
    </div>
  )
}
