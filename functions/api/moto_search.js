// ============================================================
// GET /api/moto_search?q=ABC1
// Autocomplete de placa: motos cujo license_plate começa com q.
// Resposta: { results: [{ placa, status, modelo, deposito, iot_enabled }] }
// Fonte: vammo_r.bike FINAL -> bike_model (Metabase, DB 137). Precisa MB_KEY.
// ============================================================
const MB = "https://metabase.vammo.com/api/dataset";

let CACHE = {}; // q -> { at, results } (60s por isolate)

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (q.length < 2) return json({ results: [] });
  if (!env.MB_KEY) return json({ results: [], error: "MB_KEY não configurada" });

  const hit = CACHE[q];
  if (hit && Date.now() - hit.at < 60000) return json({ results: hit.results, cached: true });

  const SQL = `
    SELECT b.license_plate AS placa,
      b.status AS status,
      bm.bike_model_name AS modelo,
      b.current_deposit_name AS deposito,
      b.iot_enabled AS iot_enabled
    FROM vammo_r.bike b FINAL
    LEFT JOIN vammo_r.bike_model bm FINAL ON bm.id = b.bike_model_id
    WHERE b._peerdb_is_deleted = 0
      AND b.license_plate IS NOT NULL
      AND upper(b.license_plate) LIKE '${q}%'
    ORDER BY b.license_plate
    LIMIT 8`;

  try {
    const r = await fetch(MB, {
      method: "POST",
      headers: { "x-api-key": env.MB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ database: 137, type: "native", native: { query: SQL } }),
    });
    const j = await r.json();
    if (j.error) return json({ results: [], error: String(j.error).slice(0, 200) });

    const cols = (j.data.cols || []).map((c) => c.name), ix = {};
    cols.forEach((c, i) => (ix[c] = i));
    const results = (j.data.rows || []).map((row) => ({
      placa: String(row[ix.placa] || "").toUpperCase(),
      status: row[ix.status] || null,
      modelo: row[ix.modelo] || null,
      deposito: row[ix.deposito] || null,
      iot_enabled: row[ix.iot_enabled] === true || row[ix.iot_enabled] === 1,
    })).filter((x) => x.placa);

    CACHE[q] = { at: Date.now(), results };
    return json({ results });
  } catch (e) {
    return json({ results: [], error: "erro ao consultar" });
  }
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
