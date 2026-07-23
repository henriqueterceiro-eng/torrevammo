// ============================================================
// GET /iot_status?placas=ABC1D23,DEF4G56
// Último ping (lat/lon) + online (≤120min) de cada placa, direto da iot.hb_full
// (Metabase, DB 137). Alimenta o filtro 📡 IoT Ping da torre (torre.html).
// Resposta: { pings: { PLACA: { online:bool, lat, lon, lp:epoch_ms } } }
// Precisa da secret MB_KEY no projeto Cloudflare Pages.
// ============================================================
const MB = "https://metabase.vammo.com/api/dataset";

// cache leve por isolate (30s): vários gestores togglando o filtro não martelam o Metabase
let CACHE = {}; // "PLACA1,PLACA2" -> { at, pings }

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // sanitiza: só A-Z0-9 por placa (evita qualquer injeção no IN)
  const placas = [...new Set(
    (url.searchParams.get("placas") || "")
      .toUpperCase()
      .split(",")
      .map((s) => s.replace(/[^A-Z0-9]/g, ""))
      .filter((s) => s.length >= 6 && s.length <= 8)
  )];
  if (!placas.length) return json({ pings: {} });
  if (!env.MB_KEY) return json({ pings: {}, error: "MB_KEY não configurada no Cloudflare" });

  const cacheKey = placas.slice().sort().join(",");
  const hit = CACHE[cacheKey];
  if (hit && Date.now() - hit.at < 30000) return json({ pings: hit.pings, cached: true });

  const inList = placas.map((p) => `'${p}'`).join(",");
  const SQL = `
    SELECT upper(vehicle_plate) AS placa,
      toUnixTimestamp(max(timestamp)) AS lp,
      if(dateDiff('minute', max(timestamp), now()) <= 120, 1, 0) AS online,
      argMax(position_status_latitude,  timestamp) AS lat,
      argMax(position_status_longitude, timestamp) AS lon
    FROM iot.hb_full
    WHERE timestamp >= now() - INTERVAL 3 DAY
      AND upper(vehicle_plate) IN (${inList})
    GROUP BY upper(vehicle_plate)`;

  try {
    const r = await fetch(MB, {
      method: "POST",
      headers: { "x-api-key": env.MB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ database: 137, type: "native", native: { query: SQL } }),
    });
    const j = await r.json();
    if (j.error) return json({ pings: {}, error: String(j.error).slice(0, 200) });

    const cols = (j.data.cols || []).map((c) => c.name), ix = {};
    cols.forEach((c, i) => (ix[c] = i));
    const num = (v) => (v == null || v === "" ? null : Number(v));

    const pings = {};
    (j.data.rows || []).forEach((row) => {
      const placa = String(row[ix.placa] || "").trim().toUpperCase();
      if (!placa) return;
      pings[placa] = {
        online: Number(row[ix.online]) === 1,
        lat: num(row[ix.lat]),
        lon: num(row[ix.lon]),
        lp: row[ix.lp] != null ? Number(row[ix.lp]) * 1000 : null, // s -> ms (front usa Date.now()-lp)
      };
    });

    CACHE[cacheKey] = { at: Date.now(), pings };
    return json({ pings });
  } catch (e) {
    return json({ pings: {}, error: "erro ao consultar iot.hb_full" });
  }
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
