// src/ts/fetchsafeJSON.ts
export default async function fetchSafeJSON<T = any>(
    url: string,
    init?: RequestInit
  ): Promise<T> {
    const res = await fetch(url, init);
  
    if (!res.ok) {
      const head = await res.text().catch(() => '');
      throw new Error(
        `[fetchSafeJSON] ${res.status} ${res.statusText} on ${url}\n` +
        head.slice(0, 500)
      );
    }
  
    const ct = res.headers.get('content-type') || '';
  
    // JSON “canonico”
    if (/application\/json|text\/json/i.test(ct)) {
      try {
        return (await res.json()) as T;
      } catch (e) {
        const raw = await res.text().catch(() => '');
        console.error('[fetchSafeJSON] parse error on', url, e, '\nHEAD:', raw.slice(0, 500));
        throw e;
      }
    }
  
    // Alcune API rispondono text/plain ma dentro c’è JSON: prova a parse-are
    const raw = await res.text().catch(() => '');
    try {
      return JSON.parse(raw) as T;
    } catch (e) {
      console.error('[fetchSafeJSON] parse error on', url, e, '\nHEAD:', raw.slice(0, 500));
      throw e;
    }
  }
  