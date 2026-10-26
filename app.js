// Greffier de séance — Les Étoiles Roi
// Transcription en direct (Web Speech API de Chrome/Edge), découpage par point
// de l'ordre du jour, votes, sauvegarde locale continue et audio de secours.
"use strict";

const CLE = "etoiles-roi-ag/seance";
const URL_REDACTION = "https://claude.ai/artifact/YCmMxX1Xrg3Fviv6qAdoef";
const FUSION_MS = 25000; // phrases d'un même orateur regroupées si moins de 25 s d'écart

const $ = (id) => document.getElementById(id);
const champsMeta = ["typeAG", "date", "dateFin", "heure", "roles", "lieu", "presidente", "secretaire", "inscrits", "presents", "representes", "ordre", "orateurs"];

// Programme de l'AG 2026 (proposition d'ordre du jour v2) : horaires, animation et questions de chaque point
const PROGRAMME = [
  { titre: "Mot de bienvenue", jour: "Samedi 7 novembre", horaire: "15h00 – 15h15", animation: "", contenu: "Ouverture officielle, rappel de l'objectif de l'AG, cadre des échanges." },
  { titre: "« À nous la parole » : un temps d'écoute", jour: "Samedi 7 novembre", horaire: "15h15 – 16h15", animation: "Achy et Erna", contenu: "Chaque membre peut s'exprimer librement sur le sujet de son choix (association, fonctionnement, vécu). Les autres apportent écoute, conseils, soutien ou propositions." },
  { titre: "Point sur la vie du groupe", jour: "Samedi 7 novembre", horaire: "16h20 – 17h20", animation: "Passy", contenu: "Participation aux événements associatifs et aux sorties ; implication des membres ; ce qui fonctionne aujourd'hui ; ce que nous souhaitons voir évoluer." },
  { titre: "Les rencontres trimestrielles : faut-il faire évoluer le format ?", jour: "Samedi 7 novembre", horaire: "17h20 – 17h50", animation: "Sandra", contenu: "Le format actuel nous convient-il ? Le conserver ou le modifier ? Quelles propositions pour des rencontres plus vivantes et participatives ?" },
  { titre: "Réflexion sur le format de l'Assemblée Générale", jour: "Samedi 7 novembre", horaire: "17h50 – 18h20", animation: "Erna et Achy", contenu: "Format, organisation et temps de parole ; participation des membres, fonctionnement et animation ; ce que nous souhaitons conserver ou faire évoluer." },
  { titre: "Tirage au sort de la tontine 2027", jour: "Samedi 7 novembre", horaire: "18h20 – 18h30", animation: "Achy", contenu: "Présentation des trois lots 2027 et tirage au sort de l'ordre de passage dans chaque lot." },
  { titre: "Bilan de l'année", jour: "Samedi 7 novembre", horaire: "18h40 – 19h10", animation: "un membre du bureau", contenu: "Ce qui a été réalisé et les réussites ; les difficultés rencontrées ; ce que nous pouvons améliorer." },
  { titre: "Divers", jour: "Samedi 7 novembre", horaire: "19h10 – 19h30", animation: "", contenu: "Sujets qui n'ont pas été traités dans l'ordre du jour." },
  { titre: "Organisation du voyage annuel", jour: "Dimanche 8 novembre", horaire: "9h00 – 10h00", animation: "Sandrine", contenu: "Destination, propositions, période ; organisation et budget ; participation des membres et répartition des responsabilités." },
  { titre: "Projets potentiels pour le groupe", jour: "Dimanche 8 novembre", horaire: "10h00 – 11h00", animation: "Saurelle", contenu: "Idées et envies des membres ; projets solidaires, culturels ou de loisirs ; moyens nécessaires, faisabilité et priorités pour l'année à venir." },
];
const programmeDe = (titre) => PROGRAMME.find((p) => p.titre === titre);

let etat = nouvelleSeance();
let ecoute = false;        // l'utilisatrice veut écouter
let reco = null;
let debutChrono = null;
let cumulMs = 0;
let verrouEcran = null;
let enregistreur = null;
let fluxAudio = null;

function nouvelleSeance() {
  return {
    format: "etoiles-roi-ag/1",
    association: "Les Étoiles Roi",
    meta: {},
    pointIndex: 0,
    orateur: "",
    segments: [],
    votes: [],
    dureeMs: 0,
  };
}

// ---------- Sauvegarde locale ----------
function sauver() {
  lireMeta();
  etat.dureeMs = dureeActuelle();
  try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch (e) { alerte("Sauvegarde locale impossible : exportez régulièrement la séance."); }
}
function charger() {
  try {
    const brut = localStorage.getItem(CLE);
    if (brut) etat = Object.assign(nouvelleSeance(), JSON.parse(brut));
  } catch (e) { /* séance neuve */ }
  cumulMs = etat.dureeMs || 0;
  for (const id of champsMeta) if (etat.meta[id] !== undefined) $(id).value = etat.meta[id];
}
function lireMeta() {
  for (const id of champsMeta) etat.meta[id] = $(id).value;
}
const points = () => $("ordre").value.split("\n").map((s) => s.trim()).filter(Boolean);
const orateurs = () => $("orateurs").value.split(",").map((s) => s.trim()).filter(Boolean);

// ---------- Affichage ----------
function hhmmss(ms) {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}
function heureDe(ts) {
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function jourHeure(ts) {
  return new Date(ts).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}
function dureeActuelle() {
  return cumulMs + (debutChrono ? Date.now() - debutChrono : 0);
}

function rendrePoint() {
  const p = points();
  if (etat.pointIndex >= p.length) etat.pointIndex = Math.max(0, p.length - 1);
  $("pointCourant").textContent = p.length ? `${etat.pointIndex + 1}. ${p[etat.pointIndex]}` : "Aucun ordre du jour";
  const prog = programmeDe(p[etat.pointIndex]);
  $("pointInfo").textContent = prog ? [prog.jour, prog.horaire, prog.animation && "animation : " + prog.animation].filter(Boolean).join(" · ") : "";
  $("btnPrec").disabled = etat.pointIndex === 0;
  $("btnSuiv").disabled = etat.pointIndex >= p.length - 1;
}

function rendrePuces() {
  const box = $("puces");
  box.textContent = "";
  const liste = orateurs();
  if (etat.orateur && !liste.includes(etat.orateur)) liste.push(etat.orateur);
  for (const nom of liste) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "puce";
    b.textContent = nom;
    b.setAttribute("aria-pressed", String(nom === etat.orateur));
    b.onclick = () => { etat.orateur = nom === etat.orateur ? "" : nom; rendrePuces(); sauver(); };
    box.append(b);
  }
}

function rendreFlux() {
  const flux = $("flux");
  const enBas = flux.scrollHeight - flux.scrollTop - flux.clientHeight < 60;
  flux.textContent = "";
  const p = points();
  let dernierPoint = -1;
  for (const s of etat.segments) {
    if (s.point !== dernierPoint) {
      dernierPoint = s.point;
      const h = document.createElement("div");
      h.className = "titre-point";
      h.textContent = `${s.point + 1}. ${s.pointTitre || p[s.point] || ""}`;
      flux.append(h);
    }
    const ligne = document.createElement("div");
    ligne.className = "seg " + s.type;
    const t = document.createElement("time");
    t.textContent = heureDe(s.ts);
    const corps = document.createElement("div");
    if (s.orateur) {
      const q = document.createElement("span");
      q.className = "qui";
      q.textContent = s.orateur + " :";
      corps.append(q);
    }
    const txt = document.createElement("span");
    txt.className = "txt";
    txt.textContent = s.texte;
    if (s.type !== "vote") {
      txt.contentEditable = "true";
      txt.spellcheck = true;
      txt.title = "Cliquez pour corriger";
      txt.onblur = () => { s.texte = txt.textContent.trim(); sauver(); if (fluxEnRetard) { fluxEnRetard = false; rendreFlux(); } };
    }
    corps.append(txt);
    const x = document.createElement("button");
    x.className = "suppr";
    x.title = "Supprimer ce passage";
    x.setAttribute("aria-label", "Supprimer ce passage");
    x.textContent = "×";
    x.onclick = () => {
      etat.segments = etat.segments.filter((o) => o !== s);
      if (s.type === "vote") etat.votes = etat.votes.filter((v) => v.id !== s.id);
      rendreTout(); sauver();
    };
    ligne.append(t, corps, x);
    flux.append(ligne);
  }
  if (enBas) flux.scrollTop = flux.scrollHeight;
  const mots = etat.segments.reduce((n, s) => n + s.texte.split(/\s+/).filter(Boolean).length, 0);
  $("compteur").textContent = etat.segments.length ? `${mots.toLocaleString("fr-FR")} mots transcrits · sauvegarde automatique sur cet ordinateur` : "";
}

// Ne pas redessiner pendant qu'une correction est en cours : on attend la sortie du champ.
let fluxEnRetard = false;
function rendreFluxSiLibre() {
  if (document.activeElement?.classList?.contains("txt")) fluxEnRetard = true;
  else rendreFlux();
}

function issueVote(v) {
  if (v.contre === 0 && v.abst === 0 && v.pour > 0) return "adoptée à l'unanimité";
  if (v.contre === 0 && v.pour > 0) return "adoptée à l'unanimité des suffrages exprimés";
  return v.pour > v.contre ? "adoptée à la majorité" : "rejetée";
}
function rendreVotes() {
  const ol = $("listeVotes");
  ol.textContent = "";
  for (const v of etat.votes) {
    const li = document.createElement("li");
    li.append(`${v.resolution} — ${v.pour} pour, ${v.contre} contre, ${v.abst} abst. `);
    const b = document.createElement("span");
    b.className = "issue" + (v.issue === "rejetée" ? " rejet" : "");
    b.textContent = v.issue;
    li.append(b);
    ol.append(li);
  }
}
function rendreTout() { rendrePoint(); rendrePuces(); rendreFlux(); rendreVotes(); if (typeof majEtat === "function" && reco !== undefined) majEtat(); }

let minuteurAlerte;
function alerte(msg) {
  const a = $("alerte");
  a.textContent = msg;
  a.hidden = false;
  clearTimeout(minuteurAlerte);
  minuteurAlerte = setTimeout(() => { a.hidden = true; }, 5000);
}

// ---------- Ajout de segments ----------
function ajouterTexte(texte, type = "parole") {
  texte = texte.trim();
  if (!texte) return;
  const p = points();
  const der = etat.segments[etat.segments.length - 1];
  const maintenant = Date.now();
  if (type === "parole" && der && der.type === "parole" && der.orateur === etat.orateur &&
      der.point === etat.pointIndex && maintenant - der.tsFin < FUSION_MS) {
    der.texte += (/[.!?…]$/.test(der.texte) ? " " : ". ") + texte;
    der.tsFin = maintenant;
  } else {
    etat.segments.push({
      id: crypto.randomUUID(), type, ts: maintenant, tsFin: maintenant,
      point: etat.pointIndex, pointTitre: p[etat.pointIndex] || "",
      orateur: type === "parole" ? etat.orateur : (type === "note" ? "Note" : "Vote"), texte,
    });
  }
  rendreFluxSiLibre();
  sauver();
}

// ---------- Reconnaissance vocale ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

function creerReco() {
  const r = new SR();
  r.lang = "fr-FR";
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    let provisoire = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) ajouterTexte(majuscule(res[0].transcript));
      else provisoire += res[0].transcript;
    }
    $("interim").textContent = provisoire;
  };
  r.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      alerte("Le micro est refusé. Autorisez-le dans la barre d'adresse de Chrome, puis relancez.");
      arreterEcoute();
    } else if (e.error === "network") {
      alerte("Connexion internet perdue : la transcription reprendra seule. L'audio continue d'être enregistré.");
    } else if (e.error === "audio-capture") {
      alerte("Aucun micro détecté. Branchez-en un puis relancez.");
      arreterEcoute();
    } else {
      alerte("Interruption de la transcription (" + e.error + "), reprise automatique.");
    }
  };
  // Chrome coupe la reconnaissance régulièrement : on relance tant que l'écoute est voulue.
  r.onend = () => {
    $("interim").textContent = "";
    if (ecoute) setTimeout(() => { if (ecoute) try { r.start(); } catch (e) { /* déjà relancée */ } }, 300);
  };
  return r;
}
function majuscule(t) {
  t = t.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

async function demarrerEcoute() {
  if (!SR) {
    alerte("Ce navigateur ne sait pas transcrire. Ouvrez l'outil dans Google Chrome ou Microsoft Edge.");
    return;
  }
  ecoute = true;
  reco = reco || creerReco();
  try { reco.start(); } catch (e) { /* déjà démarrée */ }
  debutChrono = Date.now();
  if (!lireHeure()) $("heure").value = new Date().toTimeString().slice(0, 5);
  try { verrouEcran = await navigator.wakeLock?.request("screen"); } catch (e) { /* facultatif */ }
  if ($("garderAudio").checked) demarrerAudio();
  majEtat();
  sauver();
}
function lireHeure() { return $("heure").value; }

function arreterEcoute() {
  ecoute = false;
  try { reco?.stop(); } catch (e) { /* rien */ }
  if (debutChrono) { cumulMs += Date.now() - debutChrono; debutChrono = null; }
  verrouEcran?.release?.().catch(() => {});
  verrouEcran = null;
  arreterAudio();
  majEtat();
  sauver();
}
function majEtat() {
  const b = $("btnEcoute");
  b.textContent = ecoute ? "Mettre en pause" : (etat.segments.length ? "Reprendre l'écoute" : "Démarrer l'écoute");
  b.classList.toggle("actif", ecoute);
  $("etat").dataset.etat = ecoute ? "ecoute" : (etat.segments.length ? "pause" : "arret");
  $("etatTexte").textContent = ecoute ? "Écoute en cours" : (etat.segments.length ? "En pause" : "À l'arrêt");
  $("garderAudio").disabled = ecoute;
}
setInterval(() => { $("chrono").textContent = hhmmss(dureeActuelle()); }, 1000);
document.addEventListener("visibilitychange", async () => {
  if (ecoute && document.visibilityState === "visible" && !verrouEcran) {
    try { verrouEcran = await navigator.wakeLock?.request("screen"); } catch (e) { /* facultatif */ }
  }
});

// ---------- Audio de secours (IndexedDB, par tranches de 10 s) ----------
let baseAudio;
function ouvrirBase() {
  if (baseAudio) return baseAudio;
  baseAudio = new Promise((ok, ko) => {
    const req = indexedDB.open("etoiles-roi-audio", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("morceaux", { autoIncrement: true });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
  return baseAudio;
}
async function stockerMorceau(blob) {
  const db = await ouvrirBase();
  db.transaction("morceaux", "readwrite").objectStore("morceaux").add({ ts: Date.now(), type: blob.type, blob });
}
async function lireMorceaux() {
  const db = await ouvrirBase();
  return new Promise((ok, ko) => {
    const req = db.transaction("morceaux").objectStore("morceaux").getAll();
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
}
async function viderMorceaux() {
  const db = await ouvrirBase();
  db.transaction("morceaux", "readwrite").objectStore("morceaux").clear();
}
async function demarrerAudio() {
  try {
    fluxAudio = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } });
    const type = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
    enregistreur = new MediaRecorder(fluxAudio, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
    enregistreur.ondataavailable = (e) => { if (e.data.size) stockerMorceau(e.data).then(majInfoAudio); };
    enregistreur.start(10000);
  } catch (e) {
    alerte("L'audio de secours ne peut pas être enregistré ; la transcription continue.");
  }
}
function arreterAudio() {
  if (enregistreur && enregistreur.state !== "inactive") enregistreur.stop();
  fluxAudio?.getTracks().forEach((t) => t.stop());
  enregistreur = null;
  fluxAudio = null;
}
async function majInfoAudio() {
  try {
    const m = await lireMorceaux();
    const taille = m.reduce((n, x) => n + x.blob.size, 0);
    $("infoAudio").textContent = m.length ? `Audio conservé : ${(taille / 1048576).toFixed(1)} Mo.` : "";
  } catch (e) { /* rien */ }
}

// ---------- Exports ----------
function telecharger(nom, contenu, type) {
  const url = URL.createObjectURL(contenu instanceof Blob ? contenu : new Blob([contenu], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const suffixe = () => (etat.meta.date || "seance");

function exportJson() {
  sauver();
  const ordreDuJour = points();
  return JSON.stringify({ ...etat, ordreDuJour, programme: ordreDuJour.map((t) => programmeDe(t) || { titre: t }), exporteLe: new Date().toISOString() }, null, 2);
}
function texteTranscription() {
  lireMeta();
  const m = etat.meta;
  const lignes = [
    `${m.typeAG} — ${etat.association}`,
    `Dates : du ${m.date} au ${m.dateFin || m.date}   Ouverture : ${m.heure || "?"}   Lieu : ${m.lieu || "?"}`,
    `Rôles : ${m.roles || "?"}`,
    `Présidente de séance : ${m.presidente || "?"}   Secrétaire de séance : ${m.secretaire || "?"}`,
    `Membres inscrits : ${m.inscrits || "?"}   Présents : ${m.presents || "?"}   Représentés : ${m.representes || "?"}`,
    `Durée enregistrée : ${hhmmss(dureeActuelle())}`,
    "", "ORDRE DU JOUR", ...points().map((p, i) => {
      const g = programmeDe(p);
      return `${i + 1}. ${p}` + (g ? ` (${g.jour}, ${g.horaire}${g.animation ? ", animation : " + g.animation : ""}) — ${g.contenu}` : "");
    }), "",
    "VOTES", ...(etat.votes.length ? etat.votes.map((v) => `- [point ${v.point + 1}] ${v.resolution} : ${v.pour} pour, ${v.contre} contre, ${v.abst} abstentions → ${v.issue}`) : ["(aucun vote enregistré)"]),
    "", "TRANSCRIPTION",
  ];
  let dp = -1;
  for (const s of etat.segments) {
    if (s.point !== dp) { dp = s.point; lignes.push("", `## Point ${s.point + 1}. ${s.pointTitre}`); }
    lignes.push(`[${jourHeure(s.ts)}] ${s.orateur ? s.orateur + " : " : ""}${s.texte}`);
  }
  return lignes.join("\n");
}

// ---------- Événements ----------
$("btnEcoute").onclick = () => (ecoute ? arreterEcoute() : demarrerEcoute());
// En changeant de point, la parole passe d'abord à l'animatrice prévue.
function changerPoint(delta) {
  etat.pointIndex += delta;
  const prog = programmeDe(points()[etat.pointIndex]);
  const anim = prog?.animation.split(/ et |,/)[0].trim();
  if (anim && orateurs().includes(anim)) etat.orateur = anim;
  rendrePoint(); rendrePuces(); sauver();
}
$("btnSuiv").onclick = () => changerPoint(1);
$("btnPrec").onclick = () => changerPoint(-1);
$("ordre").addEventListener("input", () => { rendrePoint(); sauver(); });
$("orateurs").addEventListener("input", () => { rendrePuces(); sauver(); });
for (const id of champsMeta) $(id).addEventListener("change", sauver);
$("orateurLibre").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const nom = e.target.value.trim();
  if (!nom) return;
  etat.orateur = nom;
  e.target.value = "";
  rendrePuces(); sauver();
});
$("formNote").onsubmit = (e) => {
  e.preventDefault();
  ajouterTexte($("noteTexte").value, "note");
  $("noteTexte").value = "";
};
$("formVote").onsubmit = (e) => {
  e.preventDefault();
  const v = {
    id: crypto.randomUUID(), point: etat.pointIndex, pointTitre: points()[etat.pointIndex] || "",
    resolution: $("voteTexte").value.trim(),
    pour: +$("votePour").value || 0, contre: +$("voteContre").value || 0, abst: +$("voteAbst").value || 0,
  };
  v.issue = issueVote(v);
  etat.votes.push(v);
  etat.segments.push({ id: v.id, type: "vote", ts: Date.now(), tsFin: Date.now(), point: v.point, pointTitre: v.pointTitre, orateur: "Vote",
    texte: `${v.resolution} — ${v.pour} pour, ${v.contre} contre, ${v.abst} abstention(s) : ${v.issue}.` });
  e.target.reset();
  rendreTout(); sauver();
  alerte("Vote enregistré.");
};
$("btnExport").onclick = () => telecharger(`AG-Etoiles-Roi-${suffixe()}.json`, exportJson(), "application/json");
$("btnTxt").onclick = () => telecharger(`AG-Etoiles-Roi-${suffixe()}-transcription.txt`, texteTranscription(), "text/plain;charset=utf-8");
$("btnAudio").onclick = async () => {
  const m = await lireMorceaux().catch(() => []);
  if (!m.length) return alerte("Aucun audio enregistré pour cette séance.");
  telecharger(`AG-Etoiles-Roi-${suffixe()}-audio.webm`, new Blob(m.map((x) => x.blob), { type: m[0].type || "audio/webm" }));
};
$("btnCopier").onclick = async () => {
  const consigne = "Voici la transcription automatique de notre assemblée générale. Rédige le procès-verbal (compte rendu) officiel de l'association : en-tête, présents et quorum, ordre du jour, déroulé point par point, résolutions avec les résultats exacts des votes, clôture, signatures. N'invente rien : écris [à compléter] quand une information manque.\n\n";
  try { await navigator.clipboard.writeText(consigne + texteTranscription()); alerte("Copié : collez-le dans Claude."); }
  catch (e) { alerte("Copie impossible : utilisez plutôt « Transcription seule (.txt) »."); }
};
$("btnEffacer").onclick = async () => {
  if (ecoute) return alerte("Mettez d'abord l'écoute en pause.");
  if (!confirm("Tout effacer (transcription, votes et audio) ? Pensez à exporter la séance avant.")) return;
  etat = nouvelleSeance();
  cumulMs = 0;
  await viderMorceaux().catch(() => {});
  try { localStorage.removeItem(CLE); } catch (e) { /* rien */ }
  rendreTout(); majEtat(); majInfoAudio();
};
window.addEventListener("beforeunload", (e) => { if (ecoute) { e.preventDefault(); e.returnValue = ""; } });

const lien = $("lienRedaction");
if (URL_REDACTION.startsWith("https://")) lien.href = URL_REDACTION; else lien.hidden = true;

charger();
rendreTout();
majEtat();
majInfoAudio();
if (!SR) alerte("Ouvrez cet outil dans Google Chrome ou Microsoft Edge pour la transcription.");
