# Vammo · Fase 1 — Torre + App do Colaborador

App de 2 lados que se comunicam em tempo real:

- **torre.html** — painel do gestor: lista de chamados, mapa Leaflet real, atribuição de chamados aos colaboradores
- **colab.html** — app do colaborador (motorista de guincho): login, GPS contínuo, recebe chamados atribuídos, atualiza status

## ⚡ Como testar (3 modos)

### 1. Teste rápido local (mesma máquina, abas diferentes)

Precisa de um servidor HTTP simples — `file://` não funciona com `BroadcastChannel` em todos os browsers.

**Windows (PowerShell):**
```powershell
cd c:\tmp\vammo-fase1
python -m http.server 8000
# ou se tiver Node:  npx serve .
```

Depois abra **duas janelas** do browser:
1. `http://localhost:8000/torre.html` — painel do gestor
2. `http://localhost:8000/colab.html` — app do colaborador (faça login)

Os dois se comunicam via `BroadcastChannel` (zero config). Atribua um chamado no torre → aparece no colab. Mude status no colab → reflete no torre.

### 2. Teste em celular real + desktop (recomendado pra demo)

Precisa do Firebase Realtime Database (gratuito, 3 min pra configurar). Veja `firebase-setup.md`.

Depois clique em ⚙ no torre → cole `databaseURL` + `apiKey` → salvar.

Agora torre roda no desktop, colab roda no celular do motorista, e a sincronização rola em tempo real entre devices reais.

### 3. Demo offline sem nada (só pra ver UI)

Abre `torre.html` direto → clica em **🧪 Demo** → **+5 chamados aleatórios**. Tudo persistido em `localStorage`.

## 🎯 O que funciona agora (Fase 1)

- ✅ Mapa Leaflet com tiles dark (CARTO) — totalmente funcional, sem chave de API
- ✅ Chamados no mapa com pins coloridos por status + ícone por motivo
- ✅ SLA com alerta visual (amarelo > limiar / vermelho pulsante > 2x)
- ✅ App do colaborador mobile-first com login, GPS contínuo, status (online/em rota/offline)
- ✅ Atribuição de chamado torre → colab em tempo real
- ✅ Colab atualiza status (em rota / concluído / recusar) → torre atualiza
- ✅ Ícone do colaborador andando no mapa do torre conforme o GPS atualiza
- ✅ Cada colab tem cor única (gerada do id) e mostra a inicial do nome
- ✅ Modo demo: clique no mapa pra criar chamado, ou +5 aleatórios
- ✅ Persistência em localStorage (status, atribuições, chamados demo)

## 📋 Próximas fases (sugestões)

- **Fase 2**: Integração real com Slack (já tem parser no arquivo original — basta plugar no novo torre)
- **Fase 3**: Roteamento real (OSRM/Mapbox Directions) com ETA pro chamado
- **Fase 4**: Histórico, métricas, dashboard de performance por colaborador
- **Fase 5**: PWA + push notifications no celular do colab
- **Fase 6**: Backend próprio (Supabase/Firebase com auth) substituindo localStorage

## 🛠 Stack

| Camada | Tech |
|---|---|
| Mapa | Leaflet 1.9.4 + CARTO Dark tiles (gratuito) |
| Sync local | `BroadcastChannel` API |
| Sync remoto | Firebase Realtime DB (opcional) |
| GPS | `navigator.geolocation.watchPosition` |
| Storage | `localStorage` |
| UI | HTML/CSS/JS puro, zero build |

Tudo em arquivos HTML standalone — pode hospedar em qualquer lugar (GitHub Pages, Netlify, Vercel, S3) ou rodar local.

## 🌐 Publicar online

**Opção mais rápida — Netlify Drop:**
1. Abre https://app.netlify.com/drop
2. Arrasta a pasta `vammo-fase1` inteira
3. Recebe uma URL tipo `https://random-name.netlify.app`
4. Torre: `URL/torre.html` · Colab: `URL/colab.html`

**Outras opções:** Vercel, GitHub Pages, Cloudflare Pages — todas gratuitas e suportam HTML estático.

Lembre: pra sync entre devices você precisa configurar Firebase também (BroadcastChannel só funciona na mesma origin/aba).
