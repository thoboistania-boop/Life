// Fonction Supabase "life-voice" : renvoie ta journée en texte à lire à voix haute.
// Appelée par un raccourci iPhone (automatisation « quand l'alarme s'arrête » → « Énoncer le texte »).
// Lien : …/functions/v1/life-voice?k=<voiceKey>. La clé est créée dans Life (Réglages > Alertes) et rangée dans le profil.
import { createClient } from "jsr:@supabase/supabase-js@2";
import "./planner.js"; // même cerveau de planning que l'appli
const P = (globalThis as any).LifePlanner;

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const txt = (s: string, status = 200) => new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

function parisNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
const toMin = (t: string) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
// « 19 heures 30 », « midi », plus naturel à l'oral que « 19:30 ».
const say = (min: number) => {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  const hh = h === 12 ? "midi" : h === 0 ? "minuit" : `${h} heure${h > 1 ? "s" : ""}`;
  return m ? `${hh} ${m}` : hh;
};
const clean = (s: string) => String(s || "").replace(/\p{Extended_Pictographic}|️/gu, "").replace(/\s+/g, " ").trim();
const isMeal = (d: any) => d.catId === "repas" || d.workout?.kind === "meal";
const isSession = (d: any) => d.workout && (d.workout.kind === "swim" || d.workout.kind === "home");

const WX = (c: number) => c === 0 ? "grand soleil" : c <= 2 ? "un peu nuageux" : c === 3 ? "couvert" : c <= 48 ? "brouillard" : c <= 67 ? "pluie" : c <= 77 ? "neige" : c <= 82 ? "averses" : c <= 86 ? "averses de neige" : "orages";
async function weather(city?: string) {
  try {
    const g = await (await fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&name=" + encodeURIComponent(city || "Paris"), { signal: AbortSignal.timeout(4000) })).json();
    const loc = g.results?.[0]; if (!loc) return "";
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FParis&forecast_days=1`, { signal: AbortSignal.timeout(4000) })).json();
    const d = w.daily; if (d?.weather_code?.[0] == null) return "";
    const rain = d.precipitation_probability_max?.[0];
    return `Météo : ${WX(d.weather_code[0])}, de ${Math.round(d.temperature_2m_min[0])} à ${Math.round(d.temperature_2m_max[0])} degrés${rain >= 50 ? `, ${rain} % de risque de pluie, prends un parapluie` : ""}.`;
  } catch { return ""; }
}

Deno.serve(async (req) => {
  const k = new URL(req.url).searchParams.get("k") || "";
  if (k.length < 20) return txt("Lien incomplet. Recopie-le depuis les réglages de Life.", 403);
  const { data: prof } = await sb.from("docs").select("user_id,data").eq("coll", "life").eq("id", "profile").eq("data->>voiceKey", k).limit(1);
  if (!prof?.length) return txt("Ce lien n'est plus valable. Recopie-le depuis les réglages de Life.", 403);
  const uid = prof[0].user_id, profile = prof[0].data || {};
  const now = parisNow();

  const { data: rows } = await sb.from("docs").select("coll,id,data").eq("user_id", uid)
    .in("coll", ["life/profile/tasks", "life/profile/categories", "life/profile/plans"]);
  const tasks = (rows || []).filter((r: any) => r.coll === "life/profile/tasks").map((r: any) => ({ id: r.id, ...r.data }));
  const cats = (rows || []).filter((r: any) => r.coll === "life/profile/categories").map((r: any) => ({ id: r.id, ...r.data }));
  let plan = (rows || []).find((r: any) => r.coll === "life/profile/plans" && r.id === now.date)?.data;
  const tasksN = tasks.map((t: any) => P.norm(t));
  if (!plan) plan = P.generate({ tasks: tasksN, cats, profile, autoLF: 1, today: now.date, nowMin: now.min }, now.date, { fromNow: true });

  const open = (t: any) => !t.done && !t.abandoned && !t.skipped;
  const today = tasks.filter((t: any) => t.date === now.date && open(t));
  const slotOf = (t: any) => t.time ? toMin(t.time) : (plan?.items || []).find((it: any) => it.tid === t.id && !it.w)?.s;

  const day = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const out: string[] = [`Bonjour${profile.firstName ? " " + profile.firstName : ""} ! Nous sommes ${day}.`];
  const wx = await weather(profile.city); if (wx) out.push(wx);

  for (const s of today.filter(isSession)) {
    const at = slotOf(s), w = s.workout;
    out.push(`Ta séance : ${clean(s.title)}${at != null ? `, à ${say(Number(at))}` : ", ce soir"}, ${w.duration || s.duration || 30} minutes${w.kind === "swim" ? ". Pense à ton sac de piscine et ta Ventoline" : ""}.`);
  }
  for (const m of today.filter(isMeal)) {
    const at = slotOf(m), name = clean(m.title).replace(/^Dîner\s*:\s*/i, "");
    out.push(`Au dîner : ${name}${at != null ? `, à ${say(Number(at))}. Commence à cuisiner vers ${say(Number(at) - (Number(m.duration) || 30))}` : ""}.`);
  }
  for (const c of today.filter((t: any) => t.catId === "courses")) out.push(`N'oublie pas : ${clean(c.title)}${c.time ? `, vers ${say(toMin(c.time))}` : ""}.`);

  // Le reste de la journée, dans l'ordre du planning.
  const others: string[] = [];
  let work = false;
  for (const it of plan?.items || []) {
    if (it.w) { work = true; continue; }
    const t = tasks.find((x: any) => x.id === it.tid);
    if (!t || isSession(t) || isMeal(t) || t.catId === "courses" || P.isDone(P.norm(t), now.date)) continue;
    others.push(`${clean(t.title)} à ${say(Number(it.s))}`);
  }
  if (work && profile.workStart) out.push(`Travail de ${say(toMin(profile.workStart))} à ${say(toMin(profile.workEnd || "18:00"))}.`);
  if (others.length) out.push(`Et aussi : ${others.slice(0, 5).join(", ")}${others.length > 5 ? `, plus ${others.length - 5} autres choses` : ""}.`);
  if (out.length <= 2) out.push("Rien de prévu aujourd'hui : profite de ta journée.");
  out.push("Bonne journée !");
  return txt(out.join(" "));
});
