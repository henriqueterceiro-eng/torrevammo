# Vammo Colab → App Android Nativo (Capacitor)

Guia pra transformar o colab.html em **app Android instalável** com GPS rodando em background, mesmo com tela bloqueada e app fechado.

## Por que Capacitor

| | Web (hoje) | Capacitor (objetivo) |
|---|---|---|
| GPS com tela bloqueada | ❌ Pausa | ✅ Continua |
| GPS com app fechado | ❌ Pausa | ✅ Continua (background service) |
| Instala via ícone | ✅ (PWA) | ✅ (APK ou Play Store) |
| Push notifications reais | ❌ Limitado | ✅ FCM nativo |
| Acelerômetro (detectar queda) | ⚠ Limitado | ✅ Nativo |
| Atualização do app | ✅ Automática (refresh) | ⚠ Cada update precisa rebuild APK |
| Código reaproveitado | — | **~95%** do HTML/JS atual |

## Pré-requisitos (instala 1 vez no seu PC)

1. **Node.js 18+** — https://nodejs.org/ → baixa LTS Windows → instala (5min)
2. **Java JDK 17** — https://adoptium.net/temurin/releases/?version=17 → MSI → instala (3min)
3. **Android Studio** — https://developer.android.com/studio → ~1GB → instala (15-20min)
   - Na primeira execução, deixa baixar o "Android SDK" (mais ~2GB)
4. **Git** — você já tem ✅

Espaço em disco total: ~5GB. Tempo total: ~30-40min de instalação + downloads.

## Como vai funcionar

```
torrevammo (repo atual)
└── colab.html, manifest, etc. (web puro)

vammo-app (NOVO repo / pasta paralela)
├── android/         ← projeto Android nativo gerado
├── src/             ← os HTMLs (referência ao Vammo Torre)
├── package.json
├── capacitor.config.json
└── plugins/         ← background-geolocation, etc.
```

O app Android **abre o colab.html** numa WebView nativa, mas com acesso a APIs nativas (GPS background, push, etc) via plugins do Capacitor.

## Quando tu estiver pronto, me avisa

Eu cuido de:
1. Criar o projeto Capacitor
2. Configurar plugin `@capacitor-community/background-geolocation`
3. Configurar permissões Android (Manifest)
4. Adaptar o colab.html pra detectar ambiente nativo e usar o plugin
5. Configurar push notifications (FCM)
6. Gerar primeiro APK debug (instalável direto no celular sem Play Store)

**Tempo estimado**: 3-4h depois que tu tiver os pré-requisitos instalados.

## Custos

| Item | Custo |
|---|---|
| Capacitor + plugins | $0 (open source) |
| Distribuir via APK direto | $0 |
| Publicar na Play Store | $25 (uma vez) |
| Apple App Store (iOS) | $99/ano + Mac pra build |

Pra começar, **APK direto** funciona perfeito: você manda o arquivo .apk pro motorista, ele instala, pronto. Sem Play Store.

## O que NÃO muda

- O painel da **torre** continua web (gestor abre no navegador no escritório/celular)
- O painel **track** (cliente) continua web (link público funciona em qualquer device)
- Todo o **backend** (Firebase) é o mesmo

Só o **colab** vira app nativo, porque é onde GPS background importa.

## Próximo passo

1. Instala os pré-requisitos da seção acima
2. Confirma comigo que tá pronto (Node, JDK, Android Studio funcionando)
3. Eu começo a montar
