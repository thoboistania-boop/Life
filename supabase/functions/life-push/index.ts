// Fonction Supabase "life-push" : appelée chaque minute par pg_cron.
// 1. Envoie les messages en attente (collection life/pushqueue : test, réponse de Life…).
// 2. Envoie une notification 10 minutes avant chaque tâche à heure précise du jour.
// Les clés VAPID et le jeton d'appel sont lus dans la table privée public.life_secrets.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
function dueOn(t: any, date: string) {
  const type = t.type === "daily" || t.type === "weekdays" || t.type === "weekly" || t.type === "everyN" || t.type === "rec" ? "rec" : "once";
  if (type === "once") return !t.done && t.date === date;
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

Deno.serve(async (req) => {
  const { data: secrets } = await sb.from("life_secrets").select("name,value");
  const S = Object.fromEntries((secrets || []).map((r: any) => [r.name, r.value]));
  if (!S.cron_token || req.headers.get("x-life-token") !== S.cron_token) return new Response("forbidden", { status: 403 });
  webpush.setVapidDetails(S.vapid_subject || "mailto:life@example.com", S.vapid_public, S.vapid_private);

  const { data: rows } = await sb.from("docs").select("user_id,coll,id,data")
    .in("coll", ["life/push", "life/pushqueue", "life/pushlog", "life/profile/tasks", "life"]);
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
    for (const t of by("life/profile/tasks", uid)) {
      const d = t.data;
      if (!d.time || !dueOn(d, now.date)) continue;
      const isDone = d.type === "once" || !d.type ? !!d.done : (d.doneDates || []).includes(now.date);
      const left = toMin(d.time) - now.min;
      if (isDone || left < 1 || left > 10 || done.includes(t.id)) continue;
      await send({ title: `Dans ${left} min`, body: `${d.title} · ${d.time}`, tag: `${now.date}-${t.id}` });
      fresh.push(t.id);
    }
    if (fresh.length) {
      await sb.from("docs").upsert({ user_id: uid, coll: "life/pushlog", id: now.date, data: { sent: done.concat(fresh) }, updated_at: new Date().toISOString() });
    }
  }
  return new Response(JSON.stringify({ ok: true, sent }), { headers: { "Content-Type": "application/json" } });
});
