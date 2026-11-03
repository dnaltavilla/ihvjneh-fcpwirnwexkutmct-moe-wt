// STRAORDINARI - LOGICA APP
// OCR Home/Agenda, stima netto (semplice/avanzata/CCNL), retribuzione per voci, viste mese ordinario/tredicesima, simulazione, privacy, tutorial
// NOTA PRIVACY: nessun valore economico reale e' scritto in questo file.

const LS_KEY = "straordinari_giorni_v1";
const LS_SETTINGS = "straordinari_settings_v1";
const LS_ONBOARDED = "straordinari_onboarded_v1";
const LS_IMPORTED = "straordinari_imported_v1";
const LS_SCHERMATA = "straordinari_schermata_v1";
const LS_PRIVACY = "straordinari_privacy_v1";     // "1" nascosti, "0" visibili (ultima scelta)
const LS_VISTA = "straordinari_vista_v1";
const LS_TUTORIAL = "straordinari_tutorial_v1";

const MESI_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

const ORARIO_TEORICO_IN = "08:30";
const ORARIO_TEORICO_OUT = "17:00";
const ORARIO_INIZIO_CONTEGGIO = "08:00";   // se entri prima, conta dalle 08:00
const PAUSA_MINIMA = 30;
const MAX_STRAORD_GIORNALIERO_MIN = 120;   // 2 ore
const MAX_STRAORD_MENSILE_MIN = 20 * 60;   // 20 ore
const TETTO_AGEVOLAZIONE_15 = 1500;        // euro/anno di maggiorazioni al 15%
const ALIQUOTA_SOSTITUTIVA = 0.15;

const AVANZATO_DEFAULT = {
  attivo:false, inpsPerc:0, previdenzaCompl:0, addReg:0, regScaglioni:"", addCom:0, addComEsenzione:0,
  coniuge:false, figli21:0, figliDis:0, quotaFigli:100, altriFamiliari:0, detrazioniExtra:0, spese19:0,
  bonus:0, welfare:0, trattenuteMensili:0
};
// Retribuzione per voci. Base oraria straordinario = RAL - patto - (superminimo se escluso) - (altre voci se non incluse)
const CCNL_DEFAULT = {
  usa:false, divisore:173, magg1:0, magg2:0, agev15:false,
  somma:false, base:0, super:0, patto:0, altre:0, pattoNetto:false, pattoLordo:0, superEscl:false, altreIncl:true
};

let state = {
  giorni: [],
  settings: { tipoContratto:"indeterminato", ralAnnua:0, mensilita:13, pagaStraordinario:0,
              avanzato:Object.assign({}, AVANZATO_DEFAULT), ccnl:Object.assign({}, CCNL_DEFAULT) },
  meseSelezionato: null
};
let giornoInModifica = null;
let schermataOcr = localStorage.getItem(LS_SCHERMATA) === "agenda" ? "agenda" : "home";
let privacyOn = localStorage.getItem(LS_PRIVACY) !== "0";   // al primo avvio nascosti, poi ultima scelta
let vistaMese = ["media","ordinario","tredicesima"].includes(localStorage.getItem(LS_VISTA)) ? localStorage.getItem(LS_VISTA) : "media";

function $(id){ return document.getElementById(id); }
const num = (v) => (parseFloat(v) || 0);
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
  try{
    const s = localStorage.getItem(LS_SETTINGS);
    if(s){
      const p = JSON.parse(s);
      const av = Object.assign({}, AVANZATO_DEFAULT, p.avanzato || {});
      const cc = Object.assign({}, CCNL_DEFAULT, p.ccnl || {});
      Object.assign(state.settings, p);
      state.settings.avanzato = av;
      state.settings.ccnl = cc;
    }
  }catch(e){}
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
// Importi in euro (solo dentro innerHTML). Con la privacy attiva il valore reale NON e' nel DOM:
// compare un segnaposto offuscato con effetto evidenziatore (stile in CSS: body.privacy .money).
const eur = (n) => '<span class="money">' + (privacyOn ? "0000,00 €" :
  (n||0).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2}) + " €") + '</span>';

// ==== PRIVACY ====
const SVG_OCCHIO = '<svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const SVG_OCCHIO_BARRATO = '<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19C5 19 1 12 1 12a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A9.9 9.9 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12A3 3 0 1 1 9.88 9.88"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const CAMPI_IMPORTO = ["sRalAnnua","sPagaStraordinario","obRalAnnua","obPagaStraordinario","simRal","simPaga",
  "ccBase","ccSuper","ccPatto","ccAltre",
  "avInps","avPrev","avAddReg","avAddCom","avAddComEsenzione","avDetrExtra","avSpese19","avBonus","avWelfare","avTratt"];
function aggiornaPrivacyUI(){
  document.body.classList.toggle("privacy", privacyOn);
  const b = $("btnPrivacy");
  if(b){ b.innerHTML = privacyOn ? SVG_OCCHIO_BARRATO : SVG_OCCHIO; b.title = privacyOn ? "Mostra gli importi" : "Nascondi gli importi"; }
  CAMPI_IMPORTO.forEach(id => { const el=$(id); if(el) el.classList.add("money-in"); });
}
function setPrivacy(on){
  privacyOn = !!on;
  localStorage.setItem(LS_PRIVACY, privacyOn ? "1" : "0");
  aggiornaPrivacyUI();
  renderAll();
  const sim = $("simOverlay"); if(sim && sim.classList.contains("open")) simCalcola();
  const det = $("dettaglioCalcolo"); if(det && det.innerHTML) renderDettaglioCalcolo();
  renderCcInfo();
}
on("btnPrivacy","click",() => setPrivacy(!privacyOn));
document.addEventListener("click", (e) => {      // tap su un importo nascosto = lo mostra
  if(privacyOn && e.target && e.target.closest && e.target.closest(".money")) setPrivacy(false);
});

// ==== CALCOLO ORE DI STRAORDINARIO ====
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

// ==== MOTORE FISCALE 2026 (stima annuale) ====
const ALIQUOTA_INPS_LAVORATORE = 0.0919;
const ALIQUOTA_INPS_APPRENDISTA = 0.0584;
const MAX_DEDUCIBILE_PREV_COMPL = 5164.57;
const SCAGLIONI_IRPEF_2026 = [
  { fino: 28000, aliquota: 0.23 },
  { fino: 50000, aliquota: 0.33 },
  { fino: Infinity, aliquota: 0.43 }
];
function calcolaIrpefAnnua(imponibile){
  let imposta = 0, prec = 0;
  for(const sc of SCAGLIONI_IRPEF_2026){
    if(imponibile > prec){
      imposta += (Math.min(imponibile, sc.fino) - prec) * sc.aliquota;
      prec = sc.fino;
    } else break;
  }
  return imposta;
}
// Detrazione lavoro dipendente (art. 13 TUIR): +65 € tra 25.000 e 35.000 €
function detrazioneLavoroDipendente(R){
  let d;
  if(R <= 15000) d = 1955;
  else if(R <= 28000) d = 1910 + 1190 * (28000 - R) / 13000;
  else if(R <= 50000) d = 1910 * (50000 - R) / 22000;
  else d = 0;
  if(R > 25000 && R <= 35000) d += 65;
  return d;
}
function detrazioneConiuge(R){
  if(R <= 15000) return 800 - 110 * R / 15000;
  if(R <= 29000) return 690;
  if(R <= 29200) return 700;
  if(R <= 34700) return 710;
  if(R <= 35000) return 720;
  if(R <= 35100) return 710;
  if(R <= 35200) return 700;
  if(R <= 40000) return 690;
  if(R <= 80000) return 690 * (80000 - R) / 40000;
  return 0;
}
// Figli 21-29: 950 € (1.350 € se disabili - da verificare) ridotti fino a 95.000 €
function fattoreFigli(R){ return R >= 95000 ? 0 : (95000 - R) / 95000; }
function detrazioneAltriFamiliari(R){ return R >= 80000 ? 0 : 750 * (80000 - R) / 80000; }
function bonusCuneo(R){
  if(R <= 8500) return R * 0.071;
  if(R <= 15000) return R * 0.053;
  if(R <= 20000) return R * 0.048;
  return 0;
}
function ulterioreDetrazioneCuneo(R){
  if(R <= 20000) return 0;
  if(R <= 32000) return 1000;
  if(R <= 40000) return 1000 * (40000 - R) / 8000;
  return 0;
}
// Addizionale regionale a scaglioni: "15000:1.42, 28000:1.43, oltre:3.33"
function parseScaglioniReg(str){
  if(!str || !String(str).trim()) return null;
  const out = [];
  for(const tok of String(str).split(/[;,](?=\s*(?:\d+(?:\.\d+)?|oltre|inf)\s*:)/i)){
    const p = tok.split(":");
    if(p.length !== 2) continue;
    const lim = /oltre|inf/i.test(p[0]) ? Infinity : parseFloat(p[0].replace(",","."));
    const al = parseFloat(p[1].replace(",","."));
    if(isNaN(lim) || isNaN(al)) continue;
    out.push({ fino:lim, aliquota:al });
  }
  if(!out.length) return null;
  out.sort((a,b) => a.fino - b.fino);
  out[out.length-1].fino = Infinity;
  return out;
}
function addizionaleRegionale(imponibile, o){
  const sc = parseScaglioniReg(o.regScaglioni);
  if(!sc) return imponibile * num(o.addReg) / 100;
  let tot = 0, prec = 0;
  for(const s of sc){
    if(imponibile > prec){ tot += (Math.min(imponibile, s.fino) - prec) * s.aliquota / 100; prec = s.fino; } else break;
  }
  return tot;
}

function opzioniDaSettings(s){
  const a = (s && s.avanzato) || {};
  return a.attivo ? a : {};
}
function calcolaNettoDettaglio(ral, tipo, mensilita, o){
  o = o || {};
  const aliq = num(o.inpsPerc) > 0 ? num(o.inpsPerc)/100 : (tipo === "apprendistato" ? ALIQUOTA_INPS_APPRENDISTA : ALIQUOTA_INPS_LAVORATORE);
  const inps = ral * aliq;
  const prev = Math.min(Math.max(0, num(o.previdenzaCompl)), MAX_DEDUCIBILE_PREV_COMPL);
  const imponibile = Math.max(0, ral - inps - prev);
  const irpefLorda = calcolaIrpefAnnua(imponibile);
  const quota = (o.quotaFigli === undefined || o.quotaFigli === "" ? 100 : num(o.quotaFigli)) / 100;
  const detrLavoro = detrazioneLavoroDipendente(imponibile);
  const detrConiuge = o.coniuge ? detrazioneConiuge(imponibile) : 0;
  const nf = Math.max(0, Math.round(num(o.figli21)));
  const nd = Math.min(nf, Math.max(0, Math.round(num(o.figliDis))));
  const detrFigli = ((nf - nd) * 950 + nd * 1350) * fattoreFigli(imponibile) * quota;
  const detrAltri = Math.max(0, Math.round(num(o.altriFamiliari))) * detrazioneAltriFamiliari(imponibile);
  const detrExtra = Math.max(0, num(o.detrazioniExtra));
  const detr19 = Math.max(0, num(o.spese19)) * 0.19;
  const ulteriore = ulterioreDetrazioneCuneo(imponibile);
  const detrTot = detrLavoro + detrConiuge + detrFigli + detrAltri + detrExtra + detr19 + ulteriore;
  const irpefNetta = Math.max(0, irpefLorda - detrTot);
  const bonus = bonusCuneo(ral - inps);
  const addReg = addizionaleRegionale(imponibile, o);
  const sogliaCom = num(o.addComEsenzione);
  const addCom = ((sogliaCom > 0 && imponibile > sogliaCom) || sogliaCom <= 0) ? imponibile * num(o.addCom) / 100 : 0;
  const trattenute = num(o.trattenuteMensili) * (mensilita || 13);
  const nettoAnnuo = ral - inps - prev - irpefNetta + bonus - addReg - addCom - trattenute;
  const tfr = ral / 13.5 - ral * 0.005;   // accantonamento TFR annuo lordo (informativo, non in busta)
  return { ral, aliquotaInps:aliq, inps, prev, imponibile, irpefLorda, detrLavoro, detrConiuge, detrFigli, detrAltri, detrExtra, detr19,
           ulteriore, irpefNetta, bonus, addReg, addCom, trattenute, nettoAnnuo, tfr };
}
function nettoBonusWelfare(ral, tipo, mensilita, o){
  const b = Math.max(0, num(o.bonus)), w = Math.max(0, num(o.welfare));
  if(!b && !w) return 0;
  const base = calcolaNettoDettaglio(ral, tipo, mensilita, o).nettoAnnuo;
  const con = b ? calcolaNettoDettaglio(ral + b, tipo, mensilita, o).nettoAnnuo : base;
  return (con - base) + w;
}
function percentualeNettaStraordinario(ral, tipo, mensilita, o, strLordoMese){
  const X = Math.max((strLordoMese || 0) * 12, 1200);
  const base = calcolaNettoDettaglio(ral, tipo, mensilita, o).nettoAnnuo;
  const con = calcolaNettoDettaglio(ral + X, tipo, mensilita, o).nettoAnnuo;
  return Math.max(0, Math.min(1, (con - base) / X));
}

// ==== RETRIBUZIONE PER VOCI ====
// Se il patto di non concorrenza e' indicato al netto, ricava il lordo (bisezione sul netto annuo marginale).
function pattoLordoDaNetto(ralSenzaPatto, nettoPatto, tipo, mensilita, o){
  if(nettoPatto <= 0) return 0;
  const base = calcolaNettoDettaglio(ralSenzaPatto, tipo, mensilita, o).nettoAnnuo;
  const f = (g) => calcolaNettoDettaglio(ralSenzaPatto + g, tipo, mensilita, o).nettoAnnuo - base;
  let lo = nettoPatto, hi = nettoPatto * 2;
  let guard = 0;
  while(f(hi) < nettoPatto && guard++ < 20) hi *= 1.5;
  for(let i=0; i<60; i++){ const mid = (lo + hi) / 2; if(f(mid) < nettoPatto) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
// Restituisce le voci e il totale (RAL) quando si inserisce la retribuzione per voci
function ralDaVoci(s){
  const c = s.ccnl || CCNL_DEFAULT;
  const base = Math.max(0, num(c.base)), sup = Math.max(0, num(c.super)), alt = Math.max(0, num(c.altre));
  const pat = Math.max(0, num(c.patto));
  let pattoLordo = pat;
  if(c.pattoNetto && pat > 0){
    const o = opzioniDaSettings(s);
    pattoLordo = pattoLordoDaNetto(base + sup + alt, pat, s.tipoContratto, s.mensilita || 13, o);
  }
  return { base, sup, alt, pattoInserito: pat, pattoLordo, totale: base + sup + alt + pattoLordo };
}
// Quota fissa della RAL esclusa dalla base oraria: patto (sempre), superminimo (se escluso), altre voci (se non incluse)
function quotaEsclusaStraordinario(ral, c){
  c = c || CCNL_DEFAULT;
  const patto = c.pattoLordo > 0 ? num(c.pattoLordo) : Math.max(0, num(c.patto));
  const esc = patto + (c.superEscl ? Math.max(0, num(c.super)) : 0) + (c.altreIncl === false ? Math.max(0, num(c.altre)) : 0);
  return Math.min(Math.max(0, ral), esc);
}
// Paga oraria: da CCNL ((RAL - quote escluse) / mensilita / divisore) oppure manuale
function tariffe(ral, mens, s){
  const c = s.ccnl || CCNL_DEFAULT;
  const m1 = num(c.magg1)/100, m2 = num(c.magg2)/100;
  const usa = !!(c.usa && ral > 0);
  const esclusa = usa ? quotaEsclusaStraordinario(ral, c) : 0;
  const p0 = usa ? ((ral - esclusa) / (mens || 13)) / (num(c.divisore) || 173) : num(s.pagaStraordinario) / (1 + m1);
  return { p0, feriale:p0*(1+m1), festivo:p0*(1+m2), m2, usa, esclusa };
}
// ovt = { ordLordo, flatLordo }: parte tassata in modo ordinario e parte al 15%
function stimaMensile(ral, mensilita, tipo, o, ovt, vista){
  mensilita = mensilita || 13;
  ovt = ovt || { ordLordo:0, flatLordo:0 };
  const d = calcolaNettoDettaglio(ral, tipo, mensilita, o);
  const M = ral / mensilita;
  let fissoLordo = M, fissoNetto = d.nettoAnnuo / mensilita;
  if(mensilita > 12 && vista && vista !== "media"){
    // Approssimazione busta paga: nei 12 mesi ordinari l'IRPEF e' calcolata sull'imponibile mensile annualizzato (x12)
    // con le detrazioni dell'intero anno; la mensilita' aggiuntiva assorbe il resto (come dopo il conguaglio).
    const impM = d.imponibile / mensilita;
    const detrEff = d.irpefLorda - d.irpefNetta;
    const taxM = Math.max(0, (calcolaIrpefAnnua(impM * 12) - detrEff) / 12);
    const netOrd = M - d.inps/mensilita - d.prev/mensilita - taxM + d.bonus/mensilita
                   - (d.addReg + d.addCom)/mensilita - d.trattenute/mensilita;
    const extra = (d.nettoAnnuo - 12 * netOrd) / (mensilita - 12);
    if(vista === "ordinario"){ fissoNetto = netOrd; }
    else { fissoLordo = M * 2; fissoNetto = netOrd + extra; }
  }
  const pct = percentualeNettaStraordinario(ral, tipo, mensilita, o, ovt.ordLordo);
  const strLordo = ovt.ordLordo + ovt.flatLordo;
  const strNetto = ovt.ordLordo * pct + ovt.flatLordo * (1 - d.aliquotaInps) * (1 - ALIQUOTA_SOSTITUTIVA);
  return { fissoLordo, fissoNetto, strLordo, strNetto,
           totLordo: fissoLordo + strLordo, totNetto: fissoNetto + strNetto, dettaglio: d };
}

function giorniDelMese(mese){
  return state.giorni.filter(g => meseKeyOf(g.data) === mese).sort((a,b) => a.data.localeCompare(b.data));
}
function straordMeseRaw(mese){
  let fer = 0, fest = 0;
  giorniDelMese(mese).forEach(g => { const m = calcolaStraordinarioMinutiCapGiorno(g); if(g.festivo) fest += m; else fer += m; });
  const tot = fer + fest;
  const f = tot > MAX_STRAORD_MENSILE_MIN ? MAX_STRAORD_MENSILE_MIN / tot : 1;
  return { minFer: fer*f, minFest: fest*f, totMin: tot };
}
function straordMese(mese, s){
  const raw = straordMeseRaw(mese);
  const tar = tariffe(s.ralAnnua, s.mensilita, s);
  const oreFer = raw.minFer/60, oreFest = raw.minFest/60;
  let ordLordo = oreFer * tar.feriale + oreFest * tar.p0;
  const magFest = oreFest * tar.p0 * tar.m2;
  let flat = 0;
  if(s.ccnl && s.ccnl.agev15 && tar.m2 > 0 && magFest > 0){
    const anno = mese.slice(0,4), mm = parseInt(mese.slice(5,7),10);
    let ytd = 0;
    for(let k=1; k<mm; k++){ const r = straordMeseRaw(anno + "-" + String(k).padStart(2,"0")); ytd += (r.minFest/60) * tar.p0 * tar.m2; }
    flat = Math.min(magFest, Math.max(0, TETTO_AGEVOLAZIONE_15 - ytd));
  }
  ordLordo += magFest - flat;
  return { oreTot: oreFer + oreFest, oreFer, oreFest, ordLordo, flatLordo: flat, strLordo: ordLordo + flat,
           totMinGrezzo: raw.totMin, oltreTetto: raw.totMin > MAX_STRAORD_MENSILE_MIN };
}

function renderSummary(){
  const grid = $("summaryGrid");
  if(!grid) return;
  const s = state.settings;
  const giorniMese = giorniDelMese(state.meseSelezionato);
  const st0 = straordMese(state.meseSelezionato, s);
  const box = (val, lab, cls) => '<div class="summary-box ' + (cls||"") + '"><div class="val">' + val + '</div><div class="lab">' + lab + '</div></div>';
  const tettoBox = st0.oltreTetto
    ? '<div class="summary-box warn" style="grid-column:1/-1"><div class="lab">Straordinario mensile grezzo ' + minutesToHM(st0.totMinGrezzo) + ' h: limitato a 20h dal tetto contrattuale.</div></div>' : "";
  const chips = $("vistaChips");
  if(chips){
    chips.style.display = (s.mensilita > 12 && s.ralAnnua) ? "flex" : "none";
    chips.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.vista === vistaMese));
  }
  let html = '<div class="sec-title">Straordinari</div>' +
    box(st0.oreTot.toFixed(2) + " h", "Ore straordinario (max 20h)" + (st0.oreFest > 0 ? " · di cui " + st0.oreFest.toFixed(2) + " h festive/notturne" : "")) +
    box(giorniMese.length, "Giorni registrati");

  if(!s.ralAnnua){
    html += '<div class="summary-box" style="grid-column:1/-1"><div class="lab">Imposta RAL e tipo contratto in Impostazioni per vedere fisso, straordinari e totale stimati. I dati restano solo su questo telefono.</div></div>' + tettoBox;
    grid.innerHTML = html;
    return;
  }
  const o = opzioniDaSettings(s);
  const vista = s.mensilita > 12 ? vistaMese : "media";
  const st = stimaMensile(s.ralAnnua, s.mensilita, s.tipoContratto, o, st0, vista);
  html += box(eur(st.strLordo), "Straordinari lordi") + box(eur(st.strNetto), "Straordinari netti stimati");
  const titoloVista = vista === "media" ? "Stipendio fisso (media annua)" : (vista === "ordinario" ? "Stipendio fisso (mese ordinario)" : "Stipendio fisso (mese con tredicesima)");
  html = '<div class="sec-title">' + titoloVista + ' - senza straordinari</div>' +
    box(eur(st.fissoLordo), "Fisso lordo", "fisso") + box(eur(st.fissoNetto), "Fisso netto", "fisso") + html;
  html += '<div class="sec-title">Totale stimato (fisso + straordinari)</div>' +
    box(eur(st.totLordo), "Totale lordo", "tot") + box(eur(st.totNetto), "Totale netto", "tot");
  const bw = nettoBonusWelfare(s.ralAnnua, s.tipoContratto, s.mensilita, o);
  if(bw > 0) html += box(eur(bw), "Bonus e welfare annui (netto stimato, fuori dal mensile)");
  html += tettoBox;
  const tar = tariffe(s.ralAnnua, s.mensilita, s);
  const escl = tar.esclusa > 0 ? ' Dalla base oraria dello straordinario sono escluse voci fisse per ' + eur(tar.esclusa) + ' l\'anno.' : '';
  const modo = (s.avanzato && s.avanzato.attivo ? "calcolo avanzato" : "calcolo semplice") + (s.ccnl && s.ccnl.usa ? " + paga da CCNL" : "");
  html += '<div class="summary-box" style="grid-column:1/-1"><div class="lab">Stima con IRPEF 2026, INPS e detrazioni (' + modo + ', ' + (s.tipoContratto === "apprendistato" ? "apprendistato" : "tempo indeterminato") + '). ' +
    (vista !== "media" ? 'Mese ordinario e tredicesima sono un\'approssimazione: la media annua resta il dato piu\' affidabile. ' : '') + 'Il netto degli straordinari tiene conto di scaglioni e detrazioni.' + escl + '</div></div>';
  grid.innerHTML = html;
}
document.querySelectorAll("#vistaChips .chip").forEach(c => {
  c.onclick = () => { vistaMese = c.dataset.vista; localStorage.setItem(LS_VISTA, vistaMese); renderSummary(); };
});

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
    const giornoLabel = dataObj.toLocaleDateString("it-IT",{weekday:"short", day:"2-digit", month:"short"}) + (g.festivo ? " 🌙" : "");
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

// ==== TUTORIAL ====
const TUTORIAL_SLIDE = [
  { ico:"👋", titolo:"Benvenuto", html:"<p>Questa app registra i tuoi <b>straordinari</b> e stima quanto valgono in busta paga.</p><ul><li>Tutti i dati restano <b>solo su questo telefono</b>: nessun account, nessun server.</li><li>Puoi rivedere questa guida in ogni momento da Impostazioni → Rivedi il tutorial.</li></ul>" },
  { ico:"➕", titolo:"Aggiungere una giornata", html:"<ul><li>Tocca il tasto <b>+</b> in basso a destra.</li><li>Scegli la data e inserisci le 4 timbrature: entrata mattina, uscita pausa, rientro pausa, uscita sera.</li><li>Tocca una giornata della lista per modificarla o eliminarla (✏️ / 🗑️).</li><li>Le schede in alto sono i mesi: scorri per vedere quelli passati.</li></ul>" },
  { ico:"📷", titolo:"Leggere lo screenshot", html:"<ul><li>Scegli prima il tipo di schermata di People Smart: <b>Home</b> (riquadro Timbrature) o <b>Agenda</b> (elenco con Entrata/Uscita).</li><li>Poi scatta una foto o scegli lo screenshot dalla galleria: la lettura avviene sul telefono.</li><li>Con molte timbrature l'app prende ingresso, pausa pranzo (la pausa più lunga) e uscita finale.</li><li>Il banner ti dice cosa ha letto: controlla sempre e correggi i campi se serve.</li><li>Nell'Agenda il giorno non si legge: scegli tu la data.</li></ul>" },
  { ico:"⌨️", titolo:"Inserimento manuale veloce", html:"<ul><li>Scrivi solo i numeri: <b>800</b> diventa 08:00, <b>1745</b> diventa 17:45.</li><li>Gli orari impossibili (es. 50:00) non vengono accettati.</li><li>Finito un orario, il cursore passa da solo al campo successivo.</li><li>Se entri prima delle <b>08:00</b>, il conteggio parte comunque dalle 08:00.</li></ul>" },
  { ico:"⏱️", titolo:"Come si calcola lo straordinario", html:"<ul><li>Turno teorico 08:30-17:00 con pausa minima di 30 minuti (se la pausa reale è più lunga conta quella).</li><li>Tetto di <b>2 ore al giorno</b> e <b>20 ore al mese</b>.</li><li>Sotto ogni giornata trovi la <b>fascia arancione</b>: è l'orario da inserire su People Smart.</li><li>🌙 Spunta \"festiva / notturna\" nella giornata se vale una maggiorazione particolare.</li></ul>" },
  { ico:"📊", titolo:"Il riepilogo del mese", html:"<ul><li>Tre blocchi separati: <b>stipendio fisso</b>, <b>straordinari</b> e <b>totale</b>, così vedi quanto è il fisso.</li><li>Con 13 o 14 mensilità puoi scegliere: <b>Media annua</b>, <b>Mese ordinario</b> o <b>Mese con tredicesima</b>.</li><li>I valori sono stime: la media annua è la più affidabile.</li></ul>" },
  { ico:"⚙️", titolo:"Impostazioni base", html:"<ul><li>Inserisci <b>RAL lorda</b>, tipo di contratto (indeterminato o apprendistato), mensilità e, se vuoi, la paga oraria dello straordinario.</li><li>Il netto usa IRPEF 2026, INPS e detrazioni da lavoro dipendente.</li><li>Il tasto <b>← Indietro</b> chiude le impostazioni senza salvare.</li></ul>" },
  { ico:"💼", titolo:"Retribuzione per voci e CCNL", html:"<ul><li>Puoi inserire la retribuzione <b>per voci</b>: paga annua base, superminimo, patto di non concorrenza e altre voci fisse. La RAL diventa la somma.</li><li>Il <b>superminimo</b> di norma entra nella base oraria dello straordinario (puoi escluderlo). Il <b>patto di non concorrenza</b> ne resta sempre fuori e può essere indicato <b>al netto</b>: l'app ricava il lordo.</li><li>Dalla base calcola la <b>paga oraria</b> con il divisore del CCNL e le maggiorazioni (straordinario e festivo/notturno).</li><li>Opzione <b>15%</b>: vale solo per le maggiorazioni festive/notturne, fino a 1.500 € l'anno e con i requisiti di reddito.</li></ul>" },
  { ico:"🛠️", titolo:"Pannello avanzato", html:"<ul><li>Addizionale regionale (anche a scaglioni) e comunale con soglia di esenzione.</li><li>Coniuge, figli 21-29 anni (anche con disabilità), altri familiari, altre detrazioni e spese al 19%.</li><li>Previdenza complementare, trattenute in busta, bonus lordo e welfare.</li><li>\"Mostra dettaglio calcolo annuo\" spiega ogni passaggio, TFR incluso.</li></ul>" },
  { ico:"🧮", titolo:"Simulazione", html:"<ul><li>Il tasto 🧮 in alto prova una <b>RAL diversa</b> e/o altre ore di straordinario.</li><li>Mostra anche la differenza rispetto alla tua situazione reale.</li><li>Non modifica nessun dato salvato.</li></ul>" },
  { ico:"👁️", titolo:"Privacy degli importi", html:"<ul><li>Il tasto con l'<b>occhio</b> in alto nasconde tutti gli importi con un effetto evidenziatore.</li><li>Per rivederli tocca l'occhio oppure un importo nascosto.</li><li>L'app ricorda l'ultima modalità scelta. Al primo avvio gli importi sono nascosti.</li></ul>" },
  { ico:"💾", titolo:"Backup e installazione", html:"<ul><li>In Impostazioni: <b>Esporta backup</b> salva un file JSON; <b>Importa</b> lo ricarica (anche .txt).</li><li>Fai un backup prima di cambiare telefono.</li><li>Da Chrome: menu ⋮ → Aggiungi a schermata Home per usarla come app.</li><li>Le stime non sostituiscono il cedolino.</li></ul>" }
];
let tutIdx = 0;
function renderTutorial(){
  const s = TUTORIAL_SLIDE[tutIdx], body = $("tutBody"), dots = $("tutDots");
  if(!body) return;
  body.innerHTML = '<div class="tut-slide"><div class="ico">' + s.ico + '</div><h2>' + s.titolo + '</h2>' + s.html + '</div>';
  if(dots) dots.innerHTML = TUTORIAL_SLIDE.map((_,i) => '<span class="' + (i===tutIdx?"on":"") + '"></span>').join("");
  const prev = $("btnTutPrev"), next = $("btnTutNext");
  if(prev) prev.style.visibility = tutIdx === 0 ? "hidden" : "visible";
  if(next) next.textContent = tutIdx === TUTORIAL_SLIDE.length-1 ? "Fine" : "Avanti";
}
function mostraTutorial(){ tutIdx = 0; renderTutorial(); openOv("tutorialOverlay"); }
function chiudiTutorial(){
  localStorage.setItem(LS_TUTORIAL, "1");
  closeOv("tutorialOverlay");
  if(!localStorage.getItem(LS_ONBOARDED)) openOv("onboardOverlay");
}
on("btnTutPrev","click",() => { if(tutIdx > 0){ tutIdx--; renderTutorial(); } });
on("btnTutNext","click",() => { if(tutIdx < TUTORIAL_SLIDE.length-1){ tutIdx++; renderTutorial(); } else chiudiTutorial(); });
on("btnTutSkip","click",chiudiTutorial);
on("btnTutorial","click",() => { closeOv("settingsOverlay"); mostraTutorial(); });

// ==== ONBOARDING ====
function checkOnboarding(){
  if(!localStorage.getItem(LS_TUTORIAL)) { mostraTutorial(); return; }
  if($("onboardOverlay") && !localStorage.getItem(LS_ONBOARDED)) openOv("onboardOverlay");
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
  const ff=$("fFestivo"); if(ff) ff.checked=false;
  resetOcrUI(); aggiornaChipSchermata(); openOv("modalOverlay");
}
function apriModaleModifica(g){
  giornoInModifica = g.id;
  const t=$("modalTitolo"); if(t) t.textContent="Modifica giornata";
  const d=$("btnDeleteFromModal"); if(d) d.style.display="block";
  const set=(id,v)=>{ const el=$(id); if(el) el.value=v||""; };
  set("fData",g.data); set("fE1",g.e1); set("fU1",g.u1); set("fE2",g.e2); set("fU2",g.u2);
  const ff=$("fFestivo"); if(ff) ff.checked=!!g.festivo;
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
                  festivo: !!($("fFestivo") && $("fFestivo").checked),
                  orarioIn:ORARIO_TEORICO_IN, orarioOut:ORARIO_TEORICO_OUT };
  if(giornoInModifica) state.giorni = state.giorni.filter(g => g.id !== giornoInModifica);
  else state.giorni = state.giorni.filter(g => g.data !== data);
  state.giorni.push(nuova);
  saveGiorni();
  state.meseSelezionato = meseKeyOf(data);
  giornoInModifica = null;
  closeOv("modalOverlay"); renderAll();
});

// ==== IMPOSTAZIONI (base + voci/CCNL + avanzato) ====
const AV_CAMPI = {
  avInps:"inpsPerc", avPrev:"previdenzaCompl", avAddReg:"addReg", avAddCom:"addCom", avAddComEsenzione:"addComEsenzione",
  avFigli:"figli21", avFigliDis:"figliDis", avQuota:"quotaFigli", avAltri:"altriFamiliari", avDetrExtra:"detrazioniExtra",
  avSpese19:"spese19", avBonus:"bonus", avWelfare:"welfare", avTratt:"trattenuteMensili"
};
const CC_NUMERI = { ccBase:"base", ccSuper:"super", ccPatto:"patto", ccAltre:"altre", ccMagg1:"magg1", ccMagg2:"magg2" };
const CC_CHECK = { ccUsa:"usa", ccAgev:"agev15", ccSomma:"somma", ccPattoNetto:"pattoNetto", ccSuperEscl:"superEscl", ccAltreIncl:"altreIncl" };
function popolaFormImpostazioni(){
  const s = state.settings, a = s.avanzato || AVANZATO_DEFAULT, c = s.ccnl || CCNL_DEFAULT;
  const set=(id,v)=>{ const el=$(id); if(el) el.value = v; };
  set("sTipoContratto", s.tipoContratto || "indeterminato");
  set("sRalAnnua", s.ralAnnua || "");
  set("sMensilita", s.mensilita || 13);
  set("sPagaStraordinario", s.pagaStraordinario || "");
  const chk = $("avAttivo"); if(chk) chk.checked = !!a.attivo;
  for(const id in AV_CAMPI){ const v = a[AV_CAMPI[id]]; set(id, v ? v : (id === "avQuota" ? 100 : "")); }
  set("avConiuge", a.coniuge ? "1" : "0");
  set("avRegScaglioni", a.regScaglioni || "");
  for(const id in CC_CHECK){ const el=$(id); if(el) el.checked = !!c[CC_CHECK[id]]; }
  for(const id in CC_NUMERI){ set(id, c[CC_NUMERI[id]] || ""); }
  set("ccDivisore", c.divisore || 173);
  renderCcInfo();
}
function leggiFormImpostazioni(){
  const v = id => { const el=$(id); return el ? el.value : ""; };
  const av = Object.assign({}, AVANZATO_DEFAULT);
  av.attivo = !!($("avAttivo") && $("avAttivo").checked);
  for(const id in AV_CAMPI){ av[AV_CAMPI[id]] = parseFloat(v(id)) || 0; }
  if(v("avQuota") === "") av.quotaFigli = 100;
  av.coniuge = v("avConiuge") === "1";
  av.regScaglioni = v("avRegScaglioni").trim();
  const cc = Object.assign({}, CCNL_DEFAULT);
  for(const id in CC_CHECK){ cc[CC_CHECK[id]] = !!($(id) && $(id).checked); }
  for(const id in CC_NUMERI){ cc[CC_NUMERI[id]] = parseFloat(v(id)) || 0; }
  cc.divisore = parseFloat(v("ccDivisore")) || 173;
  const f = {
    tipoContratto: v("sTipoContratto") || "indeterminato",
    ralAnnua: parseFloat(v("sRalAnnua")) || 0,
    mensilita: parseInt(v("sMensilita"),10) || 13,
    pagaStraordinario: parseFloat(v("sPagaStraordinario")) || 0,
    avanzato: av, ccnl: cc
  };
  // Retribuzione per voci: la RAL e' la somma e il patto (se al netto) viene convertito in lordo
  if(cc.somma){
    const r = ralDaVoci(f);
    f.ralAnnua = r.totale;
    cc.pattoLordo = r.pattoLordo;
  } else {
    cc.pattoLordo = cc.patto;
  }
  return f;
}
function renderCcInfo(){
  const box = $("ccInfo"); if(!box) return;
  const f = leggiFormImpostazioni();
  const ral = $("sRalAnnua");
  if(ral){
    ral.disabled = !!f.ccnl.somma;
    if(f.ccnl.somma) ral.value = f.ralAnnua ? Math.round(f.ralAnnua * 100) / 100 : "";
  }
  let txt = "";
  if(f.ccnl.somma){
    const r = ralDaVoci(f);
    txt += "RAL totale: " + eur(r.totale);
    if(f.ccnl.pattoNetto && r.pattoInserito > 0) txt += " (patto netto " + eur(r.pattoInserito) + " = lordo circa " + eur(r.pattoLordo) + ")";
    txt += "<br>";
  } else if(f.ccnl.pattoNetto){
    txt += "Il patto al netto richiede la modalità \"per voci\": per ora è considerato lordo.<br>";
  }
  const t = tariffe(f.ralAnnua, f.mensilita, f);
  if(!t.p0){ box.innerHTML = txt + "Inserisci RAL e divisore (oppure la paga oraria manuale) per vedere le tariffe."; return; }
  txt += "Paga base oraria: " + eur(t.p0) + " · straordinario feriale: " + eur(t.feriale) + " · festivo/notturno: " + eur(t.festivo) + (t.usa ? " (calcolate da CCNL)" : " (dalla paga manuale)");
  if(t.usa && t.esclusa > 0) txt += "<br>Base di calcolo: RAL meno " + eur(t.esclusa) + " di voci fisse escluse.";
  box.innerHTML = txt;
}
function renderDettaglioCalcolo(){
  const box = $("dettaglioCalcolo"); if(!box) return;
  const f = leggiFormImpostazioni();
  if(!f.ralAnnua){ box.innerHTML = '<p class="helper">Inserisci la RAL per vedere il dettaglio.</p>'; return; }
  const o = opzioniDaSettings(f);
  const d = calcolaNettoDettaglio(f.ralAnnua, f.tipoContratto, f.mensilita, o);
  const row = (lab, val, cls) => '<div class="det-row ' + (cls||"") + '"><span>' + lab + '</span><span>' + val + '</span></div>';
  let html = row("RAL lorda", eur(d.ral)) +
    row("INPS lavoratore (" + (d.aliquotaInps*100).toFixed(2).replace(".",",") + "%)", "− " + eur(d.inps), "neg");
  if(d.prev) html += row("Previdenza complementare (dedotta)", "− " + eur(d.prev), "neg");
  html += row("Imponibile fiscale", eur(d.imponibile)) +
    row("IRPEF lorda", eur(d.irpefLorda)) +
    row("Detrazione lavoro dipendente", "− " + eur(d.detrLavoro), "pos");
  if(d.ulteriore) html += row("Ulteriore detrazione (cuneo 20-40k)", "− " + eur(d.ulteriore), "pos");
  if(d.detrConiuge) html += row("Detrazione coniuge", "− " + eur(d.detrConiuge), "pos");
  if(d.detrFigli) html += row("Detrazione figli 21-29", "− " + eur(d.detrFigli), "pos");
  if(d.detrAltri) html += row("Detrazione altri familiari", "− " + eur(d.detrAltri), "pos");
  if(d.detrExtra) html += row("Altre detrazioni", "− " + eur(d.detrExtra), "pos");
  if(d.detr19) html += row("Detrazione spese al 19%", "− " + eur(d.detr19), "pos");
  html += row("IRPEF netta", "− " + eur(d.irpefNetta), "neg");
  if(d.bonus) html += row("Somma esente (cuneo fino a 20k)", "+ " + eur(d.bonus), "pos");
  if(d.addReg) html += row("Addizionale regionale", "− " + eur(d.addReg), "neg");
  if(d.addCom) html += row("Addizionale comunale", "− " + eur(d.addCom), "neg");
  if(d.trattenute) html += row("Trattenute in busta (annue)", "− " + eur(d.trattenute), "neg");
  html += row("Netto annuo", eur(d.nettoAnnuo), "tot") +
    row("Netto mensile (media su " + f.mensilita + ")", eur(d.nettoAnnuo / f.mensilita), "tot");
  const bw = nettoBonusWelfare(f.ralAnnua, f.tipoContratto, f.mensilita, o);
  if(bw > 0) html += row("Bonus e welfare annui (netto stimato)", "+ " + eur(bw), "pos");
  html += row("TFR maturato nell'anno (lordo, non in busta)", eur(d.tfr), "info");
  box.innerHTML = html;
}
on("btnSettings","click",() => { popolaFormImpostazioni(); openOv("settingsOverlay"); aggiornaStatoImport(); });
on("btnSettingsBack","click",() => closeOv("settingsOverlay"));
const settingsOverlayEl = $("settingsOverlay");
if(settingsOverlayEl) settingsOverlayEl.addEventListener("click", e => { if(e.target === settingsOverlayEl) closeOv("settingsOverlay"); });
on("btnSettingsSave","click",() => {
  state.settings = leggiFormImpostazioni();
  saveSettings(); closeOv("settingsOverlay"); renderAll();
});
on("btnDettaglio","click",renderDettaglioCalcolo);
["sTipoContratto","sRalAnnua","sMensilita","sPagaStraordinario","ccUsa","ccDivisore","ccMagg1","ccMagg2","ccBase","ccSuper","ccPatto","ccAltre","ccSomma","ccPattoNetto","ccSuperEscl","ccAltreIncl","ccAgev",
 "avAttivo","avInps","avPrev","avAddReg","avRegScaglioni","avAddCom","avAddComEsenzione","avConiuge","avFigli","avFigliDis","avQuota","avAltri","avDetrExtra","avSpese19","avBonus","avWelfare","avTratt"].forEach(id => {
  const el = $(id);
  if(el){
    const agg = () => { renderCcInfo(); const d=$("dettaglioCalcolo"); if(d && d.innerHTML) renderDettaglioCalcolo(); };
    el.addEventListener("input", agg); el.addEventListener("change", agg);
  }
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
  const st = straordMese(state.meseSelezionato, s);
  const tar = tariffe(s.ralAnnua, s.mensilita, s);
  $("simRal").value = s.ralAnnua || "";
  $("simMensilita").value = String(s.mensilita || 13);
  $("simTipo").value = s.tipoContratto || "indeterminato";
  $("simPaga").value = tar.feriale ? tar.feriale.toFixed(2) : "";
  $("simOre").value = st.oreTot ? st.oreTot.toFixed(2) : "";
  simCalcola();
}
function simCalcola(){
  const out = $("simResult"); if(!out) return;
  const ral = parseFloat($("simRal").value) || 0;
  const mens = parseInt($("simMensilita").value,10) || 13;
  const tipo = $("simTipo").value;
  const ore = parseFloat($("simOre").value) || 0;
  const s = state.settings;
  const paga = parseFloat($("simPaga").value) || tariffe(ral, mens, s).feriale || 0;
  if(!ral){ out.innerHTML = '<div class="summary-box" style="grid-column:1/-1"><div class="lab">Inserisci una RAL per vedere la simulazione.</div></div>'; return; }
  const o = opzioniDaSettings(s);
  const sim = stimaMensile(ral, mens, tipo, o, { ordLordo: ore*paga, flatLordo:0 }, "media");
  const box = (v,l,c) => '<div class="summary-box ' + (c||"") + '"><div class="val">' + v + '</div><div class="lab">' + l + '</div></div>';
  let html = '<div class="sec-title">Fisso (senza straordinari)</div>' +
    box(eur(sim.fissoLordo),"Fisso lordo mensile","fisso") + box(eur(sim.fissoNetto),"Fisso netto mensile","fisso") +
    '<div class="sec-title">Straordinari</div>' +
    box(eur(sim.strLordo),"Straordinari lordi") + box(eur(sim.strNetto),"Straordinari netti") +
    '<div class="sec-title">Totale simulato</div>' +
    box(eur(sim.totLordo),"Totale lordo","tot") + box(eur(sim.totNetto),"Totale netto","tot");
  if(ore > 20) html += '<div class="summary-box warn" style="grid-column:1/-1"><div class="lab">Attenzione: il tetto contrattuale e\' 20h/mese, qui stai simulando ' + ore + 'h.</div></div>';
  if(s.ralAnnua){
    const reale = stimaMensile(s.ralAnnua, s.mensilita, s.tipoContratto, o, straordMese(state.meseSelezionato, s), "media");
    const diff = sim.totNetto - reale.totNetto;
    html += '<div class="sim-diff ' + (diff>=0?"pos":"neg") + '" style="grid-column:1/-1">Rispetto alla situazione reale (' + eur(reale.totNetto) + ' netti): ' + (diff>=0?"+":"-") + eur(Math.abs(diff)) + ' al mese</div>';
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
// Mappa le timbrature sui 4 campi RISPETTANDO il tipo (E/U): se manca una riga il campo resta vuoto.
function mappaConTipi(items){
  const res = { orari:["","","",""], ingressoMancante:false };
  if(items.length === 0) return res;
  const haIngresso = items[0].k === "E";
  const iOut = items[items.length-1].k === "U" ? items.length-1 : -1;
  if(haIngresso) res.orari[0] = items[0].t; else res.ingressoMancante = true;
  if(iOut > 0 || (iOut === 0 && !haIngresso)) res.orari[3] = items[iOut].t;
  let best = -1, bestGap = -1;
  for(let i=(haIngresso?1:0); i<items.length-1; i++){
    if(items[i].k === "U" && items[i+1].k === "E"){
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
aggiornaPrivacyUI();
renderAll();
checkOnboarding();
attivaTastieraNumericaOrari();
aggiornaChipSchermata();

if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err => console.log("SW error", err));
  });
}
