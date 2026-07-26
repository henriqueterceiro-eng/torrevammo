// ============================================================
// Vammo Torre — Ingestão de chamados do CX (planilha → Firebase)
// ------------------------------------------------------------
// O CX abre o chamado pelo fluxo do Slack, que grava uma linha na planilha.
// Este script lê os chamados DE HOJE, geocoda o endereço e grava em
// vammo/chamados no Realtime DB — a torre (torrevammo.pages.dev/torre) lê
// esse nó ao vivo (on('value')) e o chamado "aparece sozinho".
//
// COMO SUBIR (1x, ~5 min):
//   1. https://script.google.com → Novo projeto → nomeia "Vammo Torre — Chamados CX"
//   2. Cola este arquivo inteiro
//   3. Roda a função  setup()  uma vez → autoriza (Planilha + Maps + rede externa)
//      → isso instala um gatilho de tempo que roda ingest() a cada 2 min
//   4. Pra testar na hora, roda  ingest()  manualmente e olha o Log (Ctrl+Enter)
//
// ⚠ Escreve na Firebase de PRODUÇÃO — os chamados de hoje aparecem na torre REAL.
// ============================================================

const PLANILHA_ID = '1PZe0RPe4Tar5CSh6BtYX7A169Szm3PUelH4AwrS13ZM';
const SHEET_GID   = 1795449927;
const FB_BASE     = 'https://vammo-torre-default-rtdb.firebaseio.com'; // regras em modo teste (write aberto)
const TZ          = 'America/Sao_Paulo';
const RAIO_GEO_REGION = 'br';

// ---- Gatilho + autorização (rodar 1x) -----------------------
function setup() {
  // remove gatilhos antigos deste script pra não duplicar
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'ingest') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('ingest').timeBased().everyMinutes(2).create();
  Logger.log('✓ Gatilho instalado: ingest() a cada 2 min. Rodando uma ingestão agora…');
  ingest();
}

// ---- Ingestão principal -------------------------------------
function ingest() {
  const sheet = SpreadsheetApp.openById(PLANILHA_ID).getSheets()
    .filter(s => s.getSheetId() === SHEET_GID)[0];
  if (!sheet) { Logger.log('✗ aba gid ' + SHEET_GID + ' não encontrada'); return; }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) { Logger.log('planilha vazia'); return; }

  const col = mapHeaders(values[0]);
  const hoje = Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd');

  let novos = 0, jaExistiam = 0, semData = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (normDate(row[col.date]) !== hoje) { semData++; continue; } // SÓ os de hoje

    const ch = rowToChamado(row, col);
    if (!ch) continue;

    // NÃO sobrescreve chamado que a torre já está tratando (status/motorista do gestor).
    // Se o id já existe no Firebase, pula — preserva o trabalho do gestor.
    if (fbExiste(ch.id)) { jaExistiam++; continue; }

    fbPut(ch.id, ch);
    novos++;
  }
  Logger.log('✓ ingest %s → %s novos · %s já existiam · %s de outros dias',
    hoje, novos, jaExistiam, semData);
}

// ---- Linha da planilha → objeto chamado ---------------------
function rowToChamado(row, col) {
  const cliente  = str(row[col.cliente]);
  const placa    = str(row[col.placa]).toUpperCase().replace(/\s+/g, '');
  const endereco = str(row[col.endereco]);
  const motivo   = str(row[col.motivo]);
  if (!cliente && !placa && !endereco) return null; // linha lixo

  const id = 'cx_' + md5(str(row[col.datahora]) + '|' + placa + '|' + cliente);
  const geo = geocode(endereco);

  const ch = {
    id: id,
    ts: parseTs(row[col.datahora]),
    origem: 'cx',
    cliente: cliente || '?',
    motivo: motivo,
    placa: placa,
    endereco: endereco,
    status: 'novo',
    travada: /^s/i.test(str(row[col.travada])),          // "Sim" → true
    clienteNoLocal: /^s/i.test(str(row[col.noLocal])),
    analista: str(row[col.analista]).replace(/^@/, ''),
    comentario: str(row[col.comentario]),
  };
  if (geo) { ch.lat = geo.lat; ch.lng = geo.lng; }

  const bo = str(row[col.backoffice]);
  if (/^https?:\/\//i.test(bo)) ch.backofficeUrl = bo;

  const ev = str(row[col.evidencias]).split(/[\s,]+/).filter(u => /^https?:\/\//i.test(u));
  if (ev.length) ch.evidencias = ev;

  const tel = parseTelefone(str(row[col.quemEnviou]));
  if (tel) ch.telefone = tel;

  return ch;
}

// ---- Firebase REST (regras abertas → sem token) -------------
function fbExiste(id) {
  const r = UrlFetchApp.fetch(FB_BASE + '/vammo/chamados/' + id + '.json?shallow=true',
    { method: 'get', muteHttpExceptions: true });
  return r.getResponseCode() === 200 && r.getContentText() !== 'null';
}
function fbPut(id, obj) {
  UrlFetchApp.fetch(FB_BASE + '/vammo/chamados/' + id + '.json', {
    method: 'put', contentType: 'application/json',
    payload: JSON.stringify(obj), muteHttpExceptions: true,
  });
}

// ---- Geocode (Maps nativo do GAS) + cache -------------------
function geocode(endereco) {
  if (!endereco || endereco.length < 6 || /^teste|^\.$|^-$/i.test(endereco)) return null;
  const cache = CacheService.getScriptCache();
  const key = 'geo_' + md5(endereco);
  const hit = cache.get(key);
  if (hit) return hit === 'null' ? null : JSON.parse(hit);
  try {
    const res = Maps.newGeocoder().setRegion(RAIO_GEO_REGION).geocode(endereco + ', Brasil');
    if (res.status === 'OK' && res.results[0]) {
      const loc = res.results[0].geometry.location;
      const out = { lat: loc.lat, lng: loc.lng };
      cache.put(key, JSON.stringify(out), 21600); // 6h
      return out;
    }
  } catch (e) { Logger.log('geocode falhou "%s": %s', endereco, e); }
  cache.put(key, 'null', 3600);
  return null;
}

// ---- Helpers ------------------------------------------------
function mapHeaders(headerRow) {
  const idx = {};
  headerRow.forEach((h, i) => { idx[norm(h)] = i; });
  const find = (frag) => {
    const k = Object.keys(idx).find(key => key.indexOf(frag) >= 0);
    return k === undefined ? -1 : idx[k];
  };
  return {
    analista:   find('analista'),
    cliente:    find('nome do cliente'),
    placa:      find('placa'),
    backoffice: find('backoffice'),
    motivo:     find('motivo'),
    evidencias: find('evidenci') >= 0 ? find('evidenci') : find('video'),
    endereco:   find('endereco de retirada') >= 0 ? find('endereco de retirada') : find('endereco'),
    travada:    find('travada'),
    comentario: find('comentario'),
    noLocal:    find('cliente esta no local'),
    quemEnviou: find('quem enviou'),
    datahora:   find('data e hora'),
    date:       Object.keys(idx).find(k => k === 'date') !== undefined ? idx['date'] : find('date'),
  };
}
function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c')
    .trim();
}
function str(v) { return v == null ? '' : String(v).trim(); }
function normDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy/MM/dd');
  const s = str(v);
  const m = s.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
  return m ? m[1] + '/' + m[2] + '/' + m[3] : s;
}
function parseTs(v) {
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(str(v));
  return isNaN(t) ? Date.now() : t;
}
function parseTelefone(s) {
  const d = str(s).replace(/\D/g, '');
  if (d.length >= 10 && d.length <= 13) return d.length <= 11 ? '55' + d : d; // +55 se faltar DDI
  return '';
}
function md5(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8)
    .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('').slice(0, 16);
}
