// Cloudflare Pages Function — POST /api/ler-km
// Recebe a foto do PAINEL (odômetro) e usa uma IA de visão pra extrair o KM sozinho.
// Anti-fraude: o KM passa a vir da imagem, não da digitação do motorista.
//
// PROVEDOR (escolhido pelo secret que estiver setado no Cloudflare Pages):
//   OPENAI_API_KEY = sk-...      → usa OpenAI (gpt-4o-mini)   [PREFERIDO]
//   GEMINI_API_KEY = <chave>     → usa Gemini (legado)        [fallback se não tiver OpenAI]
// Pra reverter pro Gemini: remova o OPENAI_API_KEY (ou deixe só o GEMINI_API_KEY).
//
// Request  (JSON): { "image": "data:image/jpeg;base64,...." }
// Response (JSON): { ok, provider, km, confianca, ehPainel, legivel, observacao }

const OPENAI_MODEL = 'gpt-4o-mini';
const GEMINI_MODEL = 'gemini-2.5-flash';

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

// Campos do resultado — reusados pelos dois provedores.
const FIELDS = {
  km: { type: 'integer', description: 'Hodômetro total em km (inteiro). 0 se ilegível.' },
  eh_painel: { type: 'boolean', description: 'true se a imagem é mesmo um painel de veículo' },
  legivel: { type: 'boolean', description: 'true se deu pra ler o número com segurança' },
  confianca: { type: 'number', description: 'confiança da leitura, 0 a 1' },
  observacao: { type: 'string', description: 'curta nota do que viu (tipo de painel, problema, etc)' }
};
const REQUIRED = ['km', 'eh_painel', 'legivel', 'confianca', 'observacao'];

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

// ---------- OpenAI (gpt-4o-mini, visão + structured output) ----------
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
      json_schema: {
        name: 'leitura_odometro',
        strict: true,
        schema: { type: 'object', additionalProperties: false, properties: FIELDS, required: REQUIRED }
      }
    }
  };
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + key },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) { const t = await resp.text().catch(() => ''); throw new Error(`OpenAI retornou ${resp.status}: ${t.slice(0, 400)}`); }
  const data = await resp.json();
  const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!raw) throw new Error('OpenAI não devolveu conteúdo: ' + JSON.stringify(data).slice(0, 300));
  return JSON.parse(raw);
}

// ---------- Gemini (legado) ----------
async function lerViaGemini(key, dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error('image precisa ser um data URL base64 (image/jpeg ou image/png)');
  const payload = {
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
    generationConfig: {
      temperature: 0, responseMimeType: 'application/json',
      responseSchema: { type: 'object', properties: FIELDS, required: ['km', 'eh_painel', 'legivel', 'confianca'] },
      thinkingConfig: { thinkingBudget: 0 }
    }
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
  if (!provider) {
    return json({ ok: false, erro: 'Nenhuma chave de IA configurada (OPENAI_API_KEY ou GEMINI_API_KEY) no Cloudflare Pages' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, erro: 'JSON inválido' }, 400); }

  const dataUrl = body && body.image;
  if (!dataUrl || typeof dataUrl !== 'string') {
    return json({ ok: false, erro: 'campo "image" (data URL) obrigatório' }, 400);
  }
  if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,.+/.test(dataUrl)) {
    return json({ ok: false, erro: 'image precisa ser um data URL base64 (image/jpeg ou image/png)' }, 400);
  }

  let parsed;
  try {
    parsed = provider === 'openai'
      ? await lerViaOpenAI(env.OPENAI_API_KEY, dataUrl)
      : await lerViaGemini(env.GEMINI_API_KEY, dataUrl);
  } catch (e) {
    return json({ ok: false, erro: 'IA falhou (' + provider + ')', detalhe: (e.message || String(e)).slice(0, 500) }, 502);
  }

  return json({
    ok: true,
    provider,
    km: Number.isFinite(parsed.km) ? Math.round(parsed.km) : 0,
    ehPainel: parsed.eh_painel !== false,
    legivel: parsed.legivel !== false,
    confianca: typeof parsed.confianca === 'number' ? parsed.confianca : 0,
    observacao: parsed.observacao || ''
  });
}
// Métodos != POST recebem 405 automático do Pages (só exportamos onRequestPost).
