// STRAORDINARI - LOGICA APP (OCR on-device Home/Agenda, import/export, stima netto, simulazione)
// NOTA PRIVACY: nessun valore economico reale e' scritto in questo file.

const LS_KEY = "straordinari_giorni_v1";
const LS_SETTINGS = "straordinari_settings_v1";
const LS_ONBOARDED = "straordinari_onboarded_v1";
const LS_IMPORTED = "straordinari_imported_v1";
const LS_SCHERMATA = "straordinari_schermata_v1";

const MESI_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

const ORARIO_TEORICO_IN = "08:30";
const ORARIO_TEORICO_OUT = "17:00";
const ORARIO_INIZIO_CONTEGGIO = "08:00";   // se entri prima, conta dalle 08:00
const PAUSA_MINIMA = 30;
const MAX_STRAORD_GIORNALIERO_MIN = 120;   // 2 ore
const MAX_STRAORD_MENSILE_MIN = 20 * 60;   // 20 ore

let state = {
  giorni: [],
  settings: { tipoContratto: "indeterminato", ralAnnua: 0, mensilita: 13, pagaStraordinario: 0 },
  meseSelezionato: null
};
let giornoInModifica = null;
let schermataOcr = localStorage.getItem(LS_SCHERMATA) === "agenda" ? "agenda" : "home";

function $(id){ return document.getElementById(id); }
function on(id, evento, handler){
  const el = $(id);
  if(el){ el.addEventListener(evento, handler); return el; }
  console.warn("Elemento id non trovato: " + id + " - verifica che index.html sia aggiornato insieme a app.js");
  return null;
}
function openOv(id){ const e=$(id); if(e) e.classList.add("open"); }
function closeOv(id){ const e=$(id); if(e) e.classList.remove("open"); }

function loadState(){
  try{ const g = localStorage.getItem(LS_KEY); if(g) state.giorni = JSON.parse(g); }catch(e){}
  try{ const s = localStorage.getItem(LS_SETTINGS); if(s) Object.assign(state.settings, JSON.parse(s)); }catch(e){}
}
function saveGiorni(){ localStorage.setItem(LS_KEY, JSON.stringify(state.giorni)); }
function saveSettings(){ localStorage.setItem(LS_SETTINGS, JSON.stringify(state.settings)); }

// ==== UTILITA' ORARI ====
function timeToMinutes(t){
  if(!t) return null;
  const p = t.split(":");
  if(p.length !== 2) return null;
  const h = parseInt(p[0],10), m = parseInt(p[1],10);
  if(isNaN(h) || isNaN(m)) return null;
  return h*60 + m;
}
function minutesToHM(mins){
  if(mins == null || isNaN(mins)) return "0:00";
  const sign = mins < 0 ? "-" : "";
  mins = Math.abs(Math.round(mins));
  return sign + Math.floor(mins/60) + ":" + String(mins%60).padStart(2,"0");
}
function minutesToDecimal(mins){ return mins/60; }
function minutesToClock(totMin){
  totMin = ((totMin % 1440) + 1440) % 1440;
  return String(Math.floor(totMin/60)).padStart(2,"0") + ":" + String(totMin%60).padStart(2,"0");
}
const eur = (n) => (n||0).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2}) + " €";

// ==== CALCOLO STRAORDINARIO ====
function calcolaStraordinarioGrezzo(g){
  if(g.tipo && g.tipo !== "normale") return 0;
  let e1 = timeToMinutes(g.e1);
  const u1 = timeToMinutes(g.u1), e2 = timeToMinutes(g.e2), u2 = timeToMinutes(g.u2);
  if(e1 == null || u2 == null) return 0;
  const inizioMin = timeToMinutes(ORARIO_INIZIO_CONTEGGIO);
  if(e1 < inizioMin) e1 = inizioMin;             // entrata prima delle 08:00 = 08:00
  const orarioIn = timeToMinutes(ORARIO_TEORICO_IN);
  const orarioOut = timeToMinutes(ORARIO_TEORICO_OUT);
  const pausaReale = (u1 != null && e2 != null && e2 > u1) ? (e2 - u1) : 0;
  const pausaEffettiva = Math.max(pausaReale, PAUSA_MINIMA);
  const totaleLavorato = u2 - e1 - pausaEffettiva;
  const previsto = orarioOut - orarioIn - PAUSA_MINIMA;
  const diff = totaleLavorato - previsto;
  return diff > 0 ? diff : 0;
}
function calcolaStraordinarioMinutiCapGiorno(g){
  return Math.min(calcolaStraordinarioGrezzo(g), MAX_STRAORD_GIORNALIERO_MIN);
}
function calcolaFasciaStraordinario(g){
  const minutiCap = calcolaStraordinarioMinutiCapGiorno(g);
  if(minutiCap <= 0) return null;
  const u2 = timeToMinutes(g.u2);
  if(u2 == null) return null;
  return minutesToClock(u2 - minutiCap) + " - " + minutesToClock(u2);
}

function meseKeyOf(dataStr){ return dataStr.slice(0,7); }
function formatMeseLabel(meseKey){
  const [y,m] = meseKey.split("-").map(Number);
  return MESI_IT[m-1] + " " + y;
}
function getMesiDisponibili(){
  const set = new Set(state.giorni.map(g => meseKeyOf(g.data)));
  const oggi = new Date();
  set.add(oggi.getFullYear() + "-" + String(oggi.getMonth()+1).padStart(2,"0"));
  return Array.from(set).sort();
}
function renderTabs(){
  const container = $("monthTabs");
  if(!container) return;
  const mesi = getMesiDisponibili();
  if(!state.meseSelezionato || !mesi.includes(state.meseSelezionato)) state.meseSelezionato = mesi[mesi.length-1];
  container.innerHTML = "";
  mesi.forEach(m => {
    const btn = document.createElement("button");
    btn.className = "tab" + (m === state.meseSelezionato ? " active" : "");
    btn.textContent = formatMeseLabel(m);
    btn.onclick = () => { state.meseSelezionato = m; renderAll(); };
    container.appendChild(btn);
  });
}

// ==== STIMA NETTO (IRPEF 2026 / INPS) ====
const ALIQUOTA_INPS_LAVORATORE = 0.0919;

const SCAGLIONI_IRPEF_2026 = [
  { fino: 28000, aliquota: 0.23 },
  { fino: 50000, aliquota: 0.33 },
  { fino: Infinity, aliquota: 0.43 }
];

function calcolaIrpefAnnua(imponibileAnnuo){
  let imposta = 0;
  let sogliaPrec = 0;
  for(const scaglione of SCAGLIONI_IRPEF_2026){
    if(imponibileAnnuo > sogliaPrec){
      const base = Math.min(imponibileAnnuo, scaglione.fino) - sogliaPrec;
      imposta += base * scaglione.aliquota;
      sogliaPrec = scaglione.fino;
    } else break;
  }
  return imposta;
}

function calcolaDetrazioneLavoroDipendente(imponibileAnnuo){
  if(imponibileAnnuo <= 15000){
    return Math.min(1955, imponibileAnnuo * 0.667 + 690);
  } else if(imponibileAnnuo <= 28000){
    return 1910 + 1190 * (28000 - imponibileAnnuo) / 13000;
  } else if(imponibileAnnuo <= 50000){
    return 1910 * (50000 - imponibileAnnuo) / 22000;
  }
  return 0;
}

function calcolaCuneoFiscale(imponibileAnnuo){
  if(imponibileAnnuo <= 8500) return imponibileAnnuo * 0.071;
  if(imponibileAnnuo <= 15000) return imponibileAnnuo * 0.053;
  if(imponibileAnnuo <= 20000) return imponibileAnnuo * 0.048;
  if(imponibileAnnuo <= 32000) return 1000;
  if(imponibileAnnuo <= 40000) return 1000 * (40000 - imponibileAnnuo) / 8000;
  return 0;
}

function calcolaNettoDaLordo(lordoAnnuo, tipoContratto){
  const aliquotaInps = tipoContratto === "apprendistato" ? 0.0584 : ALIQUOTA_INPS_LAVORATORE;
  const contributiInps = lordoAnnuo * aliquotaInps;
  const imponibileFiscale = lordoAnnuo - contributiInps;

  const irpefLorda = calcolaIrpefAnnua(imponibileFiscale);
  const detrazione = calcolaDetrazioneLavoroDipendente(imponibileFiscale);
  const cuneo = calcolaCuneoFiscale(imponibileFiscale);

  const irpefNetta = Math.max(0, irpefLorda - detrazione);
  const nettoAnnuo = lordoAnnuo - contributiInps - irpefNetta + cuneo;

  return { nettoAnnuo, contributiInps, irpefNetta, cuneo, imponibileFiscale };
}

function percentualeNettaMarginale(ralAnnua, tipoContratto){
  const aliquotaInps = tipoContratto === "apprendistato" ? 0.0584 : ALIQUOTA_INPS_LAVORATORE;
  const imponibileStimato = ralAnnua * (1 - aliquotaInps);
  let aliquotaMarginale = 0.23;
  for(const scaglione of SCAGLIONI_IRPEF_2026){
    if(imponibileStimato <= scaglione.fino){ aliquotaMarginale = scaglione.aliquota; break; }
  }
  return (1 - aliquotaInps) * (1 - aliquotaMarginale);
}


function stimaMensile(ral, mensilita, tipo, oreStraord, pagaOraria){
  mensilita = mensilita || 13;
  const fissoLordo = ral / mensilita;
  const fissoNetto = calcolaNettoDaLordo(ral, tipo).nettoAnnuo / mensilita;
  const strLordo = oreStraord * (pagaOraria || 0);
  const strNetto = strLordo * percentualeNettaMarginale(ral, tipo);
  return { fissoLordo, fissoNetto, strLordo, strNetto,
           totLordo: fissoLordo + strLordo, totNetto: fissoNetto + strNetto };
}

function giorniDelMese(mese){
  return state.giorni.filter(g => meseKeyOf(g.data) === mese).sort((a,b) => a.data.localeCompare(b.data));
}
function oreStraordMeseCorrente(){
  const tot = giorniDelMese(state.meseSelezionato).reduce((acc,g) => acc + calcolaStraordinarioMinutiCapGiorno(g), 0);
  return { totMin: tot, effMin: Math.min(tot, MAX_STRAORD_MENSILE_MIN) };
}

function renderSummary(){
  const grid = $("summaryGrid");
  if(!grid) return;
  const giorniMese = giorniDelMese(state.meseSelezionato);
  const { totMin, effMin } = oreStraordMeseCorrente();
  const oltreTetto = totMin > MAX_STRAORD_MENSILE_MIN;
  const ore = minutesToDecimal(effMin);
  const s = state.settings;
  const box = (val, lab, cls) => '<div class="summary-box ' + (cls||"") + '"><div class="val">' + val + '</div><div class="lab">' + lab + '</div></div>';
  const tettoBox = oltreTetto
    ? '<div class="summary-box warn" style="grid-column:1/-1"><div class="lab">Straordinario mensile grezzo ' + minutesToHM(totMin) + ' h: limitato a 20h dal tetto contrattuale.</div></div>' : "";

  let html = '<div class="sec-title">Straordinari</div>' +
    box(ore.toFixed(2) + " h", "Ore straordinario (max 20h)") +
    box(giorniMese.length, "Giorni registrati");

  if(!s.ralAnnua){
    html += '<div class="summary-box" style="grid-column:1/-1"><div class="lab">Imposta RAL e tipo contratto in Impostazioni per vedere fisso, straordinari e totale stimati. I dati restano solo su questo telefono.</div></div>' + tettoBox;
    grid.innerHTML = html;
    return;
  }
  const st = stimaMensile(s.ralAnnua, s.mensilita, s.tipoContratto, ore, s.pagaStraordinario);
  html += box(eur(st.strLordo), "Straordinari lordi") + box(eur(st.strNetto), "Straordinari netti stimati");
  html = '<div class="sec-title">Stipendio fisso (senza straordinari)</div>' +
    box(eur(st.fissoLordo), "Fisso lordo mensile", "fisso") + box(eur(st.fissoNetto), "Fisso netto mensile", "fisso") + html;
  html += '<div class="sec-title">Totale stimato (fisso + straordinari)</div>' +
    box(eur(st.totLordo), "Totale lordo", "tot") + box(eur(st.totNetto), "Totale netto", "tot");
  html += tettoBox;
  html += '<div class="summary-box" style="grid-column:1/-1"><div class="lab">Calcolo con scaglioni IRPEF 2026, INPS e regole ' + (s.tipoContratto === "apprendistato" ? "apprendistato" : "tempo indeterminato") + ': non e\' una semplice percentuale fissa.</div></div>';
  grid.innerHTML = html;
}

function tipoLabel(t){ return ({permesso:"Permesso", ferie:"Ferie", malattia:"Malattia"})[t] || ""; }
function renderGiorniList(){
  const list = $("giorniList");
  if(!list) return;
  const giorniMese = giorniDelMese(state.meseSelezionato);
  if(giorniMese.length === 0){
    list.innerHTML = '<div class="empty-state"><div>📋</div>Nessuna giornata registrata<br>per questo mese</div>';
    return;
  }
  list.innerHTML = "";
  giorniMese.forEach(g => {
    const minutiCap = calcolaStraordinarioMinutiCapGiorno(g);
    const grezzo = calcolaStraordinarioGrezzo(g);
    const fascia = calcolaFasciaStraordinario(g);
    const dataObj = new Date(g.data + "T00:00:00");
    const giornoLabel = dataObj.toLocaleDateString("it-IT",{weekday:"short", day:"2-digit", month:"short"});
    const legacy = tipoLabel(g.tipo);
    const orariStr = legacy ? legacy : [g.e1,g.u1,g.e2,g.u2].map(x => x || "--").join(" · ");
    const cappato = grezzo > MAX_STRAORD_GIORNALIERO_MIN;
    const badgeClass = minutiCap === 0 ? "zero" : (cappato ? "capped" : "");
    const badgeTesto = minutiCap === 0 ? "0:00" : minutesToHM(minutiCap);
    const fasciaHtml = fascia ? '<div class="giorno-fascia-straord">' + fascia + (cappato ? " (limitato a 2h)" : "") + '</div>' : "";
    const div = document.createElement("div");
    div.className = "giorno-item";
    div.innerHTML =
      '<div class="giorno-left"><div class="giorno-data">' + giornoLabel + '</div><div class="giorno-orari">' + orariStr + '</div>' + fasciaHtml + '</div>' +
      '<div class="giorno-right"><div class="badge ' + badgeClass + '">' + badgeTesto + '</div>' +
      '<button class="btn-edit" data-id="' + g.id + '" title="Modifica">✏️</button>' +
      '<button class="btn-danger" data-id="' + g.id + '" title="Elimina">🗑️</button></div>';
    div.querySelector(".btn-danger").onclick = (e) => {
      e.stopPropagation();
      if(confirm("Eliminare questa giornata?")){
        state.giorni = state.giorni.filter(x => x.id !== g.id);
        saveGiorni(); renderAll();
      }
    };
    div.querySelector(".btn-edit").onclick = (e) => { e.stopPropagation(); apriModaleModifica(g); };
    div.addEventListener("click", () => apriModaleModifica(g));
    list.appendChild(div);
  });
}
function renderAll(){ renderTabs(); renderSummary(); renderGiorniList(); }

// ==== ONBOARDING ====
function checkOnboarding(){
  if(!$("onboardOverlay")) return;
  if(!localStorage.getItem(LS_ONBOARDED)) openOv("onboardOverlay");
}
on("btnOnboardSave","click",() => {
  const v = id => { const el=$(id); return el ? el.value : ""; };
  state.settings.tipoContratto = v("obTipoContratto") || "indeterminato";
  state.settings.ralAnnua = parseFloat(v("obRalAnnua")) || 0;
  state.settings.mensilita = parseInt(v("obMensilita"),10) || 13;
  state.settings.pagaStraordinario = parseFloat(v("obPagaStraordinario")) || 0;
  saveSettings();
  localStorage.setItem(LS_ONBOARDED,"1");
  closeOv("onboardOverlay"); renderAll();
});
on("btnOnboardSkip","click",() => { localStorage.setItem(LS_ONBOARDED,"1"); closeOv("onboardOverlay"); renderAll(); });

// ==== CAMPI ORARIO: input intelligente ====
// "800" -> 08:00, "1745" -> 17:45. Cifre non valide (ora > 23, minuti > 59) vengono ignorate.
const CAMPI_ORARIO = ["fE1","fU1","fE2","fU2"];

function costruisciOrario(cifre){
  let hs = "", ms = "";
  for(const ch of cifre){
    if(hs.length === 0){
      hs = (ch >= "3") ? "0" + ch : ch;
    } else if(hs.length === 1){
      const cand = hs + ch;
      if(parseInt(cand,10) <= 23) hs = cand;
      else { hs = "0" + hs; if(ch <= "5") ms = ch; }
    } else if(ms.length === 0){
      if(ch <= "5") ms = ch;
    } else if(ms.length === 1){
      ms += ch;
    }
  }
  const completo = hs.length === 2 && ms.length === 2;
  const testo = hs.length === 2 ? hs + ":" + ms : hs;
  return { testo, completo };
}
function orarioValido(t){ return /^([01]\d|2[0-3]):[0-5]\d$/.test(t); }

function formattaOrarioInput(el, idx){
  el.addEventListener("input", (ev) => {
    let cifre = el.value.replace(/\D/g,"");
    if(ev.inputType && ev.inputType.startsWith("delete") && /:$/.test(el.value)) cifre = cifre.slice(0,-1);
    const r = costruisciOrario(cifre);
    el.value = r.testo;
    if(r.completo){
      const next = $(CAMPI_ORARIO[idx+1]);
      if(next){ next.focus(); if(next.select) next.select(); }
      else el.blur();
    }
  });
  el.addEventListener("focus", () => { if(el.select) el.select(); });
  el.addEventListener("blur", () => {
    if(!el.value) return;
    const cifre = el.value.replace(/\D/g,"");
    const r = costruisciOrario((cifre + "0000").slice(0,4));
    el.value = r.completo ? r.testo : "";
  });
}
function attivaTastieraNumericaOrari(){
  CAMPI_ORARIO.forEach((id,i) => { const el=$(id); if(el) formattaOrarioInput(el,i); });
}

// ==== MODALE GIORNATA ====
function resetOcrUI(){
  const c1=$("ocrInputCamera"), c2=$("ocrInputGallery");
  if(c1) c1.value=""; if(c2) c2.value="";
  const p=$("ocrPreview"), s=$("ocrStatus"), b=$("ocrBanner");
  if(p) p.style.display="none";
  if(s) s.style.display="none";
  if(b){ b.style.display="none"; b.className="ocr-result-banner"; }
}
function apriModaleNuova(){
  giornoInModifica = null;
  const t=$("modalTitolo"); if(t) t.textContent="Nuova giornata";
  const d=$("btnDeleteFromModal"); if(d) d.style.display="none";
  const fd=$("fData"); if(fd) fd.value=new Date().toISOString().slice(0,10);
  CAMPI_ORARIO.forEach(id => { const el=$(id); if(el) el.value=""; });
  resetOcrUI(); aggiornaChipSchermata(); openOv("modalOverlay");
}
function apriModaleModifica(g){
  giornoInModifica = g.id;
  const t=$("modalTitolo"); if(t) t.textContent="Modifica giornata";
  const d=$("btnDeleteFromModal"); if(d) d.style.display="block";
  const set=(id,v)=>{ const el=$(id); if(el) el.value=v||""; };
  set("fData",g.data); set("fE1",g.e1); set("fU1",g.u1); set("fE2",g.e2); set("fU2",g.u2);
  resetOcrUI(); aggiornaChipSchermata(); openOv("modalOverlay");
}
on("btnAdd","click",apriModaleNuova);
on("btnCancel","click",() => closeOv("modalOverlay"));
on("btnDeleteFromModal","click",() => {
  if(!giornoInModifica) return;
  if(!confirm("Eliminare questa giornata?")) return;
  state.giorni = state.giorni.filter(x => x.id !== giornoInModifica);
  saveGiorni(); closeOv("modalOverlay"); renderAll();
});
const modalOverlayEl = $("modalOverlay");
if(modalOverlayEl) modalOverlayEl.addEventListener("click", e => { if(e.target === modalOverlayEl) closeOv("modalOverlay"); });

on("btnSave","click",() => {
  const data = $("fData") ? $("fData").value : "";
  if(!data){ alert("Inserisci una data"); return; }
  const val = {};
  for(const id of CAMPI_ORARIO){
    const v = ($(id).value || "").trim();
    if(v && !orarioValido(v)){ alert("Orario non valido (" + id.replace("f","") + "): usa HH:MM tra 00:00 e 23:59."); $(id).focus(); return; }
    val[id] = v;
  }
  const idDaUsare = giornoInModifica || Date.now().toString();
  const nuova = { id:idDaUsare, data, tipo:"normale", e1:val.fE1, u1:val.fU1, e2:val.fE2, u2:val.fU2,
                  orarioIn:ORARIO_TEORICO_IN, orarioOut:ORARIO_TEORICO_OUT };
  if(giornoInModifica) state.giorni = state.giorni.filter(g => g.id !== giornoInModifica);
  else state.giorni = state.giorni.filter(g => g.data !== data);
  state.giorni.push(nuova);
  saveGiorni();
  state.meseSelezionato = meseKeyOf(data);
  giornoInModifica = null;
  closeOv("modalOverlay"); renderAll();
});

// ==== IMPOSTAZIONI ====
on("btnSettings","click",() => {
  const set=(id,v)=>{ const el=$(id); if(el) el.value=v; };
  set("sTipoContratto", state.settings.tipoContratto || "indeterminato");
  set("sRalAnnua", state.settings.ralAnnua);
  set("sMensilita", state.settings.mensilita || 13);
  set("sPagaStraordinario", state.settings.pagaStraordinario);
  openOv("settingsOverlay"); aggiornaStatoImport();
});
on("btnSettingsBack","click",() => closeOv("settingsOverlay"));
const settingsOverlayEl = $("settingsOverlay");
if(settingsOverlayEl) settingsOverlayEl.addEventListener("click", e => { if(e.target === settingsOverlayEl) closeOv("settingsOverlay"); });
on("btnSettingsSave","click",() => {
  const v = id => { const el=$(id); return el ? el.value : ""; };
  state.settings.tipoContratto = v("sTipoContratto") || "indeterminato";
  state.settings.ralAnnua = parseFloat(v("sRalAnnua")) || 0;
  state.settings.mensilita = parseInt(v("sMensilita"),10) || 13;
  state.settings.pagaStraordinario = parseFloat(v("sPagaStraordinario")) || 0;
  saveSettings(); closeOv("settingsOverlay"); renderAll();
});
on("btnExport","click",() => {
  const dataStr = JSON.stringify({ giorni: state.giorni, settings: state.settings }, null, 2);
  const blob = new Blob([dataStr], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "straordinari-backup.json"; a.click();
  URL.revokeObjectURL(url);
});
function aggiornaStatoImport(){
  const el = $("importStatus"); if(!el) return;
  const imp = localStorage.getItem(LS_IMPORTED);
  if(imp){
    el.textContent = "Dati importati il " + new Date(parseInt(imp,10)).toLocaleDateString("it-IT") + ". Sono in cache: non serve ricaricare il file.";
    el.className = "import-status ok";
  } else {
    el.textContent = "Nessuna importazione ancora effettuata.";
    el.className = "import-status";
  }
}
on("importInput","change",(e) => {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try{
      const parsed = JSON.parse(evt.target.result);
      const nuovi = Array.isArray(parsed.giorni) ? parsed.giorni : (Array.isArray(parsed) ? parsed : []);
      const mappa = new Map(state.giorni.map(g => [g.data, g]));
      nuovi.forEach(g => mappa.set(g.data, g));
      state.giorni = Array.from(mappa.values());
      saveGiorni();
      localStorage.setItem(LS_IMPORTED, Date.now().toString());
      aggiornaStatoImport(); renderAll();
      alert("Importazione completata: " + nuovi.length + " giornate caricate.");
    }catch(err){ alert("Il file selezionato non e' un JSON valido per questa app."); }
  };
  reader.onerror = () => alert("Non sono riuscito a leggere il file selezionato. Riprova.");
  reader.readAsText(file);
});

// ==== SIMULAZIONE ====
function simValoriReali(){
  const s = state.settings;
  const ore = minutesToDecimal(oreStraordMeseCorrente().effMin);
  $("simRal").value = s.ralAnnua || "";
  $("simMensilita").value = String(s.mensilita || 13);
  $("simTipo").value = s.tipoContratto || "indeterminato";
  $("simPaga").value = s.pagaStraordinario || "";
  $("simOre").value = ore ? ore.toFixed(2) : "";
  simCalcola();
}
function simCalcola(){
  const out = $("simResult"); if(!out) return;
  const ral = parseFloat($("simRal").value) || 0;
  const mens = parseInt($("simMensilita").value,10) || 13;
  const tipo = $("simTipo").value;
  const ore = parseFloat($("simOre").value) || 0;
  const paga = parseFloat($("simPaga").value) || 0;
  if(!ral){ out.innerHTML = '<div class="summary-box" style="grid-column:1/-1"><div class="lab">Inserisci una RAL per vedere la simulazione.</div></div>'; return; }
  const sim = stimaMensile(ral, mens, tipo, ore, paga);
  const s = state.settings;
  const oreReali = minutesToDecimal(oreStraordMeseCorrente().effMin);
  const box = (v,l,c) => '<div class="summary-box ' + (c||"") + '"><div class="val">' + v + '</div><div class="lab">' + l + '</div></div>';
  let html = '<div class="sec-title">Fisso (senza straordinari)</div>' +
    box(eur(sim.fissoLordo),"Fisso lordo mensile","fisso") + box(eur(sim.fissoNetto),"Fisso netto mensile","fisso") +
    '<div class="sec-title">Straordinari</div>' +
    box(eur(sim.strLordo),"Straordinari lordi") + box(eur(sim.strNetto),"Straordinari netti") +
    '<div class="sec-title">Totale simulato</div>' +
    box(eur(sim.totLordo),"Totale lordo","tot") + box(eur(sim.totNetto),"Totale netto","tot");
  if(ore > 20) html += '<div class="summary-box warn" style="grid-column:1/-1"><div class="lab">Attenzione: il tetto contrattuale e\' 20h/mese, qui stai simulando ' + ore + 'h.</div></div>';
  if(s.ralAnnua){
    const reale = stimaMensile(s.ralAnnua, s.mensilita, s.tipoContratto, oreReali, s.pagaStraordinario);
    const diff = sim.totNetto - reale.totNetto;
    html += '<div class="sim-diff ' + (diff>=0?"pos":"neg") + '" style="grid-column:1/-1">Rispetto alla situazione reale (' + eur(reale.totNetto) + ' netti): ' + (diff>=0?"+":"") + eur(diff) + ' al mese</div>';
  }
  out.innerHTML = html;
}
on("btnSim","click",() => { simValoriReali(); openOv("simOverlay"); });
on("btnSimBack","click",() => closeOv("simOverlay"));
on("btnSimReset","click",simValoriReali);
["simRal","simMensilita","simTipo","simOre","simPaga"].forEach(id => { const el=$(id); if(el){ el.addEventListener("input",simCalcola); el.addEventListener("change",simCalcola); } });
const simOverlayEl = $("simOverlay");
if(simOverlayEl) simOverlayEl.addEventListener("click", e => { if(e.target === simOverlayEl) closeOv("simOverlay"); });

// ==== OCR (Tesseract.js, on-device) ====
on("ocrInputCamera","change",(e) => processaImmagine(e.target.files[0]));
on("ocrInputGallery","change",(e) => processaImmagine(e.target.files[0]));

function aggiornaChipSchermata(){
  document.querySelectorAll("#schermataChips .chip").forEach(c => c.classList.toggle("active", c.dataset.schermata === schermataOcr));
}
document.querySelectorAll("#schermataChips .chip").forEach(c => {
  c.onclick = () => { schermataOcr = c.dataset.schermata; localStorage.setItem(LS_SCHERMATA, schermataOcr); aggiornaChipSchermata(); };
});

function punteggioLettura(r){
  return r.orari.filter(x => x).length * 10 + (r.completo ? 100 : 0) + Math.min(r.totale, 8);
}

// Lettura in 1-2 passate: prima immagine in bianco/nero; se il risultato non e' completo,
// seconda passata in scala di grigi con contrasto. Si tiene la lettura migliore.
async function eseguiOcr(imgUrl, setTesto){
  const logger = (m) => { if(m.status === "recognizing text") setTesto("Lettura testo... " + Math.round(m.progress*100) + "%"); };
  let worker = null;
  try{
    worker = await Tesseract.createWorker("ita+eng", 1, { logger });
    await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
  }catch(e){ console.warn("Worker non disponibile, uso recognize()", e); worker = null; }
  const run = async (canvas) => {
    if(worker) return (await worker.recognize(canvas)).data.text;
    return (await Tesseract.recognize(canvas, "ita+eng", { logger })).data.text;
  };
  try{
    const c1 = await preprocessImage(imgUrl, true);
    let testo = await run(c1);
    let r = leggiScreenshot(testo, schermataOcr);
    if(!r.completo){
      setTesto("Seconda lettura per maggiore precisione...");
      const c2 = await preprocessImage(imgUrl, false);
      const testo2 = await run(c2);
      const r2 = leggiScreenshot(testo2, schermataOcr);
      if(punteggioLettura(r2) > punteggioLettura(r)){ testo = testo2; r = r2; }
    }
    return { testo, r };
  } finally {
    if(worker){ try{ await worker.terminate(); }catch(e){} }
  }
}

async function processaImmagine(file){
  if(!file) return;
  const ocrPreview=$("ocrPreview"), ocrStatus=$("ocrStatus"), ocrStatusText=$("ocrStatusText"), ocrBanner=$("ocrBanner");
  const setTesto = (t) => { if(ocrStatusText) ocrStatusText.textContent = t; };
  if(typeof Tesseract === "undefined"){
    if(ocrBanner){ ocrBanner.textContent="Motore OCR non disponibile: verifica la connessione internet al primo utilizzo. Inserisci gli orari manualmente."; ocrBanner.className="ocr-result-banner warn"; }
    return;
  }
  const imgUrl = URL.createObjectURL(file);
  if(ocrPreview){ ocrPreview.src=imgUrl; ocrPreview.style.display="block"; }
  if(ocrBanner) ocrBanner.style.display="none";
  if(ocrStatus) ocrStatus.style.display="flex";
  setTesto("Preparazione immagine...");
  const setVal=(id,v)=>{ const el=$(id); if(el) el.value=v; };
  try{
    const { testo, r } = await eseguiOcr(imgUrl, setTesto);
    if(ocrStatus) ocrStatus.style.display="none";
    const ids = ["fE1","fU1","fE2","fU2"];
    const trovati = r.orari.filter(x => x).length;
    if(trovati > 0) ids.forEach((id,i) => setVal(id, r.orari[i] || ""));
    const nomeSch = r.schermata === "agenda" ? "Agenda" : "Home";
    const auto = r.cambiata ? " (riconosciuta automaticamente)" : "";
    let msg, cls;
    if(r.completo){
      msg = "Schermata " + nomeSch + auto + ": letti " + r.totale + " orari, usati " + r.orari.join(" · ") + (r.totale > 4 ? " (ingresso, uscita pranzo, rientro pranzo, uscita finale)" : "") + ". Controlla e correggi se serve.";
      cls = "ok";
    } else if(trovati > 0){
      const nomi = ["Entrata mattina","Uscita pausa","Rientro pausa","Uscita sera"];
      const mancanti = r.orari.map((v,i) => v ? null : nomi[i]).filter(x => x);
      msg = "Schermata " + nomeSch + auto + ": letti " + r.totale + " orari ma ne mancano " + (4-trovati) + " (" + mancanti.join(", ") + "). Compila a mano i campi vuoti e controlla gli altri.";
      if(r.ingressoMancante && r.suggerimentoIngresso) msg += " Dal Turno previsto l'ingresso potrebbe essere " + r.suggerimentoIngresso + " (da verificare).";
      cls = "warn";
    } else {
      msg = "Nessuna timbratura trovata come schermata " + nomeSch + ". Controlla di aver scelto il tipo giusto (Home / Agenda) oppure inserisci i valori a mano.";
      cls = "warn";
    }
    if(r.totale % 2 === 1 && r.completo) { msg += " Attenzione: numero di timbrature dispari, controlla."; cls = "warn"; }
    const dataRilevata = estraiData(testo);
    if(dataRilevata){
      setVal("fData", dataRilevata);
    } else if(r.schermata === "agenda"){
      setVal("fData", "");
      msg += " Nell'Agenda il giorno non e' leggibile: seleziona la data."; cls = "warn";
    }
    if(ocrBanner){ ocrBanner.textContent = msg; ocrBanner.className = "ocr-result-banner " + cls; }
  }catch(err){
    console.error(err);
    if(ocrStatus) ocrStatus.style.display="none";
    if(ocrBanner){ ocrBanner.textContent="Errore nella lettura. Inserisci gli orari manualmente."; ocrBanner.className="ocr-result-banner warn"; }
  }
}

function preprocessImage(imgUrl, binarizza){
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.max(1, 1600 / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for(let i=0; i<data.length; i+=4){
        const gray = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
        let v;
        if(binarizza) v = gray > 150 ? 255 : 0;
        else v = Math.max(0, Math.min(255, (gray - 128) * 1.5 + 128));
        data[i] = data[i+1] = data[i+2] = v;
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas);
    };
    img.src = imgUrl;
  });
}

// ---- Schermata HOME: riquadro TIMBRATURE ----
function estraiOrariTimbrature(testo){
  const pulito = testo.replace(/[oO](?=\d|\s|$)/g, "0").replace(/[lI](?=\d|\s|$)/g, "1");
  const idxTimbrature = pulito.search(/TIMBRATURE/i);
  const idxGiustificativi = pulito.search(/GIUSTIFICATIV/i);
  let zonaUtile;
  if(idxTimbrature !== -1){
    const fine = idxGiustificativi !== -1 && idxGiustificativi > idxTimbrature ? idxGiustificativi : pulito.length;
    zonaUtile = pulito.slice(idxTimbrature, fine);
  } else {
    zonaUtile = pulito;
  }
  const regex = /(?:^|[^\d])([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/g;
  const trovati = [];
  let match;
  while((match = regex.exec(zonaUtile)) !== null){
    trovati.push(match[1].padStart(2,"0") + ":" + match[2]);
  }
  return trovati;
}
// N timbrature -> ingresso, uscita pranzo, rientro pranzo, uscita finale.
// Pranzo = intervallo uscita->rientro piu' lungo; le uscite brevi vengono ignorate.
function selezionaQuattroOrari(tutti){
  const n = tutti.length;
  if(n <= 4) return tutti.slice();
  const min = tutti.map(timeToMinutes);
  if(n % 2 === 0){
    let best = 1, bestGap = -1;
    for(let i=1; i<n-1; i+=2){
      const gap = min[i+1] - min[i];
      if(gap > bestGap){ bestGap = gap; best = i; }
    }
    return [tutti[0], tutti[best], tutti[best+1], tutti[n-1]];
  }
  return [tutti[0], tutti[1], tutti[2], tutti[n-1]];
}

// ---- Schermata AGENDA: righe "HH:MM Timbratura Entrata/Uscita" ----
// Ignora "Turno previsto" e "TOT. ORE", che non sono timbrature.
function estraiTimbratureAgenda(testo){
  const regex = /([01]?\d|2[0-3])[:.]([0-5]\d)[^\dA-Za-z\n]{0,3}\s*T\w{2,3}bratur\w*\s+(E|U)/gi;
  const items = [];
  let m;
  while((m = regex.exec(testo)) !== null){
    items.push({ t: m[1].padStart(2,"0") + ":" + m[2], k: m[3].toUpperCase() });
  }
  return items;
}
function estraiTurnoPrevisto(testo){
  const m = testo.match(/Turno\s+previst\w*\s*:?\s*([^\n]+)/i);
  if(!m) return [];
  const out = [];
  const re = /([01]?\d|2[0-3])[:.]([0-5]\d)/g;
  let x;
  while((x = re.exec(m[1])) !== null) out.push(x[1].padStart(2,"0") + ":" + x[2]);
  return out;
}
// Mappa le timbrature sui 4 campi RISPETTANDO il tipo (E/U): se manca l'ingresso il campo resta vuoto
// e le altre timbrature non scalano di posto.
//  - Ingresso: prima riga solo se e' un'Entrata
//  - Uscita finale: ultima Uscita
//  - Pranzo: coppia Uscita->Entrata consecutiva con intervallo piu' lungo
function mappaConTipi(items){
  const res = { orari:["","","",""], ingressoMancante:false };
  if(items.length === 0) return res;
  const haIngresso = items[0].k === "E";
  let iOut = -1;
  for(let i=items.length-1; i>=0; i--){ if(items[i].k === "U"){ iOut = i; break; } }
  if(haIngresso) res.orari[0] = items[0].t; else res.ingressoMancante = true;
  if(iOut >= 0 && iOut > (haIngresso ? 0 : -1)) res.orari[3] = items[iOut].t;
  let best = -1, bestGap = -1;
  for(let i=(haIngresso?1:0); i<iOut; i++){
    if(items[i].k === "U" && items[i+1] && items[i+1].k === "E" && i+1 < iOut){
      const gap = timeToMinutes(items[i+1].t) - timeToMinutes(items[i].t);
      if(gap > bestGap){ bestGap = gap; best = i; }
    }
  }
  if(best >= 0){ res.orari[1] = items[best].t; res.orari[2] = items[best+1].t; }
  return res;
}

function leggiScreenshot(testo, schermata){
  const haHeaderHome = /TIMBRATURE/i.test(testo);
  const agenda = estraiTimbratureAgenda(testo);
  let usa = schermata, cambiata = false;
  if(schermata === "agenda" && agenda.length === 0 && haHeaderHome){ usa = "home"; cambiata = true; }
  else if(schermata === "home" && !haHeaderHome && agenda.length > 0){ usa = "agenda"; cambiata = true; }
  if(usa === "agenda"){
    const m = mappaConTipi(agenda);
    const turno = estraiTurnoPrevisto(testo);
    return { schermata:"agenda", cambiata, totale:agenda.length, orari:m.orari,
             completo: m.orari.every(x => x), ingressoMancante: m.ingressoMancante,
             suggerimentoIngresso: turno.length ? turno[0] : "" };
  }
  const tutti = haHeaderHome ? estraiOrariTimbrature(testo) : [];
  const sel = selezionaQuattroOrari(tutti);
  while(sel.length < 4) sel.push("");
  return { schermata:"home", cambiata, totale:tutti.length, orari:sel,
           completo: sel.every(x => x) && tutti.length % 2 === 0, ingressoMancante:false, suggerimentoIngresso:"" };
}

function estraiData(testo){
  const mesiMap = {
    gennaio:1, gen:1, febbraio:2, feb:2, marzo:3, mar:3, aprile:4, apr:4,
    maggio:5, mag:5, may:5, giugno:6, giu:6, jun:6, luglio:7, lug:7, jul:7,
    agosto:8, ago:8, aug:8, settembre:9, set:9, sep:9, ottobre:10, ott:10, oct:10,
    novembre:11, nov:11, dicembre:12, dic:12, dec:12
  };
  const m = testo.match(/(\d{1,2})\s+([A-Za-zàèìòù]{3,})\s+(\d{4})/i);
  if(m){
    const giorno = m[1].padStart(2,"0");
    const mese = mesiMap[m[2].toLowerCase()];
    if(mese) return m[3] + "-" + String(mese).padStart(2,"0") + "-" + giorno;
  }
  return null;
}

// ==== INIT ====
loadState();
renderAll();
checkOnboarding();
attivaTastieraNumericaOrari();
aggiornaChipSchermata();

if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err => console.log("SW error", err));
  });
}
