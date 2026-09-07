# Handoff técnico — Plataforma de Guinchos (Torre Vammo)

> Documento para o time de Tech que vai integrar esta plataforma ao sistema oficial da Vammo.
> Autor: Henrique Terceiro (henrique.terceiro@vammo.com) · Última atualização: 07/09/2026
>
> **Leia a seção [⚠️ Segurança](#️-segurança--leia-antes-de-integrar) antes de qualquer coisa.**
> Existem dois itens que provavelmente são impeditivos para integração, e eles estão mapeados aqui
> com números medidos — não são suposições.

---

## 1. O que é

Plataforma de operação de **socorro e movimentação de motos** (o "guincho" da Vammo). Está **em
produção**, com frota real na rua todos os dias. Não é protótipo.

Cobre três operações:

| Operação | Quem usa | O que faz |
|---|---|---|
| **Socorro** | CX abre, torre despacha, colaborador atende | Cliente com moto parada; colaborador vai ao local, resolve ou recolhe |
| **Movimentação entre bases** | Fleet abre, torre despacha | Transferência de lotes de motos entre bases (até 10 por viagem) |
| **Rastreio** | Cliente final | Link público de acompanhamento |

Volume de referência: **~55 chamados/dia**, 9–14 colaboradores em campo, ~410 km rodados/dia.
1.500 chamados no histórico, 363 ativos no momento desta escrita.

---

## 2. Os 6 apps

Cada app é **um arquivo HTML único**, com CSS e JS inline. Não há build, bundler, framework ou
`node_modules`. Abrir o arquivo no navegador é rodar o app.

| Arquivo | Rota | Quem usa | Linhas | Versão |
|---|---|---|---:|---|
| `torre.html` | `/torre` | Controlador (despacho) | 9.090 | v123 |
| `colab.html` | `/colab` | Colaborador em campo (PWA/APK) | 7.178 | v95 |
| `cx.html` | `/cx` | Atendimento (abre socorro) | 1.229 | v13 |
| `fleet.html` | `/fleet` | Fleet (abre movimentação) | 1.092 | v19 |
| `track.html` | `/track` | Cliente final (público) | 556 | — |
| `index.html` | `/` | Portal de entrada | — | — |

`tiles.js` (176 linhas) e `service-worker.js` (120) são compartilhados — ver seções 6 e 7.

**Por que arquivo único:** decisão consciente. O app do colaborador precisa funcionar offline, em
celular ruim, com sinal instável. Zero dependência de build significa zero chance de deploy
quebrado por toolchain, e o service worker cacheia um arquivo só. O custo é que os arquivos são
grandes — a navegação se faz por busca, não por estrutura de pastas.

---

## 3. Arquitetura

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  6 apps     │────▶│ Firebase Realtime DB │◀────│  torre.html     │
│  (browser)  │     │  (vammo-torre)       │     │  (controlador)  │
└──────┬──────┘     └──────────────────────┘     └─────────────────┘
       │                                                   
       │            ┌──────────────────────┐     ┌─────────────────┐
       └───────────▶│ Cloudflare Functions │────▶│ Google Maps API │
                    │  /route /matrix      │     │ Metabase (OMS)  │
                    │  /geocode /api/*     │     └─────────────────┘
                    └──────────────────────┘
```

**Firebase Realtime Database** (`vammo-torre`) — estado ao vivo. Todos os apps escutam o mesmo
banco; a sincronização entre torre e campo é o próprio RTDB, sem backend intermediário.

**Cloudflare Pages** (projeto `torrevammo`) — hospedagem + Functions. As Functions existem só para
guardar chaves de API que não podem ir ao cliente:

| Function | Serve |
|---|---|
| `functions/route.js` | Google Directions com trânsito (`/route`) |
| `functions/matrix.js` | Distance Matrix — "colab mais próximo" (`/matrix`) |
| `functions/geocode.js` | Geocoding de endereço (`/geocode`) |
| `functions/streetview.js` | Foto do local no card |
| `functions/api/moto_lookup.js` | Placa → cliente/telefone/modelo (Metabase) |
| `functions/api/ler-km.js` | OCR do painel (KM) por IA |
| `functions/api/ler-placa.js` | OCR de placa |
| `functions/iot_status.js` | Status de telemetria da moto |

Todas têm **guarda de mesma-origem** (`referer.host === host`, senão 403) — exceto
`api/moto_lookup.js`, que não tem.

**Metabase** (`metabase.vammo.com`, DB 137, ClickHouse) — leitura do OMS. `moto_lookup` consulta
`vammo_r.bike` + `user` + `bike_model`.

---

## 4. Deploy

```
git push origin main   →   Cloudflare Pages faz build e publica
```

### ⚠️ Não existe staging. `main` é produção.

Um push na `main` chega **em minutos** no celular de quem está na rua. Não há ambiente
intermediário, canário ou rollout gradual.

**Consequências práticas, aprendidas na prática:**

1. **Peça PR, não push direto.** A branch `main` deveria estar protegida (é grátis em repo
   público). Enquanto não estiver, qualquer colaborador do repo publica na frota.
2. **Janela de deploy: virada de turno.** Em 04/09/2026 foram cinco deploys numa tarde com a frota
   na rua. Cada um forçou o app a rebaixar, e três bugs antigos — que só aparecem em partida a frio
   com sinal ruim — se manifestaram de uma vez, travando três motoristas. Os bugs eram antigos; a
   janela foi criada pelo deploy em massa.
3. **Bumpar as versões.** Ver seção 7.

### Rollback

`git revert` + push. Não há botão de rollback no Cloudflare Pages para este projeto.

---

## 5. Modelo de dados (Firebase RTDB)

Nós principais, todos sob `vammo/`:

| Nó | O que guarda | Cuidado |
|---|---|---|
| `chamados` | Chamados ativos (novo, em_rota, concluído recente) | Fonte da verdade do despacho |
| `chamados_hist` | Arquivo (faxina diária move para cá) | **~159 MB** — tem base64 inline; `json.loads` estoura |
| `colaboradores` | Cadastro (nome, e-mail, papel) | — |
| `motoristas` | Telemetria ao vivo (GPS, velocidade, modo) | Escrito a cada ping |
| `turnos` | Turno em andamento, **um por colaborador** | Ver armadilha abaixo |
| `veiculos` | Frota (carro, carreta, slots, `atribuidoA`) | Ver armadilha abaixo |
| `bases` | 6 bases fixas (lat/lng) | Muda raríssimo |
| `queues` | Ordem da fila de cada colaborador | A torre manda; o app respeita |
| `corridas` | Log de corrida (km, duração, trajeto) | Base do relatório |
| `logs_torre` | Auditoria de override/intervenção | Toda ação manual grava aqui |
| `config` | Flags ajustáveis sem deploy | Ver seção 8 |

### 🕳️ Armadilhas do modelo — leia antes de mexer

**`turnos/<colabId>` guarda UM turno.** Abrir turno novo (trocar de veículo) **sobrescreve** o
anterior e leva os `slotsOcupados` junto. Isso travou motoristas em campo repetidamente: o chamado
de transferência continua de pé com as placas, mas sem slot o botão "Descarregar" fica desabilitado
(`btnDesc.disabled = slotsCount() === 0`) e o `descargaEm` nunca é gravado — o Concluir trava para
sempre. Mitigado em 04/09 por `reconciliarSlots()` no `colab.html`, que **reconstrói** os slots a
partir dos chamados abertos. **Não é correção da causa** — o modelo continua guardando um turno só.

**Array vazio no RTDB vira `null`.** Descarregar todas as motos deixa `slotsOcupados = []`, e o
RTDB **apaga o nó**. Um eco atrasado dessa deleção apagava placas escaneadas depois. Mesma
mitigação acima.

**`update()` em nó inexistente CRIA o nó.** A faxina arquiva chamado em `chamados_hist` e apaga do
nó vivo; um `update()` cego depois disso **recria** o chamado com só aqueles campos, e ele aparece
na torre como fantasma (`"?" · NOVO · NaN:NaN`). Todo write em chamado deve checar existência
primeiro — ver o padrão em `confirmarDescarga` (`colab.html`).

**`veiculos/<id>/atribuidoA` não é liberado no logout.** Encerrar sessão ou o app morrer deixa o
veículo marcado; e como o app só deixa o **próprio dono** retomar (`atribuidoA === me.id`), o carro
fica invisível para todos os outros. Aconteceu duas vezes em 24h. A torre tem botão de liberar
veículo (`torre.html`, ~linha 4943).

**O check-in não é atômico.** `finalizarCheckIn` faz `update()` incondicional no `atribuidoA`, e a
lista de veículos vem de um `once('value')` de quando o wizard abriu. Como o wizard leva minutos
(4 fotos + OCR do KM), **dois colaboradores podem assumir o mesmo veículo**. Já ocorreu. O correto
é `transaction()`.

---

## 6. Mapa (`tiles.js`)

**Fonte única** de provedor, chave, estilo, atribuição e reserva do mapa base, para os 6 apps.
Trocar qualquer um deles é **uma linha** neste arquivo.

Existe porque em 02/09/2026 o CARTO passou a exigir API key nos basemaps, o mapa apagou em todos os
apps ao mesmo tempo, e o conserto exigiu **seis edições** — a URL estava copiada em seis arquivos.

- `CARTO_KEY` preenchida → CARTO primário, OSM de reserva. Vazia → OSM primário.
- Failover automático: 6 tiles falhando em sequência trocam de provedor **com aviso na tela**.
- Atribuição ligada sempre — é **condição de licença** do OSM e do tier gratuito do CARTO.

⚠️ **O CARTO está aposentando os basemaps raster (PNG).** Sem data anunciada, mas o caminho deles é
vector tile. Quando morrer, apagar a chave devolve tudo para o OSM automaticamente.

---

## 7. Convenções que importam

**Versionar todo deploy.** Cada app tem uma constante de versão exibida na interface
(`TORRE_VERSION`, `APP_VERSION`, `CX_VERSION`, `FLEET_VERSION`). Sem isso é impossível saber, num
incidente, qual código o motorista está rodando.

**Bumpar `CACHE_VERSION` do service worker** junto com `APP_VERSION` do colab. O HTML é
network-first **com timeout de 3 s** — quem está com sinal ruim cai para o cache. Sem bumpar, o
motorista em área ruim segue na versão antiga indefinidamente.

**A torre anuncia a versão esperada do colab** (`LATEST_COLAB_VERSION` em `torre.html`) para
sinalizar app desatualizado. Bumpar as duas juntas.

**Um classificador só por conceito.** `categoriaDoMotivo()` (`torre.html`) é a fonte única de
"que tipo de chamado é este" — alimenta o filtro lateral **e** o ícone do pino. Não criar lista
paralela de motivos: se as duas divergirem, filtro e mapa passam a discordar.

Isso não é teórico. O mesmo motivo aparece com **4 grafias diferentes** em produção
(`Movimentação Comercial - Fleet` × `comercial` × `Churn / Manutenção` × `motos churn/manutenção —`,
esta última com travessão U+2014), porque `fleet.html` **concatena** o rótulo em runtime. Casar por
igualdade exata perde ~43% dos chamados, silenciosamente.

**Nunca casar motivo por prefixo curto, keyword ou removendo tokens de 1–2 letras.**
`Remoção de pátio cobrar` e `Remoção de pátio n cobrar` viram **idênticos** se você descartar o
`n` — e o `n` é justamente o que inverte a regra de cobrança.

**Erro de carregamento não é fato de negócio.** Duas vezes um `catch` virou mensagem afirmando
coisa falsa ao operador: "Placa não encontrada no Backoffice" quando a consulta falhou (a placa
existia), e "Nenhuma base cadastrada" quando o SDK não baixou (as 6 bases estavam lá). Se a causa é
rede, a mensagem tem que dizer isso e oferecer nova tentativa.

**Toda dependência de rede precisa de timeout.** `await ensureFb()` seguido de `once('value')` sem
timeout deixou o botão de check-out **inerte, sem erro nem spinner** — o pior tipo de falha em app
de campo, porque o motorista acha que o toque não pegou. Padrão em `_comTimeout` (`colab.html`).

**Override manual grava em `logs_torre`.** Finalização forçada, atrelar moto, liberar veículo,
restaurar slot — tudo com operador, motivo e timestamp.

---

## 8. Flags ajustáveis sem deploy (`vammo/config`)

| Flag | Default | O que faz |
|---|---|---|
| `rotasGoogle` | ausente (= off) | Liga o Google Directions no desenho da rota da torre. **Desligado de propósito** — ligou uma vez e custou ~R$ 9 mil em 4 dias |
| `rotasSmart` | on | ETA com trânsito no despacho + auto-otimização |
| `routeRefreshM` | 1200 | Metros que o colab anda antes da torre repagar rota |
| `matrixMax` | 5 | Origens por consulta de Distance Matrix (cobra por **elemento**) |
| `authEpoch` | — | Logoff geral: turno anterior a este epoch é invalidado |

Constantes no código que valem conhecer: `BASE_RAIO_M = 500` (raio para "chegou na base"),
`ROTA_REFRESH_M = 500` (colab), `ARRIVED_TIME_MS = 8000`.

---

## 9. Custos externos

**Google Maps Platform** — caso de suporte encerrado em 02/09/2026. Pay-As-You-Go é o plano correto
neste volume (crossover com o Pro de US$ 1.200/mês fica em ~131.250 eventos/mês; estamos em ~23.800
→ ~US$ 188/mês).

Caps diários configurados no Cloud Console (billing `018886-9D19E6-CB4BF6`):

| API | Cap/dia |
|---|---:|
| Directions | 2.500 requests |
| Distance Matrix | 1.000 **elementos** (não requests) |
| Geocoding | 500 requests |

⚠️ **Cap apertado é perigoso.** O cap anterior era 333/dia contra demanda de ~4.600 — a cota
exauria na primeira hora e o resto do turno rodava **sem ETA com trânsito, em silêncio**, porque o
fallback (OSRM) é mudo. No Distance Matrix era pior: 333 elementos = 66 despachos/dia contra ~60
reais, e ao estourar o ranking de "colab mais próximo" degradava para distância em linha reta.

O cap existe para conter **regressão de código**, não para acompanhar demanda. Um defeito
encontrado em 27/08 gerava ~2.000 chamadas de um único veículo em uma viagem.

**Alerta de orçamento avisa, não corta.** Quem corta é a cota.

---

## 10. ⚠️ Segurança — leia antes de integrar

São dois itens, ambos verificados com medição. Provavelmente impeditivos para integração ao sistema
oficial.

### 10.1 O banco de produção está aberto para a internet

As Security Rules do Realtime Database estão permissivas. Leitura feita em 04/09/2026 **sem
nenhuma credencial**, via REST público:

| | |
|---|---:|
| Chamados ativos | **363** |
| ...com nome do cliente | 363 |
| ...com **telefone** | 328 |
| ...com **endereço** | 363 |
| Histórico | **1.500** chamados |
| Colaboradores (nome, e-mail) | 27 |
| Posição GPS ao vivo | 6 |

**E não é só leitura.** `PATCH`, `PUT` e `POST` sem token funcionam — foi assim que intervenções
de suporte (restaurar slot, liberar veículo) foram feitas. Qualquer pessoa com a URL pode alterar
ou apagar chamado, turno e veículo.

Dado pessoal de cliente exposto desta forma é questão de **LGPD**, não apenas de segurança.

**Correção:** fechar as Security Rules exigindo autenticação. Os apps já usam **Google Sign-In
restrito a `@vammo.com`** (`torre.html` tem RBAC com papéis dev/admin/controlador), então a base
existe — falta a regra no banco. Atenção: `track.html` é público por design (link do cliente) e
precisa de um caminho de leitura restrito ao próprio chamado.

### 10.2 Chaves de API commitadas em repositório público

O repositório é **público** (`henriqueterceiro-eng/torrevammo`, criado em 28/05/2026).

| Onde | Chave |
|---|---|
| `colab.html`, `torre.html`, `cx.html`, `fleet.html`, `track.html` | Firebase (browser key) |
| `colab.html`, `torre.html`, `track.html` | **TomTom** |
| `tiles.js` | **CARTO** |

A chave do Firebase é projetada para ser pública — **o problema não é ela, é a regra aberta atrás
dela** (10.1). As do TomTom e CARTO são faturáveis e estão indexáveis.

**Rotacionar só resolve depois de** fechar o banco **ou** tornar o repositório privado — senão a
chave nova volta para o mesmo lugar.

**Recomendado antes de adicionar colaboradores:** ligar *Secret scanning* + *Push protection*
(grátis em repo público). Bloqueia push contendo chave detectada.

### 10.3 Secrets que não estão no repo

Ficam como secret no Cloudflare Pages (projeto `torrevammo`), write-only — não é possível ler de
volta:

`GMAPS_KEY` (Google Maps) · `TOMTOM_KEY` · `MB_KEY` (Metabase)

⚠️ Secret novo **só passa a valer em nova implantação**. Depois de `wrangler pages secret put`, é
preciso forçar um deploy — sem isso as Functions seguem com a chave antiga.

---

## 11. Pendências conhecidas

Itens reais, com causa mapeada, não desejos:

**Alta — travam operação**

1. `turnos/<colabId>` guardar um turno só (seção 5). `reconciliarSlots()` mitiga; a causa segue.
2. `veiculos.atribuidoA` não liberado no logout. Sugerido: varredura que libera veículo cujo dono
   não tem turno ativo — **precisa checar `veiculoId` E `carretaId`**, senão libera a carreta de
   todo motorista trabalhando.
3. Check-in sem `transaction()` → dois colaboradores no mesmo veículo (seção 5).
4. `confirmarDescarga` perde o `descargaEm` quando o slot não tem `chamadoId` — descarrega e não
   registra, silenciosamente.
5. `validarEGravarPlaca` não remove o slot antigo ao re-escanear a mesma posição → slot fantasma →
   `isFull()` recusa a última placa.
6. `adicionarCarregar` aceita placa vazia — origem dos slots fantasma.

**Média**

7. `chamados_hist` com ~159 MB de base64 inline. Fotos deveriam sair do nó de chamado.
8. `moto_lookup` usa `FINAL` em 3 tabelas juntadas no ClickHouse — lento, e `FINAL` em JOIN não
   deduplica de verdade. O padrão correto é `argMax(_peerdb_version) GROUP BY id`.
9. Sem aviso na torre quando dois turnos ativos compartilham placa. Hoje se descobre por telefone.
10. Filtro de status (pills) da torre não chega no mapa — a lista filtra, o mapa segue mostrando
    tudo. Dessincronia anterior ao filtro por motivo.

---

## 12. Por onde começar

1. **Leia a seção 10.** Decidam a ordem: fechar as regras, rotacionar chaves, privar/transferir o
   repo.
2. **`torre.html`** — comece por `renderAll()` (funil de render), `filtered()` (filtro da lista),
   `renderChamadoMarkers()` (pinos) e `categoriaDoMotivo()` (classificador).
3. **`colab.html`** — comece por `syncFilaFromSnapshot()` (fila), `checkInMoto()` /
   `confirmarDescarga()` (slots) e `buildFlow()` (fluxo de atendimento por motivo).
4. **Não filtrar o array global `chamados` na torre.** `pruneQueues()` deriva dele a fila do
   colaborador e **escreve no Firebase**; e ~40 caminhos de escrita usam `chamados.find(id)` +
   `if(!c) return`, que falham **em silêncio** com o array reduzido. Filtro é de renderização.
5. **`logs_torre`** é o melhor lugar para entender o que dá errado na operação — cada intervenção
   manual está lá com motivo e causa raiz.

Comentários no código carregam o **porquê** das decisões, incluindo o custo de erros passados. Onde
houver comentário longo, ele existe porque alguém pagou caro pela lição.

---

## Contato

**Henrique Terceiro** — henrique.terceiro@vammo.com
