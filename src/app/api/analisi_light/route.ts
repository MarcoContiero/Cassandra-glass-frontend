// app/api/analisi_light/route.ts
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_BASE =
  process.env.BACKEND_BASE?.replace(/\/+$/, '') || 'http://127.0.0.1:8000';

export async function GET(req: NextRequest) {
  try {
    // --- DEBUG MULTI-TF ------------------------------------------------------
    const allClientTFs = req.nextUrl.searchParams.getAll('timeframes');
    const oneClientTF = req.nextUrl.searchParams.get('timeframes');
    const tfCsvClient = req.nextUrl.searchParams.get('timeframes_csv');
    console.log('[DBG API] client.getAll(timeframes)=', allClientTFs,
      ' client.get(timeframes)=', oneClientTF,
      ' client.timeframes_csv=', tfCsvClient);

    // Ricostruzione sicura: preferisci getAll; in fallback usa csv o singolo
    const tfList = allClientTFs.length
      ? allClientTFs
      : (tfCsvClient ? tfCsvClient.split(',').map(s => s.trim()).filter(Boolean) : (oneClientTF ? [oneClientTF] : []));

    const tfCsv = tfList.join(',');
    // ------------------------------------------------------------------------

    // Ricostruisci l'URL verso il backend
    const target = new URL('/api/analisi_light', BACKEND_BASE);

    // Copia tutte le query esistenti
    req.nextUrl.searchParams.forEach((v, k) => {
      if (k !== 'timeframes' && k !== 'timeframes_csv') {
        target.searchParams.append(k, v);
      }
    });

    // Inietta TF in entrambi i formati: ripetuto + CSV (compat totale)
    if (tfList.length) {
      tfList.forEach(tf => target.searchParams.append('timeframes', tf));
      target.searchParams.set('timeframes_csv', tfCsv);
    }


    console.log('[DBG API] → backend URL:', target.toString());

    const beRes = await fetch(target.toString(), {
      method: 'GET',
      headers: { 'accept': 'application/json' },
      cache: 'no-store',
    });

    if (!beRes.ok) {
      const t = await beRes.text().catch(() => '');
      console.error('[DBG API] backend error:', beRes.status, t);
      return NextResponse.json(
        { error: `backend ${beRes.status}`, body: t },
        { status: 502 }
      );
    }

    const json = await beRes.json();

    // Piccolo echo di meta TF per debug lato FE
    const _meta = {
      ...(json?._meta || {}),
      tfs: Array.isArray(json?._meta?.tfs) && json._meta.tfs.length
        ? json._meta.tfs
        : Object.keys(json?.trend_tf_score || {}),
    };
    const out = { ...json, _meta };
    return NextResponse.json(out, { status: 200 });
  } catch (err: any) {
    console.error('[DBG API] route crash:', err);
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
