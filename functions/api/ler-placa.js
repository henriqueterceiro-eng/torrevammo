// Cloudflare Pages Function — POST /api/ler-placa
// Recebe a foto de uma PLACA de moto (Mercosul ou modelo antigo) e usa IA de visão pra ler.
// Usado no fluxo de TRANSFERÊNCIA do Fleet: o colab escaneia cada placa pra preencher os slots.
//
// PROVEDOR (pelo secret setado no Cloudflare Pages):
//   OPENAI_API_KEY = sk-...   → OpenAI (gpt-4o-mini)   [PREFERIDO]
//   GEMINI_API_KEY = <chave>  → Gemini (legado)        [fallback]
//
// Request  (JSON): { "image": "data:image/jpeg;base64,...." }
// Response (JSON): { ok, provider, placa, legivel, confianca, observacao }
//   placa = 7 chars A-Z0-9 SEM hífen/espaço (ex: ABC1D23 Mercosul, ou ABC1234 antigo), ou "" se ilegível.

const OPENAI_MODEL = 'gpt-4o-mini';
const GEMINI_MODEL = 'gemini-2.5-flash';

const PROMPT = [
  'Você é um leitor de PLACAS de veículo brasileiras. A imagem é a foto da placa de uma MOTO.',
  'Leia a placa. Formatos possíveis:',
  '- Mercosul: 3 letras + 1 número + 1 letra + 2 números (ex: ABC1D23).',
  '- Antigo: 3 letras + 4 números (ex: ABC1234).',
  'Regras:',
  '- Retorne a placa em MAIÚSCULAS, só letras e números, SEM hífen, espaço ou pontos (7 caracteres).',
  '- Cuidado com confusões comuns: 0/O, 1/I, 5/S, 8/B, 2/Z — use a POSIÇÃO no formato pra decidir (posições 1-3 são letras; no Mercosul a 5ª é letra; as demais numéricas no antigo).',
  '- Se a placa estiver ilegível (borrada, cortada, reflexo, suja demais, ângulo ruim), marque legivel=false e devolva placa="".',
  '- Se a imagem não tiver uma placa de veículo, legivel=false e placa="".',
  '- confianca de 0 a 1 indicando o quanto você confia na leitura.'
].join('\n');

const FIELDS = {
  placa: { type: 'string', description: 'Placa em maiúsculas, 7 chars A-Z0-9 sem separador. "" se ilegível.' },
  legivel: { type: 'boolean', description: 'true se deu pra ler a placa com segurança' },
  confianca: { type: 'number', description: 'confiança da leitura, 0 a 1' },
  observacao: { type: 'string', description: 'curta nota (formato, problema, etc)' }
};
const REQUIRED = ['placa', 'legivel', 'confianca', 'observacao'];

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

// normaliza pra 7 chars A-Z0-9
const normPlaca = (p) => (p || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);

async function lerViaOpenAI(key, dataUrl) {
  const payload = {
    model: OPENAI_MODEL,
    temperature: 0,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: dataUrl } }
      ]
    }],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'leitura_placa', strict: true, schema: { type: 'object', additionalProperties: false, properties: FIELDS, required: REQUIRED } }
    }
  };
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + key }, body: JSON.stringify(payload)
  });
  if (!resp.ok) { const t = await resp.text().catch(() => ''); throw new Error(`OpenAI retornou ${resp.status}: ${t.slice(0, 400)}`); }
  const data = await resp.json();
  const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!raw) throw new Error('OpenAI não devolveu conteúdo');
  return JSON.parse(raw);
}

async function lerViaGemini(key, dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error('data URL inválido');
  const payload = {
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: { type: 'object', properties: FIELDS, required: ['placa', 'legivel', 'confianca'] }, thinkingConfig: { thinkingBudget: 0 } }
  };
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(payload)
  });
  if (!resp.ok) { const t = await resp.text().catch(() => ''); throw new Error(`Gemini retornou ${resp.status}: ${t.slice(0, 400)}`); }
  const data = await resp.json();
  const raw = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!raw) throw new Error('Gemini não devolveu conteúdo');
  return JSON.parse(raw);
}

export async function onRequestPost({ request, env }) {
  const provider = env.OPENAI_API_KEY ? 'openai' : (env.GEMINI_API_KEY ? 'gemini' : null);
  if (!provider) return json({ ok: false, erro: 'Nenhuma chave de IA configurada (OPENAI_API_KEY ou GEMINI_API_KEY)' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, erro: 'JSON inválido' }, 400); }
  const dataUrl = body && body.image;
  if (!dataUrl || typeof dataUrl !== 'string') return json({ ok: false, erro: 'campo "image" (data URL) obrigatório' }, 400);
  if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,.+/.test(dataUrl)) return json({ ok: false, erro: 'image precisa ser data URL base64 (image/jpeg|png)' }, 400);

  let parsed;
  try {
    parsed = provider === 'openai' ? await lerViaOpenAI(env.OPENAI_API_KEY, dataUrl) : await lerViaGemini(env.GEMINI_API_KEY, dataUrl);
  } catch (e) {
    return json({ ok: false, erro: 'IA falhou (' + provider + ')', detalhe: (e.message || String(e)).slice(0, 500) }, 502);
  }

  const placa = normPlaca(parsed.placa);
  const legivel = parsed.legivel !== false && placa.length >= 7;
  return json({
    ok: true,
    provider,
    placa: legivel ? placa : '',
    legivel,
    confianca: typeof parsed.confianca === 'number' ? parsed.confianca : 0,
    observacao: parsed.observacao || ''
  });
}
// Métodos != POST recebem 405 automático do Pages.
