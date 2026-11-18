// Mails de Life : « Ta journée » (chaque matin) et « Ta semaine » (le dimanche).
// HTML en tableaux et styles en ligne : c'est ce que Gmail et les autres messageries affichent correctement.
// L'adresse de destination et la clé d'envoi (Resend) sont dans la table privée life_secrets, jamais dans le code.

export const BASE = "https://thoboistania-boop.github.io/Life/";
const C = { bg: "#FFF6EC", card: "#FFFFFF", ink: "#3D3A44", muted: "#8A8492", line: "#EFE4D8", pink: "#E58FB8", soft: "#FCE7F1" };

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Image absolue ; les schémas SVG ont une copie PNG (Gmail n'affiche pas le SVG).
const abs = (u?: string) => !u ? "" : (/^https?:/.test(u) ? u : BASE + u.replace(/^\.?\//, "")).replace(/\.svg$/, ".png");
const link = (id: string, fb = false) => `${BASE}?t=${encodeURIComponent(id)}${fb ? "&fb=1" : ""}`;
const fmtDur = (m: number) => !m ? "" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
const dayName = (date: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) => {
  const s = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", ...opts }).format(new Date(date + "T12:00:00Z"));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 4px"><tr><td style="background:${C.ink};border-radius:22px">` +
  `<a href="${esc(href)}" style="display:inline-block;padding:10px 20px;color:#fff;text-decoration:none;font-weight:600;font-size:14px">${esc(label)}</a></td></tr></table>`;

const section = (title: string, inner: string) =>
  `<tr><td style="padding:8px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:16px">` +
  `<tr><td style="padding:16px 16px 12px"><div style="font-size:18px;font-weight:700;color:${C.ink};margin:0 0 6px">${title}</div>${inner}</td></tr></table></td></tr>`;

// Cartes numérotées, deux par ligne, comme dans l'appli.
function cards(items: any[], withImg = true, k = { n: 0 }, fit = "cover") {
  let rows = "";
  for (let i = 0; i < items.length; i += 2) {
    const cell = (x: any) => {
      if (!x) return `<td width="50%" style="padding:5px"></td>`;
      const n = ++k.n;
      const img = withImg && x.img ? `<img src="${esc(abs(x.img))}" width="256" alt="${esc(x.name)}" height="150" style="display:block;width:100%;height:150px;object-fit:${fit};background:#fff;border-radius:12px 12px 0 0;border:0">` : "";
      return `<td width="50%" valign="top" style="padding:5px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:12px;background:${C.bg}">` +
        `<tr><td style="padding:0">${img}</td></tr><tr><td style="padding:8px 10px 10px;font-size:13px;color:${C.ink}">` +
        `<span style="display:inline-block;min-width:20px;height:20px;line-height:20px;border-radius:10px;background:${C.soft};text-align:center;font-size:11px;font-weight:700;margin-right:4px">${n}</span>` +
        `<b>${esc(x.name)}</b>${x.dose ? `<div style="margin-top:3px">${esc(x.dose)}</div>` : ""}${x.tip ? `<div style="margin-top:3px;color:${C.muted};font-size:12px">${esc(x.tip)}</div>` : ""}` +
        `</td></tr></table></td>`;
    };
    rows += `<tr>${cell(items[i])}${cell(items[i + 1])}</tr>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

const meta = (bits: string[]) => bits.filter(Boolean).length ? `<div style="font-size:13px;color:${C.muted};margin:0 0 8px">${bits.filter(Boolean).join(" · ")}</div>` : "";
const partTitle = (s: string) => `<div style="font-size:13px;font-weight:700;color:${C.ink};margin:12px 0 2px">${esc(s.replace(/\s*\(touche.*\)$/i, ""))}</div>`;

export function sessionBlock(t: any, full = true) {
  const w = t.workout || {};
  const parts = (w.parts || []) as any[];
  const head = meta([t.time ? `🕖 ${t.time}` : "", w.duration || t.duration ? `⏱️ ${fmtDur(w.duration || t.duration)}` : "", w.distance ? `📏 ${w.distance} m` : "", w.goal ? `🎯 ${esc(w.goal)}` : ""]);
  if (!full) {
    const list = parts.map((p) => `<div style="font-size:13px;color:${C.ink};margin:4px 0"><b>${esc(p.name.replace(/\s*\(.*\)$/, ""))}</b> : ${(p.items || []).map((x: any) => esc(x.name)).join(", ")}</div>`).join("");
    return head + list + button(link(t.id), "Voir la séance avec les photos");
  }
  const k = { n: 0 };
  return head + parts.map((p) => partTitle(p.name) + cards(p.items || [], true, k, "contain")).join("") +
    (w.notes ? `<div style="font-size:13px;color:${C.ink};background:${C.soft};border-radius:10px;padding:10px 12px;margin-top:10px"><b>Consignes</b><br>${esc(w.notes)}</div>` : "") +
    button(link(t.id), "Ouvrir la séance dans Life");
}

export function mealBlock(t: any, full = true) {
  const w = t.workout || {};
  const [plate, steps] = [(w.parts || [])[0], (w.parts || [])[1]];
  const cover = t.coverUrl ? `<img src="${esc(abs(t.coverUrl))}" width="536" height="240" alt="" style="display:block;width:100%;height:240px;object-fit:cover;border-radius:12px;border:0;margin:4px 0 10px">` : "";
  const plateList = plate ? `<ul style="margin:4px 0 0;padding-left:20px;font-size:14px;color:${C.ink}">${(plate.items || []).map((x: any) => `<li style="margin:2px 0"><b>${esc(x.name)}</b>${x.dose ? ` : ${esc(x.dose)}` : ""}</li>`).join("")}</ul>` : "";
  const head = meta([t.time ? `🕖 ${t.time}` : "", t.duration ? `⏱️ ${fmtDur(t.duration)}` : "", w.goal ? esc(w.goal) : ""]);
  if (!full) return cover + head + plateList + button(link(t.id), "Voir la recette");
  return cover + head + (plate ? partTitle("Dans ton assiette") + plateList : "") +
    (steps ? partTitle("Étapes") + cards(steps.items || []) : "") +
    (w.notes ? `<div style="font-size:13px;color:${C.ink};background:${C.soft};border-radius:10px;padding:10px 12px;margin-top:10px"><b>Bon à savoir</b><br>${esc(w.notes)}</div>` : "") +
    button(link(t.id), "Ouvrir la recette dans Life");
}

// Liste de courses : les lignes en MAJUSCULES deviennent des rubriques, les « • » des puces.
export function shoppingBlock(t: any) {
  let html = "", open = false;
  const close = () => { if (open) { html += "</ul>"; open = false; } };
  for (const raw of String(t.desc || "").split("\n")) {
    const l = raw.trim();
    if (!l) { close(); continue; }
    if (/^[•\-]\s*/.test(l)) { if (!open) { html += `<ul style="margin:2px 0 6px;padding-left:20px;font-size:14px;color:${C.ink}">`; open = true; } html += `<li style="margin:2px 0">${esc(l.replace(/^[•\-]\s*/, ""))}</li>`; continue; }
    close();
    html += l === l.toUpperCase() && /[A-ZÉ]/.test(l)
      ? `<div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:${C.pink};margin:10px 0 2px">${esc(l)}</div>`
      : `<p style="font-size:14px;color:${C.ink};margin:4px 0">${esc(l)}</p>`;
  }
  close();
  return meta([t.date ? dayName(t.date, { weekday: "long", day: "numeric", month: "long" }) : "", t.time || ""]) + html + button(link(t.id), "Cocher mes courses dans Life");
}

function frame(title: string, subtitle: string, body: string, pre: string) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">` +
    `<div style="display:none;max-height:0;overflow:hidden">${esc(pre)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">` +
    `<tr><td style="padding:24px 20px 8px"><div style="font-size:13px;color:${C.pink};font-weight:700;letter-spacing:.08em">LIFE</div>` +
    `<div style="font-size:26px;font-weight:800;color:${C.ink};margin-top:2px">${esc(title)}</div><div style="font-size:14px;color:${C.muted};margin-top:4px">${subtitle}</div></td></tr>` +
    body +
    `<tr><td style="padding:16px 20px 28px;font-size:12px;color:${C.muted}">Photos : Wikimedia Commons, licences libres. Envoyé par Life.</td></tr>` +
    `</table></td></tr></table></body></html>`;
}

type Ctx = { tasks: any[]; cats: any[]; date: string; wx?: string; planLines?: string[] };
const isMeal = (d: any) => d.catId === "repas" || d.workout?.kind === "meal";
const isShop = (d: any, cats: any[]) => d.catId === "courses" || /course/i.test((cats.find((c) => c.id === d.catId) || {}).name || "");
const isSession = (d: any) => d.workout && (d.workout.kind === "swim" || d.workout.kind === "home");
const open = (d: any) => !d.done && !d.abandoned && !d.skipped;
const byTime = (a: any, b: any) => String(a.time || "99").localeCompare(String(b.time || "99"));

export function dailyMail({ tasks, cats, date, wx, planLines }: Ctx) {
  const today = tasks.filter((t) => t.date === date && open(t));
  const sessions = today.filter(isSession).sort(byTime);
  const meals = today.filter(isMeal).sort(byTime);
  const shops = today.filter((t) => isShop(t, cats)).sort(byTime);
  let body = "";
  for (const s of sessions) body += section(`${s.workout.kind === "swim" ? "🏊" : "🏠"} ${esc(s.title)}`, sessionBlock(s));
  for (const m of meals) body += section(`🍽️ ${esc(m.title)}`, mealBlock(m));
  for (const c of shops) body += section(`🛒 ${esc(c.title)}`, shoppingBlock(c));
  if (planLines && planLines.length) body += section("📋 Le reste de ta journée", `<div style="font-size:14px;color:${C.ink};line-height:1.7">${planLines.map(esc).join("<br>")}</div>`);
  if (!body) body = section("☀️ Journée libre", `<p style="font-size:14px;color:${C.ink}">Pas de séance ni de repas prévu aujourd'hui.</p>`);
  const pre = [sessions[0] && sessions[0].title, meals[0] && meals[0].title.replace(/^Dîner\s*:\s*/i, "dîner : ")].filter(Boolean).join(" · ");
  const subject = `Ta journée · ${dayName(date, { weekday: "long", day: "numeric", month: "long" })}`;
  return { subject, html: frame("Ta journée", `${esc(dayName(date))}${wx ? " · " + esc(wx) : ""}`, body + section("", button(BASE, "Ouvrir Life")), pre || "Ton programme du jour") };
}

export function weeklyMail({ tasks, cats, date }: Ctx) {
  const days: string[] = [];
  for (let i = 1; i <= 7; i++) days.push(new Date(new Date(date + "T12:00:00Z").getTime() + i * 864e5).toISOString().slice(0, 10));
  let body = "";
  const shops: any[] = [];
  for (const d of days) {
    const list = tasks.filter((t) => t.date === d && open(t));
    const ses = list.filter(isSession).sort(byTime), meals = list.filter(isMeal).sort(byTime);
    shops.push(...list.filter((t) => isShop(t, cats)));
    if (!ses.length && !meals.length) continue;
    let inner = "";
    for (const s of ses) inner += `<div style="font-size:15px;font-weight:700;color:${C.ink};margin:10px 0 2px">${s.workout.kind === "swim" ? "🏊" : "🏠"} ${esc(s.title)}</div>` + sessionBlock(s, false);
    for (const m of meals) inner += `<div style="font-size:15px;font-weight:700;color:${C.ink};margin:14px 0 2px">🍽️ ${esc(m.title)}</div>` + mealBlock(m, false);
    body += section(esc(dayName(d)), inner);
  }
  for (const c of shops.sort((a, b) => String(a.date).localeCompare(String(b.date)) || byTime(a, b))) body += section(`🛒 ${esc(c.title)}`, shoppingBlock(c));
  if (!body) body = section("Semaine à préparer", `<p style="font-size:14px;color:${C.ink}">Rien n'est encore prévu pour la semaine prochaine. Claude prépare la suite à son prochain passage.</p>`);
  const subject = `Ta semaine · du ${dayName(days[0], { day: "numeric", month: "long" })} au ${dayName(days[6], { day: "numeric", month: "long" })}`;
  return { subject, html: frame("Ta semaine", `Du ${esc(dayName(days[0]))} au ${esc(dayName(days[6]))}`, body, "Tes séances, tes repas et ta liste de courses") };
}

export async function sendMail(key: string, to: string, m: { subject: string; html: string }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Life <onboarding@resend.dev>", to: [to], subject: m.subject, html: m.html }),
    signal: AbortSignal.timeout(15000),
  });
  return r.ok;
}
