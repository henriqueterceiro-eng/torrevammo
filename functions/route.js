// ============================================================
// GET /route?from=lat,lng&stops=lat,lng|lat,lng|...
// Rota multi-stop + ETA COM TRÂNSITO (Google Directions). O último stop é o
// destino; os do meio viram waypoints (ordem preservada). Fallback é no front
// (OSRM) se isto falhar. Precisa da secret GMAPS_KEY no Cloudflare Pages.
// Resposta: { coords:[[lat,lng]...], distance:m, duration:s, trafficDelay:s, legs:[], provider }
// ============================================================
export async function onRequestGet(context){
  const { request, env } = context;
  const url = new URL(request.url);

  // anti-abuso simples: só aceita chamada do próprio app (mesma origem)
  const ref = request.headers.get('referer') || '';
  try { if(!ref || new URL(ref).host !== url.host) return json({ error:'origem invalida' }, 403); }
  catch(_){ return json({ error:'origem invalida' }, 403); }

  if(!env.GMAPS_KEY) return json({ error:'GMAPS_KEY nao configurada' }, 500);

  const okpt = s => /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/.test(s);
  const from = (url.searchParams.get('from') || '').trim();
  if(!okpt(from)) return json({ error:'from invalido' }, 400);
  const stops = (url.searchParams.get('stops') || '').split('|').map(s => s.trim()).filter(s => okpt(s));
  if(!stops.length) return json({ error:'stops vazio' }, 400);

  const wantOpt = url.searchParams.get('optimize') === '1';   // opt-in: otimiza a ORDEM dos waypoints
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1);
  const p = new URLSearchParams({ origin: from, destination, mode: 'driving', departure_time: 'now', key: env.GMAPS_KEY });
  if(waypoints.length) p.set('waypoints', (wantOpt ? 'optimize:true|' : '') + waypoints.join('|'));

  try {
    const r = await fetch('https://maps.googleapis.com/maps/api/directions/json?' + p.toString());
    const d = await r.json();
    if(d.status !== 'OK' || !d.routes || !d.routes.length){
      return json({ error: 'directions:' + (d.status || '?'), detail: (d.error_message || '').slice(0, 160) }, 502);
    }
    const route = d.routes[0];
    const coords = decodePolyline((route.overview_polyline && route.overview_polyline.points) || '');
    let distance = 0, duration = 0, durTraffic = 0;
    const legs = (route.legs || []).map(l => {
      const dv = l.distance.value, uv = l.duration.value, tv = (l.duration_in_traffic ? l.duration_in_traffic.value : l.duration.value);
      distance += dv; duration += uv; durTraffic += tv;
      return { distance: dv, duration: uv, trafficDelay: Math.max(0, tv - uv) };
    });
    return json({ coords, distance, duration, trafficDelay: Math.max(0, durTraffic - duration), legs, waypointOrder: route.waypoint_order || null, provider: 'google' });
  } catch(e){
    return json({ error: 'falha google directions' }, 502);
  }
}

// decodifica o overview_polyline do Google -> [[lat,lng], ...]
function decodePolyline(str){
  let index = 0, lat = 0, lng = 0; const coords = [];
  while(index < str.length){
    let b, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while(b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while(b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}
function json(obj, status){
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
