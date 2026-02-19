const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 3210;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data', 'store.json');
const FINANCE = path.join(ROOT, 'data', 'finance_config.json');
const COMMERCIAL_QUOTES = path.join(ROOT, 'data', 'commercial_quotes.json');
const COMMERCIAL_PROJECTS = path.join(ROOT, 'data', 'commercial_projects.json');
const ACCOUNTS = path.join(ROOT, 'data', 'accounts.json');

function readAccounts() {
  try {
    if (!fs.existsSync(ACCOUNTS)) return [];
    return JSON.parse(fs.readFileSync(ACCOUNTS, 'utf8'));
  } catch { return []; }
}
const EVENTS = '/home/node/.openclaw/workspace/business/management/events/events.jsonl';
const ACTIONS = '/home/node/.openclaw/workspace/business/management/actions/open.jsonl';
const QUOTATIONS_DIR = '/home/node/.openclaw/workspace/business/quotations';
const PDF_OUTPUT_DIR = '/home/node/.openclaw/workspace/pdf-output';
const PUBLIC = path.join(ROOT, 'public');

function readActions() {
  if (!fs.existsSync(ACTIONS)) return [];
  return fs.readFileSync(ACTIONS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}
function writeActions(items) {
  fs.writeFileSync(ACTIONS, items.map(x => JSON.stringify(x)).join('\n') + '\n');
}
function appendEvent(evt) {
  try {
    fs.mkdirSync(path.dirname(EVENTS), { recursive: true });
    fs.appendFileSync(EVENTS, JSON.stringify({ eventId: `evt-${Date.now()}`, ts: now(), schemaVersion: 1, ...evt }) + '\n');
  } catch { }
}

function readCommercialQuotes() {
  try {
    if (!fs.existsSync(COMMERCIAL_QUOTES)) return [];
    const rows = JSON.parse(fs.readFileSync(COMMERCIAL_QUOTES, 'utf8'));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeCommercialQuotes(rows) {
  fs.mkdirSync(path.dirname(COMMERCIAL_QUOTES), { recursive: true });
  fs.writeFileSync(COMMERCIAL_QUOTES, JSON.stringify(rows, null, 2));
}

function readCommercialProjects() {
  try {
    if (!fs.existsSync(COMMERCIAL_PROJECTS)) return [];
    const rows = JSON.parse(fs.readFileSync(COMMERCIAL_PROJECTS, 'utf8'));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeCommercialProjects(rows) {
  fs.mkdirSync(path.dirname(COMMERCIAL_PROJECTS), { recursive: true });
  fs.writeFileSync(COMMERCIAL_PROJECTS, JSON.stringify(rows, null, 2));
}

function normalizeTelegramTag(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  return s.startsWith('@') ? s : `@${s}`;
}

function commercialTaskTitleForQuote(quote) {
  return `Seguimiento cotización ${quote.customer || 'Sin cliente'} · ${quote.quoteId}`;
}

function ensureCommercialFollowUpTask(quote) {
  const items = readActions();
  const owner = quote.requesterTelegramTag || quote.requesterName || quote.requesterTelegramId || 'Comercial';
  const dueDate = quote.validUntil || isoDay(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const title = commercialTaskTitleForQuote(quote);

  const idx = items.findIndex(t => String(t.linkedQuoteId || '') === String(quote.quoteId || ''));
  const base = {
    id: idx >= 0 ? items[idx].id : `COM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
    area: 'comercial',
    title,
    objective: `Hacer seguimiento comercial de la cotización ${quote.quoteId}`,
    owner,
    dueDate,
    status: 'in_progress',
    priority: 'alta',
    linkedQuoteId: quote.quoteId,
    quotePdfPath: quote.pdfPath,
    quotePdfUrl: quote.pdfUrl,
    quoteRequestedByTelegram: quote.requesterTelegramTag || quote.requesterTelegramId || '',
    nextCheckIn: isoDay(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)),
    evidence: idx >= 0 ? (items[idx].evidence || []) : [],
    blockers: idx >= 0 ? (items[idx].blockers || []) : [],
    createdAt: idx >= 0 ? items[idx].createdAt : now(),
    updatedAt: now()
  };

  items[idx >= 0 ? idx : items.length] = { ...(idx >= 0 ? items[idx] : {}), ...base };
  writeActions(items);
  return base.id;
}

function readEvents(limit = 2000) {
  if (!fs.existsSync(EVENTS)) return [];
  const lines = fs.readFileSync(EVENTS, 'utf8').split('\n').filter(Boolean);
  return lines.slice(-limit).map(l => JSON.parse(l));
}

const ACK_CHANNELS = new Set(['dm', 'consulting', 'roadmap']);
const ACK_DEADLINE_SEC = 60;
const ROLE_KEYS = ['AID', 'CFO', 'COO', 'CAO', 'CSO', 'COS'];

function detectRole(e) {
  const roleRaw = String((e.meta || {}).role || e.role || '').toUpperCase();
  if (ROLE_KEYS.includes(roleRaw)) return roleRaw;

  const s = String(e.source || '').toLowerCase();
  if (s.includes('aid')) return 'AID';
  if (s.includes('cfo') || s.includes('fin')) return 'CFO';
  if (s.includes('coo') || s.includes('ops')) return 'COO';
  if (s.includes('cao') || s.includes('admin')) return 'CAO';
  if (s.includes('cso') || s.includes('sec')) return 'CSO';
  if (s.includes('cos') || s.includes('staff')) return 'COS';
  return null;
}

function computeRoleDiscipline(events, strictThreshold = 85) {
  const nowMs = Date.now();
  const e24 = (events || []).filter(e => {
    const t = new Date(e.ts || 0).getTime();
    return t && (nowMs - t <= 24 * 60 * 60 * 1000);
  });

  const roleStats = {};
  for (const r of ROLE_KEYS) roleStats[r] = { role: r, total24h: 0, mutations24h: 0, ackRequired24h: 0, ackOnTime24h: 0, error24h: 0 };

  const ackByForId = {};
  for (const e of e24) {
    if (e.type === 'event_ack' && e.ackForEventId) ackByForId[e.ackForEventId] = e;
  }

  for (const e of e24) {
    const role = detectRole(e);
    if (!role) continue;
    const st = roleStats[role];
    st.total24h += 1;
    const typ = String(e.type || '');
    if (typ.includes('mutation') || typ.includes('note')) st.mutations24h += 1;
    if (typ.includes('error') || typ.includes('failed')) st.error24h += 1;

    if (e.type !== 'event_ack' && e.requireAck !== false && ACK_CHANNELS.has(String(e.channel || ''))) {
      st.ackRequired24h += 1;
      const ack = ackByForId[e.eventId];
      if (ack) {
        const tE = new Date(e.ts || 0).getTime();
        const tA = new Date(ack.ts || 0).getTime();
        if (tE && tA && (tA - tE) / 1000 <= ACK_DEADLINE_SEC && String(ack.status || 'delivered') !== 'failed') {
          st.ackOnTime24h += 1;
        }
      }
    }
  }

  const roles = {};
  for (const r of ROLE_KEYS) {
    const st = roleStats[r];
    const mutRate = st.total24h ? st.mutations24h / st.total24h : 1;
    const ackRate = st.ackRequired24h ? st.ackOnTime24h / st.ackRequired24h : 1;
    const errPenalty = st.total24h ? Math.min(1, st.error24h / st.total24h) : 0;
    const score = Math.max(0, Math.min(100, Math.round((0.45 * mutRate + 0.45 * ackRate + 0.10 * (1 - errPenalty)) * 100)));
    roles[r] = { ...st, score, strictMode: score < strictThreshold };
  }
  return { strictThreshold, roles, anyStrict: Object.values(roles).some(x => x.strictMode) };
}

function getStrictRuntimeState() {
  const d = computeRoleDiscipline(readEvents(5000), 85);
  const strictRoles = Object.entries(d.roles).filter(([, v]) => v.strictMode).map(([k]) => k);
  return { anyStrict: strictRoles.length > 0, strictRoles, strictThreshold: d.strictThreshold };
}

const USERS = {
  mark: { id: '1161247886', name: 'Mark', role: 'admin', password: process.env.MUZE_PM_PASS_MARK || 'mark2025' },
  christopher: { id: '1663239354', name: 'Christopher', role: 'editor', password: process.env.MUZE_PM_PASS_CHRIS || 'chris2025' },
  viewer: { id: 'viewer', name: 'Viewer', role: 'viewer', password: process.env.MUZE_PM_PASS_VIEWER || 'viewer2025' }
};

const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24;

function now() { return new Date().toISOString(); }
function isoDay(d = new Date()) { return d.toISOString().slice(0, 10); }

function readStore() {
  const s = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  s.tasks = s.tasks || [];
  s.users = s.users || [];
  s.projects = s.projects || [];
  s.taskUpdates = s.taskUpdates || [];
  s.auditLog = s.auditLog || [];
  s.taskNotes = s.taskNotes || [];
  return s;
}
function writeStore(store) { fs.writeFileSync(DATA, JSON.stringify(store, null, 2)); }

function send(res, code, body, type = 'application/json', extraHeaders = {}) {
  res.writeHead(code, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extraHeaders
  });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function parseBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', c => buf += c);
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve({}); } });
  });
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach(kv => {
    const i = kv.indexOf('=');
    if (i > -1) out[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim());
  });
  return out;
}

function getSession(req) {
  const sid = parseCookies(req).sid;
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  if (Date.now() > s.exp) { sessions.delete(sid); return null; }
  return s;
}

function requireAuth(req, res) {
  const s = getSession(req);
  if (!s) { send(res, 401, { error: 'UNAUTHENTICATED' }); return null; }
  return s;
}

function requireEditor(session, res) {
  if (!session || !['admin', 'editor'].includes(session.role)) {
    send(res, 403, { error: 'UNAUTHORIZED_EDITOR' });
    return false;
  }
  return true;
}

function audit(store, actorId, action, entity, before, after) {
  store.auditLog.push({ id: `a-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, ts: now(), actorId, action, entity, before, after });
}

function getTaskIdFromUrl(url, suffix = '') {
  const m = url.match(/^\/api\/tasks\/([^/]+)(?:\/([^?]+))?/);
  if (!m) return null;
  if (suffix && m[2] !== suffix) return null;
  return decodeURIComponent(m[1]);
}

function weekWindow() {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
  start.setUTCHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  if (req.url === '/api/login' && req.method === 'POST') {
    const body = await parseBody(req);
    const username = String(body.username || '').toLowerCase();
    const password = String(body.password || '');
    const u = USERS[username];
    if (!u || u.password !== password) return send(res, 401, { error: 'INVALID_CREDENTIALS' });
    const sid = crypto.randomBytes(24).toString('hex');
    sessions.set(sid, { id: u.id, name: u.name, role: u.role, exp: Date.now() + SESSION_TTL_MS });
    return send(res, 200, { ok: true, user: { id: u.id, name: u.name, role: u.role } }, 'application/json', {
      'Set-Cookie': `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
    });
  }

  if (req.url === '/api/logout' && req.method === 'POST') {
    const sid = parseCookies(req).sid;
    if (sid) sessions.delete(sid);
    return send(res, 200, { ok: true }, 'application/json', { 'Set-Cookie': 'sid=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax' });
  }

  if (req.url === '/api/me' && req.method === 'GET') {
    const s = getSession(req);
    if (!s) return send(res, 401, { error: 'UNAUTHENTICATED' });
    return send(res, 200, { user: { id: s.id, name: s.name, role: s.role } });
  }

  let session = null;
  if (req.url.startsWith('/api/')) {
    session = requireAuth(req, res);
    if (!session) return;
  }

  if (req.url.startsWith('/api/finance/config') && req.method === 'GET') {
    try {
      const cfg = fs.existsSync(FINANCE) ? JSON.parse(fs.readFileSync(FINANCE, 'utf8')) : {};
      return send(res, 200, cfg);
    } catch (e) {
      return send(res, 500, { error: 'FINANCE_CONFIG_READ_FAILED', detail: String(e.message || e) });
    }
  }

  if (req.url.startsWith('/api/finance/config') && req.method === 'PATCH') {
    if (!requireEditor(session, res)) return;
    const body = await parseBody(req);
    try {
      const strict = getStrictRuntimeState();
      if (strict.anyStrict && body?.allowStrictOverride !== true) {
        return send(res, 423, { error: 'STRICT_MODE_ACTIVE', strictRoles: strict.strictRoles, blockedAction: 'finance_config_patch' });
      }
      const cfg = fs.existsSync(FINANCE) ? JSON.parse(fs.readFileSync(FINANCE, 'utf8')) : {};
      const next = { ...cfg, ...body, updatedAt: now() };
      fs.writeFileSync(FINANCE, JSON.stringify(next, null, 2));
      return send(res, 200, { ok: true, config: next });
    } catch (e) {
      return send(res, 500, { error: 'FINANCE_CONFIG_PATCH_FAILED', detail: String(e.message || e) });
    }
  }

  if ((req.url.startsWith('/api/finance-summary') || req.url.startsWith('/api/finance/summary')) && req.method === 'GET') {
    let cfg = {
      scope: 'cermaq_only', month: isoDay().slice(0, 7), revenues: [], ivaCreditoEstimado: 0,
      costsDirect: [], operatingExpenses: [], annualTax: { regime: 'Pro Pyme General (14D)', idpcRate: 0.25 }
    };
    try {
      if (fs.existsSync(FINANCE)) cfg = JSON.parse(fs.readFileSync(FINANCE, 'utf8'));
    } catch { }

    const revenues = (cfg.revenues || []).filter(r => {
      if (cfg.scope === 'cermaq_only') return String(r.customer || '').toUpperCase().includes('CERMAQ');
      return true;
    });
    const netRevenue = revenues.reduce((a, x) => a + Number(x.net || 0), 0);
    const ivaDebito = revenues.reduce((a, x) => a + Number(x.iva || 0), 0);
    const ivaCredito = Number(cfg.ivaCreditoEstimado || 0);
    const ivaPorPagarEstimado = Math.max(0, ivaDebito - ivaCredito);

    const totalCostosDirectos = (cfg.costsDirect || []).reduce((a, x) => a + Number(x.monthlyAmount || 0), 0);
    const totalGastosOperativos = (cfg.operatingExpenses || []).reduce((a, x) => a + Number(x.monthlyAmount || 0), 0);
    const totalHonorarios = (cfg.honorarios || []).reduce((a, x) => a + Number(x.monthlyAmount || 0), 0);
    const totalBonosExtraordinarios = (cfg.bonosExtraordinarios || []).reduce((a, x) => a + Number(x.amount || 0), 0);
    const utilidadMensualAntesImpuesto = netRevenue - totalCostosDirectos - totalGastosOperativos - totalHonorarios - totalBonosExtraordinarios;

    const idpcRate = Number((cfg.annualTax || {}).idpcRate || 0.25);
    const utilidadAnualRunRate = Math.max(0, utilidadMensualAntesImpuesto * 12);
    const impuestoAnualEstimado = utilidadAnualRunRate * idpcRate;
    const reservaImpuestoMensual = Math.max(0, utilidadMensualAntesImpuesto * idpcRate);
    const utilidadMensualEstimada = utilidadMensualAntesImpuesto - reservaImpuestoMensual;
    const margenNetoPct = netRevenue > 0 ? (utilidadMensualEstimada / netRevenue) * 100 : 0;

    const openingBalance = Number((cfg.cash || {}).openingBalance || 0);
    const minimumTarget = Number((cfg.cash || {}).minimumTarget || 0);
    const cajaEstimadaFinMes = openingBalance + utilidadMensualEstimada - ivaPorPagarEstimado;
    const health = cajaEstimadaFinMes >= minimumTarget ? 'green' : (cajaEstimadaFinMes >= minimumTarget * 0.7 ? 'yellow' : 'red');

    const byProject = {};
    for (const r of revenues) {
      const key = r.project || 'Sin proyecto';
      if (!byProject[key]) byProject[key] = { project: key, net: 0, iva: 0, total: 0, directCost: 0 };
      byProject[key].net += Number(r.net || 0);
      byProject[key].iva += Number(r.iva || 0);
      byProject[key].total += Number(r.total || 0);
    }
    for (const c of (cfg.costsDirect || [])) {
      const key = c.project || 'Sin proyecto';
      if (!byProject[key]) byProject[key] = { project: key, net: 0, iva: 0, total: 0, directCost: 0 };
      byProject[key].directCost += Number(c.monthlyAmount || 0);
    }

    return send(res, 200, {
      scope: cfg.scope || 'cermaq_only',
      month: cfg.month || isoDay().slice(0, 7),
      regime: (cfg.annualTax || {}).regime || 'Pro Pyme General (14D)',
      idpcRate,
      revenues,
      ivaDebito,
      ivaCreditoEstimado: ivaCredito,
      ivaPorPagarEstimado,
      costsDirect: cfg.costsDirect || [],
      operatingExpenses: cfg.operatingExpenses || [],
      honorarios: cfg.honorarios || [],
      bonosExtraordinarios: cfg.bonosExtraordinarios || [],
      totalCostosDirectos,
      totalGastosOperativos,
      totalHonorarios,
      totalBonosExtraordinarios,
      reservaImpuestoMensual,
      utilidadMensualAntesImpuesto,
      utilidadMensualEstimada,
      margenNetoPct,
      impuestoAnualEstimado,
      openingBalance,
      minimumTarget,
      cajaEstimadaFinMes,
      health,
      byProject: Object.values(byProject)
    });
  }

  if (req.url.startsWith('/api/events') && req.method === 'GET') {
    try {
      if (!fs.existsSync(EVENTS)) return send(res, 200, { events: [] });
      const lines = fs.readFileSync(EVENTS, 'utf8').split('\n').filter(Boolean);
      const events = lines.slice(-200).map(l => JSON.parse(l));
      return send(res, 200, { events });
    } catch (e) {
      return send(res, 500, { error: 'EVENTS_READ_FAILED', detail: String(e.message || e) });
    }
  }

  if (req.url.startsWith('/api/discipline-score') && req.method === 'GET') {
    try {
      if (!fs.existsSync(EVENTS)) return send(res, 200, { score: 0, bySource: {}, counts: { total24h: 0 } });
      const nowMs = Date.now();
      const lines = fs.readFileSync(EVENTS, 'utf8').split('\n').filter(Boolean);
      const events = lines.map(l => JSON.parse(l)).filter(e => {
        const t = new Date(e.ts || 0).getTime();
        return t && (nowMs - t <= 24 * 60 * 60 * 1000);
      });

      const bySource = {};
      let mutations = 0;
      for (const e of events) {
        const s = e.source || 'unknown';
        bySource[s] = (bySource[s] || 0) + 1;
        if (String(e.type || '').includes('mutation') || String(e.type || '').includes('note')) mutations++;
      }
      const score = Math.min(100, Math.round((mutations / Math.max(1, events.length)) * 100));
      return send(res, 200, { score, bySource, counts: { total24h: events.length, mutations24h: mutations } });
    } catch (e) {
      return send(res, 500, { error: 'DISCIPLINE_SCORE_FAILED', detail: String(e.message || e) });
    }
  }

  if (req.url.startsWith('/api/role-discipline') && req.method === 'GET') {
    try {
      return send(res, 200, computeRoleDiscipline(readEvents(5000), 85));
    } catch (e) {
      return send(res, 500, { error: 'ROLE_DISCIPLINE_FAILED', detail: String(e.message || e) });
    }
  }

  if (req.url.startsWith('/api/strict-mode') && req.method === 'GET') {
    try {
      const d = computeRoleDiscipline(readEvents(5000), 85);
      return send(res, 200, { strictThreshold: d.strictThreshold, roles: Object.fromEntries(Object.entries(d.roles).map(([k, v]) => [k, { score: v.score, strictMode: v.strictMode }])), anyStrict: d.anyStrict });
    } catch (e) {
      return send(res, 500, { error: 'STRICT_MODE_FAILED', detail: String(e.message || e) });
    }
  }

  if (req.url.startsWith('/api/discipline-summary') && req.method === 'GET') {
    try {
      let events = [];
      if (fs.existsSync(EVENTS)) {
        events = fs.readFileSync(EVENTS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
      }
      const last24 = Date.now() - 24 * 60 * 60 * 1000;
      const e24 = events.filter(e => {
        const t = Date.parse(e.ts || '');
        return Number.isFinite(t) ? t >= last24 : false;
      });
      const byType = {};
      const bySource = {};
      e24.forEach(e => {
        byType[e.type || 'unknown'] = (byType[e.type || 'unknown'] || 0) + 1;
        bySource[e.source || 'unknown'] = (bySource[e.source || 'unknown'] || 0) + 1;
      });
      return send(res, 200, {
        window: '24h',
        totalEvents: e24.length,
        byType,
        bySource,
        latestEventTs: e24.length ? e24[e24.length - 1].ts : null
      });
    } catch (e) {
      return send(res, 500, { error: 'DISCIPLINE_SUMMARY_FAILED', detail: String(e.message || e) });
    }
  }

  if (req.url.startsWith('/api/events') && !req.url.startsWith('/api/events/ack') && req.method === 'POST') {
    if (!requireEditor(session, res)) return;
    const body = await parseBody(req);
    try {
      const channel = body.channel || 'system';
      const requireAck = ACK_CHANNELS.has(channel) ? (body.requireAck !== false) : false;
      const evt = {
        eventId: body.eventId || `evt-${Date.now()}`,
        ts: body.ts || now(),
        schemaVersion: 1,
        source: body.source || 'system',
        channel,
        type: body.type || 'event',
        entityId: body.entityId || '',
        requireAck,
        before: body.before ?? null,
        after: body.after ?? null,
        meta: body.meta || {}
      };
      fs.mkdirSync(path.dirname(EVENTS), { recursive: true });
      fs.appendFileSync(EVENTS, JSON.stringify(evt) + '\n');
      return send(res, 201, { ok: true, event: evt });
    } catch (e) {
      return send(res, 500, { error: 'EVENT_APPEND_FAILED', detail: String(e.message || e) });
    }
  }

  if (req.url.startsWith('/api/events/ack') && req.method === 'POST') {
    if (!requireEditor(session, res)) return;
    const body = await parseBody(req);
    try {
      if (!body.ackForEventId) return send(res, 400, { error: 'ACK_FOR_EVENT_ID_REQUIRED' });
      const ack = {
        eventId: `evt-${Date.now()}`,
        ts: now(),
        schemaVersion: 1,
        source: body.source || 'system',
        channel: body.channel || 'system',
        type: 'event_ack',
        ackForEventId: body.ackForEventId,
        status: body.status || 'delivered',
        meta: body.meta || {}
      };
      fs.mkdirSync(path.dirname(EVENTS), { recursive: true });
      fs.appendFileSync(EVENTS, JSON.stringify(ack) + '\n');
      return send(res, 201, { ok: true, ack });
    } catch (e) {
      return send(res, 500, { error: 'EVENT_ACK_FAILED', detail: String(e.message || e) });
    }
  }

  if (req.url.startsWith('/api/consistency-health') && req.method === 'GET') {
    try {
      const events = readEvents(5000);
      const channels = ['dm', 'consulting', 'roadmap', 'system'];
      const nowMs = Date.now();
      const byChannel = {};
      for (const ch of channels) byChannel[ch] = { lastEventTs: null, lagSec: null, ok60s: false, ack24h: 0, pendingAckOverdue: 0 };

      const eventById = {};
      const acked = new Set();
      for (const e of events) {
        const ch = String(e.channel || 'system');
        const t = new Date(e.ts || 0).getTime();
        if (e.eventId) eventById[e.eventId] = e;
        if (!byChannel[ch]) continue;
        if (t && (!byChannel[ch].lastEventTs || t > new Date(byChannel[ch].lastEventTs).getTime())) byChannel[ch].lastEventTs = e.ts;
        if (e.type === 'event_ack') {
          const in24h = t && (nowMs - t <= 24 * 60 * 60 * 1000);
          if (in24h) byChannel[ch].ack24h += 1;
          if (e.status !== 'failed' && e.ackForEventId) acked.add(String(e.ackForEventId));
        }
      }

      const overdue = [];
      for (const e of events) {
        const ch = String(e.channel || 'system');
        if (!ACK_CHANNELS.has(ch)) continue;
        if (e.type === 'event_ack') continue;
        if (e.requireAck === false) continue;
        if (!e.eventId) continue;
        if (acked.has(String(e.eventId))) continue;
        const t = new Date(e.ts || 0).getTime();
        if (!t) continue;
        const ageSec = Math.max(0, Math.floor((nowMs - t) / 1000));
        if (ageSec > ACK_DEADLINE_SEC) {
          overdue.push({ eventId: e.eventId, channel: ch, ageSec, type: e.type || 'event', entityId: e.entityId || '' });
          if (byChannel[ch]) byChannel[ch].pendingAckOverdue += 1;
        }
      }

      for (const ch of channels) {
        const last = byChannel[ch].lastEventTs;
        if (!last) continue;
        const lagSec = Math.max(0, Math.floor((nowMs - new Date(last).getTime()) / 1000));
        byChannel[ch].lagSec = lagSec;
        byChannel[ch].ok60s = lagSec <= 60;
      }

      const consistencyOk = channels.every(ch => (byChannel[ch].ok60s || byChannel[ch].lastEventTs === null))
        && overdue.length === 0;
      return send(res, 200, { consistencyOk, sloSec: 60, ackDeadlineSec: ACK_DEADLINE_SEC, overdueAckCount: overdue.length, overdueAcks: overdue.slice(0, 30), byChannel });
    } catch (e) {
      return send(res, 500, { error: 'CONSISTENCY_HEALTH_FAILED', detail: String(e.message || e) });
    }
  }

  if (req.url.startsWith('/api/commercial/projects') && req.method === 'GET') {
    const projects = readCommercialProjects().sort((a, b) => String((a.customer || '') + (a.name || '')).localeCompare(String((b.customer || '') + (b.name || ''))));
    return send(res, 200, { projects });
  }

  if (req.url.startsWith('/api/commercial/projects') && req.method === 'POST') {
    if (!requireEditor(session, res)) return;
    const body = await parseBody(req);
    const projectId = String(body.projectId || `CP-${Date.now()}`);
    const row = {
      projectId,
      customer: String(body.customer || 'Sin cliente'),
      name: String(body.name || body.project || 'Proyecto comercial'),
      owner: String(body.owner || 'Comercial'),
      stage: String(body.stage || 'negotiation'),
      amount: body.amount ?? null,
      currency: String(body.currency || 'CLP'),
      updatedAt: now(),
      createdAt: body.createdAt || now(),
      notes: String(body.notes || '')
    };
    const rows = readCommercialProjects();
    const idx = rows.findIndex(x => String(x.projectId) === projectId);
    if (idx >= 0) rows[idx] = { ...rows[idx], ...row, createdAt: rows[idx].createdAt || row.createdAt };
    else rows.push(row);
    writeCommercialProjects(rows);
    appendEvent({ source: 'api', channel: 'roadmap', type: 'commercial_project_mutation', entityId: projectId, after: row });
    return send(res, 201, { ok: true, project: row });
  }

  if (req.url.startsWith('/api/commercial/quotes') && req.method === 'GET') {
    const quotes = readCommercialQuotes().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return send(res, 200, { quotes });
  }

  if (req.url.startsWith('/api/commercial/quotes') && req.method === 'POST') {
    if (!requireEditor(session, res)) return;
    const body = await parseBody(req);
    const quoteId = String(body.quoteId || `Q-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`);
    const pdfPathRaw = String(body.pdfPath || '').trim();

    if (!pdfPathRaw) return send(res, 400, { error: 'PDF_PATH_REQUIRED' });

    const candidates = [
      pdfPathRaw,
      path.join(QUOTATIONS_DIR, pdfPathRaw),
      path.join(PDF_OUTPUT_DIR, pdfPathRaw)
    ];
    const resolvedPdfPath = candidates.find(p => fs.existsSync(p));
    if (!resolvedPdfPath) return send(res, 404, { error: 'PDF_NOT_FOUND', pdfPath: pdfPathRaw });

    const requesterTelegramTag = normalizeTelegramTag(body.requesterTelegramTag || body.requestedByTelegramTag || '');
    const requesterTelegramId = String(body.requesterTelegramId || body.requestedByTelegramId || '');
    const requesterName = String(body.requesterName || body.requestedByName || body.requestedBy || '').trim();

    const quote = {
      quoteId,
      sourceModule: String(body.sourceModule || body.source || 'roadmap'),
      createdAt: now(),
      updatedAt: now(),
      customer: String(body.customer || 'Sin cliente'),
      project: String(body.project || body.opportunity || ''),
      amount: body.amount ?? null,
      currency: String(body.currency || 'CLP'),
      validUntil: body.validUntil || null,
      status: String(body.status || 'quote_sent'),
      followUpStatus: String(body.followUpStatus || 'pending_followup'),
      requesterTelegramTag,
      requesterTelegramId,
      requesterName,
      pdfPath: resolvedPdfPath,
      pdfName: path.basename(resolvedPdfPath),
      pdfUrl: `/files/quotations/${encodeURIComponent(path.basename(resolvedPdfPath))}`,
      notes: String(body.notes || '')
    };

    const rows = readCommercialQuotes();
    const idx = rows.findIndex(x => String(x.quoteId) === quoteId);
    if (idx >= 0) {
      quote.createdAt = rows[idx].createdAt || quote.createdAt;
      rows[idx] = { ...rows[idx], ...quote, updatedAt: now() };
    } else {
      rows.push(quote);
    }
    writeCommercialQuotes(rows);

    const followUpTaskId = ensureCommercialFollowUpTask(quote);
    appendEvent({
      source: quote.sourceModule || 'roadmap',
      channel: quote.sourceModule === 'dm' ? 'dm' : 'roadmap',
      type: 'quote_mutation',
      entityId: quote.quoteId,
      after: { ...quote, followUpTaskId }
    });

    return send(res, 201, { ok: true, quote, followUpTaskId });
  }

  if (req.url.startsWith('/api/commercial-summary') && req.method === 'GET') {
    let tasks = [];
    try {
      if (fs.existsSync(ACTIONS)) {
        const lines = fs.readFileSync(ACTIONS, 'utf8').split('\n').filter(Boolean);
        tasks = lines.map(l => JSON.parse(l)).filter(t => ['comercial', 'ventas', 'sales'].includes(String(t.area || '').toLowerCase()) || /cotiz|propuesta|comercial|discovery|negoci/i.test(String(t.title || '') + ' ' + String(t.objective || '')));
      }
    } catch { }

    let quotes = [];
    try {
      const files = [];
      for (const dir of [QUOTATIONS_DIR, PDF_OUTPUT_DIR]) {
        if (!fs.existsSync(dir)) continue;
        fs.readdirSync(dir)
          .filter(n => n.endsWith('.pdf'))
          .forEach(n => {
            const p = path.join(dir, n);
            const st = fs.statSync(p);
            files.push({ name: n, mtime: st.mtime.toISOString(), pdfUrl: `/files/quotations/${encodeURIComponent(n)}` });
          });
      }
      quotes = files.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime))).slice(0, 50);
    } catch { }

    const quoteRegistry = readCommercialQuotes().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 100);

    const inferStage = (t) => {
      const txt = `${t.title || ''} ${t.objective || ''}`.toLowerCase();
      if (/pago recibido|cobrado/.test(txt)) return 'payment_received';
      if (/factura/.test(txt)) return 'invoice_sent';
      if (/\boc\b|orden de compra/.test(txt)) return 'po_received';
      if (/aceptaci/.test(txt)) return 'accepted';
      if (/cotiz|quote|propuesta/.test(txt)) return 'quote_sent';
      return 'negotiation';
    };

    const stageCounts = { negotiation: 0, quote_sent: 0, accepted: 0, po_received: 0, invoice_sent: 0, payment_received: 0 };
    tasks.forEach(t => stageCounts[inferStage(t)] = (stageCounts[inferStage(t)] || 0) + 1);

    const counts = {
      open: tasks.filter(t => t.status !== 'done').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      won: tasks.filter(t => t.status === 'done').length
    };

    const totalPipeline = Math.max(1, counts.open + counts.won);
    const conversionRate = Math.round((counts.won / totalPipeline) * 100);

    const projects = readCommercialProjects();
    const accounts = readAccounts();
    const byCustomer = {};
    
    // Group projects by account/customer
    for (const p of projects) {
      const acc = accounts.find(a => a.accountId === p.accountId) || { name: p.customer || 'Sin cliente' };
      const custName = acc.name;
      if (!byCustomer[custName]) byCustomer[custName] = { customer: custName, account: acc, projects: [] };
      byCustomer[custName].projects.push({ ...p, tasks: [], quotes: [] });
    }

    const inferProjectKey = (txt = '') => {
      const s = String(txt).toLowerCase();
      if (s.includes('comex')) return 'cermaq-comex';
      if (s.includes('monday')) return 'cermaq-monday-implementacion';
      if (s.includes('desarrollo')) return 'cermaq-desarrollo';
      if (s.includes('cermaq')) return 'cermaq-desarrollo';
      return null;
    };

    // Helper to find project in nested structure
    const findProj = (key) => {
      for (const c of Object.values(byCustomer)) {
        const found = c.projects.find(p => p.projectId === key);
        if (found) return found;
      }
      return null;
    };

    for (const t of tasks) {
      const key = inferProjectKey(`${t.title || ''} ${t.objective || ''}`);
      const target = findProj(key);
      if (target) target.tasks.push({ id: t.id, title: t.title, status: t.status, stage: inferStage(t), dueDate: t.dueDate, owner: t.owner });
    }
    for (const q of quoteRegistry) {
      const key = inferProjectKey(`${q.project || ''} ${q.customer || ''}`);
      const target = findProj(key);
      if (target) target.quotes.push({ quoteId: q.quoteId, pdfUrl: q.pdfUrl, requesterTelegramTag: q.requesterTelegramTag, createdAt: q.createdAt });
    }

    const hierarchy = Object.values(byCustomer).map(c => {
      c.projects = c.projects.map(p => {
        const stages = p.tasks.map(t => t.stage);
        const stage = stages.includes('payment_received') ? 'payment_received'
          : stages.includes('invoice_sent') ? 'invoice_sent'
            : stages.includes('po_received') ? 'po_received'
              : stages.includes('accepted') ? 'accepted'
                : stages.includes('quote_sent') ? 'quote_sent'
                  : (p.stage || 'negotiation');
        return { ...p, stage };
      });
      return c;
    });

    return send(res, 200, {
      counts,
      stageCounts,
      conversionRate,
      tasks: tasks.slice(0, 150).map(t => ({ id: t.id, title: t.title, owner: t.owner, dueDate: t.dueDate, status: t.status, stage: inferStage(t), linkedQuoteId: t.linkedQuoteId || null })),
      quotes,
      quoteRegistry,
      hierarchy
    });
  }

  if (req.url.startsWith('/api/os-summary') && req.method === 'GET') {
    const s = readStore();
    const counts = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
    s.tasks.forEach(t => counts[t.status] = (counts[t.status] || 0) + 1);

    let lastEventTs = null;
    let eventsCount = 0;
    try {
      if (fs.existsSync(EVENTS)) {
        const lines = fs.readFileSync(EVENTS, 'utf8').split('\n').filter(Boolean);
        eventsCount = lines.length;
        if (lines.length) {
          const evt = JSON.parse(lines[lines.length - 1]);
          lastEventTs = evt.ts || null;
        }
      }
    } catch { }

    let lagSec = null;
    try {
      if (lastEventTs) lagSec = Math.max(0, Math.floor((Date.now() - new Date(lastEventTs).getTime()) / 1000));
    } catch { }

    let health = 'warn';
    if (lastEventTs && lagSec !== null) {
      if (lagSec <= 300) health = 'ok';
      else if (lagSec <= 1800) health = 'degraded';
      else health = 'idle';
    }

    const pipelineHealthy = Boolean(lastEventTs);
    return send(res, 200, { counts, lastEventTs, lagSec, eventsCount, health, pipelineHealthy });
  }

  if (req.url.startsWith('/api/summary') && req.method === 'GET') {
    try {
      execSync('python3 /home/node/.openclaw/workspace/business/management/scripts/workflow_engine.py', { stdio: 'pipe' });
      execSync('python3 /home/node/.openclaw/workspace/research/muze-pm-lite/scripts/sync_actions_to_store.py', { stdio: 'pipe' });
    } catch (_) { }
    const s = readStore();
    const counts = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
    s.tasks.forEach(t => counts[t.status] = (counts[t.status] || 0) + 1);
    return send(res, 200, { counts, projects: s.projects, users: s.users, tasks: s.tasks.slice(-500) });
  }

  // read-only from web UI create endpoint remains disabled
  if (req.url === '/api/tasks' && req.method === 'POST') {
    return send(res, 403, { error: 'READ_ONLY_MODE', note: 'Create via workflow/chat or API mutation policy.' });
  }

  // Task timeline notes
  const noteTaskId = getTaskIdFromUrl(req.url, 'notes');
  if (noteTaskId && req.method === 'GET') {
    const s = readStore();
    const notes = (s.taskNotes || []).filter(n => n.taskId === noteTaskId).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    return send(res, 200, { taskId: noteTaskId, notes });
  }
  if (noteTaskId && req.method === 'POST') {
    if (!requireEditor(session, res)) return;
    const body = await parseBody(req);
    const s = readStore();
    const t = s.tasks.find(x => x.id === noteTaskId);
    if (!t) return send(res, 404, { error: 'TASK_NOT_FOUND' });
    const note = {
      id: `n-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      taskId: noteTaskId,
      ts: now(),
      actorId: String(body.actorId || session.id || ''),
      actorName: String(body.actorName || session.name || ''),
      type: ['update', 'commitment', 'blocker', 'decision', 'evidence'].includes(body.type) ? body.type : 'update',
      text: String(body.text || '').slice(0, 5000),
      nextCheckDate: body.nextCheckDate || null,
      source: body.source || 'manual'
    };
    s.taskNotes.push(note);
    appendEvent({ source: "api", type: "task_note_add", entityId: noteTaskId, after: note });
    t.updatedAt = now();
    if (note.nextCheckDate) t.nextCheckDate = note.nextCheckDate;
    audit(s, note.actorId || session.id, 'TASK_NOTE_ADD', `task:${noteTaskId}`, null, note);
    writeStore(s);
    return send(res, 201, note);
  }

  if (req.url === '/api/weekly-summary' && req.method === 'GET') {
    const s = readStore();
    const w = weekWindow();
    const inRange = (ts) => ts && ts >= w.start && ts <= w.end;
    const byOwner = {};

    s.tasks.forEach(t => {
      const k = t.ownerId || 'unassigned';
      if (!byOwner[k]) byOwner[k] = { ownerId: k, total: 0, done: 0, overdue: 0, blocked: 0 };
      byOwner[k].total += 1;
      if (t.status === 'done') byOwner[k].done += 1;
      if (t.status === 'blocked') byOwner[k].blocked += 1;
      if (t.dueDate && t.dueDate < isoDay() && t.status !== 'done') byOwner[k].overdue += 1;
    });

    const notes = (s.taskNotes || []).filter(n => inRange(n.ts));
    return send(res, 200, {
      window: w,
      owners: Object.values(byOwner).sort((a, b) => b.overdue - a.overdue || b.total - a.total),
      notesCount: notes.length,
      commitments: notes.filter(n => n.type === 'commitment').length,
      blockers: notes.filter(n => n.type === 'blocker').length
    });
  }

  if (req.url.startsWith('/api/tasks') && req.method === 'GET') {
    const reqPath = req.url.split('?')[0];
    const parts = reqPath.split('/').filter(Boolean); // api tasks :id?
    const items = readActions();
    if (parts.length === 2) {
      return send(res, 200, { tasks: items });
    }
    if (parts.length === 3) {
      const id = decodeURIComponent(parts[2]);
      const t = items.find(x => x.id === id);
      if (!t) return send(res, 404, { error: 'TASK_NOT_FOUND' });
      return send(res, 200, t);
    }
  }

  if (req.url.startsWith('/api/tasks/') && req.method === 'PATCH') {
    if (!requireEditor(session, res)) return;
    const reqPath = req.url.split('?')[0];
    const id = decodeURIComponent(reqPath.split('/')[3] || '');
    const body = await parseBody(req);

    const strict = getStrictRuntimeState();
    if (strict.anyStrict) {
      const allowedInStrict = ['status', 'addEvidence', 'nextCheckIn'];
      const touched = Object.keys(body || {}).filter(k => body[k] !== undefined);
      const disallowed = touched.filter(k => !allowedInStrict.includes(k));
      if (disallowed.length && body?.allowStrictOverride !== true) {
        return send(res, 423, {
          error: 'STRICT_MODE_ACTIVE',
          strictRoles: strict.strictRoles,
          blockedAction: 'task_patch',
          allowedInStrict,
          disallowedKeys: disallowed
        });
      }
    }

    const items = readActions();
    const idx = items.findIndex(x => x.id === id);
    if (idx < 0) return send(res, 404, { error: 'TASK_NOT_FOUND' });
    const before = { ...items[idx] };
    const t = items[idx];
    ['title', 'objective', 'owner', 'dueDate', 'status', 'priority', 'nextCheckIn', 'area'].forEach(k => { if (body[k] !== undefined) t[k] = body[k]; });
    if (body.addEvidence) t.evidence = [...(t.evidence || []), body.addEvidence];
    if (body.addBlocker) t.blockers = [...(t.blockers || []), body.addBlocker];
    t.updatedAt = now();
    items[idx] = t;
    writeActions(items);
    try { execSync('python3 /home/node/.openclaw/workspace/business/management/scripts/workflow_engine.py', { stdio: 'pipe' }); } catch { }
    try { execSync('python3 /home/node/.openclaw/workspace/research/muze-pm-lite/scripts/sync_actions_to_store.py', { stdio: 'pipe' }); } catch { }
    appendEvent({ source: 'api', type: 'task_mutation', entityId: id, before, after: t });
    return send(res, 200, { ok: true, task: t });
  }

  if (req.url === '/api/updates' && req.method === 'GET') return send(res, 200, readStore().taskUpdates.slice(-200));
  if (req.url === '/api/audit' && req.method === 'GET') return send(res, 200, readStore().auditLog.slice(-300));

  if (req.url === '/api/sync-actions' && req.method === 'POST') {
    if (!requireEditor(session, res)) return;
    try {
      const out = execSync('python3 /home/node/.openclaw/workspace/research/muze-pm-lite/scripts/sync_actions_to_store.py', { stdio: 'pipe' }).toString();
      return send(res, 200, { ok: true, output: out.trim() });
    } catch (e) {
      return send(res, 500, { error: 'SYNC_FAILED', detail: String(e.message || e) });
    }
  }

  if (req.url.startsWith('/files/quotations/') && req.method === 'GET') {
    const filename = decodeURIComponent(req.url.split('?')[0].replace('/files/quotations/', ''));
    const fromBusiness = path.join(QUOTATIONS_DIR, filename);
    const fromPdfOutput = path.join(PDF_OUTPUT_DIR, filename);
    const filePath = fs.existsSync(fromBusiness) ? fromBusiness : (fs.existsSync(fromPdfOutput) ? fromPdfOutput : null);
    if (!filePath) return send(res, 404, { error: 'FILE_NOT_FOUND' });
    try {
      const data = fs.readFileSync(filePath);
      return send(res, 200, data, 'application/pdf', { 'Content-Disposition': `inline; filename="${path.basename(filePath)}"` });
    } catch (e) {
      return send(res, 500, { error: 'FILE_READ_FAILED', detail: String(e.message || e) });
    }
  }

  let reqPath = req.url.split('?')[0];
  let filePath = reqPath === '/' ? path.join(PUBLIC, 'index.html') : path.join(PUBLIC, reqPath);
  if (!filePath.startsWith(PUBLIC)) return send(res, 403, 'Forbidden', 'text/plain');

  // support directory routes like /operations/ -> /operations/index.html
  try {
    if (reqPath.endsWith('/')) {
      filePath = path.join(PUBLIC, reqPath, 'index.html');
    }
  } catch { }

  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === '.html' ? 'text/html'
      : ext === '.js' ? 'application/javascript'
        : ext === '.css' ? 'text/css'
          : ext === '.svg' ? 'image/svg+xml'
            : 'application/octet-stream';
    send(res, 200, data, type);
  });
});

server.listen(PORT, () => console.log(`Muze PM Lite running on http://localhost:${PORT}`));
