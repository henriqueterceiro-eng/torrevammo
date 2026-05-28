# Firebase Realtime DB — Setup em 3 minutos

Necessário pra sincronizar entre devices reais (celular + desktop). Pra teste local na mesma máquina o `BroadcastChannel` já resolve sem nada disso.

## Passo a passo

1. Acesse https://console.firebase.google.com
2. **Add project** → dê um nome (ex: `vammo-torre`) → desabilite Analytics → criar
3. No menu lateral: **Build** → **Realtime Database** → **Create Database**
4. Escolha localização (`us-east1` é mais barato) → **Start in test mode** (válido por 30 dias)
5. Na aba **Rules**, cole isso pra liberar leitura/escrita pública (só pra teste, NÃO use em prod sem auth):

   ```json
   {
     "rules": {
       "vammo": {
         ".read": true,
         ".write": true,
         "events": {
           ".indexOn": ["ts"]
         }
       }
     }
   }
   ```

6. Pegue a config: ⚙ → **Project settings** → role até **Your apps** → clique no `</>` (Web) → registra app → copia o objeto `firebaseConfig`. Você precisa só de 2 campos:
   - `apiKey`
   - `databaseURL` (formato `https://NOME-default-rtdb.firebaseio.com`)

7. No app **torre.html**: clica em **⚙ Config** → cola os 2 campos → Salvar.

8. No app **colab.html**: edita o topo do arquivo (linhas ~10-14), preenche o `FIREBASE_CONFIG`:

   ```js
   const FIREBASE_CONFIG = {
     apiKey: 'AIza...',
     databaseURL: 'https://vammo-torre-default-rtdb.firebaseio.com'
   };
   ```

   (Não tem UI de config no colab ainda — fica como melhoria pra Fase 2.)

## Pra produção (auth obrigatório!)

As rules acima são **públicas** — qualquer pessoa que ache a URL pode ler/escrever. Pra prod:

```json
{
  "rules": {
    "vammo": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

E adicionar Firebase Auth (anônimo basta) no setup. Quando chegar a hora, eu monto.

## Custos

Free tier (Spark plan): 100 conexões simultâneas, 1 GB storage, 10 GB/mês de download. Pra ~20 colaboradores fazendo update de GPS a cada 3s, dá folgado pra MVP.

Se passar do free, plano Blaze é pay-as-you-go com mínimo de ~US$ 5/mês. Pra essa carga, fica < US$ 1/mês fácil.
