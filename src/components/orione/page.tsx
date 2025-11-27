// app/orione/page.tsx
import OrionePanel from "@/components/orione/OrionePanel";

export default function OrionePage() {
  return (
    <main className="min-h-screen bg-linear-to-b from-black via-slate-950 to-black p-4 md:p-8">
      <OrionePanel
        onConfigure={(payload) => {
          // TODO: qui collegheremo il backend Orione / bot
          // es: fetch("/api/orione/config", { method: "POST", body: JSON.stringify(payload) })
          console.log("Orione config pronta per il backend:", payload);
        }}
      />
    </main>
  );
}