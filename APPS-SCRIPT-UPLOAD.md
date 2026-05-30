# Upload de documentos + OCR via IA — Setup do Apps Script

O Apps Script faz **duas coisas**:
1. Salva o arquivo (CNH/CRLV em PDF ou foto) no Google Drive
2. Se `docType` for `'cnh'` ou `'crlv'`, manda a imagem pra **Gemini Vision** que lê os campos e devolve JSON estruturado pro app pré-preencher o form

Setup leva ~10 minutos, faz 1 vez só.

## Passo 1 — Pegar a chave do Gemini

1. Acessa https://aistudio.google.com/apikey
2. Clica em **Create API key** (use o projeto Google padrão ou crie um novo)
3. **Copia a chave** (começa com `AIza...`)

> Plano free do Gemini dá ~1500 req/dia — sobra pra cadastrar dezenas de colabs/veículos por dia sem custo.

## Passo 2 — Criar pasta no Drive

1. Abre https://drive.google.com
2. Cria pasta: **"Vammo Documentos"**
3. Entra na pasta e **copia o ID** da URL:
   ```
   https://drive.google.com/drive/folders/AQUI_TÁ_O_ID_LONGÃO
                                         ^^^^^^^^^^^^^^^^^^^^
   ```

## Passo 3 — Criar Apps Script

1. Abre https://script.google.com
2. **Novo projeto** → renomeia pra **"Vammo Upload + OCR"**
3. **Apaga** o `function myFunction() {}`
4. **Cola** o código abaixo:

```javascript
// ============================================================
// Vammo — Upload no Drive + OCR (Gemini Vision)
// ============================================================
const FOLDER_ID = 'COLE_AQUI_O_ID_DA_PASTA';
const GEMINI_API_KEY = 'COLE_AQUI_A_CHAVE_GEMINI';
const GEMINI_MODEL = 'gemini-2.5-flash'; // rápido, bom em PT-BR, free tier generoso

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!data.base64 || !data.name) {
      return jsonOut({ error: 'missing base64 or name' });
    }

    // 1) Salva arquivo no Drive
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const blob = Utilities.newBlob(
      Utilities.base64Decode(data.base64),
      data.mimeType || 'application/octet-stream',
      data.name
    );
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const result = {
      ok: true,
      id: file.getId(),
      url: file.getUrl(),
      previewUrl: 'https://drive.google.com/file/d/' + file.getId() + '/preview',
      name: file.getName(),
      size: file.getSize()
    };

    // 2) Se docType vier, roda OCR via Gemini
    if (data.docType && GEMINI_API_KEY && GEMINI_API_KEY.indexOf('COLE_AQUI') < 0) {
      try {
        result.extracted = extractWithGemini(data.base64, data.mimeType, data.docType);
      } catch (err) {
        result.extractError = String(err).substring(0, 200);
      }
    }

    return jsonOut(result);
  } catch (err) {
    return jsonOut({ error: String(err) });
  }
}

function doGet() {
  return jsonOut({ ok: true, service: 'Vammo Upload + OCR', ts: Date.now() });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// OCR via Gemini Vision
// ============================================================
function extractWithGemini(b64, mime, docType) {
  const prompts = {
    cnh: 'Voce esta lendo uma CNH (Carteira Nacional de Habilitacao) brasileira. ' +
      'Extraia os campos abaixo e responda APENAS um objeto JSON puro (sem markdown, sem comentarios, sem texto antes ou depois). ' +
      'Schema obrigatorio:\n' +
      '{\n' +
      '  "nome": "nome completo conforme aparece na CNH",\n' +
      '  "cpf": "formato XXX.XXX.XXX-XX",\n' +
      '  "rg": "numero do RG/identidade",\n' +
      '  "dataNascimento": "YYYY-MM-DD",\n' +
      '  "nomeMae": "nome completo da mae (filiacao)",\n' +
      '  "cnhNumero": "numero de registro da CNH (so digitos)",\n' +
      '  "cnhCategoria": "uma de A, B, AB, C, D, E, AC, AD, AE",\n' +
      '  "cnhValidade": "YYYY-MM-DD",\n' +
      '  "cnhPrimeira": "data da primeira habilitacao em YYYY-MM-DD",\n' +
      '  "cnhUf": "sigla UF da emissao (ex: SP, RJ)",\n' +
      '  "cnhEar": "sim ou nao - se exerce atividade remunerada",\n' +
      '  "cnhObs": "observacoes/restricoes (ex: lentes corretivas)"\n' +
      '}\n' +
      'Use "" (string vazia) para campos que voce nao conseguir ler com certeza. NUNCA invente. NAO retorne markdown.',

    crlv: 'Voce esta lendo um CRLV (Certificado de Registro e Licenciamento de Veiculo) brasileiro. ' +
      'Extraia os campos abaixo e responda APENAS um objeto JSON puro (sem markdown, sem comentarios). ' +
      'Schema obrigatorio:\n' +
      '{\n' +
      '  "placa": "placa do veiculo em maiusculas, formato ABC1D23 ou ABC1234",\n' +
      '  "renavam": "numero RENAVAM (so digitos)",\n' +
      '  "chassi": "chassi do veiculo (17 caracteres alfanumericos)",\n' +
      '  "marca": "marca apenas (ex: FIAT, VOLKSWAGEN, HONDA)",\n' +
      '  "modelo": "modelo/versao do veiculo (ex: STRADA FREEDOM CD)",\n' +
      '  "anoFabricacao": numero do ano de fabricacao (ex: 2023),\n' +
      '  "ano": numero do ano modelo (ex: 2024),\n' +
      '  "cor": "cor predominante (ex: Branco, Prata)",\n' +
      '  "combustivel": "uma de: gasolina, etanol, flex, diesel, gnv, eletrico, hibrido",\n' +
      '  "categoria": "uma de: particular, aluguel, oficial, aprendizagem",\n' +
      '  "municipio": "municipio/UF de licenciamento (ex: Sao Paulo/SP)"\n' +
      '}\n' +
      'Use "" para textos que nao conseguir ler e null para numeros. NUNCA invente. NAO retorne markdown.'
  };

  const prompt = prompts[docType];
  if (!prompt) throw new Error('docType invalido: ' + docType);

  // Gemini aceita imagens e PDFs nativamente em inline_data
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL +
              ':generateContent?key=' + GEMINI_API_KEY;

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mime || 'image/jpeg', data: b64 } }
      ]
    }],
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0.05  // baixo = consistente, evita criatividade no OCR
    }
  };

  const r = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = r.getResponseCode();
  const body = r.getContentText();
  if (code !== 200) throw new Error('Gemini HTTP ' + code + ': ' + body.substring(0, 200));

  const resp = JSON.parse(body);
  const text = resp.candidates && resp.candidates[0] && resp.candidates[0].content &&
               resp.candidates[0].content.parts && resp.candidates[0].content.parts[0] &&
               resp.candidates[0].content.parts[0].text;
  if (!text) throw new Error('Resposta Gemini vazia');

  // Sanidade: deve ser JSON valido
  return JSON.parse(text);
}
```

5. Substitui os 2 valores no topo:
   - `'COLE_AQUI_O_ID_DA_PASTA'` → ID da pasta do Drive
   - `'COLE_AQUI_A_CHAVE_GEMINI'` → chave do Gemini
6. **Salva** (Ctrl+S)

## Passo 4 — Publicar como Web App

1. **Implantar** → **Nova implantação**
2. ⚙ Selecionar tipo → **Aplicativo da Web**
3. Configurações:
   - **Descrição**: Upload + OCR Vammo
   - **Executar como**: Eu (seu email)
   - **Quem pode acessar**: **Qualquer pessoa**
4. **Implantar** → **Autorizar acesso** → escolhe conta → aceita permissões (Drive: gerenciar arquivos criados pelo app; UrlFetchApp: chamar APIs externas)
5. **Copia a URL** do Web App

## Passo 5 — Colar a URL no Vammo Torre

1. No app **torrevammo.pages.dev** → ⚙ Config
2. Cola a URL no campo **"URL de upload (Apps Script)"**
3. Salva

Pronto. Agora ao cadastrar colaborador/veículo:
- Clica em **📎 Subir arquivo** → escolhe CNH ou CRLV
- Apps Script: salva no Drive + lê via Gemini
- Form é **pré-preenchido** com os campos extraídos (azulado = preenchido pela IA)
- Você confere e salva. Se algum campo veio errado, edita por cima — não sobrescreve o que você já tinha digitado manualmente.

## Como testar

Teste rápido via curl (substitui SUA_URL):
```bash
# upload sem OCR
curl -X POST 'SUA_URL_AQUI' \
  -H 'Content-Type: application/json' \
  -d '{"name":"teste.txt","base64":"SGVsbG8gVmFtbW8=","mimeType":"text/plain"}'

# upload + OCR (use uma foto real codificada em base64)
curl -X POST 'SUA_URL_AQUI' \
  -H 'Content-Type: application/json' \
  -d '{"name":"cnh.jpg","base64":"...","mimeType":"image/jpeg","docType":"cnh"}'
```

Deve retornar:
```json
{
  "ok": true,
  "id": "...",
  "url": "https://drive.google.com/...",
  "previewUrl": "...",
  "name": "cnh.jpg",
  "size": 123456,
  "extracted": {
    "nome": "JOAO DA SILVA",
    "cpf": "123.456.789-00",
    "dataNascimento": "1990-05-15",
    "cnhNumero": "12345678900",
    "cnhCategoria": "AB",
    "cnhValidade": "2027-08-20",
    ...
  }
}
```

## Quotas

- **Drive**: 50 MB/dia via Apps Script (uploads pequenos não atinge isso)
- **Gemini 2.5 Flash free tier**: ~1500 requests/dia, 1M tokens/min — sobra demais
- **Imagem por request**: até 20 MB (validamos isso no front também)

## Trocar pra produção (quando virar real)

- Migrar `FOLDER_ID` pra Drive da empresa Vammo
- Trocar `GEMINI_API_KEY` por uma chave do projeto GCP corporativo (com billing) — desbloqueia mais quota e SLA
- Adicionar validação de token no `doPost` (header secret) pra ninguém de fora chamar
- Considerar trocar Gemini por Serpro / Document AI quando precisar de OCR "oficial" pra fiscalização

## Segurança

⚠ O endpoint aceita uploads de qualquer pessoa com a URL. Pra piloto/demo tá ok — só não vaza a URL.
Pra produção:
1. Adicionar token no header e validar no `doPost`
2. Ou trocar **Quem pode acessar** pra "Qualquer pessoa do meu domínio Workspace"
