// Fonction Supabase "life-push" : appelée chaque minute par pg_cron.
// 1. Envoie les messages en attente (collection life/pushqueue : test, réponse de Life…).
// 2. Envoie une notification 10 minutes avant chaque tâche à heure précise du jour.
// Les clés VAPID et le jeton d'appel sont lus dans la table privée public.life_secrets.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";
import "./planner.js"; // même cerveau de planning que l'appli
const P = (globalThis as any).LifePlanner;

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Row = { user_id: string; coll: string; id: string; data: Record<string, any> };

function parisNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const diffDays = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5);

// Même règle que l'appli : la tâche est-elle prévue ce jour-là ?
// Une tâche ponctuelle sans date, ou en retard, est prévue aujourd'hui ; un événement (soirée, concert, rdv…) seulement le jour même.
const plain = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const EVENT_RE = /\b(soiree|concert|spectacle|fete|anniversaire|mariage|match|festival|vernissage|theatre|opera|rdv|rendez-vous)\b/;
function dueOn(t: any, date: string) {
  const type = t.type === "daily" || t.type === "weekdays" || t.type === "weekly" || t.type === "everyN" || t.type === "rec" ? "rec" : "once";
  if (type === "once") {
    if (t.done || t.abandoned) return false;
    if (!t.date) return true;
    const event = t.kind === "event" || EVENT_RE.test(plain(t.title));
    return event ? t.date === date : t.date <= date;
  }
  if (t.start && t.start > date) return false;
  const d = parse(date), dow = d.getUTCDay();
  if (t.type === "weekdays") return dow >= 1 && dow <= 5;
  if (t.freq === "week" || t.type === "weekly") return (t.days || []).includes(dow);
  if (t.freq === "month") {
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return d.getUTCDate() === Math.min(Number(t.monthDay) || 1, last);
  }
  const n = Math.max(1, Number(t.every || t.n) || 1), k = diffDays(t.start || date, date);
  return k >= 0 && k % n === 0;
}

// Météo du jour en une ligne (Open-Meteo, gratuit) : « ☀️ 14° ». Vide si la ville est inconnue ou le service muet.
const WX = (c: number) => c === 0 ? "☀️" : c <= 2 ? "🌤️" : c === 3 ? "☁️" : c <= 48 ? "🌫️" : c <= 67 ? "🌧️" : c <= 77 ? "❄️" : c <= 82 ? "🌧️" : c <= 86 ? "🌨️" : "⛈️";
async function weatherLine(city?: string) {
  try {
    const g = await (await fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&name=" + encodeURIComponent(city || "Paris"), { signal: AbortSignal.timeout(5000) })).json();
    const loc = g.results?.[0]; if (!loc) return "";
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=weather_code,temperature_2m_max,precipitation_probability_max&timezone=Europe%2FParis&forecast_days=1`, { signal: AbortSignal.timeout(5000) })).json();
    const code = w.daily?.weather_code?.[0], max = w.daily?.temperature_2m_max?.[0], rain = w.daily?.precipitation_probability_max?.[0];
    if (code == null) return "";
    return `${WX(code)} ${Math.round(max)}°${rain >= 50 ? ` · pluie ${rain} %` : ""}`;
  } catch { return ""; }
}

Deno.serve(async (req) => {
  const { data: secrets } = await sb.from("life_secrets").select("name,value");
  const S = Object.fromEntries((secrets || []).map((r: any) => [r.name, r.value]));
  if (!S.cron_token || req.headers.get("x-life-token") !== S.cron_token) return new Response("forbidden", { status: 403 });
  webpush.setVapidDetails(S.vapid_subject || "mailto:life@example.com", S.vapid_public, S.vapid_private);

  const { data: rows } = await sb.from("docs").select("user_id,coll,id,data")
    .in("coll", ["life/push", "life/pushqueue", "life/pushlog", "life/profile/tasks", "life/profile/plans", "life/profile/categories", "life"]);
  const all = (rows || []) as Row[];
  const by = (coll: string, uid: string) => all.filter((r) => r.coll === coll && r.user_id === uid);
  const users = [...new Set(all.filter((r) => r.coll === "life/push").map((r) => r.user_id))];
  const now = parisNow();
  let sent = 0;

  for (const uid of users) {
    const subs = by("life/push", uid);
    const send = async (payload: Record<string, string>) => {
      for (const s of subs) {
        try { await webpush.sendNotification(s.data.sub, JSON.stringify(payload)); sent++; }
        catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await sb.from("docs").delete().eq("user_id", uid).eq("coll", "life/push").eq("id", s.id);
          }
        }
      }
    };

    for (const q of by("life/pushqueue", uid)) {
      await send({ title: q.data.title || "Life", body: q.data.body || "", tag: q.id });
      await sb.from("docs").delete().eq("user_id", uid).eq("coll", "life/pushqueue").eq("id", q.id);
    }

    const profile = all.find((r) => r.user_id === uid && r.coll === "life" && r.id === "profile")?.data || {};
    if (profile.alerts === false) continue;
    const log = by("life/pushlog", uid).find((r) => r.id === now.date);
    const done: string[] = log?.data?.sent || [];
    const fresh: string[] = [];

    // Message du réveil : à l'heure du réveil, Life prépare la journée (si l'appli ne l'a pas déjà fait)
    // et l'envoie en résumé, une ligne par tâche.
    const wake = toMin(profile.wake || "07:00");
    const force = new URL(req.url).searchParams.get("brief") === "1"; // essai manuel (appel protégé par le jeton)
    if (force || (profile.morning !== false && now.min >= wake && now.min <= wake + 15 && !done.includes("brief"))) {
      const tasksN = by("life/profile/tasks", uid).map((r) => P.norm({ id: r.id, ...r.data }));
      const cats = by("life/profile/categories", uid).map((r) => ({ id: r.id, ...r.data }));
      let plan = all.find((r) => r.user_id === uid && r.coll === "life/profile/plans" && r.id === now.date)?.data;
      if (!plan) {
        plan = P.generate({ tasks: tasksN, cats, profile, autoLF: 1, today: now.date, nowMin: now.min }, now.date, { fromNow: true });
        const data = { date: now.date, items: plan.items, skipped: [], at: new Date().toISOString(), by: "morning" };
        await sb.from("docs").upsert({ user_id: uid, coll: "life/profile/plans", id: now.date, data, updated_at: new Date().toISOString() });
        all.push({ user_id: uid, coll: "life/profile/plans", id: now.date, data });
      }
      const emoji = (t: any) => (cats.find((c: any) => c.id === t.catId) || {}).emoji || "•";
      const lines: string[] = [];
      for (const it of plan.items || []) {
        const t = tasksN.find((x: any) => x.id === it.tid);
        if (!t || P.isDone(t, now.date)) continue;
        lines.push(`${it.w ? "💼" : P.toHM(it.s)} ${emoji(t)} ${t.title}`);
      }
      const shown = lines.slice(0, 8);
      if (lines.length > 8) shown.push(`+ ${lines.length - 8} autre${lines.length - 8 > 1 ? "s" : ""}`);
      const day = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "short" }).format(new Date());
      const wx = await weatherLine(profile.city);
      await send({
        title: `Ta journée · ${day.charAt(0).toUpperCase() + day.slice(1)}${wx ? " · " + wx : ""}`,
        body: shown.length ? shown.join("\n") : "Rien de prévu aujourd'hui : profite de ta journée.",
        tag: `${now.date}-brief`,
      });
      if (!force) fresh.push("brief");
    }
    for (const t of by("life/profile/tasks", uid)) {
      const d = t.data;
      if (!d.time || !dueOn(d, now.date)) continue;
      const isDone = d.type === "once" || !d.type ? !!d.done : (d.doneDates || []).includes(now.date);
      const left = toMin(d.time) - now.min;
      // 10 minutes avant, puis à l'heure de début (rattrapage de 2 minutes si l'appel a du retard).
      const key = left >= 1 && left <= 10 ? t.id : left <= 0 && left >= -2 ? `${t.id}@start` : null;
      if (isDone || !key || done.includes(key)) continue;
      await send({ title: key === t.id ? `Dans ${left} min` : "C'est maintenant", body: `${d.title} · ${d.time}`, tag: `${now.date}-${key}` });
      fresh.push(key);
    }
    // Tâches sans heure fixe : on suit le planning du jour calculé par l'appli (créneau choisi par Life).
    const plan = all.find((r) => r.user_id === uid && r.coll === "life/profile/plans" && r.id === now.date)?.data;
    const tasks = by("life/profile/tasks", uid);
    for (const it of plan?.items || []) {
      if (it.w) continue;
      const t = tasks.find((x) => x.id === it.tid);
      if (!t || t.data.time) continue;
      const d = t.data;
      const isDone = d.type === "once" || !d.type ? !!d.done || !!d.abandoned : (d.doneDates || []).includes(now.date);
      const left = Number(it.s) - now.min;
      const key = `${t.id}@plan`;
      if (isDone || left > 5 || left < -2 || done.includes(key) || fresh.includes(key)) continue;
      const hh = String(Math.floor(it.s / 60)).padStart(2, "0") + ":" + String(it.s % 60).padStart(2, "0");
      await send({ title: left > 0 ? `Dans ${left} min` : "C'est le moment", body: `${d.title} · ${hh}`, tag: `${now.date}-${key}` });
      fresh.push(key);
    }
    if (fresh.length) {
      await sb.from("docs").upsert({ user_id: uid, coll: "life/pushlog", id: now.date, data: { sent: done.concat(fresh) }, updated_at: new Date().toISOString() });
    }
  }
  return new Response(JSON.stringify({ ok: true, sent }), { headers: { "Content-Type": "application/json" } });
});
