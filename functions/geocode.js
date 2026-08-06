// ============================================================
// GET /geocode?addr=<endereço>  ->  { lat, lng, formatted, locationType }
// Google Geocoding (endereço texto -> coordenada). Usado pela torre pra plotar
// chamado que chegou só com endereço (sem lat/lng). Secret GMAPS_KEY.
// ============================================================
export async function onRequestGet(context){
  const { request, env } = context;
  const url = new URL(request.url);

  // anti-abuso: só o próprio app (mesma origem)
  const ref = request.headers.get('referer') || '';
  try { if(!ref || new URL(ref).host !== url.host) return json({ error:'origem invalida' }, 403); }
  catch(_){ return json({ error:'origem invalida' }, 403); }

  if(!env.GMAPS_KEY) return json({ error:'GMAPS_KEY nao configurada' }, 500);

  // REVERSE: ?latlng=-23.5,-46.6 -> endereço (usado pra transformar o ping do IoT em endereço)
  const latlng = (url.searchParams.get('latlng') || '').trim();
  if(latlng){
    if(!/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(latlng)) return json({ error:'latlng invalido' }, 400);
    try {
      const p = new URLSearchParams({ latlng, key: env.GMAPS_KEY, language: 'pt-BR' });
      const r = await fetch('https://maps.googleapis.com/maps/api/geocode/json?' + p.toString());
      const d = await r.json();
      if(d.status !== 'OK' || !d.results || !d.results.length) return json({ error: 'reverse:' + (d.status || '?') }, 502);
      const g = d.results[0];
      return json({ lat: g.geometry.location.lat, lng: g.geometry.location.lng, formatted: g.formatted_address });
    } catch(e){ return json({ error: 'falha reverse geocode' }, 502); }
  }

  const addr = (url.searchParams.get('addr') || '').trim();
  if(addr.length < 5) return json({ error:'addr invalido' }, 400);

  try {
    const p = new URLSearchParams({ address: addr, key: env.GMAPS_KEY, region: 'br', language: 'pt-BR' });
    const r = await fetch('https://maps.googleapis.com/maps/api/geocode/json?' + p.toString());
    const d = await r.json();
    if(d.status !== 'OK' || !d.results || !d.results.length){
      return json({ error: 'geocode:' + (d.status || '?'), detail: (d.error_message || '').slice(0, 160) }, 502);
    }
    const g = d.results[0];
    return json({ lat: g.geometry.location.lat, lng: g.geometry.location.lng, formatted: g.formatted_address, locationType: g.geometry.location_type });
  } catch(e){
    return json({ error: 'falha geocode' }, 502);
  }
}
function json(obj, status){
  // geocode de endereço é estável -> pode cachear 1 dia (menos custo)
  const cc = status ? 'no-store' : 'max-age=86400';
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': cc } });
}
