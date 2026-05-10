/* ============================================================
   AI Model Browser — app logic
   ============================================================ */

const state = {
  all: {},
  filtered: [],
  pinned: new Set(),
  view: 'browse',
  resultMode: 'cards', // cards | table
  search: '',
  chips: new Set(),
  provider: '',
  mode: '',
  sortBy: 'featured',
  page: 1,
  pageSize: 60,
  lbMode: 'chat',
  calc: { input: 100000, output: 20000, calls: 1000, models: [] },
  kbar: { open: false, query: '', idx: 0, results: [] },
  tweaks: window.__TWEAK_DEFAULTS || {}
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const fmtMoney = (n) => {
  if (n === undefined || n === null || isNaN(n)) return '—';
  if (n === 0) return '$0';
  if (n < 0.01) return '$' + n.toFixed(4);
  if (n < 1) return '$' + n.toFixed(3);
  if (n < 100) return '$' + n.toFixed(2);
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};
const fmtTokens = (n) => {
  if (!n) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(n % 1000 === 0 ? 0 : 0) + 'K';
  return n.toLocaleString();
};
const pricePerUnit = (perToken) => {
  if (perToken === undefined || perToken === null) return null;
  return state.tweaks.unit === '1k' ? perToken * 1000 : perToken * 1_000_000;
};
const priceLabel = () => state.tweaks.unit === '1k' ? '/ 1K' : '/ 1M';

const PROVIDER_PRETTY = {
  openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', gemini: 'Google Gemini',
  bedrock: 'AWS Bedrock', bedrock_converse: 'AWS Bedrock', azure: 'Azure', azure_ai: 'Azure AI',
  mistral: 'Mistral', deepseek: 'DeepSeek', groq: 'Groq', cohere: 'Cohere', cohere_chat: 'Cohere',
  perplexity: 'Perplexity', xai: 'xAI', fireworks_ai: 'Fireworks AI', together_ai: 'Together AI',
  replicate: 'Replicate', vertex_ai: 'Vertex AI', databricks: 'Databricks', openrouter: 'OpenRouter',
  cerebras: 'Cerebras', sambanova: 'SambaNova', deepinfra: 'DeepInfra', dashscope: 'Alibaba (DashScope)',
  moonshot: 'Moonshot', stability: 'Stability', voyage: 'Voyage', watsonx: 'IBM watsonx',
  ai21: 'AI21', amazon_nova: 'Amazon Nova', chatgpt: 'ChatGPT', meta_llama: 'Meta Llama',
  zai: 'Z.ai', ovhcloud: 'OVHcloud', nebius: 'Nebius', novita: 'Novita',
  github_copilot: 'GitHub Copilot', lambda_ai: 'Lambda', baseten: 'Baseten',
  vercel_ai_gateway: 'Vercel AI Gateway', minimax: 'MiniMax', heroku: 'Heroku',
  ollama: 'Ollama', snowflake: 'Snowflake', deepgram: 'Deepgram', assemblyai: 'AssemblyAI',
  elevenlabs: 'ElevenLabs', aws_polly: 'AWS Polly', volcengine: 'Volcengine'
};
const prettyProvider = (p) => PROVIDER_PRETTY[p] || (p || '—').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/Vertex Ai/g, 'Vertex AI');

// Deterministic colored initial chip per provider (OpenRouter-style favicon-ish marker)
const AVATAR_COLORS = ['#0071e3','#5e5ce6','#30d158','#ff9f0a','#ff453a','#bf5af2','#64d2ff','#ffd60a','#ff6482','#a2845e'];
function providerAvatar(provider, large = false) {
  const key = (provider || '?').toString();
  const display = PROVIDER_PRETTY[provider] || key;
  const letter = display.replace(/^[^A-Za-z0-9]+/, '').charAt(0).toUpperCase() || '?';
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const color = AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  return `<span class="pa${large ? ' pa-lg' : ''}" style="background:${color}" title="${escape(prettyProvider(provider))}" aria-hidden="true">${escape(letter)}</span>`;
}

// Count of capability flags — for "most capable" stat
const CAP_KEYS = ['supports_function_calling','supports_vision','supports_audio_input','supports_audio_output','supports_reasoning','supports_prompt_caching','supports_response_schema','supports_web_search','supports_pdf_input','supports_system_messages','supports_parallel_function_calling','supports_tool_choice'];
const countCaps = (info) => CAP_KEYS.reduce((n, k) => n + (info[k] ? 1 : 0), 0);

// Famous/popular models score-boost for "featured" sort
const FEATURED_PRIORITY = [
  /^gpt-5/i, /^gpt-4o/i, /^o3/, /^o1/, /^claude-(opus|sonnet|haiku|3|4)/i,
  /^gemini-(2|1\.5)/i, /^deepseek/i, /^grok/i, /^mistral-(large|medium|small)/i,
  /^llama-3/i, /^command-r/i
];
const featuredScore = (name) => {
  for (let i = 0; i < FEATURED_PRIORITY.length; i++) {
    if (FEATURED_PRIORITY[i].test(name)) return 100 - i;
  }
  return 0;
};

/* ============ Load data ============ */
async function load() {
  const res = await fetch('model_prices_and_context_windows.json');
  const data = await res.json();
  delete data.sample_spec;
  state.all = data;
  initFilters();
  initEvents();
  applyTweaks(state.tweaks);
  loadPinned();
  loadCalcModels();
  render();
}

function initFilters() {
  const providers = new Map();
  const modes = new Map();
  for (const [k, v] of Object.entries(state.all)) {
    if (v.litellm_provider) providers.set(v.litellm_provider, (providers.get(v.litellm_provider) || 0) + 1);
    if (v.mode) modes.set(v.mode, (modes.get(v.mode) || 0) + 1);
  }
  const provSelect = $('#providerFilter');
  [...providers.entries()].sort((a, b) => b[1] - a[1]).forEach(([p, c]) => {
    const o = document.createElement('option');
    o.value = p;
    o.textContent = `${prettyProvider(p)} (${c})`;
    provSelect.appendChild(o);
  });
  const modeOrder = ['chat', 'embedding', 'image_generation', 'audio_transcription', 'audio_speech', 'rerank', 'completion', 'responses', 'image_edit', 'video_generation', 'ocr', 'search', 'moderation'];
  const modeSelect = $('#modeFilter');
  modeOrder.forEach(m => {
    if (!modes.has(m)) return;
    const o = document.createElement('option');
    o.value = m;
    o.textContent = `${m.replace(/_/g, ' ')} (${modes.get(m)})`;
    modeSelect.appendChild(o);
  });
  // stats
  $('#modelCountTag').textContent = `${Object.keys(state.all).length.toLocaleString()} models`;
  $('#providerCountTag').textContent = `${providers.size}`;
}

/* ============ Filtering ============ */
function applyFilter() {
  const q = state.search.toLowerCase().trim();
  const out = [];
  for (const [name, info] of Object.entries(state.all)) {
    if (q && !(name.toLowerCase().includes(q) || (info.litellm_provider || '').toLowerCase().includes(q))) continue;
    if (state.provider && info.litellm_provider !== state.provider) continue;
    if (state.mode && info.mode !== state.mode) continue;

    if (state.chips.has('vision') && !info.supports_vision) continue;
    if (state.chips.has('tools') && !info.supports_function_calling) continue;
    if (state.chips.has('reasoning') && !info.supports_reasoning) continue;
    if (state.chips.has('caching') && !info.supports_prompt_caching) continue;
    if (state.chips.has('big')) {
      const ctx = info.max_input_tokens || info.max_tokens || 0;
      if (ctx < 200_000) continue;
    }
    if (state.chips.has('cheap')) {
      if (!info.input_cost_per_token || info.input_cost_per_token * 1_000_000 > 1) continue;
    }

    out.push([name, info]);
  }
  sortList(out);
  state.filtered = out;
  state.page = 1;
}

function sortList(list) {
  const s = state.sortBy;
  list.sort(([an, ai], [bn, bi]) => {
    switch (s) {
      case 'name': return an.localeCompare(bn);
      case 'input_asc':
        return (ai.input_cost_per_token ?? Infinity) - (bi.input_cost_per_token ?? Infinity);
      case 'input_desc':
        return (bi.input_cost_per_token ?? -1) - (ai.input_cost_per_token ?? -1);
      case 'output_asc':
        return (ai.output_cost_per_token ?? Infinity) - (bi.output_cost_per_token ?? Infinity);
      case 'output_desc':
        return (bi.output_cost_per_token ?? -1) - (ai.output_cost_per_token ?? -1);
      case 'context_desc':
        return (bi.max_input_tokens || bi.max_tokens || 0) - (ai.max_input_tokens || ai.max_tokens || 0);
      case 'featured':
      default: {
        const fb = featuredScore(bn) - featuredScore(an);
        if (fb !== 0) return fb;
        // tiebreaker: chat models, with input cost defined
        const aChat = ai.mode === 'chat' ? 1 : 0;
        const bChat = bi.mode === 'chat' ? 1 : 0;
        if (aChat !== bChat) return bChat - aChat;
        return an.localeCompare(bn);
      }
    }
  });
}

/* ============ Render ============ */
function render() {
  renderStats();
  applyFilter();
  $('#resultCount').textContent = `${state.filtered.length.toLocaleString()} results`;
  if (state.filtered.length === 0) {
    $('#cardsView').hidden = true;
    $('#tableView').hidden = true;
    $('#emptyState').hidden = false;
    $('#pagination').hidden = true;
    return;
  }
  $('#emptyState').hidden = true;
  if (state.resultMode === 'cards') {
    $('#cardsView').hidden = false;
    $('#tableView').hidden = true;
    renderCards();
  } else {
    $('#cardsView').hidden = true;
    $('#tableView').hidden = false;
    renderTable();
  }
  renderCompareTray();
}

function renderCards() {
  const grid = $('#cardsView');
  const slice = state.filtered.slice(0, state.page * state.pageSize);
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  slice.forEach(([name, info]) => frag.appendChild(modelCard(name, info)));
  grid.appendChild(frag);
  renderPagination(slice.length);
}

function renderTable() {
  const body = $('#tableBody');
  body.innerHTML = '';
  const slice = state.filtered.slice(0, state.page * state.pageSize);
  const frag = document.createDocumentFragment();
  slice.forEach(([name, info]) => frag.appendChild(modelRow(name, info)));
  body.appendChild(frag);
  renderPagination(slice.length);
}

function renderPagination(shown) {
  const total = state.filtered.length;
  if (shown >= total) {
    $('#pagination').hidden = true;
    return;
  }
  $('#pagination').hidden = false;
  $('#showingMeta').textContent = `Showing ${shown.toLocaleString()} of ${total.toLocaleString()}`;
}

function modelCard(name, info) {
  const el = document.createElement('div');
  el.className = 'model-card';
  el.dataset.name = name;
  const inP = pricePerUnit(info.input_cost_per_token);
  const outP = pricePerUnit(info.output_cost_per_token);
  const ctx = info.max_input_tokens || info.max_tokens;
  const max = info.max_output_tokens;
  const caps = [];
  if (info.supports_vision) caps.push(['vision', '⊙ Vision']);
  if (info.supports_function_calling) caps.push(['tools', '⌘ Tools']);
  if (info.supports_reasoning) caps.push(['reasoning', '∿ Reasoning']);
  if (info.supports_audio_input || info.supports_audio_output) caps.push(['audio', '♪ Audio']);
  if (info.supports_prompt_caching) caps.push(['cache', '◫ Cache']);

  const pinned = state.pinned.has(name);

  el.innerHTML = `
    <div class="mc-head">
      <div>
        <h3 class="mc-name">${escape(name)}</h3>
        <div class="mc-provider">${escape(prettyProvider(info.litellm_provider))}${info.mode ? ' · ' + info.mode.replace(/_/g, ' ') : ''}</div>
      </div>
      <button class="mc-pin ${pinned ? 'pinned' : ''}" aria-label="Pin to compare">${pinned ? '✓' : '+'}</button>
    </div>
    <div class="mc-stats">
      <div class="mc-stat">
        <div class="mc-stat-label">Input ${priceLabel()}</div>
        <div class="mc-stat-value ${inP === null ? 'dim' : ''}">${inP === null ? '—' : fmtMoney(inP)}</div>
      </div>
      <div class="mc-stat">
        <div class="mc-stat-label">Output ${priceLabel()}</div>
        <div class="mc-stat-value ${outP === null ? 'dim' : ''}">${outP === null ? '—' : fmtMoney(outP)}</div>
      </div>
      <div class="mc-stat">
        <div class="mc-stat-label">Context</div>
        <div class="mc-stat-value ${!ctx ? 'dim' : ''}">${ctx ? fmtTokens(ctx) : '—'}</div>
      </div>
      <div class="mc-stat">
        <div class="mc-stat-label">Max out</div>
        <div class="mc-stat-value ${!max ? 'dim' : ''}">${max ? fmtTokens(max) : '—'}</div>
      </div>
    </div>
    ${caps.length ? `<div class="mc-caps">${caps.map(([cls, label]) => `<span class="cap ${cls}">${label}</span>`).join('')}</div>` : ''}
  `;

  el.addEventListener('click', (e) => {
    if (e.target.closest('.mc-pin')) {
      e.stopPropagation();
      togglePin(name);
      return;
    }
    openDetail(name);
  });
  return el;
}

function modelRow(name, info) {
  const tr = document.createElement('tr');
  tr.dataset.name = name;
  const inP = pricePerUnit(info.input_cost_per_token);
  const outP = pricePerUnit(info.output_cost_per_token);
  const ctx = info.max_input_tokens || info.max_tokens;
  const caps = [];
  if (info.supports_vision) caps.push('Vision');
  if (info.supports_function_calling) caps.push('Tools');
  if (info.supports_reasoning) caps.push('Reasoning');
  if (info.supports_audio_input || info.supports_audio_output) caps.push('Audio');
  if (info.supports_prompt_caching) caps.push('Cache');
  const pinned = state.pinned.has(name);

  tr.innerHTML = `
    <td class="row-name">${escape(name)}</td>
    <td>${escape(prettyProvider(info.litellm_provider))}</td>
    <td>${info.mode ? info.mode.replace(/_/g, ' ') : '—'}</td>
    <td class="num">${inP === null ? '—' : fmtMoney(inP)}</td>
    <td class="num">${outP === null ? '—' : fmtMoney(outP)}</td>
    <td class="num">${ctx ? fmtTokens(ctx) : '—'}</td>
    <td>${caps.map(c => `<span class="cap" style="font-size:10.5px;padding:2px 7px;">${c}</span>`).join(' ')}</td>
    <td><button class="mc-pin ${pinned ? 'pinned' : ''}" aria-label="Pin">${pinned ? '✓' : '+'}</button></td>
  `;
  tr.addEventListener('click', (e) => {
    if (e.target.closest('.mc-pin')) {
      e.stopPropagation();
      togglePin(name);
      return;
    }
    openDetail(name);
  });
  return tr;
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============ Pinning ============ */
function togglePin(name) {
  if (state.pinned.has(name)) state.pinned.delete(name);
  else {
    if (state.pinned.size >= 6) {
      state.pinned.delete([...state.pinned][0]);
    }
    state.pinned.add(name);
  }
  savePinned();
  renderCompareTray();
  // Update in-card pin state without full re-render
  $$('.mc-pin').forEach(btn => {
    const card = btn.closest('[data-name]');
    if (!card) return;
    const isPinned = state.pinned.has(card.dataset.name);
    btn.classList.toggle('pinned', isPinned);
    btn.textContent = isPinned ? '✓' : '+';
  });
}

function savePinned() {
  try { localStorage.setItem('mb_pinned', JSON.stringify([...state.pinned])); } catch (e) {}
}
function loadPinned() {
  try {
    const v = JSON.parse(localStorage.getItem('mb_pinned') || '[]');
    v.forEach(n => state.all[n] && state.pinned.add(n));
  } catch (e) {}
}

function renderCompareTray() {
  const tray = $('#compareTray');
  if (state.pinned.size === 0) { tray.hidden = true; return; }
  tray.hidden = false;
  $('#ctCount').textContent = state.pinned.size;
  const chips = $('#ctChips');
  chips.innerHTML = '';
  [...state.pinned].forEach(name => {
    const chip = document.createElement('span');
    chip.className = 'ct-chip';
    chip.innerHTML = `${escape(name)} <button aria-label="Remove">✕</button>`;
    chip.querySelector('button').addEventListener('click', () => togglePin(name));
    chips.appendChild(chip);
  });
}

/* ============ Compare modal ============ */
function openCompare() {
  if (state.pinned.size === 0) return;
  const names = [...state.pinned];
  const grid = $('#compareGrid');
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = `200px repeat(${names.length}, minmax(220px, 1fr))`;

  const rows = [
    ['Provider', i => prettyProvider(i.litellm_provider)],
    ['Mode', i => i.mode ? i.mode.replace(/_/g, ' ') : null],
    [`Input ${priceLabel()}`, i => {
      const p = pricePerUnit(i.input_cost_per_token);
      return p === null ? null : fmtMoney(p);
    }, 'min', i => i.input_cost_per_token ?? Infinity],
    [`Output ${priceLabel()}`, i => {
      const p = pricePerUnit(i.output_cost_per_token);
      return p === null ? null : fmtMoney(p);
    }, 'min', i => i.output_cost_per_token ?? Infinity],
    ['Context window', i => {
      const c = i.max_input_tokens || i.max_tokens;
      return c ? fmtTokens(c) : null;
    }, 'max', i => i.max_input_tokens || i.max_tokens || 0],
    ['Max output', i => i.max_output_tokens ? fmtTokens(i.max_output_tokens) : null, 'max', i => i.max_output_tokens || 0],
    ['Vision', i => i.supports_vision ? '✓' : '—'],
    ['Function calling', i => i.supports_function_calling ? '✓' : '—'],
    ['Reasoning', i => i.supports_reasoning ? '✓' : '—'],
    ['Audio input', i => i.supports_audio_input ? '✓' : '—'],
    ['Audio output', i => i.supports_audio_output ? '✓' : '—'],
    ['Prompt caching', i => i.supports_prompt_caching ? '✓' : '—'],
    ['System messages', i => i.supports_system_messages ? '✓' : '—'],
    ['Web search', i => i.supports_web_search ? '✓' : '—'],
    ['Response schema', i => i.supports_response_schema ? '✓' : '—'],
    ['Cache read cost', i => {
      const p = pricePerUnit(i.cache_read_input_token_cost);
      return p === null ? null : fmtMoney(p);
    }],
  ];

  // labels column
  const labelCol = document.createElement('div');
  labelCol.className = 'compare-col labels';
  labelCol.innerHTML = `<div class="cc-head"><div class="cc-name">&nbsp;</div></div>` +
    rows.map(([label]) => `<div class="cc-row"><div class="cc-val">${label}</div></div>`).join('');
  grid.appendChild(labelCol);

  // compute best per row
  const bestByRow = rows.map(r => {
    if (!r[2]) return null;
    const vals = names.map(n => r[3](state.all[n]));
    const fn = r[2] === 'min' ? Math.min : Math.max;
    const best = fn(...vals.filter(v => v !== Infinity && v !== 0));
    return { mode: r[2], best };
  });

  names.forEach(n => {
    const info = state.all[n];
    const col = document.createElement('div');
    col.className = 'compare-col';
    col.innerHTML = `<div class="cc-head">
        <div class="cc-name">${escape(n)}</div>
        <div class="cc-prov">${escape(prettyProvider(info.litellm_provider))}</div>
      </div>` +
      rows.map((r, ri) => {
        const v = r[1](info);
        let cls = '';
        if (v && bestByRow[ri]) {
          const myVal = r[3](info);
          if (myVal === bestByRow[ri].best && myVal !== 0 && myVal !== Infinity) cls = 'best';
        }
        return `<div class="cc-row"><div class="cc-val ${v ? cls : 'absent'}">${v ?? '—'}</div></div>`;
      }).join('');
    grid.appendChild(col);
  });

  $('#compareModal').hidden = false;
}

/* ============ Detail modal ============ */
function openDetail(name) {
  const info = state.all[name];
  if (!info) return;
  $('#detailName').textContent = name;
  $('#detailProvider').textContent = prettyProvider(info.litellm_provider) + (info.mode ? ' · ' + info.mode.replace(/_/g, ' ') : '');

  const inP = pricePerUnit(info.input_cost_per_token);
  const outP = pricePerUnit(info.output_cost_per_token);
  const ctx = info.max_input_tokens || info.max_tokens;
  const stats = [
    ['Input', inP === null ? '—' : fmtMoney(inP) + ' ' + priceLabel()],
    ['Output', outP === null ? '—' : fmtMoney(outP) + ' ' + priceLabel()],
    ['Context', ctx ? fmtTokens(ctx) : '—'],
    ['Max output', info.max_output_tokens ? fmtTokens(info.max_output_tokens) : '—'],
  ];

  const caps = [];
  const capMap = {
    supports_vision: 'Vision', supports_function_calling: 'Function calling',
    supports_reasoning: 'Reasoning', supports_prompt_caching: 'Prompt caching',
    supports_audio_input: 'Audio input', supports_audio_output: 'Audio output',
    supports_system_messages: 'System messages', supports_response_schema: 'Response schema',
    supports_web_search: 'Web search', supports_pdf_input: 'PDF input',
    supports_parallel_function_calling: 'Parallel tools', supports_tool_choice: 'Tool choice'
  };
  for (const [k, label] of Object.entries(capMap)) {
    if (info[k]) caps.push(label);
  }

  const fieldOrder = [
    'litellm_provider', 'mode', 'max_input_tokens', 'max_output_tokens', 'max_tokens',
    'input_cost_per_token', 'output_cost_per_token', 'cache_creation_input_token_cost',
    'cache_read_input_token_cost', 'output_cost_per_reasoning_token',
    'input_cost_per_image', 'output_cost_per_image', 'input_cost_per_audio_token',
    'input_cost_per_second', 'output_cost_per_second',
    'deprecation_date', 'source'
  ];
  const allFields = new Set([...fieldOrder, ...Object.keys(info)]);

  const isPinned = state.pinned.has(name);

  $('#detailBody').innerHTML = `
    <div class="detail-actions">
      <button class="btn-primary small" id="dPin">${isPinned ? '✓ Pinned to compare' : '+ Pin to compare'}</button>
      <button class="btn-ghost small" id="dCalc">Add to calculator</button>
      ${info.source ? `<a class="btn-ghost small" href="${escape(info.source)}" target="_blank" rel="noopener">Source ↗</a>` : ''}
    </div>
    <div class="detail-section">
      <h3>At a glance</h3>
      <div class="detail-stats">
        ${stats.map(([k, v]) => `<div class="detail-stat"><div class="detail-stat-label">${k}</div><div class="detail-stat-value">${v}</div></div>`).join('')}
      </div>
    </div>
    ${caps.length ? `<div class="detail-section">
      <h3>Capabilities</h3>
      <div class="mc-caps">${caps.map(c => `<span class="cap">${c}</span>`).join('')}</div>
    </div>` : ''}
    <div class="detail-section">
      <h3>All fields</h3>
      <div class="detail-fields">
        ${[...allFields].filter(f => info[f] !== undefined).map(f => {
          let v = info[f];
          if (typeof v === 'number' && f.includes('cost') && f.includes('token')) v = v + ' ($' + (v * 1_000_000).toFixed(2) + '/1M)';
          if (typeof v === 'object') v = JSON.stringify(v);
          if (typeof v === 'boolean') v = v ? 'true' : 'false';
          return `<div class="df-row"><div class="df-key">${f}</div><div class="df-val">${escape(v)}</div></div>`;
        }).join('')}
      </div>
    </div>
  `;

  $('#dPin').addEventListener('click', () => {
    togglePin(name);
    const np = state.pinned.has(name);
    $('#dPin').textContent = np ? '✓ Pinned to compare' : '+ Pin to compare';
  });
  $('#dCalc').addEventListener('click', () => {
    if (!state.calc.models.includes(name)) state.calc.models.push(name);
    saveCalcModels();
    renderCalc();
    closeAllModals();
    switchView('calculator');
  });

  $('#detailModal').hidden = false;
}

/* ============ Leaderboards ============ */
function renderLeaderboards() {
  const grid = $('#leaderboardGrid');
  grid.innerHTML = '';
  const mode = state.lbMode;
  const all = Object.entries(state.all).filter(([_, i]) => i.mode === mode);

  const boards = [];
  if (mode === 'chat') {
    boards.push({
      title: 'Cheapest input',
      sub: 'lowest input cost per token',
      list: all.filter(([_, i]) => i.input_cost_per_token > 0)
        .sort((a, b) => a[1].input_cost_per_token - b[1].input_cost_per_token)
        .slice(0, 8)
        .map(([n, i]) => [n, fmtMoney(pricePerUnit(i.input_cost_per_token)) + ' ' + priceLabel()])
    });
    boards.push({
      title: 'Cheapest output',
      sub: 'lowest output cost per token',
      list: all.filter(([_, i]) => i.output_cost_per_token > 0)
        .sort((a, b) => a[1].output_cost_per_token - b[1].output_cost_per_token)
        .slice(0, 8)
        .map(([n, i]) => [n, fmtMoney(pricePerUnit(i.output_cost_per_token)) + ' ' + priceLabel()])
    });
    boards.push({
      title: 'Biggest context',
      sub: 'largest max input tokens',
      list: all.filter(([_, i]) => i.max_input_tokens || i.max_tokens)
        .sort((a, b) => (b[1].max_input_tokens || b[1].max_tokens) - (a[1].max_input_tokens || a[1].max_tokens))
        .slice(0, 8)
        .map(([n, i]) => [n, fmtTokens(i.max_input_tokens || i.max_tokens)])
    });
    boards.push({
      title: 'Best value vision',
      sub: 'cheapest with vision support',
      list: all.filter(([_, i]) => i.supports_vision && i.input_cost_per_token > 0)
        .sort((a, b) => a[1].input_cost_per_token - b[1].input_cost_per_token)
        .slice(0, 8)
        .map(([n, i]) => [n, fmtMoney(pricePerUnit(i.input_cost_per_token)) + ' ' + priceLabel()])
    });
    boards.push({
      title: 'Reasoning models',
      sub: 'sorted by output cost',
      list: all.filter(([_, i]) => i.supports_reasoning && i.output_cost_per_token > 0)
        .sort((a, b) => a[1].output_cost_per_token - b[1].output_cost_per_token)
        .slice(0, 8)
        .map(([n, i]) => [n, fmtMoney(pricePerUnit(i.output_cost_per_token)) + ' ' + priceLabel()])
    });
    boards.push({
      title: 'Largest output',
      sub: 'highest max_output_tokens',
      list: all.filter(([_, i]) => i.max_output_tokens)
        .sort((a, b) => b[1].max_output_tokens - a[1].max_output_tokens)
        .slice(0, 8)
        .map(([n, i]) => [n, fmtTokens(i.max_output_tokens)])
    });
  } else if (mode === 'embedding') {
    boards.push({
      title: 'Cheapest embeddings',
      sub: 'lowest input cost per token',
      list: all.filter(([_, i]) => i.input_cost_per_token > 0)
        .sort((a, b) => a[1].input_cost_per_token - b[1].input_cost_per_token)
        .slice(0, 10)
        .map(([n, i]) => [n, fmtMoney(pricePerUnit(i.input_cost_per_token)) + ' ' + priceLabel()])
    });
    boards.push({
      title: 'Longest input',
      sub: 'largest max input tokens',
      list: all.filter(([_, i]) => i.max_input_tokens)
        .sort((a, b) => b[1].max_input_tokens - a[1].max_input_tokens)
        .slice(0, 10)
        .map(([n, i]) => [n, fmtTokens(i.max_input_tokens)])
    });
  } else if (mode === 'image_generation') {
    boards.push({
      title: 'Cheapest per image',
      sub: 'lowest output_cost_per_image',
      list: all.filter(([_, i]) => i.output_cost_per_image)
        .sort((a, b) => a[1].output_cost_per_image - b[1].output_cost_per_image)
        .slice(0, 10)
        .map(([n, i]) => [n, fmtMoney(i.output_cost_per_image) + '/image'])
    });
  } else if (mode === 'audio_transcription') {
    boards.push({
      title: 'Cheapest per second',
      sub: 'lowest input_cost_per_second',
      list: all.filter(([_, i]) => i.input_cost_per_second)
        .sort((a, b) => a[1].input_cost_per_second - b[1].input_cost_per_second)
        .slice(0, 10)
        .map(([n, i]) => [n, fmtMoney(i.input_cost_per_second) + '/sec'])
    });
  }

  // Provider leaderboard - count models
  const providerCount = new Map();
  all.forEach(([_, i]) => {
    const p = i.litellm_provider;
    providerCount.set(p, (providerCount.get(p) || 0) + 1);
  });
  boards.push({
    title: 'Most models',
    sub: 'by provider',
    list: [...providerCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p, c]) => [prettyProvider(p), `${c} models`])
  });

  boards.forEach(b => {
    if (!b.list.length) return;
    const card = document.createElement('div');
    card.className = 'lb-card';
    card.innerHTML = `<div class="lb-head"><h3>${b.title}</h3><span class="lb-sub">${b.sub}</span></div>` +
      b.list.map(([n, v], idx) => `<div class="lb-row"><div class="lb-rank ${idx === 0 ? 'gold' : ''}">${String(idx + 1).padStart(2, '0')}</div><div class="lb-name" title="${escape(n)}">${escape(n)}</div><div class="lb-val">${escape(v)}</div></div>`).join('');
    // make rows clickable to open detail
    grid.appendChild(card);
    card.querySelectorAll('.lb-row').forEach((row, idx) => {
      const name = b.list[idx][0];
      if (state.all[name]) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => openDetail(name));
      }
    });
  });
}

/* ============ Calculator ============ */
function loadCalcModels() {
  try {
    const v = JSON.parse(localStorage.getItem('mb_calc') || 'null');
    if (v && v.models) {
      state.calc.models = v.models.filter(n => state.all[n]);
      if (v.input != null) state.calc.input = v.input;
      if (v.output != null) state.calc.output = v.output;
      if (v.calls != null) state.calc.calls = v.calls;
    }
  } catch (e) {}
  if (state.calc.models.length === 0) {
    // Pre-fill with 3 popular models if present
    ['gpt-4o', 'claude-3-5-sonnet-latest', 'gemini-2.0-flash'].forEach(n => {
      if (state.all[n] && state.calc.models.length < 3) state.calc.models.push(n);
    });
    // Fallback: just take 3 chat models
    if (state.calc.models.length === 0) {
      Object.entries(state.all).filter(([_, i]) => i.mode === 'chat' && i.input_cost_per_token).slice(0, 3).forEach(([n]) => state.calc.models.push(n));
    }
  }
}
function saveCalcModels() {
  try {
    localStorage.setItem('mb_calc', JSON.stringify({
      models: state.calc.models,
      input: state.calc.input, output: state.calc.output, calls: state.calc.calls
    }));
  } catch (e) {}
}

function renderCalc() {
  // sync inputs
  $('#calcIn').value = state.calc.input;
  $('#calcInNum').value = state.calc.input;
  $('#calcOut').value = state.calc.output;
  $('#calcOutNum').value = state.calc.output;
  $('#calcCalls').value = state.calc.calls;
  $('#calcCallsNum').value = state.calc.calls;

  // chips
  const chips = $('#calcModelChips');
  chips.innerHTML = '';
  state.calc.models.forEach(name => {
    const chip = document.createElement('span');
    chip.className = 'cm-chip';
    chip.innerHTML = `${escape(name)}<button>✕</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      state.calc.models = state.calc.models.filter(m => m !== name);
      saveCalcModels();
      renderCalc();
    });
    chips.appendChild(chip);
  });

  // results
  const results = state.calc.models.map(name => {
    const info = state.all[name];
    if (!info) return null;
    const inputCost = (info.input_cost_per_token || 0) * state.calc.input;
    const outputCost = (info.output_cost_per_token || 0) * state.calc.output;
    const perCall = inputCost + outputCost;
    const monthly = perCall * state.calc.calls;
    return { name, info, perCall, monthly, inputCost, outputCost };
  }).filter(Boolean).sort((a, b) => a.monthly - b.monthly);

  const rEl = $('#calcResults');
  if (results.length === 0) {
    rEl.innerHTML = `<div class="cr-empty">Add models to compare costs.</div>`;
    return;
  }
  const minCost = results[0].monthly;
  rEl.innerHTML = results.map(r => `
    <div class="cr-row ${r.monthly === minCost ? 'best' : ''}">
      <div>
        <div class="cr-name">${escape(r.name)}</div>
        <div class="cr-breakdown">in ${fmtMoney(r.inputCost * state.calc.calls)} · out ${fmtMoney(r.outputCost * state.calc.calls)} · ${fmtMoney(r.perCall)}/call</div>
      </div>
      <div></div>
      <div class="cr-total ${r.monthly === minCost ? 'best' : ''}">${fmtMoney(r.monthly)}</div>
    </div>
  `).join('');
}

/* ============ Matrix ============ */
function renderMatrix() {
  const caps = [
    ['supports_vision', 'Vision'],
    ['supports_function_calling', 'Tools'],
    ['supports_reasoning', 'Reasoning'],
    ['supports_prompt_caching', 'Caching'],
    ['supports_audio_input', 'Audio in'],
    ['supports_audio_output', 'Audio out'],
    ['supports_response_schema', 'Schema'],
    ['supports_web_search', 'Web search'],
    ['supports_pdf_input', 'PDF'],
    ['supports_system_messages', 'System msg'],
  ];
  // top 12 providers by count of chat models
  const providerCount = new Map();
  for (const [_, i] of Object.entries(state.all)) {
    if (i.mode !== 'chat') continue;
    const p = i.litellm_provider;
    if (!p) continue;
    providerCount.set(p, (providerCount.get(p) || 0) + 1);
  }
  const topProviders = [...providerCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(e => e[0]);

  // count cells
  const cell = {};
  for (const p of topProviders) {
    cell[p] = {};
    for (const [k] of caps) cell[p][k] = 0;
    cell[p].__total = 0;
  }
  for (const [_, i] of Object.entries(state.all)) {
    if (i.mode !== 'chat') continue;
    if (!cell[i.litellm_provider]) continue;
    cell[i.litellm_provider].__total++;
    for (const [k] of caps) if (i[k]) cell[i.litellm_provider][k]++;
  }

  const t = $('#matrixTable');
  let html = '<thead><tr><th class="col-h first">Provider</th><th class="col-h first" style="text-align:right;padding-right:8px;min-width:auto;">Models</th>';
  caps.forEach(([_, label]) => { html += `<th class="col-h">${label}</th>`; });
  html += '</tr></thead><tbody>';
  topProviders.forEach(p => {
    const tot = cell[p].__total;
    html += `<tr><th class="row-h">${prettyProvider(p)}</th>`;
    html += `<td style="background:transparent;font-family:var(--font-mono);font-size:11.5px;color:var(--muted);min-width:auto;cursor:default;">${tot}</td>`;
    caps.forEach(([k]) => {
      const c = cell[p][k];
      const pct = tot ? c / tot : 0;
      let cls = c === 0 ? 'zero' : pct > 0.75 ? 'l4' : pct > 0.5 ? 'l3' : pct > 0.25 ? 'l2' : 'l1';
      html += `<td class="${cls}" data-provider="${p}" data-cap="${k}" title="${c} of ${tot} ${prettyProvider(p)} models">${c}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';
  t.innerHTML = html;

  // Drilldown
  t.querySelectorAll('td[data-provider]').forEach(td => {
    td.addEventListener('click', () => {
      switchView('browse');
      state.provider = td.dataset.provider;
      $('#providerFilter').value = td.dataset.provider;
      const capKey = td.dataset.cap;
      // map cap key to chip if possible
      state.chips.clear();
      const chipMap = { supports_vision: 'vision', supports_function_calling: 'tools', supports_reasoning: 'reasoning', supports_prompt_caching: 'caching' };
      if (chipMap[capKey]) {
        state.chips.add(chipMap[capKey]);
        $$('.chip').forEach(c => c.classList.toggle('active', c.dataset.chip === chipMap[capKey]));
      } else {
        // generic: filter to chat models, the user will see
        state.mode = 'chat';
        $('#modeFilter').value = 'chat';
      }
      render();
    });
  });
}

/* ============ Tweaks panel ============ */
function applyTweaks(t) {
  state.tweaks = { ...state.tweaks, ...t };
  document.body.dataset.theme = state.tweaks.theme;
  document.body.dataset.density = state.tweaks.density;
  document.body.dataset.unit = state.tweaks.unit;
  document.body.dataset.accent = state.tweaks.accent;
  state.sortBy = state.tweaks.defaultSort || 'featured';
  $('#sortBy').value = state.sortBy;
  $('#tweakSort').value = state.sortBy;
  // sync seg-group active states
  $$('.seg-group').forEach(g => {
    const key = g.dataset.tweak;
    g.querySelectorAll('.seg, .swatch').forEach(b => {
      b.classList.toggle('active', b.dataset.value === state.tweaks[key]);
    });
  });
}

function setTweak(key, value) {
  state.tweaks[key] = value;
  try {
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: value } }, '*');
  } catch (e) {}
  applyTweaks(state.tweaks);
  render();
}

/* ============ Inline suggestions (under hero search) ============ */
function renderSuggest(forceShow = false) {
  const q = state.search.toLowerCase().trim();
  const el = $('#heroSuggest');
  if (!q && !forceShow) { el.hidden = true; return; }

  let list;
  if (!q) {
    list = Object.entries(state.all)
      .filter(([n]) => featuredScore(n) > 0)
      .sort((a, b) => featuredScore(b[0]) - featuredScore(a[0]))
      .slice(0, 8);
  } else {
    list = Object.entries(state.all)
      .filter(([n, i]) => n.toLowerCase().includes(q) || (i.litellm_provider || '').toLowerCase().includes(q))
      .slice(0, 10);
  }
  state.kbar.results = list;
  state.kbar.idx = 0;

  if (list.length === 0) {
    el.hidden = false;
    el.innerHTML = `<div class="hero-suggest-empty">No matches for "${escape(state.search)}".</div>`;
    return;
  }
  const header = !q ? `<div style="padding:8px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600;">Popular models</div>` : '';
  el.innerHTML = header + list.map(([n, i], idx) => {
    const inP = pricePerUnit(i.input_cost_per_token);
    return `<div class="kbar-row ${idx === 0 ? 'active' : ''}" data-idx="${idx}">
      <div class="kr-icon">⌘</div>
      <div>
        <div class="kr-name">${escape(n)}</div>
        <div class="kr-prov">${escape(prettyProvider(i.litellm_provider))}${i.mode ? ' · ' + i.mode : ''}</div>
      </div>
      <div class="kr-meta">${inP === null ? '' : fmtMoney(inP) + priceLabel().replace(/ /g, '')}</div>
    </div>`;
  }).join('') +
  `<div class="hero-suggest-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>⇧</kbd>+<kbd>↵</kbd> pin</span></div>`;
  el.hidden = false;
  el.querySelectorAll('.kbar-row').forEach(r => {
    r.addEventListener('mouseenter', () => {
      state.kbar.idx = parseInt(r.dataset.idx);
      refreshSuggestActive();
    });
    r.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const idx = parseInt(r.dataset.idx);
      const item = state.kbar.results[idx];
      if (item) openDetail(item[0]);
      $('#heroSuggest').hidden = true;
    });
  });
}
function refreshSuggestActive() {
  $$('#heroSuggest .kbar-row').forEach((r, i) => r.classList.toggle('active', i === state.kbar.idx));
  const active = $('#heroSuggest .kbar-row.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

/* ============ View routing ============ */
function switchView(v) {
  state.view = v;
  $$('.view').forEach(s => s.hidden = s.dataset.view !== v);
  $$('#navTabs .tab').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'leaderboards') renderLeaderboards();
  if (v === 'calculator') renderCalc();
  if (v === 'matrix') renderMatrix();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeAllModals() {
  $('#compareModal').hidden = true;
  $('#detailModal').hidden = true;
  $('#heroSuggest').hidden = true;
}

/* ============ Events ============ */
function initEvents() {
  // Nav tabs
  $('#navTabs').addEventListener('click', e => {
    const t = e.target.closest('.tab');
    if (t) switchView(t.dataset.view);
  });

  // Theme toggle
  $('#themeToggle').addEventListener('click', () => {
    setTweak('theme', state.tweaks.theme === 'dark' ? 'light' : 'dark');
  });

  // Search
  const search = $('#heroSearch');
  search.addEventListener('input', e => {
    state.search = e.target.value;
    $('#heroClear').classList.toggle('visible', !!state.search);
    render();
  });
  $('#heroClear').addEventListener('click', () => {
    search.value = ''; state.search = ''; $('#heroClear').classList.remove('visible'); render();
  });

  // Chips
  $('#heroChips').addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    const v = c.dataset.chip;
    if (state.chips.has(v)) state.chips.delete(v);
    else state.chips.add(v);
    c.classList.toggle('active');
    render();
  });

  // Selects
  $('#providerFilter').addEventListener('change', e => { state.provider = e.target.value; render(); });
  $('#modeFilter').addEventListener('change', e => { state.mode = e.target.value; render(); });
  $('#sortBy').addEventListener('change', e => { state.sortBy = e.target.value; render(); });

  // View switch
  $$('.view-switch .vs').forEach(b => b.addEventListener('click', () => {
    state.resultMode = b.dataset.mode;
    $$('.view-switch .vs').forEach(x => x.classList.toggle('active', x === b));
    render();
  }));

  // Empty reset
  $('#emptyReset').addEventListener('click', () => {
    state.search = ''; state.chips.clear(); state.provider = ''; state.mode = '';
    $('#heroSearch').value = ''; $('#providerFilter').value = ''; $('#modeFilter').value = '';
    $$('.chip').forEach(c => c.classList.remove('active'));
    render();
  });

  // Load more
  $('#loadMore').addEventListener('click', () => { state.page++; render(); });

  // Compare tray
  $('#ctOpen').addEventListener('click', openCompare);
  $('#ctClear').addEventListener('click', () => { state.pinned.clear(); savePinned(); render(); });

  // Modal close — close everything whenever a backdrop/close button is clicked
  document.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) {
      closeAllModals();
    }
  });
  // Safety net: clicking outside any modal panel closes everything
  document.addEventListener('mousedown', e => {
    const openModals = ['#compareModal', '#detailModal'].filter(s => !$(s).hidden);
    if (openModals.length === 0) return;
    if (e.target.closest('.modal-panel, .tweaks')) return;
    closeAllModals();
  });

  // Table header sort
  $$('.data-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      state.sortBy = th.dataset.sort;
      $('#sortBy').value = th.dataset.sort;
      render();
    });
  });

  // Leaderboard mode
  $$('.lb-mode-filter .seg').forEach(b => b.addEventListener('click', () => {
    state.lbMode = b.dataset.lbmode;
    $$('.lb-mode-filter .seg').forEach(x => x.classList.toggle('active', x === b));
    renderLeaderboards();
  }));

  // Calculator
  const syncCalc = () => { saveCalcModels(); renderCalc(); };
  $('#calcIn').addEventListener('input', e => { state.calc.input = +e.target.value; syncCalc(); });
  $('#calcInNum').addEventListener('input', e => { state.calc.input = +e.target.value || 0; syncCalc(); });
  $('#calcOut').addEventListener('input', e => { state.calc.output = +e.target.value; syncCalc(); });
  $('#calcOutNum').addEventListener('input', e => { state.calc.output = +e.target.value || 0; syncCalc(); });
  $('#calcCalls').addEventListener('input', e => { state.calc.calls = +e.target.value; syncCalc(); });
  $('#calcCallsNum').addEventListener('input', e => { state.calc.calls = +e.target.value || 0; syncCalc(); });
  $('#calcAddModel').addEventListener('click', () => {
    // simple prompt-based add
    const name = window.prompt('Model id to add (try `gpt-4o`, `claude-3-5-sonnet-latest`):');
    if (!name) return;
    if (!state.all[name]) { alert('No model called "' + name + '". Use the search to find exact id.'); return; }
    if (!state.calc.models.includes(name)) state.calc.models.push(name);
    saveCalcModels();
    renderCalc();
  });

  // Tweaks panel
  $$('.seg-group').forEach(g => {
    g.addEventListener('click', e => {
      const b = e.target.closest('.seg, .swatch');
      if (!b) return;
      const key = g.dataset.tweak;
      g.querySelectorAll('.seg, .swatch').forEach(x => x.classList.toggle('active', x === b));
      setTweak(key, b.dataset.value);
    });
  });
  $('#tweakSort').addEventListener('change', e => setTweak('defaultSort', e.target.value));
  $('#tweaksClose').addEventListener('click', () => {
    $('#tweaksPanel').hidden = true;
    try { window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); } catch (e) {}
  });

  // Search jump: focus inline hero search
  const focusHeroSearch = () => {
    switchView('browse');
    const s = $('#heroSearch');
    s.focus();
    s.select();
    s.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  $('#kbarTrigger').addEventListener('click', focusHeroSearch);
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); focusHeroSearch(); return; }
    if (e.key === 'Escape') closeAllModals();
  });

  // Edit-mode protocol (tweaks)
  window.addEventListener('message', e => {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === '__activate_edit_mode') {
      $('#tweaksPanel').hidden = false;
    }
    if (e.data.type === '__deactivate_edit_mode') {
      $('#tweaksPanel').hidden = true;
    }
  });
  // Announce after listener registered
  setTimeout(() => {
    try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch (e) {}
  }, 0);
}



/* ============ Boot ============ */
load().catch(err => {
  console.error(err);
  document.body.innerHTML = `<div style="padding:80px;text-align:center;color:var(--muted)">Failed to load model data. Serve over HTTP and reload.</div>`;
});
