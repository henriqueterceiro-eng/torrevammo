// ============================================================
// GET /matrix?origins=lat,lng|lat,lng|...&dest=lat,lng
// Tempo/distância COM TRÂNSITO de cada origem (colab) até 1 destino (chamado),
// via Google Distance Matrix. Alimenta o "Sugerir colab mais próximo" da torre.
// Resposta: { elements:[{i,ok,distance(m),duration(s),durationInTraffic(s)}], provider }
// Secret GMAPS_KEY. Guarda de mesma-origem.
// ============================================================
export async function onRequestGet(context){
  const { request, env } = context;
  const url = new URL(request.url);
  const ref = request.headers.get('referer') || '';
  try { if(!ref || new URL(ref).host !== url.host) return json({ error:'origem invalida' }, 403); }
  catch(_){ return json({ error:'origem invalida' }, 403); }
  if(!env.GMAPS_KEY) return json({ error:'GMAPS_KEY nao configurada' }, 500);

  const okpt = s => /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/.test(s);
  const dest = (url.searchParams.get('dest') || '').trim();
  if(!okpt(dest)) return json({ error:'dest invalido' }, 400);
  let origins = (url.searchParams.get('origins') || '').split('|').map(s => s.trim()).filter(okpt);
  if(!origins.length) return json({ error:'origins vazio' }, 400);
  if(origins.length > 25) origins = origins.slice(0, 25); // limite do Distance Matrix por chamada

  try {
    const p = new URLSearchParams({ origins: origins.join('|'), destinations: dest, mode: 'driving', departure_time: 'now', key: env.GMAPS_KEY });
    const r = await fetch('https://maps.googleapis.com/maps/api/distancematrix/json?' + p.toString());
    const d = await r.json();
    if(d.status !== 'OK' || !d.rows) return json({ error: 'matrix:' + (d.status || '?'), detail: (d.error_message || '').slice(0, 160) }, 502);
    const elements = d.rows.map((row, i) => {
      const e = (row.elements && row.elements[0]) || {};
      if(e.status !== 'OK') return { i, ok: false };
      const dur = e.duration ? e.duration.value : null;
      const tr = e.duration_in_traffic ? e.duration_in_traffic.value : dur;
      return { i, ok: true, distance: e.distance ? e.distance.value : null, duration: dur, durationInTraffic: tr };
    });
    return json({ elements, provider: 'google' });
  } catch(e){
    return json({ error: 'falha distance matrix' }, 502);
  }
}
function json(obj, status){
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
