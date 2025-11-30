// src/components/overlay/CiclicaOverlay.tsx
"use client";

import * as React from "react";
import type { CiclicaViewModel } from "@/lib/ciclica/ciclicaViewModel";
import { OverlayShell } from "@/components/overlays/OverlayShell";
import { CiclicaPanel } from "@/components/ciclica/CiclicaPanel";

export interface CiclicaOverlayProps {
  data: CiclicaViewModel | null;
}

export function CiclicaOverlay({ data }: CiclicaOverlayProps) {
  return (
    <OverlayShell>
      <CiclicaPanel data={data} />
    </OverlayShell>
  );
}
