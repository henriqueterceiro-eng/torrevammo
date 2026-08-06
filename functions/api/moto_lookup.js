// ============================================================
// GET /api/moto_lookup?placa=ABC1D23
// Dados do cliente + moto a partir da placa, pro chamado manual pre-preencher.
// Fonte: vammo_r.bike -> user (cellphone) -> bike_model (Metabase, DB 137).
// Resposta: { found, placa, cliente, telefone, modelo, email, user_id, backofficeUrl }
// Precisa da secret MB_KEY no projeto Cloudflare Pages.
// ============================================================
const MB = "https://metabase.vammo.com/api/dataset";

let CACHE = {}; // PLACA -> { at, data } (10min por isolate)

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const placa = (url.searchParams.get("placa") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (placa.length < 6 || placa.length > 8) return json({ found: false, error: "placa inválida" });
  if (!env.MB_KEY) return json({ found: false, error: "MB_KEY não configurada no Cloudflare" });

  const hit = CACHE[placa];
  if (hit && Date.now() - hit.at < 600000) return json({ ...hit.data, cached: true });

  const SQL = `
    SELECT b.license_plate AS placa,
      trim(concat(coalesce(u.first_name,''), ' ', coalesce(u.last_name,''))) AS cliente,
      u.cellphone AS telefone,
      u.email     AS email,
      bm.bike_model_name AS modelo,
      b.user_id   AS user_id,
      b.status    AS status,
      b.current_deposit_name AS deposito,
      u.street_address AS rua, u.street_number AS numero,
      u.complement_address AS complemento, u.city AS cidade, u.zip_code AS cep
    FROM vammo_r.bike b FINAL
    LEFT JOIN vammo_r.user u FINAL ON u.id = b.user_id
    LEFT JOIN vammo_r.bike_model bm FINAL ON bm.id = b.bike_model_id
    WHERE upper(b.license_plate) = '${placa}' AND b._peerdb_is_deleted = 0
    ORDER BY b.user_id DESC
    LIMIT 1`;

  try {
    const r = await fetch(MB, {
      method: "POST",
      headers: { "x-api-key": env.MB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ database: 137, type: "native", native: { query: SQL } }),
    });
    const j = await r.json();
    if (j.error) return json({ found: false, error: String(j.error).slice(0, 200) });

    const rows = (j.data && j.data.rows) || [];
    if (!rows.length) return json({ found: false, placa });

    const cols = j.data.cols.map((c) => c.name), ix = {};
    cols.forEach((c, i) => (ix[c] = i));
    const row = rows[0];
    const val = (k) => { const v = row[ix[k]]; return v == null || v === "" ? null : v; };
    const uid = val("user_id");

    // Endereço de CADASTRO do cliente (compõe rua, número - complemento · cidade · CEP)
    const rua = val("rua"), numero = val("numero"), compl = val("complemento"), cidade = val("cidade"), cep = val("cep");
    let enderecoCliente = null;
    if (rua) {
      let e = rua + (numero ? ", " + numero : "");
      if (compl) e += " - " + compl;
      if (cidade) e += " - " + cidade;
      if (cep) e += " · " + cep;
      enderecoCliente = e;
    }

    const data = {
      found: true,
      placa: val("placa") || placa,
      cliente: val("cliente"),
      telefone: val("telefone"),
      modelo: val("modelo"),
      email: val("email"),
      user_id: uid,
      status: val("status"),
      deposito: val("deposito"),
      enderecoCliente,
      backofficeUrl: uid ? "https://backoffice.vammo.com/users/" + uid : null,
    };
    CACHE[placa] = { at: Date.now(), data };
    return json(data);
  } catch (e) {
    return json({ found: false, error: "erro ao consultar" });
  }
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
