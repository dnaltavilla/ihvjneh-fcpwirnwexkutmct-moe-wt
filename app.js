// ==== STRAORDINARI - LOGICA APP (OCR + import JSON + modifica + stima netto realistica) ====
// NOTA PRIVACY: nessun valore economico reale e' scritto in questo file.
const LS_KEY = "straordinari_giorni_v1";
const LS_SETTINGS = "straordinari_settings_v1";
const LS_ONBOARDED = "straordinari_onboarded_v1";
const LS_IMPORTED = "straordinari_imported_v1";

const MESI_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

let state = {
  giorni: [],
  settings: {
    tipoContratto: "indeterminato",
    ralAnnua: 0,
    mensilita: 13,
    pagaStraordinario: 0,
    giorniTeorici: 22
  },
  meseSelezionato: null
};

let giornoInModifica = null; // id della giornata attualmente in editing, null = nuova

function on(id, evento, handler){
  const el = document.getElementById(id);
  if(el){
    el.addEventListener(evento, handler);
    return el;
  } else {
    console.warn(`Elemento #${id} non trovato: verifica che index.html sia aggiornato insieme a app.js`);
    return null;
  }
}

function loadState(){
  try{
    const g = localStorage.getItem(LS_KEY);
    if(g) state.giorni = JSON.parse(g);
  }catch(e){ state.giorni = []; }
  try{
    const s = localStorage.getItem(LS_SETTINGS);
    if(s) state.settings = Object.assign(state.settings, JSON.parse(s));
  }catch(e){}
}
function saveGiorni(){ localStorage.setItem(LS_KEY, JSON.stringify(state.giorni)); }
function saveSettings(){ localStorage.setItem(LS_SETTINGS, JSON.stringify(state.settings)); }

function timeToMinutes(t){
  if(!t) return null;
  const parts = t.split(":");
  if(parts.length !== 2) return null;
  const h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
  if(isNaN(h) || isNaN(m)) return null;
  return h*60+m;
}
function minutesToHM(mins){
  if(mins === null || isNaN(mins)) return "0:00";
  const sign = mins < 0 ? "-" : "";
  mins = Math.abs(Math.round(mins));
  const h = Math.floor(mins/60);
  const m = mins % 60;
  return `${sign}${h}:${String(m).padStart(2,"0")}`;
}
function minutesToDecimal(mins){ return mins/60; }

const PAUSA_MINIMA = 30;

function calcolaStraordinario(g){
  if(g.tipo !== "normale") return 0;
  const e1 = timeToMinutes(g.e1), u1 = timeToMinutes(g.u1);
  const e2 = timeToMinutes(g.e2), u2 = timeToMinutes(g.u2);
  const orarioIn = timeToMinutes(g.orarioIn || "08:30");
  const orarioOut = timeToMinutes(g.orarioOut || "17:00");
  if(e1===null || u2===null) return 0;

  const pausaReale = (u1!==null && e2!==null && e2>u1) ? (e2-u1) : 0;
  const pausaEffettiva = Math.max(pausaReale, PAUSA_MINIMA);

  const totaleLavorato = (u2 - e1) - pausaEffettiva;
  const previsto = (orarioOut - orarioIn) - PAUSA_MINIMA;

  const diff = totaleLavorato - previsto;
  return diff > 0 ? minutesToDecimal(diff) : 0;
}

// ============================================================
// ==== MOTORE STIMA NETTO REALISTICO (IRPEF 2026 + INPS + apprendistato) ====
// Stessa logica del progetto "ral-netto-calculator": scaglioni IRPEF 2026,
// contributi INPS lavoratore 9,19%, differenza apprendistato/indeterminato,
// applicata qui allo stipendio base + straordinari fatti nel mese.
// ============================================================
const ALIQUOTA_INPS_LAVORATORE = 0.0919; // aliquota standard dipendenti

// Scaglioni IRPEF 2026 (Legge di Bilancio 2026)
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

// Detrazione lavoro dipendente 2026 (semplificata, decrescente con il reddito)
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

// Bonus/cuneo fiscale 2026: esonero contributivo o detrazione fissa a seconda della fascia
function calcolaCuneoFiscale(imponibileAnnuo){
  if(imponibileAnnuo <= 8500) return imponibileAnnuo * 0.071;
  if(imponibileAnnuo <= 15000) return imponibileAnnuo * 0.053;
  if(imponibileAnnuo <= 20000) return imponibileAnnuo * 0.048;
  if(imponibileAnnuo <= 32000) return 1000;
  if(imponibileAnnuo <= 40000) return 1000 * (40000 - imponibileAnnuo) / 8000;
  return 0;
}

// Calcola netto annuo/mensile da RAL lorda annua, tenendo conto di:
// - contratto apprendistato: aliquota INPS lavoratore ridotta (5,84% vs 9,19% standard)
// - scaglioni IRPEF 2026, detrazione lavoro dipendente, cuneo fiscale
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

// Stima l'incidenza netta (%) di un euro aggiuntivo di straordinario,
// usando l'aliquota marginale del proprio scaglione IRPEF + INPS.
function percentualeNettaMarginale(ralAnnua, tipoContratto){
  const aliquotaInps = tipoContratto === "apprendistato" ? 0.0584 : ALIQUOTA_INPS_LAVORATORE;
  const imponibileStimato = ralAnnua * (1 - aliquotaInps);
  let aliquotaMarginale = 0.23;
  for(const scaglione of SCAGLIONI_IRPEF_2026){
    if(imponibileStimato <= scaglione.fino){ aliquotaMarginale = scaglione.aliquota; break; }
  }
  return (1 - aliquotaInps) * (1 - aliquotaMarginale);
}

function meseKeyOf(dataStr){ return dataStr.slice(0,7); }
function formatMeseLabel(meseKey){
  const [y,m] = meseKey.split("-").map(Number);
  return `${MESI_IT[m-1]} ${y}`;
}
function getMesiDisponibili(){
  const set = new Set(state.giorni.map(g => meseKeyOf(g.data)));
  const oggi = new Date();
  const meseCorrente = `${oggi.getFullYear()}-${String(oggi.getMonth()+1).padStart(2,"0")}`;
  set.add(meseCorrente);
  return Array.from(set).sort();
}

function renderTabs(){
  const container = document.getElementById("monthTabs");
  if(!container) return;
  const mesi = getMesiDisponibili();
  if(!state.meseSelezionato || !mesi.includes(state.meseSelezionato)){
    state.meseSelezionato = mesi[mesi.length-1];
  }
  container.innerHTML = "";
  mesi.forEach(m => {
    const btn = document.createElement("button");
    btn.className = "tab" + (m === state.meseSelezionato ? " active" : "");
    btn.textContent = formatMeseLabel(m);
    btn.onclick = () => { state.meseSelezionato = m; renderAll(); };
    container.appendChild(btn);
  });
}

function renderSummary(){
  const grid = document.getElementById("summaryGrid");
  if(!grid) return;

  const mese = state.meseSelezionato;
  const giorniMese = state.giorni.filter(g => meseKeyOf(g.data) === mese)
                                  .sort((a,b)=> a.data.localeCompare(b.data));

  const totaleOreStraordinario = giorniMese.reduce((acc,g) => acc + calcolaStraordinario(g), 0);
  const giorniLavorati = giorniMese.filter(g => g.tipo === "normale").length;

  const s = state.settings;

  if(!s.ralAnnua || s.ralAnnua === 0){
    grid.innerHTML = `
      <div class="summary-box" style="grid-column:1/3;">
        <div class="lab">Imposta RAL e tipo contratto in ⚙️ Impostazioni per vedere qui la stima netto realistica (scaglioni IRPEF 2026). I dati restano solo su questo telefono.</div>
      </div>
      <div class="summary-box"><div class="val">${totaleOreStraordinario.toFixed(2)} h</div><div class="lab">Straordinario totale</div></div>
      <div class="summary-box"><div class="val">${giorniLavorati}</div><div class="lab">Giorni lavorati</div></div>
    `;
    return;
  }

  const mensilita = s.mensilita || 13;
  const stipendioBaseMensile = s.ralAnnua / mensilita;
  const pagaStraordinarioTot = totaleOreStraordinario * (s.pagaStraordinario || 0);

  const pctNettaMarginale = percentualeNettaMarginale(s.ralAnnua, s.tipoContratto);
  const nettoStraordinario = pagaStraordinarioTot * pctNettaMarginale;

  const { nettoAnnuo } = calcolaNettoDaLordo(s.ralAnnua, s.tipoContratto);
  const nettoBaseMensile = nettoAnnuo / mensilita;

  const nettoMeseStimato = nettoBaseMensile + nettoStraordinario;
  const lordoMeseStimato = stipendioBaseMensile + pagaStraordinarioTot;

  const labelContratto = s.tipoContratto === "apprendistato" ? "Apprendistato" : "T. indeterminato";

  grid.innerHTML = `
    <div class="summary-box"><div class="val">${totaleOreStraordinario.toFixed(2)} h</div><div class="lab">Straordinario totale</div></div>
    <div class="summary-box"><div class="val">${giorniLavorati}</div><div class="lab">Giorni lavorati</div></div>
    <div class="summary-box"><div class="val">${pagaStraordinarioTot.toFixed(2)} €</div><div class="lab">Straordinario lordo</div></div>
    <div class="summary-box"><div class="val">${nettoStraordinario.toFixed(2)} €</div><div class="lab">Straordinario netto stimato</div></div>
    <div class="summary-box"><div class="val">${lordoMeseStimato.toFixed(2)} €</div><div class="lab">Stima mese lordo</div></div>
    <div class="summary-box"><div class="val">${nettoMeseStimato.toFixed(2)} €</div><div class="lab">Stima mese netto</div></div>
    <div class="summary-box" style="grid-column:1/3;"><div class="lab">Calcolo con scaglioni IRPEF 2026, INPS e regole ${labelContratto} — non una semplice percentuale fissa.</div></div>
  `;
}

function tipoLabel(t){
  return {normale:"", permesso:"Permesso", ferie:"Ferie", malattia:"Malattia"}[t] || "";
}

function renderGiorniList(){
  const list = document.getElementById("giorniList");
  if(!list) return;

  const mese = state.meseSelezionato;
  const giorniMese = state.giorni.filter(g => meseKeyOf(g.data) === mese)
                                  .sort((a,b)=> a.data.localeCompare(b.data));

  if(giorniMese.length === 0){
    list.innerHTML = `<div class="empty-state"><div>📅</div>Nessuna giornata registrata<br>per questo mese</div>`;
    return;
  }

  list.innerHTML = "";
  giorniMese.forEach(g => {
    const straord = calcolaStraordinario(g);
    const dataObj = new Date(g.data + "T00:00:00");
    const giornoLabel = dataObj.toLocaleDateString("it-IT", {weekday:"short", day:"2-digit", month:"short"});

    let orariStr = "";
    if(g.tipo !== "normale"){
      orariStr = tipoLabel(g.tipo);
    } else {
      orariStr = `${g.e1||"--"} · ${g.u1||"--"} / ${g.e2||"--"} · ${g.u2||"--"}`;
    }

    const div = document.createElement("div");
    div.className = "giorno-item";
    div.innerHTML = `
      <div class="giorno-left">
        <div class="giorno-data">${giornoLabel}</div>
        <div class="giorno-orari">${orariStr}</div>
      </div>
      <div class="giorno-right">
        <div class="badge ${straord===0 ? 'zero':''}">${straord>0 ? minutesToHM(straord*60) : (g.tipo!=='normale' ? tipoLabel(g.tipo) : '0:00')}</div>
        <button class="btn-edit" data-id="${g.id}" title="Modifica">✏️</button>
        <button class="btn-danger" data-id="${g.id}" title="Elimina">✕</button>
      </div>
    `;
    div.querySelector(".btn-danger").onclick = (e) => {
      e.stopPropagation();
      if(confirm("Eliminare questa giornata?")){
        state.giorni = state.giorni.filter(x => x.id !== g.id);
        saveGiorni();
        renderAll();
      }
    };
    div.querySelector(".btn-edit").onclick = (e) => {
      e.stopPropagation();
      apriModaleModifica(g);
    };
    div.addEventListener("click", () => apriModaleModifica(g));
    list.appendChild(div);
  });
}

function renderAll(){
  renderTabs();
  renderSummary();
  renderGiorniList();
}

// ==== ONBOARDING PRIVATO (primo avvio, solo sul telefono dell'utente) ====
function checkOnboarding(){
  const onboardOverlay = document.getElementById("onboardOverlay");
  if(!onboardOverlay) return;
  const done = localStorage.getItem(LS_ONBOARDED);
  if(!done){
    onboardOverlay.classList.add("open");
  }
}

on("btnOnboardSave", "click", () => {
  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
  state.settings.tipoContratto = getVal("obTipoContratto") || "indeterminato";
  state.settings.ralAnnua = parseFloat(getVal("obRalAnnua")) || 0;
  state.settings.mensilita = parseInt(getVal("obMensilita")) || 13;
  state.settings.pagaStraordinario = parseFloat(getVal("obPagaStraordinario")) || 0;
  saveSettings();
  localStorage.setItem(LS_ONBOARDED, "1");
  const ov = document.getElementById("onboardOverlay");
  if(ov) ov.classList.remove("open");
  renderAll();
});

on("btnOnboardSkip", "click", () => {
  localStorage.setItem(LS_ONBOARDED, "1");
  const ov = document.getElementById("onboardOverlay");
  if(ov) ov.classList.remove("open");
  renderAll();
});

// ============================================================
// ==== AUTO-FORMATTAZIONE CAMPI ORARIO (tastiera numerica) ====
// ============================================================
function formattaOrarioInput(el){
  el.addEventListener("input", () => {
    let digits = el.value.replace(/\D/g, "").slice(0, 4);
    if(digits.length >= 3){
      let h = digits.slice(0, 2);
      let m = digits.slice(2);
      el.value = h + ":" + m;
    } else {
      el.value = digits;
    }
  });
  el.addEventListener("blur", () => {
    if(el.value === "") return;
    const digits = el.value.replace(/\D/g, "");
    if(digits.length === 3){
      el.value = "0" + digits.slice(0,1) + ":" + digits.slice(1);
    }
    let h = parseInt(el.value.split(":")[0], 10);
    let m = parseInt((el.value.split(":")[1] || "0"), 10);
    if(!isNaN(h) && !isNaN(m)){
      h = Math.min(Math.max(h, 0), 23);
      m = Math.min(Math.max(m, 0), 59);
      if(el.value.includes(":")){
        el.value = String(h).padStart(2,"0") + ":" + String(m).padStart(2,"0");
      }
    }
  });
}

function attivaTastieraNumericaOrari(){
  document.querySelectorAll("input.time-input").forEach(formattaOrarioInput);
}

// ==== MODAL NUOVA/MODIFICA GIORNATA ====
let tipoCorrente = "normale";

function apriModaleNuova(){
  giornoInModifica = null;
  const modalTitolo = document.getElementById("modalTitolo");
  if(modalTitolo) modalTitolo.textContent = "Nuova giornata";
  const btnDelete = document.getElementById("btnDeleteFromModal");
  if(btnDelete) btnDelete.style.display = "none";

  const fData = document.getElementById("fData");
  if(fData) fData.value = new Date().toISOString().slice(0,10);
  ["fE1","fU1","fE2","fU2","fOrarioIn","fOrarioOut"].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = "";
  });
  resetOcrUI();
  setTipo("normale");
  const modalOverlay = document.getElementById("modalOverlay");
  if(modalOverlay) modalOverlay.classList.add("open");
}

function apriModaleModifica(giorno){
  giornoInModifica = giorno.id;
  const modalTitolo = document.getElementById("modalTitolo");
  if(modalTitolo) modalTitolo.textContent = "Modifica giornata";
  const btnDelete = document.getElementById("btnDeleteFromModal");
  if(btnDelete) btnDelete.style.display = "block";

  const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ""; };
  setVal("fData", giorno.data);
  setVal("fE1", giorno.e1);
  setVal("fU1", giorno.u1);
  setVal("fE2", giorno.e2);
  setVal("fU2", giorno.u2);
  setVal("fOrarioIn", giorno.orarioIn || "08:30");
  setVal("fOrarioOut", giorno.orarioOut || "17:00");
  resetOcrUI();
  setTipo(giorno.tipo || "normale");
  const modalOverlay = document.getElementById("modalOverlay");
  if(modalOverlay) modalOverlay.classList.add("open");
}

on("btnAdd", "click", apriModaleNuova);

on("btnCancel", "click", () => {
  const modalOverlay = document.getElementById("modalOverlay");
  if(modalOverlay) modalOverlay.classList.remove("open");
});

on("btnDeleteFromModal", "click", () => {
  if(!giornoInModifica) return;
  if(confirm("Eliminare questa giornata?")){
    state.giorni = state.giorni.filter(x => x.id !== giornoInModifica);
    saveGiorni();
    const modalOverlay = document.getElementById("modalOverlay");
    if(modalOverlay) modalOverlay.classList.remove("open");
    renderAll();
  }
});

const modalOverlayEl = document.getElementById("modalOverlay");
if(modalOverlayEl){
  modalOverlayEl.addEventListener("click", (e) => {
    if(e.target === modalOverlayEl) modalOverlayEl.classList.remove("open");
  });
}

function setTipo(t){
  tipoCorrente = t;
  document.querySelectorAll("#tipoChips .chip").forEach(c => {
    c.classList.toggle("active", c.dataset.tipo === t);
  });
  const orariFields = document.getElementById("orariFields");
  if(orariFields) orariFields.style.display = (t === "normale") ? "block" : "none";
}
document.querySelectorAll("#tipoChips .chip").forEach(c => {
  c.onclick = () => setTipo(c.dataset.tipo);
});

on("btnSave", "click", () => {
  const fData = document.getElementById("fData");
  const data = fData ? fData.value : "";
  if(!data){ alert("Inserisci una data"); return; }

  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };

  const idDaUsare = giornoInModifica || Date.now().toString();

  const giornataAggiornata = {
    id: idDaUsare,
    data: data,
    tipo: tipoCorrente,
    e1: getVal("fE1"),
    u1: getVal("fU1"),
    e2: getVal("fE2"),
    u2: getVal("fU2"),
    orarioIn: getVal("fOrarioIn") || "08:30",
    orarioOut: getVal("fOrarioOut") || "17:00"
  };

  if(giornoInModifica){
    state.giorni = state.giorni.filter(g => g.id !== giornoInModifica);
  }
  state.giorni = state.giorni.filter(g => g.data !== data || g.id === idDaUsare);
  state.giorni.push(giornataAggiornata);
  saveGiorni();

  state.meseSelezionato = meseKeyOf(data);
  giornoInModifica = null;
  const modalOverlay = document.getElementById("modalOverlay");
  if(modalOverlay) modalOverlay.classList.remove("open");
  renderAll();
});

// ==== SETTINGS ====
on("btnSettings", "click", () => {
  const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ""; };
  setVal("sTipoContratto", state.settings.tipoContratto || "indeterminato");
  setVal("sRalAnnua", state.settings.ralAnnua);
  setVal("sMensilita", state.settings.mensilita || 13);
  setVal("sPagaStraordinario", state.settings.pagaStraordinario);
  setVal("sGiorniTeorici", state.settings.giorniTeorici || 22);
  const settingsOverlay = document.getElementById("settingsOverlay");
  if(settingsOverlay) settingsOverlay.classList.add("open");
  aggiornaStatoImport();
});

const settingsOverlayEl = document.getElementById("settingsOverlay");
if(settingsOverlayEl){
  settingsOverlayEl.addEventListener("click", (e) => {
    if(e.target === settingsOverlayEl) settingsOverlayEl.classList.remove("open");
  });
}

on("btnSettingsSave", "click", () => {
  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
  state.settings.tipoContratto = getVal("sTipoContratto") || "indeterminato";
  state.settings.ralAnnua = parseFloat(getVal("sRalAnnua")) || 0;
  state.settings.mensilita = parseInt(getVal("sMensilita")) || 13;
  state.settings.pagaStraordinario = parseFloat(getVal("sPagaStraordinario")) || 0;
  state.settings.giorniTeorici = parseFloat(getVal("sGiorniTeorici")) || 22;
  saveSettings();
  const settingsOverlay = document.getElementById("settingsOverlay");
  if(settingsOverlay) settingsOverlay.classList.remove("open");
  renderAll();
});

on("btnExport", "click", () => {
  const dataStr = JSON.stringify({giorni: state.giorni, settings: state.settings}, null, 2);
  const blob = new Blob([dataStr], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "straordinari_backup.json";
  a.click();
  URL.revokeObjectURL(url);
});

// ============================================================
// ==== IMPORT JSON CON CACHE PERMANENTE ====
// ============================================================
function aggiornaStatoImport(){
  const statusEl = document.getElementById("importStatus");
  if(!statusEl) return;
  const importato = localStorage.getItem(LS_IMPORTED);
  if(importato){
    statusEl.textContent = `✓ Dati importati il ${new Date(parseInt(importato)).toLocaleDateString("it-IT")}. Sono in cache: non serve ricaricare il file. Scorri i mesi nella barra in alto.`;
    statusEl.className = "import-status ok";
  } else {
    statusEl.textContent = "Nessuna importazione ancora effettuata. Tocca il pulsante qui sopra e seleziona il file dati_importati.json.";
    statusEl.className = "import-status";
  }
}

on("importInput", "change", (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try{
      const parsed = JSON.parse(evt.target.result);
      const nuoviGiorni = Array.isArray(parsed.giorni) ? parsed.giorni : [];

      const mappaEsistenti = new Map(state.giorni.map(g => [g.data, g]));
      nuoviGiorni.forEach(g => mappaEsistenti.set(g.data, g));
      state.giorni = Array.from(mappaEsistenti.values());
      saveGiorni();

      localStorage.setItem(LS_IMPORTED, Date.now().toString());
      aggiornaStatoImport();
      renderAll();
      alert(`Importazione completata: ${nuoviGiorni.length} giornate caricate in cache. Chiudi le Impostazioni e scorri la barra dei mesi in alto per vederle.`);
    }catch(err){
      console.error(err);
      alert("Il file selezionato non è un JSON valido per questa app.");
    }
  };
  reader.onerror = () => {
    alert("Non sono riuscito a leggere il file selezionato. Riprova.");
  };
  reader.readAsText(file);
});

// ============================================================
// ==== LETTURA OCR DA SCREENSHOT (Tesseract.js, on-device) ====
// ============================================================
const ocrPreview = document.getElementById("ocrPreview");
const ocrStatus = document.getElementById("ocrStatus");
const ocrStatusText = document.getElementById("ocrStatusText");
const ocrBanner = document.getElementById("ocrBanner");

function resetOcrUI(){
  const c1 = document.getElementById("ocrInputCamera");
  const c2 = document.getElementById("ocrInputGallery");
  if(c1) c1.value = "";
  if(c2) c2.value = "";
  if(ocrPreview) ocrPreview.style.display = "none";
  if(ocrStatus) ocrStatus.style.display = "none";
  if(ocrBanner){
    ocrBanner.style.display = "none";
    ocrBanner.className = "ocr-result-banner";
  }
}

on("ocrInputCamera", "change", (e) => processaImmagine(e.target.files[0]));
on("ocrInputGallery", "change", (e) => processaImmagine(e.target.files[0]));

async function processaImmagine(file){
  if(!file) return;
  if(typeof Tesseract === "undefined"){
    if(ocrBanner){
      ocrBanner.textContent = "⚠ Motore OCR non disponibile (verifica connessione internet al primo utilizzo). Inserisci gli orari manualmente.";
      ocrBanner.className = "ocr-result-banner warn";
    }
    return;
  }

  const imgUrl = URL.createObjectURL(file);
  if(ocrPreview){ ocrPreview.src = imgUrl; ocrPreview.style.display = "block"; }
  if(ocrBanner) ocrBanner.style.display = "none";

  if(ocrStatus) ocrStatus.style.display = "flex";
  if(ocrStatusText) ocrStatusText.textContent = "Preparazione immagine...";

  try{
    const processedCanvas = await preprocessImage(imgUrl);
    if(ocrStatusText) ocrStatusText.textContent = "Lettura testo in corso...";

    const result = await Tesseract.recognize(processedCanvas, "ita+eng", {
      logger: (m) => {
        if(m.status === "recognizing text" && ocrStatusText){
          ocrStatusText.textContent = `Lettura testo... ${Math.round(m.progress*100)}%`;
        }
      }
    });

    const testoLetto = result.data.text;
    const orari = estraiOrariTimbrature(testoLetto);

    if(ocrStatus) ocrStatus.style.display = "none";

    const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };

    if(orari.length >= 4){
      setVal("fE1", orari[0]);
      setVal("fU1", orari[1]);
      setVal("fE2", orari[2]);
      setVal("fU2", orari[3]);
      if(ocrBanner){
        ocrBanner.textContent = `✓ Rilevati orari da TIMBRATURE: ${orari.slice(0,4).join(" · ")}. Controlla e correggi se serve.`;
        ocrBanner.className = "ocr-result-banner ok";
      }
    } else if(orari.length > 0){
      const ids = ["fE1","fU1","fE2","fU2"];
      orari.forEach((val, i) => setVal(ids[i], val));
      if(ocrBanner){
        ocrBanner.textContent = `⚠ Rilevati solo ${orari.length}/4 orari nella riga TIMBRATURE. Completa manualmente i campi mancanti.`;
        ocrBanner.className = "ocr-result-banner warn";
      }
    } else {
      if(ocrBanner){
        ocrBanner.textContent = "⚠ Non ho trovato la riga TIMBRATURE nello screenshot. Inserisci i valori manualmente qui sotto.";
        ocrBanner.className = "ocr-result-banner warn";
      }
    }

    const dataRilevata = estraiData(testoLetto);
    if(dataRilevata) setVal("fData", dataRilevata);

  }catch(err){
    console.error(err);
    if(ocrStatus) ocrStatus.style.display = "none";
    if(ocrBanner){
      ocrBanner.textContent = "⚠ Errore nella lettura. Inserisci gli orari manualmente.";
      ocrBanner.className = "ocr-result-banner warn";
    }
  }
}

function preprocessImage(imgUrl){
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
        const bw = gray > 150 ? 255 : 0;
        data[i] = data[i+1] = data[i+2] = bw;
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas);
    };
    img.src = imgUrl;
  });
}

function estraiOrariTimbrature(testo){
  const pulito = testo.replace(/[oO](?=\d|\s|$)/g, "0").replace(/[lI](?=\d|\s|$)/g, "1");

  const idxTimbrature = pulito.search(/TIMBRATUR/i);
  const idxGiustificativi = pulito.search(/GIUSTIFICATIV/i);

  let zonaUtile;
  if(idxTimbrature !== -1){
    const fine = idxGiustificativi !== -1 && idxGiustificativi > idxTimbrature ? idxGiustificativi : pulito.length;
    zonaUtile = pulito.slice(idxTimbrature, fine);
  } else {
    zonaUtile = pulito;
  }

  const regex = /([01]?\d|2[0-3])[:.]([0-5]\d)/g;
  const trovati = [];
  let match;
  while((match = regex.exec(zonaUtile)) !== null){
    const h = match[1].padStart(2,"0");
    const m = match[2];
    trovati.push(`${h}:${m}`);
  }
  return trovati;
}

function estraiData(testo){
  const mesiMap = {
    gennaio:1, gen:1, febbraio:2, feb:2, marzo:3, mar:3, aprile:4, apr:4,
    maggio:5, mag:5, may:5, giugno:6, giu:6, jun:6, luglio:7, lug:7, jul:7,
    agosto:8, ago:8, aug:8, settembre:9, set:9, sep:9, ottobre:10, ott:10, oct:10,
    novembre:11, nov:11, dicembre:12, dic:12, dec:12
  };
  let m = testo.match(/(\d{1,2})\s+([A-Za-zàèìòù]{3,})\s+(\d{4})/i);
  if(m){
    const giorno = m[1].padStart(2,"0");
    const mese = mesiMap[m[2].toLowerCase()];
    if(mese) return `${m[3]}-${String(mese).padStart(2,"0")}-${giorno}`;
  }
  m = testo.match(/(\d{1,2})[\s\-\/]([A-Za-z]{3})/);
  if(m){
    const giorno = m[1].padStart(2,"0");
    const mese = mesiMap[m[2].toLowerCase()];
    if(mese){
      const anno = new Date().getFullYear();
      return `${anno}-${String(mese).padStart(2,"0")}-${giorno}`;
    }
  }
  return null;
}

// ==== INIT ====
loadState();
renderAll();
checkOnboarding();
attivaTastieraNumericaOrari();

// ==== SERVICE WORKER (PWA offline) ====
if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err => console.log("SW error", err));
  });
}
