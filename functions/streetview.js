// ============================================================
// GET /streetview?lat=..&lng=..[&mode=auto|streetview|map]
// Imagem do local pro chamado (colab ver o ponto antes de chegar).
// Street View real (foto da rua); se nao houver, cai pro satelite (staticmap).
// Proxy server-side — a chave NUNCA vai pro cliente. Secret GMAPS_KEY.
// ============================================================
const G = "https://maps.googleapis.com/maps/api";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const lat = parseFloat(url.searchParams.get("lat"));
  const lng = parseFloat(url.searchParams.get("lng"));
  const mode = url.searchParams.get("mode") || "auto";
  if (!isFinite(lat) || !isFinite(lng)) return new Response("lat/lng invalidos", { status: 400 });
  if (!env.GMAPS_KEY) return new Response("GMAPS_KEY nao configurada", { status: 500 });

  const loc = `${lat},${lng}`;
  const key = env.GMAPS_KEY;
  const staticMap = () =>
    fetch(`${G}/staticmap?center=${loc}&zoom=19&size=640x400&maptype=hybrid&markers=color:red%7C${loc}&key=${key}`);

  try {
    if (mode === "map") return passImg(await staticMap(), "map");

    // Checa se existe Street View no ponto (evita a imagem cinza "sem imagem").
    let hasSV = mode === "streetview";
    if (mode === "auto") {
      const meta = await fetch(`${G}/streetview/metadata?location=${loc}&source=outdoor&key=${key}`)
        .then((r) => r.json()).catch(() => ({}));
      hasSV = meta.status === "OK";
    }
    if (hasSV) {
      return passImg(await fetch(`${G}/streetview?size=640x400&location=${loc}&fov=80&source=outdoor&key=${key}`), "streetview");
    }
    return passImg(await staticMap(), "map"); // sem street view -> aereo
  } catch (e) {
    return new Response("erro ao buscar imagem", { status: 502 });
  }
}

function passImg(r, source) {
  return new Response(r.body, {
    headers: {
      "Content-Type": r.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "public, max-age=86400", // 1 dia (o local nao muda) — ajuda offline/perf
      "X-Source": source,
    },
  });
}
