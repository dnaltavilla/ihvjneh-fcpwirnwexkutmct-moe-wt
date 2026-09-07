// ==== STRAORDINARI - LOGICA APP (con lettura OCR da screenshot) ====
const LS_KEY = "straordinari_giorni_v1";
const LS_SETTINGS = "straordinari_settings_v1";

const MESI_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

let state = {
  giorni: [],
  settings: {
    giorniTeorici: 22,
    pagaGiornata: 102.28,
    pagaStraordinario: 15.34,
    percNetto: 82
  },
  meseSelezionato: null
};

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
  const [h,m] = t.split(":").map(Number);
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

// La pausa pranzo minima contrattuale e' sempre di 30 minuti:
// se la pausa reale (uscita->rientro) e' piu' breve, si applica comunque il minimo di 30'.
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
  const mesi = getMesiDisponibili();
  if(!state.meseSelezionato || !mesi.includes(state.meseSelezionato)){
    state.meseSelezionato = mesi[mesi.length-1];
  }
  const container = document.getElementById("monthTabs");
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
  const mese = state.meseSelezionato;
  const giorniMese = state.giorni.filter(g => meseKeyOf(g.data) === mese)
                                  .sort((a,b)=> a.data.localeCompare(b.data));

  const totaleOreStraordinario = giorniMese.reduce((acc,g) => acc + calcolaStraordinario(g), 0);
  const giorniLavorati = giorniMese.filter(g => g.tipo === "normale").length;

  const s = state.settings;
  const stipendioBase = s.giorniTeorici * s.pagaGiornata;
  const pagaStraordinarioTot = totaleOreStraordinario * s.pagaStraordinario;
  const stimaLordo = stipendioBase + pagaStraordinarioTot;
  const stimaNetto = stimaLordo * (s.percNetto/100);

  const grid = document.getElementById("summaryGrid");
  grid.innerHTML = `
    <div class="summary-box"><div class="val">${totaleOreStraordinario.toFixed(2)} h</div><div class="lab">Straordinario totale</div></div>
    <div class="summary-box"><div class="val">${giorniLavorati}</div><div class="lab">Giorni lavorati</div></div>
    <div class="summary-box"><div class="val">${pagaStraordinarioTot.toFixed(2)} €</div><div class="lab">Paga straordinario</div></div>
    <div class="summary-box"><div class="val">${stimaLordo.toFixed(2)} €</div><div class="lab">Stima stipendio lordo</div></div>
    <div class="summary-box" style="grid-column:1/3;"><div class="val">${stimaNetto.toFixed(2)} €</div><div class="lab">Stima netto (${s.percNetto}%)</div></div>
  `;
}

function tipoLabel(t){
  return {normale:"", permesso:"Permesso", ferie:"Ferie", malattia:"Malattia"}[t] || "";
}

function renderGiorniList(){
  const mese = state.meseSelezionato;
  const giorniMese = state.giorni.filter(g => meseKeyOf(g.data) === mese)
                                  .sort((a,b)=> a.data.localeCompare(b.data));
  const list = document.getElementById("giorniList");

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
        <button class="btn-danger" data-id="${g.id}">✕</button>
      </div>
    `;
    div.querySelector(".btn-danger").onclick = () => {
      if(confirm("Eliminare questa giornata?")){
        state.giorni = state.giorni.filter(x => x.id !== g.id);
        saveGiorni();
        renderAll();
      }
    };
    list.appendChild(div);
  });
}

function renderAll(){
  renderTabs();
  renderSummary();
  renderGiorniList();
}

// ==== MODAL NUOVA GIORNATA ====
const modalOverlay = document.getElementById("modalOverlay");
const settingsOverlay = document.getElementById("settingsOverlay");
let tipoCorrente = "normale";

document.getElementById("btnAdd").onclick = () => {
  document.getElementById("fData").value = new Date().toISOString().slice(0,10);
  document.getElementById("fE1").value = "";
  document.getElementById("fU1").value = "";
  document.getElementById("fE2").value = "";
  document.getElementById("fU2").value = "";
  document.getElementById("fOrarioIn").value = "08:30";
  document.getElementById("fOrarioOut").value = "17:00";
  resetOcrUI();
  setTipo("normale");
  modalOverlay.classList.add("open");
};
document.getElementById("btnCancel").onclick = () => modalOverlay.classList.remove("open");
modalOverlay.addEventListener("click", (e) => { if(e.target === modalOverlay) modalOverlay.classList.remove("open"); });

function setTipo(t){
  tipoCorrente = t;
  document.querySelectorAll("#tipoChips .chip").forEach(c => {
    c.classList.toggle("active", c.dataset.tipo === t);
  });
  document.getElementById("orariFields").style.display = (t === "normale") ? "block" : "none";
}
document.querySelectorAll("#tipoChips .chip").forEach(c => {
  c.onclick = () => setTipo(c.dataset.tipo);
});

document.getElementById("btnSave").onclick = () => {
  const data = document.getElementById("fData").value;
  if(!data){ alert("Inserisci una data"); return; }

  const nuovaGiornata = {
    id: Date.now().toString(),
    data: data,
    tipo: tipoCorrente,
    e1: document.getElementById("fE1").value,
    u1: document.getElementById("fU1").value,
    e2: document.getElementById("fE2").value,
    u2: document.getElementById("fU2").value,
    orarioIn: document.getElementById("fOrarioIn").value,
    orarioOut: document.getElementById("fOrarioOut").value
  };

  state.giorni = state.giorni.filter(g => g.data !== data);
  state.giorni.push(nuovaGiornata);
  saveGiorni();

  state.meseSelezionato = meseKeyOf(data);
  modalOverlay.classList.remove("open");
  renderAll();
};

// ==== SETTINGS ====
document.getElementById("btnSettings").onclick = () => {
  document.getElementById("sGiorniTeorici").value = state.settings.giorniTeorici;
  document.getElementById("sPagaGiornata").value = state.settings.pagaGiornata;
  document.getElementById("sPagaStraordinario").value = state.settings.pagaStraordinario;
  document.getElementById("sPercNetto").value = state.settings.percNetto;
  settingsOverlay.classList.add("open");
};
settingsOverlay.addEventListener("click", (e) => { if(e.target === settingsOverlay) settingsOverlay.classList.remove("open"); });

document.getElementById("btnSettingsSave").onclick = () => {
  state.settings.giorniTeorici = parseFloat(document.getElementById("sGiorniTeorici").value) || 22;
  state.settings.pagaGiornata = parseFloat(document.getElementById("sPagaGiornata").value) || 0;
  state.settings.pagaStraordinario = parseFloat(document.getElementById("sPagaStraordinario").value) || 0;
  state.settings.percNetto = parseFloat(document.getElementById("sPercNetto").value) || 100;
  saveSettings();
  settingsOverlay.classList.remove("open");
  renderAll();
};

document.getElementById("btnExport").onclick = () => {
  const dataStr = JSON.stringify({giorni: state.giorni, settings: state.settings}, null, 2);
  const blob = new Blob([dataStr], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "straordinari_backup.json";
  a.click();
  URL.revokeObjectURL(url);
};

// ============================================================
// ==== LETTURA OCR DA SCREENSHOT (Tesseract.js, on-device) ====
// ============================================================
const ocrZone = document.getElementById("ocrZone");
const ocrInput = document.getElementById("ocrInput");
const ocrPreview = document.getElementById("ocrPreview");
const ocrStatus = document.getElementById("ocrStatus");
const ocrStatusText = document.getElementById("ocrStatusText");
const ocrBanner = document.getElementById("ocrBanner");

function resetOcrUI(){
  ocrInput.value = "";
  ocrPreview.style.display = "none";
  ocrStatus.style.display = "none";
  ocrBanner.style.display = "none";
  ocrBanner.className = "ocr-result-banner";
}

ocrZone.onclick = () => ocrInput.click();

ocrInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if(!file) return;

  const imgUrl = URL.createObjectURL(file);
  ocrPreview.src = imgUrl;
  ocrPreview.style.display = "block";
  ocrBanner.style.display = "none";

  ocrStatus.style.display = "flex";
  ocrStatusText.textContent = "Preparazione immagine...";

  try{
    const processedCanvas = await preprocessImage(imgUrl);
    ocrStatusText.textContent = "Lettura testo in corso...";

    const result = await Tesseract.recognize(processedCanvas, "eng", {
      logger: (m) => {
        if(m.status === "recognizing text"){
          ocrStatusText.textContent = `Lettura testo... ${Math.round(m.progress*100)}%`;
        }
      },
      tessedit_char_whitelist: "0123456789:EUeu "
    });

    const testoLetto = result.data.text;
    const orari = estraiOrari(testoLetto);

    ocrStatus.style.display = "none";

    if(orari.length >= 4){
      document.getElementById("fE1").value = orari[0];
      document.getElementById("fU1").value = orari[1];
      document.getElementById("fE2").value = orari[2];
      document.getElementById("fU2").value = orari[3];
      ocrBanner.textContent = `✓ Rilevati ${orari.length} orari: ${orari.join(" · ")}. Controlla e correggi se serve.`;
      ocrBanner.className = "ocr-result-banner ok";
    } else if(orari.length > 0){
      orari.forEach((val, i) => {
        const ids = ["fE1","fU1","fE2","fU2"];
        document.getElementById(ids[i]).value = val;
      });
      ocrBanner.textContent = `⚠ Rilevati solo ${orari.length}/4 orari. Completa manualmente i campi mancanti.`;
      ocrBanner.className = "ocr-result-banner warn";
    } else {
      ocrBanner.textContent = "⚠ Nessun orario riconosciuto automaticamente. Inserisci i valori manualmente qui sotto.";
      ocrBanner.className = "ocr-result-banner warn";
    }

    const dataRilevata = estraiData(testoLetto);
    if(dataRilevata) document.getElementById("fData").value = dataRilevata;

  }catch(err){
    console.error(err);
    ocrStatus.style.display = "none";
    ocrBanner.textContent = "⚠ Errore nella lettura. Inserisci gli orari manualmente.";
    ocrBanner.className = "ocr-result-banner warn";
  }
});

// Ritaglia/ingrandisce/binarizza l'immagine per migliorare l'accuratezza OCR
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

// Estrae sequenze HH:MM dal testo OCR, in ordine di apparizione
function estraiOrari(testo){
  const puliti = testo.replace(/[oO]/g, "0").replace(/[lI]/g, "1");
  const regex = /([01]?\d|2[0-3])[:.]([0-5]\d)/g;
  const trovati = [];
  let match;
  while((match = regex.exec(puliti)) !== null){
    const h = match[1].padStart(2,"0");
    const m = match[2];
    trovati.push(`${h}:${m}`);
  }
  return trovati;
}

// Cerca pattern data tipo "7-Sep" "07/09" ecc. Fallback: nessuna modifica
function estraiData(testo){
  const mesiMap = {gen:1,feb:2,mar:3,apr:4,mag:5,may:5,giu:6,jun:6,lug:7,jul:7,ago:8,aug:8,set:9,sep:9,ott:10,oct:10,nov:11,dic:12,dec:12};
  const m = testo.match(/(\d{1,2})[\s\-\/]([A-Za-z]{3})/);
  if(m){
    const giorno = m[1].padStart(2,"0");
    const meseAbbr = m[2].toLowerCase();
    const mese = mesiMap[meseAbbr];
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

// ==== SERVICE WORKER (PWA offline) ====
if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err => console.log("SW error", err));
  });
}
