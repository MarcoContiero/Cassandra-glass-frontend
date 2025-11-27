import { detectors } from "@/lib/ranges/detectors";

async function main() {
  const symbol = "ETHUSDT";
  const timeframe = "4h";

  console.log("=== Test Ranges ===");
  console.log("Symbol:", symbol, "TF:", timeframe);

  // STANDARD
  const standard = await detectors.standard({ symbol, timeframe });
  console.log("\n--- STANDARD ---");
  console.log("Trovati:", standard.length);
  standard.slice(0, 5).forEach((r) => {
    console.log(`ID: ${r.id}, top: ${r.top}, bottom: ${r.bottom}`);
  });

  // INSIDE
  if (detectors.inside) {
    const inside = await detectors.inside({ symbol, timeframe });
    console.log("\n--- INSIDE ---");
    console.log("Trovati:", inside.length);
    inside.slice(0, 5).forEach((r) => {
      console.log(
        `ID: ${r.id}, madre:${r.meta?.madre}, inside:${r.meta?.inside}, conferma:${r.meta?.conferma}`
      );
    });
  } else {
    console.log("\nInside disabilitato nei flags");
  }

  // MULTITOUCH
  if (detectors.multitouch) {
    const multi = await detectors.multitouch({ symbol, timeframe });
    console.log("\n--- MULTITOUCH ---");
    console.log("Trovati:", multi.length);
    multi.slice(0, 5).forEach((r) => {
      console.log(
        `ID: ${r.id}, touches:${JSON.stringify(r.meta?.touches)}, top:${r.top}, bottom:${r.bottom}`
      );
    });
  } else {
    console.log("\nMultitouch disabilitato nei flags");
  }
}

main().catch((e) => {
  console.error("Errore test:", e);
});
