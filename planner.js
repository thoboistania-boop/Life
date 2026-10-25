// Cerveau du planning de Life, partagé par l'appli (navigateur) et par le service du matin (Supabase).
// Fonctions pures : tout ce qui dépend de l'état (tâches, profil, date du jour) est passé en paramètre.
(function (root) {
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseYmd = s => { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const diffDays = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
  const toMin = t => { if (!t) return null; const p = String(t).split(':').map(Number); return p[0] * 60 + (p[1] || 0); };
  const toHM = m => pad(Math.floor(m / 60) % 24) + ':' + pad(Math.round(m % 60));
  const OLD_MIN = [null, 10, 20, 45, 90, 150];

  // Remet une tâche au format actuel (les anciennes versions de Life utilisaient d'autres champs).
  function norm(t) {
    const o = Object.assign({}, t);
    if (o.type === 'daily') { o.type = 'rec'; o.freq = 'day'; o.every = 1; }
    else if (o.type === 'weekdays') { o.type = 'rec'; o.freq = 'week'; o.days = [1, 2, 3, 4, 5]; }
    else if (o.type === 'weekly') { o.type = 'rec'; o.freq = 'week'; }
    else if (o.type === 'everyN') { o.type = 'rec'; o.freq = 'day'; o.every = +o.n || 2; }
    if (o.type !== 'rec') o.type = 'once';
    if (!o.duration) o.duration = OLD_MIN[+o.difficulty || 3] || 30;
    if (!o.effort) o.effort = +o.difficulty || 3;
    if (o.desc == null) o.desc = o.notes || '';
    o.catIds = Array.isArray(o.catIds) ? o.catIds : [];
    return o;
  }

  /* Moment de la journée : deviné d'après le titre, modifiable dans la tâche. Fenêtres en minutes depuis minuit. */
  const plain = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const MOMENTS = {
    any: { l: 'N’importe quand' },
    morning: { l: 'Le matin', from: 360, to: 720 },
    noon: { l: 'Le midi', from: 690, to: 870 },
    afternoon: { l: 'L’après-midi', from: 810, to: 1110 },
    evening: { l: 'Le soir', from: 1080, to: 1440 },
    open: { l: 'Heures d’ouverture des magasins', from: 570, to: 1140 },
    calls: { l: 'Heures de bureau (appels, démarches)', from: 540, to: 1080 }
  };
  const MOMENT_RULES = [
    ['evening', /\b(soiree|diner|apero|concert|boite|club|fete|teuf|spectacle|theatre|opera|karaoke|afterwork|bar)\b/],
    ['noon', /\b(dejeuner|brunch|pause dej)/],
    ['morning', /\b(petit[- ]?dej|footing|jogging|meditation|matinale)/],
    ['calls', /\b(appeler|telephoner|rappeler|prendre (un )?rdv|prendre rendez-vous)\b/],
    ['open', /\b(courses|magasin|acheter|achat|boutique|pharmacie|poste|mairie|prefecture|coiffeur|garage|musee|expo|exposition|bibliotheque|shopping|grillz)\b/]
  ];
  const detectMoment = title => { const t = plain(title); for (const r of MOMENT_RULES) if (r[1].test(t)) return r[0]; return 'any'; };
  const momentOf = t => t.moment && t.moment !== 'auto' && MOMENTS[t.moment] ? t.moment : detectMoment(t.title);
  const winOf = t => { const m = MOMENTS[momentOf(t)]; return m && m.from != null ? [m.from, m.to] : [0, 1440]; };
  // Premier créneau libre qui tombe dans le bon moment de la journée.
  const fitSlot = (ivs, t) => { const w = winOf(t); for (const iv of ivs) { const s = Math.max(iv[0], w[0]), e = Math.min(iv[1], w[1]); if (e - s >= t.duration) return [s, e]; } return null; };
  // Un événement (soirée, concert, rendez-vous…) ne se reporte pas tout seul : s'il est passé, Life demande.
  const EVENT_RE = /\b(soiree|concert|spectacle|fete|anniversaire|mariage|match|festival|vernissage|theatre|opera|rdv|rendez-vous)\b/;
  const isEvent = t => t.type === 'once' && !!t.date && (t.kind === 'event' || EVENT_RE.test(plain(t.title)));

  function dayInfo(profile, date) {
    const p = profile || {}; const dow = parseYmd(date).getDay();
    return { dow, wake: toMin(p.wake || '07:00'), sleep: toMin(p.sleep || '23:00'),
      works: !!p.work && (p.workDays || []).includes(dow), ws: toMin(p.workStart || '09:00'), we: toMin(p.workEnd || '17:30'), c: +p.commute || 0 };
  }
  function isDone(t, date) { return t.type === 'once' ? !!t.done : (t.doneDates || []).includes(date); }
  // La tâche est-elle à faire ce jour-là ? td = date du jour.
  function dueOn(t, date, td) {
    if (t.type === 'rec') {
      if (t.start && t.start > date) return false;
      const d = parseYmd(date);
      if (t.freq === 'week') return (t.days || []).includes(d.getDay());
      if (t.freq === 'month') { const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); return d.getDate() === Math.min(+t.monthDay || 1, last); }
      const n = Math.max(1, +t.every || 1); const k = diffDays(t.start || date, date); return k >= 0 && k % n === 0;
    }
    if (t.done || t.abandoned) return false;
    if (t.date) { if (isEvent(t)) return t.date === date && date >= td; return date === td ? t.date <= date : t.date === date; }
    return date >= td;
  }

  // Calcule le planning d'un jour.
  // ctx = { tasks (normalisées), cats, profile, autoLF, today, nowMin } ; o = { pinned, skipped, exclude, fromNow }
  function generate(ctx, date, o) {
    o = o || {}; const pinned = o.pinned || [], skipped = o.skipped || [], exclude = o.exclude || new Set();
    const profile = ctx.profile || {}, tasks = ctx.tasks || [], cats = ctx.cats || [];
    const rule = profile.prioRule || 'guaranteed';
    const lf = (ctx.autoLF || 1) * (+profile.loadBias || 1);
    const prio = c => +c.priority || 5;
    const catOf = t => cats.find(c => c.id === t.catId) || { priority: 5 };
    const taskById = id => tasks.find(x => x.id === id);
    const di = dayInfo(profile, date);
    const busy = [], items = [], used = new Set(pinned.map(i => i.tid));
    if (di.works) busy.push([di.ws - di.c, di.we + di.c]);
    pinned.forEach(i => { items.push(i); if (!i.w) busy.push([i.s, i.e + 10]); });
    const cands = tasks.filter(t => !used.has(t.id) && !skipped.includes(t.id) && !exclude.has(t.id) && !isDone(t, date) && dueOn(t, date, ctx.today));
    cands.filter(t => t.time).sort((a, b) => toMin(a.time) - toMin(b.time)).forEach(t => {
      const s = toMin(t.time), e = s + t.duration; items.push({ tid: t.id, s, e }); busy.push([s, e + 10]); used.add(t.id);
    });
    let startDay = di.wake + 30; const endDay = di.sleep - 30;
    if (o.fromNow && date === ctx.today) startDay = Math.max(startDay, Math.ceil((ctx.nowMin + 5) / 5) * 5);
    const freeIntervals = () => { const b = busy.slice().sort((x, y) => x[0] - y[0]); const out = []; let cur = startDay;
      for (const iv of b) { if (iv[0] > cur) out.push([cur, Math.min(iv[0], endDay)]); cur = Math.max(cur, iv[1]); }
      if (cur < endDay) out.push([cur, endDay]); return out.filter(iv => iv[1] - iv[0] >= 10); };
    const free = freeIntervals().reduce((a, iv) => a + iv[1] - iv[0], 0);
    let budget = free * 0.6 * lf, freeLeft = free;
    const urgent = t => rule !== 'strict' && ((t.deadline && diffDays(date, t.deadline) <= 2) || (t.type === 'once' && t.date && t.date < date));
    const cmp = (a, b) => (urgent(b) - urgent(a)) || (prio(catOf(b)) - prio(catOf(a))) || ((+b.priority || 5) - (+a.priority || 5)) || ((b.mandatory ? 1 : 0) - (a.mandatory ? 1 : 0)) || String(a.deadline || '9').localeCompare(String(b.deadline || '9'));
    const rest = cands.filter(t => !used.has(t.id)).sort(cmp);
    let order = rest;
    if (rule === 'guaranteed') {
      const firsts = [], seen = new Set();
      rest.forEach(t => { if (!seen.has(t.catId)) { seen.add(t.catId); firsts.push(t); } });
      const urg = rest.filter(urgent);
      order = urg.concat(firsts.filter(t => !urg.includes(t)), rest.filter(t => !urg.includes(t) && !firsts.includes(t)));
    }
    let heavy = items.filter(i => { const t = taskById(i.tid); return t && t.effort >= 4; }).length;
    let workSlots = items.filter(i => i.w).length; const sel = [];
    for (const t of order) {
      const d = t.duration, must = t.mandatory || urgent(t) || (t.type === 'once' && t.date === date);
      if (t.effort >= 4 && heavy >= 2 && !must) continue;
      if (t.atWork && di.works && workSlots < 2 && d <= 60) { items.push({ tid: t.id, s: di.ws, e: di.ws + d, w: true }); workSlots++; used.add(t.id); continue; }
      if (d + 10 > freeLeft) continue;
      if (!must && budget < d) continue;
      sel.push(t); freeLeft -= d + 10; if (!must) budget -= d; if (t.effort >= 4) heavy++;
    }
    sel.sort(cmp).forEach(t => {
      const slot = fitSlot(freeIntervals(), t); if (!slot) return;
      const s = slot[0], e = s + t.duration; items.push({ tid: t.id, s, e }); busy.push([s, e + 10]); used.add(t.id);
    });
    items.sort((a, b) => a.s - b.s);
    return { date, items, skipped };
  }

  root.LifePlanner = { pad, ymd, parseYmd, addDays, diffDays, toMin, toHM, norm, plain, MOMENTS, MOMENT_RULES, detectMoment, momentOf, winOf, fitSlot, EVENT_RE, isEvent, dayInfo, isDone, dueOn, generate };
})(typeof globalThis !== 'undefined' ? globalThis : this);
