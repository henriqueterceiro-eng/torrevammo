/* ============================================================================
   tiles.js — FONTE ÚNICA do mapa base de todos os apps Vammo
   (torre · colab · cx · fleet · track · preview)

   POR QUE ESTE ARQUIVO EXISTE
   Em 02/09/2026 o CARTO passou a exigir API key nos basemaps. Os tiles voltavam uma imagem escrita
   "API KEY REQUIRED" e o mapa virou fundo liso em TODOS os apps ao mesmo tempo — motorista na rua
   incluído. Não foi queda nossa e não teve deploy: o provedor mudou a política.
   O conserto exigiu editar SEIS arquivos, porque a URL do provedor estava copiada em cada um.
   Nunca mais. Trocar provedor, chave ou estilo agora é UMA linha, aqui.

   O QUE ELE RESOLVE ALÉM DA DUPLICAÇÃO
   1. RESERVA AUTOMÁTICA. Antes não existia: um provedor cair apagava o mapa da operação inteira.
   2. AVISO VISÍVEL. O pior de 02/09 não foi o mapa sumir — foi ninguém saber por quê. O
      errorTileUrl dos apps é um PNG escuro que finge ser mapa vazio, então a falha era MUDA.
   3. ATRIBUIÇÃO. Os 5 apps subiam com attributionControl:false. A licença do OSM exige crédito, e
      o tier gratuito do CARTO exige crédito visível de CARTO + OSM como CONDIÇÃO de uso. Estávamos
      fora de conformidade com o provedor atual, não só com o futuro. Aqui é ligado sempre.
   ============================================================================ */
(function () {
  'use strict';

  // ▼▼▼ A ÚNICA LINHA QUE MUDA PRA TROCAR DE PROVEDOR ▼▼▼
  var CARTO_KEY = '';
  // Vazio          -> usa OSM (grátis, sem chave, mas mapa claro invertido no tema escuro).
  // Chave preenchida -> usa CARTO e o mapa volta EXATAMENTE como era antes de 02/09/2026.
  // Chave grátis em carto.com/basemaps/apikey — 5 milhões de tiles/mês, sem precisar de conta.
  // ⚠ O CARTO está APOSENTANDO os basemaps raster (PNG). Sem data anunciada, mas o caminho deles é
  //   vector tile. Quando morrer, apagar a chave acima já devolve tudo pro OSM sozinho.

  var PROV = {
    carto: {
      nome: 'CARTO',
      // Formato do exemplo OFICIAL do CARTO na página da chave: mantém o subdomínio {s} com
      // subdomains 'abcd' (paralelismo de download) e aceita zoom 20.
      // ⚠ O caminho difere entre estilos e isso NÃO é chute: historicamente o dark_all servia na
      //   raiz e o voyager sob rastertiles/. Confirmado com a chave real antes de subir.
      dark:    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?key=' + CARTO_KEY,
      streets: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=' + CARTO_KEY,
      rotulos: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png?key=' + CARTO_KEY,
      sub: 'abcd',
      zoomMax: 20,
      // Atribuição no formato que o CARTO pede — com os links, não texto solto. É CONDIÇÃO do
      // tier gratuito, por isso vai com <a> mesmo.
      attr: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
      inverte: false          // já vem escuro de fábrica
    },
    osm: {
      nome: 'OSM',
      dark:    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      streets: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      rotulos: null,
      sub: '',                // host único, sem subdomínio
      zoomMax: 19,
      attr: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      inverte: true           // OSM não tem versão escura: o tema dark inverte por CSS
    }
  };

  var PRIMARIO = CARTO_KEY ? 'carto' : 'osm';
  var RESERVA  = CARTO_KEY ? 'osm'   : null;   // sem chave, o OSM já é o primário

  // ---- CSS próprio: os apps não precisam mais declarar nada ----
  var st = document.createElement('style');
  st.textContent =
    '.tile-inv{filter:invert(1) hue-rotate(180deg) brightness(.78) saturate(.6)}' +
    '.vt-aviso{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:99999;' +
    'background:rgba(180,40,40,.94);color:#fff;font:600 12px/1.35 system-ui,sans-serif;' +
    'padding:9px 15px;border-radius:9px;box-shadow:0 8px 26px rgba(0,0,0,.45);max-width:92vw;text-align:center}' +
    '.leaflet-control-attribution{font-size:9px!important;background:rgba(0,0,0,.42)!important;color:#ddd!important}' +
    '.leaflet-control-attribution a{color:#8ecae6!important}';
  document.head.appendChild(st);

  function aviso(txt) {
    try {
      var d = document.querySelector('.vt-aviso') || document.createElement('div');
      d.className = 'vt-aviso';
      d.textContent = txt;
      if (!d.parentNode) document.body.appendChild(d);
    } catch (e) {}
  }

  // Atribuição é OBRIGAÇÃO de licença, não enfeite — liga mesmo em mapa criado com
  // attributionControl:false, que é o caso de todos os 5 apps.
  function creditar(map, texto) {
    try {
      if (!map.attributionControl) {
        L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);
      }
      map.attributionControl.addAttribution(texto);
    } catch (e) {}
  }

  function camada(url, prov, extra) {
    var o = {
      maxZoom: prov.zoomMax || 19,
      minZoom: 3,
      subdomains: prov.sub || 'abc',
      // placeholder escuro em vez de esticar o tile vizinho
      errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    };
    for (var k in (extra || {})) o[k] = extra[k];
    if (prov.inverte && extra && extra.escuro !== false) {
      o.className = ((o.className || '') + ' tile-inv').trim();
    }
    delete o.escuro;
    return L.tileLayer(url, o);
  }

  var API = {
    provedor: PRIMARIO,
    nome: function () { return PROV[PRIMARIO].nome; },
    temChave: !!CARTO_KEY,
    url: function (estilo) { return PROV[PRIMARIO][estilo || 'dark']; },
    sub: function () { return PROV[PRIMARIO].sub || ''; },
    zoomMax: function () { return PROV[PRIMARIO].zoomMax || 19; },
    attr: function () { return PROV[PRIMARIO].attr; },
    inverte: function () { return PROV[PRIMARIO].inverte; },
    rotulos: function () { return PROV[PRIMARIO].rotulos; },
    // A torre monta as camadas com maquina propria (seletor dark/streets/satelite, errorTileUrl,
    // minZoom 6, classes de tema). Em vez de forca-la no base(), ela consome estes helpers.
    creditar: function (map, txt) { creditar(map, txt || PROV[PRIMARIO].attr); },
    urlReserva: function (estilo) { return RESERVA ? PROV[RESERVA][estilo || 'dark'] : null; },
    subReserva: function () { return RESERVA ? (PROV[RESERVA].sub || '') : ''; },
    nomeReserva: function () { return RESERVA ? PROV[RESERVA].nome : null; },
    inverteReserva: function () { return RESERVA ? !!PROV[RESERVA].inverte : false; },
    avisar: aviso,

    /* base(map, estilo, extra)
       Cria a camada base, credita a licença e arma a reserva. `estilo` = 'dark' | 'streets'.
       Passe extra.escuro=false num app de tema CLARO pra não inverter o tile do OSM. */
    base: function (map, estilo, extra) {
      estilo = estilo || 'dark';
      var prov = PROV[PRIMARIO];
      var layer = camada(prov[estilo], prov, extra).addTo(map);
      creditar(map, prov.attr);

      // Failover: 6 tiles seguidos falhando = provedor fora. Não 1 nem 2, senão um tile perdido
      // durante um pan derrubaria o mapa sem necessidade. Qualquer tile que CARREGA zera a conta,
      // então provedor de pé com falha esporádica não dispara nada.
      var erros = 0, caiu = false;
      layer.on('tileload', function () { erros = 0; });
      layer.on('tileerror', function () {
        if (caiu || !RESERVA || ++erros < 6) return;
        caiu = true;
        console.warn('[tiles] ' + prov.nome + ' não entregou tile — caindo pra ' + PROV[RESERVA].nome);
        try {
          // ORDEM IMPORTA: cria a reserva ANTES de remover a que falhou. Na ordem inversa, se o
          // removeLayer estourar o catch engolia tudo e a reserva nunca nascia — o operador lia
          // "usando reserva" e ficava sem mapa NENHUM. Achado testando o modulo, nao em producao.
          var r = PROV[RESERVA];
          var nova = camada(r[estilo], r, extra).addTo(map);
          nova.bringToBack();
          creditar(map, r.attr);
          try { map.removeLayer(layer); } catch (e2) {}   // se nao der, pior caso e camada sobreposta
        } catch (e) { console.warn('[tiles] falha ao ligar reserva:', e); }
        aviso('⚠ Mapa: ' + prov.nome + ' fora do ar — usando ' + PROV[RESERVA].nome + ' (reserva)');
      });
      return layer;
    }
  };

  window.VammoTiles = API;
  console.log('[tiles] provedor:', API.nome(), '| reserva:', RESERVA ? PROV[RESERVA].nome : 'nenhuma');
})();
