import ProgramsHub from '@/components/ProgramsHub';

// TODO: auth gate
// Implementazione futura:
// 1. Verificare sessione (NextAuth / Supabase Auth / custom JWT)
// 2. Se autenticato → mostrare app con tier corretto
// 3. Se non autenticato → redirect a /login
// 4. Tier utente (orione|argonauta|agema) determina tab accessibili in ProgramsHub
// 5. Tab non disponibili per tier: visibili ma con lock overlay e CTA upgrade

export default function AppPage() {
  return <ProgramsHub />;
}
