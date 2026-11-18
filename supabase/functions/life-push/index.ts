// Fonction Supabase "life-push" : appelée chaque minute par pg_cron.
// 1. Envoie les messages en attente (collection life/pushqueue : test, réponse de Life…).
// 2. Envoie une notification 10 minutes avant chaque tâche à heure précise du jour.
// 4. Mails : « Ta journée » au réveil, « Ta semaine » le dimanche (si life_secrets contient resend_key et mail_to).
// 3. Repas : « commence à cuisiner » ; sport : demande du ressenti ; relance d'une tâche non cochée ; bilan du soir.
// Les clés VAPID et le jeton d'appel sont lus dans la table privée public.life_secrets.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";
import "./planner.js"; // même cerveau de planning que l'appli
import { dailyMail, weeklyMail, sendMail } from "./mail.ts";
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
const isMeal = (d: any) => d.catId === "repas" || d.workout?.kind === "meal";
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
      payload.url = payload.url || "./";
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
      if (!d.time || !dueOn(d, now.date) || isMeal(d)) continue;
      const isDone = d.type === "once" || !d.type ? !!d.done : (d.doneDates || []).includes(now.date);
      const left = toMin(d.time) - now.min;
      // 10 minutes avant, puis à l'heure de début (rattrapage de 2 minutes si l'appel a du retard).
      const key = left >= 1 && left <= 10 ? t.id : left <= 0 && left >= -2 ? `${t.id}@start` : null;
      if (isDone || !key || done.includes(key)) continue;
      await send({ title: key === t.id ? `Dans ${left} min` : "C'est maintenant", body: `${d.title} · ${d.time}`, tag: `${now.date}-${key}`, url: `./?t=${t.id}` });
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
      await send({ title: left > 0 ? `Dans ${left} min` : "C'est le moment", body: `${d.title} · ${hh}`, tag: `${now.date}-${key}`, url: `./?t=${t.id}` });
      fresh.push(key);
    }
    // ---- Rappels en plus (repas, ressenti, relance, bilan du soir) ----
    const catsAll = by("life/profile/categories", uid).map((r) => ({ id: r.id, ...r.data }));
    const catOf = (d: any) => catsAll.find((c: any) => c.id === d.catId) as any;
    const isSport = (d: any) => {
      if (d.workout && (d.workout.kind === "swim" || d.workout.kind === "home")) return true;
      const c = catOf(d), parent = c && catsAll.find((x: any) => x.id === c.parentId) as any;
      return /sport|natation|piscine/i.test(`${c?.name || ""} ${parent?.name || ""}`);
    };
    const sleep = toMin(profile.sleep || "23:00");
    const isOnce = (d: any) => d.type === "once" || !d.type;
    const doneToday = (d: any) => isOnce(d) ? !!d.done || !!d.abandoned : (d.doneDates || []).includes(now.date);
    const once = (key: string) => !done.includes(key) && !fresh.includes(key);
    const todayTimed = tasks.filter((t) => t.data.time && dueOn(t.data, now.date) && !doneToday(t.data));
    for (const t of todayTimed) {
      const d = t.data, start = toMin(d.time), dur = Math.max(5, Number(d.duration) || 30), end = start + dur;
      // Avant de cuisiner : au moment où il faut s'y mettre pour manger à l'heure.
      if (isMeal(d)) {
        const lead = start - dur;
        if (now.min >= lead && now.min <= lead + 10 && once(`${t.id}@cook`)) {
          await send({ title: "🍳 C'est l'heure de cuisiner", body: `${d.title.replace(/^Dîner\s*:\s*/i, "")} · commence maintenant pour manger à ${d.time} (${dur} min)`, tag: `${now.date}-${t.id}@cook`, url: `./?t=${t.id}` });
          fresh.push(`${t.id}@cook`);
        }
        continue;
      }
      // Relance : 30 min après la fin prévue, la tâche n'est toujours pas cochée.
      if ((!isOnce(d) || d.date === now.date) && now.min >= end + 30 && now.min <= Math.min(end + 120, sleep - 30) && once(`${t.id}@nudge`)) {
        await send({ title: "Tu as pu le faire ?", body: `${d.title} · touche pour cocher, ou pour la remettre à demain`, tag: `${now.date}-${t.id}@nudge`, url: `./?t=${t.id}` });
        fresh.push(`${t.id}@nudge`);
      }
    }
    // Après une séance de sport cochée (ou terminée) : demander le ressenti s'il n'est pas encore noté.
    for (const t of tasks) {
      const d = t.data;
      if (!isSport(d) || d.abandoned || d.skipped || !isOnce(d) || d.date !== now.date) continue;
      if (d.swimFeedback && String(d.swimFeedback.at || "").slice(0, 10) >= now.date) continue;
      const slot = (plan?.items || []).find((it: any) => it.tid === t.id && !it.w);
      const startMin = d.time ? toMin(d.time) : slot ? Number(slot.s) : null;
      if (startMin == null && !d.done) continue;
      const end = (startMin ?? 0) + (Number(d.duration) || 45);
      const doneMin = d.done && d.doneAt ? toMin(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d.doneAt))) : null;
      const at = doneMin != null ? Math.min(doneMin + 10, end + 20) : end + 20;
      if (now.min >= at && now.min <= Math.min(at + 120, sleep) && once(`${t.id}@fb`)) {
        await send({ title: "💬 Comment c'était ?", body: `${d.title} · note ton ressenti en 10 secondes, Claude adapte la prochaine séance`, tag: `${now.date}-${t.id}@fb`, url: `./?t=${t.id}&fb=1` });
        fresh.push(`${t.id}@fb`);
      }
    }
    // Bilan du soir : 1 h 30 avant le coucher.
    const eve = profile.evening ? toMin(profile.evening) : sleep - 90;
    if (profile.eveningBrief !== false && now.min >= eve && now.min <= eve + 15 && once("evening")) {
      const all2 = tasks.map((t) => t.data);
      const doneN = all2.filter((d) => isOnce(d) ? d.done && String(d.doneAt || "").length && new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(d.doneAt)) === now.date : (d.doneDates || []).includes(now.date)).length;
      const left = tasks.filter((t) => isOnce(t.data) && !doneToday(t.data) && t.data.date === now.date && !isMeal(t.data)).map((t) => t.data.title);
      const tmr = new Date(parse(now.date).getTime() + 864e5).toISOString().slice(0, 10);
      const next = all2.filter((d) => d.time && dueOn(d, tmr) && !(isOnce(d) && d.date !== tmr))
        .sort((a, b) => String(a.time).localeCompare(String(b.time))).slice(0, 5)
        .map((d) => `${d.time} ${(catOf(d) || {}).emoji || "•"} ${d.title}`);
      const body = [
        left.length ? `Pas encore fait : ${left.slice(0, 3).join(", ")}${left.length > 3 ? "…" : ""} (touche pour remettre à demain)` : "Tout ce qui était prévu aujourd'hui est fait 🎉",
        next.length ? `Demain :\n${next.join("\n")}` : "Demain : rien d'heure fixe pour l'instant.",
      ].join("\n");
      await send({ title: `🌙 Bilan du jour · ${doneN} fait${doneN > 1 ? "s" : ""}`, body, tag: `${now.date}-evening`, url: "./" });
      fresh.push("evening");
    }
    // Mails du matin (et du dimanche) : envoyés au réveil, une seule fois par jour.
    const mailAsk = new URL(req.url).searchParams.get("mail");
    if (S.resend_key && S.mail_to && profile.mails !== false) {
      const atWake = now.min >= wake && now.min <= wake + 30;
      const raw = tasks.map((r) => ({ id: r.id, ...r.data }));
      const cats2 = by("life/profile/categories", uid).map((r) => ({ id: r.id, ...r.data }));
      const isSunday = parse(now.date).getUTCDay() === 0;
      if (mailAsk === "day" || (atWake && once("mail-day"))) {
        const p2 = all.find((r) => r.user_id === uid && r.coll === "life/profile/plans" && r.id === now.date)?.data;
        const planLines: string[] = [];
        for (const it of p2?.items || []) {
          const t = raw.find((x: any) => x.id === it.tid) as any;
          if (!t || t.workout || t.catId === "repas" || t.catId === "courses" || (isOnce(t) ? t.done || t.abandoned : (t.doneDates || []).includes(now.date))) continue;
          planLines.push(`${it.w ? "💼" : P.toHM(it.s)} ${(cats2.find((c: any) => c.id === t.catId) as any)?.emoji || "•"} ${t.title}`);
        }
        const ok = await sendMail(S.resend_key, S.mail_to, dailyMail({ tasks: raw, cats: cats2, date: now.date, wx: await weatherLine(profile.city), planLines }));
        if (ok && mailAsk !== "day") fresh.push("mail-day");
      }
      if (mailAsk === "week" || (isSunday && atWake && once("mail-week"))) {
        const ok = await sendMail(S.resend_key, S.mail_to, weeklyMail({ tasks: raw, cats: cats2, date: now.date }));
        if (ok && mailAsk !== "week") fresh.push("mail-week");
      }
    }
    if (fresh.length) {
      await sb.from("docs").upsert({ user_id: uid, coll: "life/pushlog", id: now.date, data: { sent: done.concat(fresh) }, updated_at: new Date().toISOString() });
    }
  }
  return new Response(JSON.stringify({ ok: true, sent }), { headers: { "Content-Type": "application/json" } });
});
