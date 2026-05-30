# Upload de documentos pro Google Drive — Setup do Apps Script

Pra que o app possa **fazer upload direto** de CNH/CRLV pro Google Drive (sem servidor próprio), criamos um pequeno endpoint via Google Apps Script. **Setup leva 5 minutos**, faz 1 vez só.

## Passo 1 — Criar pasta no Drive

1. Abre https://drive.google.com
2. Cria pasta nova: **"Vammo Documentos"** (ou nome que quiser)
3. Entra na pasta criada
4. **Copia o ID** da pasta (parte da URL):
   ```
   https://drive.google.com/drive/folders/AQUI_TÁ_O_ID_LONGÃO
                                         ^^^^^^^^^^^^^^^^^^^^
   ```

## Passo 2 — Criar Apps Script

1. Abre https://script.google.com
2. **Novo projeto** → renomeia pra **"Vammo Upload"**
3. **Apaga** o código que vem (`function myFunction() {}`)
4. **Cola** o código abaixo:

```javascript
// Pasta do Drive onde os arquivos vão (use o ID que você copiou)
const FOLDER_ID = 'COLE_AQUI_O_ID_DA_PASTA';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!data.base64 || !data.name) {
      return jsonOut({ error: 'missing base64 or name' });
    }
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const blob = Utilities.newBlob(
      Utilities.base64Decode(data.base64),
      data.mimeType || 'application/octet-stream',
      data.name
    );
    const file = folder.createFile(blob);
    // Torna acessível por link (só quem tem o link consegue ver)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return jsonOut({
      ok: true,
      id: file.getId(),
      url: file.getUrl(),
      previewUrl: 'https://drive.google.com/file/d/' + file.getId() + '/preview',
      name: file.getName(),
      size: file.getSize()
    });
  } catch (err) {
    return jsonOut({ error: String(err) });
  }
}

function doGet() {
  return jsonOut({ ok: true, service: 'Vammo Upload', ts: Date.now() });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

5. Substitui `'COLE_AQUI_O_ID_DA_PASTA'` pelo ID da pasta que você copiou
6. **Salva** (Ctrl+S)

## Passo 3 — Publicar como Web App

1. Clica no botão **Implantar** (Deploy) no canto superior direito → **Nova implantação**
2. ⚙ Selecionar tipo → **Aplicativo da Web**
3. Configurações:
   - **Descrição**: Upload Vammo
   - **Executar como**: Eu (seu email)
   - **Quem pode acessar**: **Qualquer pessoa** ← importante!
4. Clica **Implantar**
5. Vai pedir autorização → **Autorizar acesso** → escolhe sua conta Google → aceita as permissões (Drive: gerenciar arquivos criados pelo app)
6. **Copia a URL do Web App** (algo como `https://script.google.com/macros/s/AKfycb.../exec`)

## Passo 4 — Colar a URL no Vammo Torre

1. No app **torrevammo.pages.dev** → ⚙ Config (engrenagem na navbar)
2. Cola a URL no campo **"URL de upload (Apps Script)"**
3. Salva

Pronto. Agora ao cadastrar colaborador/veículo, vai aparecer botão **📎 Subir arquivo** ao invés de pedir URL manual.

## Como testar

Teste rápido via curl (substitui SUA_URL):
```bash
curl -X POST 'SUA_URL_AQUI' \
  -H 'Content-Type: application/json' \
  -d '{"name":"teste.txt","base64":"SGVsbG8gVmFtbW8=","mimeType":"text/plain"}'
```

Deve retornar algo como:
```json
{"ok":true,"id":"...","url":"https://drive.google.com/...","previewUrl":"..."}
```

E o arquivo `teste.txt` deve aparecer na sua pasta do Drive.

## Trocar pra outro Drive depois

Quando quiser migrar pro Drive da empresa (em vez do seu pessoal):
1. Cria pasta na conta da empresa
2. Cria novo Apps Script com FOLDER_ID atualizado
3. Publica Web App
4. Cola nova URL no ⚙ Config
5. Pronto — arquivos novos vão pro Drive da empresa (os antigos continuam onde estavam)

## Limites (free)

- **Tamanho do arquivo**: até ~25 MB por upload (Apps Script limit)
- **Cota diária**: 50 MB/dia total via Apps Script ([detalhes](https://developers.google.com/apps-script/guides/services/quotas))
- Pra mais volume, migrar pra Firebase Storage ou Cloudflare R2 (te oriento quando chegar a hora)

## Segurança

⚠ Ponto importante: o endpoint aceita uploads de **qualquer pessoa que tenha a URL**. Pra produção:
1. Adicionar token de validação no header (validar no `doPost`)
2. Ou trocar pra "Qualquer pessoa do meu domínio" (se Workspace)

Pra demo/piloto, "Qualquer pessoa" funciona — só não compartilhe a URL.
