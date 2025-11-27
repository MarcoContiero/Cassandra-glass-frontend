import { motion } from "framer-motion"

interface Props {
  testo: string
  onClick: () => void
}

export default function RispostaSintetica({ testo, onClick }: Props) {
  if (!testo) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      onClick={onClick}
      className="bg-white/10 rounded-xl p-4 text-left max-w-2xl mx-auto cursor-pointer hover:bg-white/20"
    >
      <p className="text-sm text-white/80">{testo}</p>
    </motion.div>
  )
}
