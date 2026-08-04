# Publicar o Vammo Colab na Google Play — passo a passo

O app é um **shell Capacitor que carrega o colab web ao vivo** (`torrevammo.pages.dev/colab`).
Logo: mudanças de tela/regra/bug **atualizam sozinhas** (é só dar deploy). A Play Store só entra
pra: instalar sem aviso de "fonte desconhecida" + auto-update da **casca nativa** (plugin/GPS).

O build é feito **na nuvem** (GitHub Actions) — você **não instala nada** (nem Android Studio).

---

## Fase 0 — Conta (só você faz, ~US$ 25)
1. Acesse https://play.google.com/console → **criar conta de desenvolvedor**.
2. Pague a taxa **única de US$ 25**. Use uma conta Google da empresa (ex.: a de Fleet/TI).
3. Escolha tipo **Organização** (Vammo) se possível (pede alguns dados da empresa).
4. Aguarde a verificação da conta (pode levar de horas a alguns dias).

## Fase 1 — Gerar a "chave" do app (keystore) — na nuvem, 1 vez
No GitHub do repo (`henriqueterceiro-eng/torrevammo`):
1. **Settings → Secrets and variables → Actions → New repository secret**, crie:
   - `ANDROID_KS_PASS` = uma **senha forte** (anote num cofre — vai usar de novo)
   - `ANDROID_KEY_ALIAS` = `upload`
2. **Actions → "1) Gerar upload keystore" → Run workflow**.
3. Quando terminar, abra a execução → **Artifacts → baixe `upload-keystore`**. Dentro tem:
   - `upload.keystore` → **GUARDE em local seguro + backup** (perder = nunca mais atualiza o app!)
   - `upload.keystore.b64` → abra, copie **todo** o conteúdo
4. Crie o secret **`ANDROID_KEYSTORE_B64`** e cole o conteúdo do `.b64`.

## Fase 2 — Compilar o app — na nuvem
1. **Actions → "2) Build Android" → Run workflow**.
   - `versionName`: `1.0.0`
   - `versionCode`: `1` (⚠️ **sempre incremente** a cada novo build: 2, 3, 4…)
2. No fim, baixe o artefato **`vammo-colab-v1.0.0`**. Tem:
   - `app-release.aab` → sobe na Play (Fase 4)
   - `app-debug.apk` → instale num celular e **teste** (Fase 3)

## Fase 3 — Testar ANTES de publicar ⚠️ (importante por causa do GPS)
Instale o `app-debug.apk` num Android e confirme:
- Login funciona, mapa/GPS aparecem.
- **GPS em background**: faça check-in, **apague a tela / abra o Waze na frente** por uns minutos
  e confira na **torre** se o colab **continua online** (a notificação "Rastreando…" deve ficar fixa).
- Se o rastreio em background **parar** no Android 14: é a regra nova de foreground-service-location.
  Me avisa que a gente resolve (fixar versão do plugin `@capacitor-community/background-geolocation`
  ou trocar pelo `@transistorsoft/...` que é robusto no 34). **Não publique antes disso funcionar.**

## Fase 4 — Criar o app na Play Console e subir
1. **Play Console → Create app**: nome `Vammo Colab`, idioma PT-BR, tipo **App**, **Gratuito**.
2. **Store listing** (aba "Presença na loja"):
   - Descrição curta + completa (posso te escrever).
   - **Ícone 512×512** (PNG), **feature graphic 1024×500**, e **2+ screenshots** do app.
   - **Política de privacidade** (URL) — **obrigatória** (o app usa localização). Posso gerar uma
     página simples e hospedar em `torrevammo.pages.dev/privacidade`.
3. **App content** (Políticas):
   - **Data safety**: declare que coleta **localização** (precisa/aproximada) pra "funcionalidade do app".
   - **Permissões sensíveis → Localização em segundo plano**: preencha a **declaração** explicando
     o uso (rastreio de frota de guinchos/colaboradores em serviço) — pode pedir um **vídeo curto**
     demonstrando. Justificativa legítima; é burocracia.
   - Classificação de conteúdo (questionário) + público-alvo.
4. **Produção → Create new release**:
   - A Play vai sugerir **Play App Signing** → **aceite** (o Google guarda a chave definitiva; a sua
     keystore vira só a "de upload").
   - Faça **upload do `app-release.aab`**.
   - Notas da versão → **Revisar e lançar**.
5. **Recomendado**: primeiro lance em **Teste interno** (libera na hora pra uma lista de e-mails),
   valide com 2-3 colaboradores, e só então promova pra **Produção** (a 1ª revisão da Play leva de
   horas a ~1-2 dias).

## Depois de publicado — como funcionam os updates
- **Conteúdo (telas/regras/bugs):** deploy no Cloudflare → **atualiza sozinho** na hora (não precisa Play).
- **Casca nativa (plugin/permissão/GPS):** rode o **workflow 2** com `versionCode` maior → suba o novo
  `.aab` numa release da Play → o Android **auto-atualiza** no celular de todos (auto-update é o padrão).

## Custos
| Item | Custo |
|---|---|
| Conta Play (única) | US$ 25 |
| Build na nuvem (GitHub Actions) | US$ 0 |
| Distribuir/atualizar | US$ 0 |

## Resumo de secrets no GitHub
| Secret | O que é |
|---|---|
| `ANDROID_KS_PASS` | senha da keystore |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEYSTORE_B64` | conteúdo do `upload.keystore.b64` |
