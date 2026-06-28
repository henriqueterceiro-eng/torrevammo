// Cloudflare Pages Function — POST /api/ler-km
// Recebe a foto do PAINEL (odômetro) e usa o Gemini pra extrair o KM sozinho.
// Anti-fraude: o KM passa a vir da imagem, não da digitação do motorista.
//
// SECRET necessário no projeto Pages (Settings → Environment variables):
//   GEMINI_API_KEY = <chave do Google AI Studio>
//
// Request  (JSON): { "image": "data:image/jpeg;base64,...." }
// Response (JSON): { ok, km, confianca, ehPainel, legivel, observacao }

const MODEL = 'gemini-2.5-flash';
const GEMINI_URL = m => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

const PROMPT = [
  'Você é um leitor de odômetro de veículos. A imagem é a foto do PAINEL de um carro/caminhão.',
  'Sua tarefa: ler o HODÔMETRO TOTAL (a quilometragem acumulada do veículo, geralmente o número grande de 5 a 7 dígitos), NÃO o hodômetro parcial/trip (que costuma ter casa decimal, ex: 123.4).',
  'Regras:',
  '- Retorne SÓ o número inteiro de km, sem pontos nem texto.',
  '- Se houver dois números (total e parcial), escolha o TOTAL (sem decimal, valor maior).',
  '- Se a imagem NÃO for um painel de veículo (ex: foto de um papel, tela, número impresso), marque eh_painel=false.',
  '- Se o número estiver ilegível (reflexo, borrado, escuro, cortado), marque legivel=false e devolva km=0.',
  '- confianca de 0 a 1 indicando o quanto você confia na leitura.'
].join('\n');

const SCHEMA = {
  type: 'object',
  properties: {
    km: { type: 'integer', description: 'Hodômetro total em km (inteiro). 0 se ilegível.' },
    eh_painel: { type: 'boolean', description: 'true se a imagem é mesmo um painel de veículo' },
    legivel: { type: 'boolean', description: 'true se deu pra ler o número com segurança' },
    confianca: { type: 'number', description: 'confiança da leitura, 0 a 1' },
    observacao: { type: 'string', description: 'curta nota do que viu (tipo de painel, problema, etc)' }
  },
  required: ['km', 'eh_painel', 'legivel', 'confianca']
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) {
    return json({ ok: false, erro: 'GEMINI_API_KEY não configurada no Cloudflare Pages' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, erro: 'JSON inválido' }, 400);
  }

  const dataUrl = body && body.image;
  if (!dataUrl || typeof dataUrl !== 'string') {
    return json({ ok: false, erro: 'campo "image" (data URL) obrigatório' }, 400);
  }

  // Separa mime + base64 do data URL
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) {
    return json({ ok: false, erro: 'image precisa ser um data URL base64 (image/jpeg ou image/png)' }, 400);
  }
  const mimeType = m[1];
  const base64 = m[2];

  const payload = {
    contents: [{
      parts: [
        { text: PROMPT },
        { inline_data: { mime_type: mimeType, data: base64 } }
      ]
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: SCHEMA,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  let resp;
  try {
    resp = await fetch(GEMINI_URL(MODEL), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    return json({ ok: false, erro: 'falha de rede ao chamar Gemini: ' + (e.message || e) }, 502);
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    return json({ ok: false, erro: `Gemini retornou ${resp.status}`, detalhe: txt.slice(0, 500) }, 502);
  }

  let data;
  try {
    data = await resp.json();
  } catch {
    return json({ ok: false, erro: 'resposta do Gemini não é JSON' }, 502);
  }

  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) {
    return json({ ok: false, erro: 'Gemini não devolveu conteúdo', detalhe: JSON.stringify(data).slice(0, 500) }, 502);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ ok: false, erro: 'JSON do Gemini inválido', detalhe: raw.slice(0, 300) }, 502);
  }

  return json({
    ok: true,
    km: Number.isFinite(parsed.km) ? Math.round(parsed.km) : 0,
    ehPainel: parsed.eh_painel !== false,
    legivel: parsed.legivel !== false,
    confianca: typeof parsed.confianca === 'number' ? parsed.confianca : 0,
    observacao: parsed.observacao || ''
  });
}
// Métodos != POST recebem 405 automático do Pages (só exportamos onRequestPost).
