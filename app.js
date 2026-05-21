/*
  Aplicación técnica estática para transporte de sedimentos y socavación.
  No usa dependencias externas. Compatible con GitHub Pages.
*/
const G = 9.81;
const periods = [2,5,10,25,50,100,200];

const presets = {
  "A2-1": {n:0.040, d90:178.00, dm:37.27, d84:20.00, d50:18.0, psi:1.326, chi:0.302, q:{2:0.44,5:0.48,10:0.57,25:0.74,50:0.91,100:1.05,200:1.15}, bed0:1132.16, slope:0.12, width:5.4, depth:0.16},
  "A2-2": {n:0.040, d90:118.67, dm:28.17, d84:84.40, d50:28.0, psi:1.326, chi:0.308, q:{2:1.46,5:1.62,10:1.90,25:2.49,50:3.05,100:3.52,200:3.86}, bed0:1124.20, slope:0.13, width:8.2, depth:0.28},
  "A2-3": {n:0.040, d90:23.33, dm:13.74, d84:18.50, d50:9.0, psi:1.326, chi:0.332, q:{2:1.66,5:1.85,10:2.16,25:2.83,50:3.46,100:4.00,200:4.39}, bed0:1112.13, slope:0.049, width:10.5, depth:0.42},
  "Andacollo": {n:0.034, d90:54.333, dm:19.237, d84:36.67, d50:15.0, psi:1.326, chi:0.322, q:{2:3.80,5:11.59,10:16.30,25:18.92,50:19.76,100:24.29,200:27.04}, bed0:1036.50, slope:0.020, width:14.0, depth:0.75}
};

let state = {
  sections: [],
  results: [],
  mobile: [],
  local: null
};

const $ = (id) => document.getElementById(id);
const fmt = (v, d=2) => Number.isFinite(v) ? Number(v).toFixed(d) : "";
const num = (id, fallback=0) => {
  const v = parseFloat($(id).value);
  return Number.isFinite(v) ? v : fallback;
};
const text = (id) => $(id).value;
const rad = (deg) => deg * Math.PI / 180;
const clamp = (v,min,max) => Math.max(min, Math.min(max, v));

function init(){
  const riverSelect = $("riverSelect");
  Object.keys(presets).forEach(k=>{
    const op = document.createElement("option");
    op.value = k; op.textContent = k; riverSelect.appendChild(op);
  });
  riverSelect.value = "A2-2";
  loadPresetValues();
  generateSections();
  bindEvents();
  calculateAll();
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  }
}

function bindEvents(){
  document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>switchTab(btn.dataset.tab)));
  $("loadPreset").addEventListener("click",()=>{loadPresetValues(); generateSections(); calculateAll();});
  $("riverSelect").addEventListener("change",()=>{loadPresetValues();});
  $("periodSelect").addEventListener("change",()=>{setQFromPeriod(); updateSectionQ(); calculateAll();});
  $("conditionSelect").addEventListener("change",()=>{applyConditionEffect(); calculateAll();});
  $("generateSections").addEventListener("click",()=>{generateSections(); calculateAll();});
  $("calculateBtn").addEventListener("click",calculateAll);
  $("autoChi").addEventListener("click",()=>{$("chi").value = estimateChi(num("dm",20)).toFixed(3); calculateAll();});
  $("addSection").addEventListener("click",()=>{addSection(); renderSections();});
  $("clearSections").addEventListener("click",()=>{state.sections=[]; renderSections(); state.results=[]; renderResults();});
  $("reindexSections").addEventListener("click",()=>{state.sections.sort((a,b)=>a.station-b.station); renderSections(); calculateAll();});
  $("parseTable").addEventListener("click",()=>{parsePastedTable(); calculateAll();});
  $("sectionsTable").addEventListener("input",onSectionInput);
  $("calcLocal").addEventListener("click",()=>{state.local = calcLocalScour(); renderLocal(); renderReport();});
  $("runTemporal").addEventListener("click",()=>{state.mobile = simulateMobileBed(); renderMobile(); drawCharts(); renderReport();});
  $("exportCsv").addEventListener("click",exportCsv);
  $("exportReport").addEventListener("click",exportReportHtml);
  $("saveJson").addEventListener("click",saveProjectJson);
  $("loadJson").addEventListener("change",loadProjectJson);
  ["d50","d84","d90","dm","gammaW","gammaS","psi","chi","porosity","bulkDensity","nDefault","slopeDefault","totalLength","dxDefault"].forEach(id=>{
    $(id).addEventListener("change",()=>calculateAll());
  });
}

function switchTab(id){
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("is-active",b.dataset.tab===id));
  document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("is-active",p.id===id));
  if(id === "results") drawCharts();
}

function loadPresetValues(){
  const p = presets[$("riverSelect").value];
  $("nDefault").value = p.n.toFixed(3);
  $("slopeDefault").value = p.slope;
  $("d90").value = p.d90;
  $("dm").value = p.dm;
  $("d84").value = p.d84;
  $("d50").value = p.d50;
  $("psi").value = p.psi;
  $("chi").value = p.chi;
  $("localD90").value = (p.d90/1000).toFixed(4);
  setQFromPeriod();
}

function setQFromPeriod(){
  const p = presets[$("riverSelect").value];
  const tr = $("periodSelect").value;
  return p.q[tr] || p.q[100] || 1;
}

function updateSectionQ(){
  const q = setQFromPeriod();
  state.sections.forEach(s => s.Q = q);
  renderSections();
}

function applyConditionEffect(){
  const cond = $("conditionSelect").value;
  // Mantiene datos editables, pero aplica una variación leve para generar un ejemplo CP/SP.
  if(state.sections.length === 0) return;
  state.sections.forEach((s,i)=>{
    const f = cond === "Con Proyecto" ? (0.92 + 0.08*Math.sin(i*0.7)) : (1.00 + 0.02*Math.cos(i));
    s.topWidth = Math.max(0.4, s.topWidth * f);
    s.velocity = Math.max(0.05, s.Q / Math.max(0.01, s.area));
  });
  renderSections();
}

function generateSections(){
  const p = presets[$("riverSelect").value];
  const L = Math.max(1,num("totalLength",1000));
  const dx = Math.max(1,num("dxDefault",100));
  const n = num("nDefault",p.n);
  const J = num("slopeDefault",p.slope);
  const q = setQFromPeriod();
  const count = Math.floor(L/dx)+1;
  const cond = $("conditionSelect").value;
  state.sections = [];
  for(let i=0;i<count;i++){
    const st = Math.min(L, i*dx);
    const morph = 1 + 0.25*Math.sin(i*0.9) + 0.12*Math.cos(i*0.35);
    const widthFactor = cond === "Con Proyecto" ? 0.88 + 0.06*Math.sin(i) : 1;
    const topWidth = Math.max(0.8, p.width * morph * widthFactor);
    const bed = p.bed0 - st * J * 0.35 + 0.35*Math.sin(i*0.55);
    const depth = Math.max(0.03, p.depth * Math.pow(q/(p.q[100] || q),0.38) * (0.75 + 0.22*Math.cos(i*0.8)));
    const area = Math.max(0.001, topWidth * depth * (0.82 + 0.08*Math.sin(i*0.5)));
    const velocity = q / area;
    const wettedP = topWidth + 2*depth;
    const R = area / Math.max(0.001,wettedP);
    const froude = velocity / Math.sqrt(G * Math.max(0.001, depth));
    state.sections.push({
      id: cryptoId(), pt:`PT ${i+1}`, station:st, dx: i===0?dx:st-state.sections[i-1].station, Q:q, bed, waterElev:bed+depth,
      energyElev:bed+depth+Math.pow(velocity,2)/(2*G), J, velocity, area, topWidth, R, froude, depth, n,
      d50:num("d50",p.d50), d84:num("d84",p.d84), d90:num("d90",p.d90), dm:num("dm",p.dm), psi:num("psi",p.psi), chi:num("chi",p.chi)
    });
  }
  renderSections();
}

function cryptoId(){
  return Math.random().toString(36).slice(2,10);
}

function addSection(){
  const last = state.sections[state.sections.length-1];
  const dx = num("dxDefault",100);
  const station = last ? last.station + dx : 0;
  const q = setQFromPeriod();
  state.sections.push({
    id: cryptoId(), pt:`PT ${state.sections.length+1}`, station, dx, Q:q, bed:last?last.bed-dx*num("slopeDefault",0.01)*0.3:100,
    waterElev:last?last.waterElev-dx*num("slopeDefault",0.01)*0.25:100.5, energyElev:last?last.energyElev-dx*num("slopeDefault",0.01)*0.25:100.6,
    J:num("slopeDefault",0.01), velocity:1, area:1, topWidth:5, R:0.15, froude:1, depth:0.2, n:num("nDefault",0.04),
    d50:num("d50",10), d84:num("d84",20), d90:num("d90",30), dm:num("dm",15), psi:num("psi",1.326), chi:num("chi",0.32)
  });
}

function renderSections(){
  const headers = ["PT","Estación m","Δx m","Q m³/s","Fondo m","EH m","E m","J m/m","Vel m/s","Área m²","Ancho m","R m","Froude","Tirante m","n","Dm mm","D84 mm","D90 mm","Acción"];
  const table = $("sectionsTable");
  table.innerHTML = `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody></tbody>`;
  const tbody = table.querySelector("tbody");
  state.sections.forEach((s,idx)=>{
    const row = document.createElement("tr");
    row.dataset.idx = idx;
    row.innerHTML = `
      <td><input data-k="pt" value="${escapeHtml(s.pt)}" /></td>
      <td><input type="number" data-k="station" value="${fmt(s.station,2)}" /></td>
      <td><input type="number" data-k="dx" value="${fmt(s.dx,2)}" /></td>
      <td><input type="number" data-k="Q" value="${fmt(s.Q,4)}" /></td>
      <td><input type="number" data-k="bed" value="${fmt(s.bed,3)}" /></td>
      <td><input type="number" data-k="waterElev" value="${fmt(s.waterElev,3)}" /></td>
      <td><input type="number" data-k="energyElev" value="${fmt(s.energyElev,3)}" /></td>
      <td><input type="number" data-k="J" value="${fmt(s.J,6)}" /></td>
      <td><input type="number" data-k="velocity" value="${fmt(s.velocity,3)}" /></td>
      <td><input type="number" data-k="area" value="${fmt(s.area,3)}" /></td>
      <td><input type="number" data-k="topWidth" value="${fmt(s.topWidth,3)}" /></td>
      <td><input type="number" data-k="R" value="${fmt(s.R,4)}" /></td>
      <td><input type="number" data-k="froude" value="${fmt(s.froude,3)}" /></td>
      <td><input type="number" data-k="depth" value="${fmt(s.depth,3)}" /></td>
      <td><input type="number" data-k="n" value="${fmt(s.n,4)}" /></td>
      <td><input type="number" data-k="dm" value="${fmt(s.dm,3)}" /></td>
      <td><input type="number" data-k="d84" value="${fmt(s.d84,3)}" /></td>
      <td><input type="number" data-k="d90" value="${fmt(s.d90,3)}" /></td>
      <td><button data-delete="${idx}" class="danger">Eliminar</button></td>`;
    tbody.appendChild(row);
  });
  tbody.querySelectorAll("button[data-delete]").forEach(btn=>btn.addEventListener("click",()=>{
    state.sections.splice(parseInt(btn.dataset.delete,10),1); renderSections(); calculateAll();
  }));
}

function onSectionInput(e){
  const input = e.target;
  if(!input.dataset.k) return;
  const tr = input.closest("tr");
  const idx = parseInt(tr.dataset.idx,10);
  const k = input.dataset.k;
  state.sections[idx][k] = k === "pt" ? input.value : parseFloat(input.value);
  calculateAll(false);
}

function parsePastedTable(){
  const raw = $("pasteBox").value.trim();
  if(!raw) return alert("Pega primero una tabla.");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const split = (line) => line.includes("\t") ? line.split("\t") : line.split(/[;,]/);
  const headers = split(lines[0]).map(normalizeHeader);
  const rows = lines.slice(1).map(split);
  const map = {
    pt:["pt","perfil"], station:["estacion","station","modelo"], Q:["q","caudal","caudaltotal"], bed:["fondo","cotafondo","elevminfondo","elevacionminfondo"], waterElev:["eh","alturaagua","watersurface"], energyElev:["e","lineaenergia","energy"], J:["j","pendhidraulica","pendiente"], velocity:["velocidad","velmedia","vel"], area:["area","areaflujo"], topWidth:["ancho","anchosuperf","anchosuperficial"], R:["r","radiohidraulico"], froude:["froude","nfroude"], depth:["tirante","h","depth"], n:["n","manning"]
  };
  const idxFor = (key) => headers.findIndex(h => map[key].includes(h));
  const n = num("nDefault",0.04);
  state.sections = rows.map((cols,i)=>{
    const get = (key,fallback=0) => {
      const ix = idxFor(key);
      if(ix<0) return fallback;
      const v = parseFloat(String(cols[ix]).replace(",","."));
      return Number.isFinite(v) ? v : fallback;
    };
    const s = {
      id: cryptoId(), pt: cols[idxFor("pt")] || `PT ${i+1}`,
      station:get("station",i*num("dxDefault",100)), dx:i===0?num("dxDefault",100):0, Q:get("Q",setQFromPeriod()),
      bed:get("bed",100-i), waterElev:get("waterElev",0), energyElev:get("energyElev",0), J:get("J",num("slopeDefault",0.01)),
      velocity:get("velocity",0), area:get("area",0), topWidth:get("topWidth",5), R:get("R",0), froude:get("froude",0), depth:get("depth",0), n:get("n",n),
      d50:num("d50",10), d84:num("d84",20), d90:num("d90",30), dm:num("dm",15), psi:num("psi",1.326), chi:num("chi",0.32)
    };
    if(!s.depth && s.waterElev) s.depth = Math.max(0,s.waterElev - s.bed);
    if(!s.waterElev && s.depth) s.waterElev = s.bed+s.depth;
    if(!s.energyElev) s.energyElev = s.waterElev + (s.velocity*s.velocity)/(2*G);
    return completeHydraulics(s);
  });
  state.sections.forEach((s,i)=>{ if(i>0) s.dx = Math.abs(s.station-state.sections[i-1].station); });
  renderSections();
}

function normalizeHeader(h){
  return String(h).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
}

function completeHydraulics(s){
  let depth = Number.isFinite(s.depth) && s.depth>0 ? s.depth : Math.max(0.001, (s.waterElev||0)-(s.bed||0));
  let width = Number.isFinite(s.topWidth) && s.topWidth>0 ? s.topWidth : 1;
  let area = Number.isFinite(s.area) && s.area>0 ? s.area : width*depth;
  let R = Number.isFinite(s.R) && s.R>0 ? s.R : area / Math.max(0.001, width + 2*depth);
  let velocity = Number.isFinite(s.velocity) && s.velocity>0 ? s.velocity : s.Q / Math.max(0.001, area);
  let froude = Number.isFinite(s.froude) && s.froude>0 ? s.froude : velocity / Math.sqrt(G*depth);
  return {...s, depth, topWidth:width, area, R, velocity, froude, waterElev:s.waterElev || s.bed+depth, energyElev:s.energyElev || s.bed+depth+velocity*velocity/(2*G)};
}

function estimateChi(dmMm){
  const L = Math.log10(Math.max(0.001, dmMm));
  return 0.394557 - 0.04136*L - 0.00891*L*L;
}
function betaReturn(T){
  return 0.7929 + 0.0973 * Math.log10(Math.max(1,T));
}

function calcMPM(sec, overrides={}){
  const s = completeHydraulics(sec);
  const n = overrides.n ?? s.n ?? num("nDefault",0.04);
  const d90m = Math.max(0.000001,(overrides.d90 ?? s.d90 ?? num("d90",30))/1000);
  const dmm = Math.max(0.000001,(overrides.dm ?? s.dm ?? num("dm",15))/1000);
  const gammaW = overrides.gammaW ?? num("gammaW",1000);
  const gammaS = overrides.gammaS ?? num("gammaS",1800);
  const Ks = 1/Math.max(0.0001,n);
  const Kr = 26/Math.pow(d90m,1/6);
  const left = Math.pow(Ks/Kr,1.5) * gammaW * Math.max(0,s.J) * Math.max(0,s.R);
  const critical = 0.047 * (gammaS - gammaW) * dmm;
  const coef = 0.25 * Math.pow(gammaW/G,1/3) * Math.pow(Math.max(0,1-gammaW/gammaS),2/3);
  const excess = left - critical;
  const gs = excess > 0 && coef > 0 ? Math.pow(excess/coef,1.5) : 0; // kg/s/m, según forma documental
  const GsKgS = gs * Math.max(0,s.topWidth);
  const GsTonHr = GsKgS * 3.6;
  const GsM3Hr = GsTonHr / Math.max(0.0001,num("bulkDensity",1.8));
  return {Ks, Kr, gs, GsKgS, GsTonHr, GsM3Hr, excess};
}

function calcScour(sec){
  const s = completeHydraulics(sec);
  const T = parseFloat($("periodSelect").value);
  const q = s.Q / Math.max(0.001,s.topWidth);
  const D84m = Math.max(0.000001,(s.d84 || num("d84",20))/1000);
  const hcNeill = Math.pow(q/(1.81*Math.sqrt(G*Math.pow(D84m,0.33))),0.855);
  const hsNeill = Math.max(0,hcNeill - s.depth);
  const beta = betaReturn(T);
  const DmMm = Math.max(0.001,s.dm || num("dm",15));
  const psi = s.psi || num("psi",1.326);
  const chi = s.chi || num("chi",estimateChi(DmMm));
  const denom = 0.68 * beta * Math.pow(DmMm,0.28) * psi;
  const hLL = denom>0 ? Math.pow(q/denom,1/(chi+1)) : 0;
  const hsLL = Math.max(0,hLL - s.depth);
  const hsAvg = (hsNeill + hsLL)/2;
  return {q, beta, hcNeill, hsNeill, hLL, hsLL, hsAvg};
}

function calculateAll(render=true){
  state.results = state.sections.map((raw,i)=>{
    const s = completeHydraulics(raw);
    state.sections[i] = s;
    const mpm = calcMPM(s);
    const scour = calcScour(s);
    return {...s, ...mpm, ...scour, finalBed:s.bed - scour.hsAvg};
  });
  if(render){
    renderResults();
    state.mobile = simulateMobileBed(false);
    renderMobile();
    if(!state.local) state.local = calcLocalScour();
    renderLocal();
  }else{
    renderResults();
  }
}

function renderResults(){
  const r = state.results;
  const avg = (arr,k)=> arr.length ? arr.reduce((a,x)=>a+(x[k]||0),0)/arr.length : 0;
  const crit = r.reduce((a,x)=> !a || x.hsAvg>a.hsAvg ? x : a, null);
  $("kpiGs").textContent = fmt(avg(r,"GsTonHr"),1);
  $("kpiHs").textContent = fmt(avg(r,"hsAvg"),3);
  $("kpiCritical").textContent = crit ? `${crit.pt} / ${fmt(crit.station,0)} m` : "—";
  const headers = ["PT","Estación","Q","J","V","Área","Ancho","R","F","Tirante","Ks","Kr","gs kg/s/m","Gs Ton/hr","Neill m","L-L m","Promedio m","Cota socavada"];
  const table = $("resultsTable");
  table.innerHTML = `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${r.map(x=>`
    <tr><td>${escapeHtml(x.pt)}</td><td>${fmt(x.station,2)}</td><td>${fmt(x.Q,3)}</td><td>${fmt(x.J,5)}</td><td>${fmt(x.velocity,2)}</td><td>${fmt(x.area,2)}</td><td>${fmt(x.topWidth,2)}</td><td>${fmt(x.R,3)}</td><td>${fmt(x.froude,2)}</td><td>${fmt(x.depth,3)}</td><td>${fmt(x.Ks,2)}</td><td>${fmt(x.Kr,2)}</td><td>${fmt(x.gs,3)}</td><td>${fmt(x.GsTonHr,2)}</td><td>${fmt(x.hsNeill,3)}</td><td>${fmt(x.hsLL,3)}</td><td>${fmt(x.hsAvg,3)}</td><td>${fmt(x.finalBed,3)}</td></tr>`).join("")}</tbody>`;
  drawCharts();
  renderReport();
}

function simulateMobileBed(update=true){
  const hydro = parseHydrograph();
  if(state.results.length === 0) return [];
  const supplyVal = num("solidSupply",0.7);
  const supplyType = $("solidSupplyType").value;
  const por = clamp(num("porosity",0.35),0,0.85);
  const bulk = Math.max(0.1,num("bulkDensity",1.8));
  const armor = Math.max(0,num("armorFactor",0.35));
  const maxDz = Math.max(0.001,num("maxDzStep",0.15));
  const base = state.results.map(x=>({...x, z:x.bed, erosion:0, deposit:0, dmEff:x.dm}));
  for(let t=1;t<hydro.length;t++){
    const dt = Math.max(0,hydro[t].time - hydro[t-1].time);
    const factor = Math.max(0,hydro[t].factor);
    base.forEach((s,idx)=>{
      const scaled = {...s, Q:s.Q*factor, velocity:s.velocity*Math.pow(factor||0.0001,0.35), J:s.J*Math.pow(factor||0.0001,0.20), dm:s.dmEff};
      const cap = calcMPM(scaled).GsTonHr;
      let supply = supplyType === "tonhr" ? supplyVal : cap * supplyVal;
      if(idx>0 && supplyType !== "tonhr") supply = calcMPM({...base[idx-1], Q:base[idx-1].Q*factor, dm:base[idx-1].dmEff}).GsTonHr * supplyVal;
      const width = Math.max(0.1,s.topWidth);
      const dx = Math.max(0.1,s.dx || num("dxDefault",100));
      const dzRaw = -((cap - supply) * dt) / (bulk * (1-por) * width * dx);
      const dz = clamp(dzRaw, -maxDz, maxDz);
      s.z += dz;
      if(dz < 0) s.erosion += -dz;
      if(dz > 0) s.deposit += dz;
      const d84 = s.d84 || num("d84",20);
      const d50 = s.d50 || num("d50",10);
      s.dmEff = Math.min(d84, Math.max(s.dm, s.dm * (1 + armor * s.erosion / Math.max(0.01,d50/1000))));
      s.lastCapacity = cap;
      s.lastSupply = supply;
    });
  }
  const out = base.map(s=>({pt:s.pt, station:s.station, bedInitial:s.bed, bedFinal:s.z, erosion:s.erosion, deposit:s.deposit, dz:s.z-s.bed, dmEff:s.dmEff, capacity:s.lastCapacity||0, supply:s.lastSupply||0}));
  if(update) state.mobile = out;
  return out;
}

function parseHydrograph(){
  const raw = $("hydrographBox").value.trim();
  const data = raw.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
    const [a,b] = line.split(/[;,\t ]+/).map(Number);
    return {time:Number.isFinite(a)?a:0, factor:Number.isFinite(b)?b:0};
  }).sort((a,b)=>a.time-b.time);
  return data.length >= 2 ? data : [{time:0,factor:0},{time:1,factor:1}];
}

function renderMobile(){
  const rows = state.mobile || [];
  const table = $("mobileTable");
  table.innerHTML = `<thead><tr>${["PT","Estación","Cota inicial","Cota final","Δz","Erosión acum.","Depósito acum.","Dm efectivo","Capacidad Ton/hr","Aporte Ton/hr"].map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(x=>`
    <tr><td>${escapeHtml(x.pt)}</td><td>${fmt(x.station,2)}</td><td>${fmt(x.bedInitial,3)}</td><td>${fmt(x.bedFinal,3)}</td><td>${fmt(x.dz,3)}</td><td>${fmt(x.erosion,3)}</td><td>${fmt(x.deposit,3)}</td><td>${fmt(x.dmEff,2)}</td><td>${fmt(x.capacity,2)}</td><td>${fmt(x.supply,2)}</td></tr>`).join("")}</tbody>`;
}

function calcLocalScour(){
  const Dp = num("localDp",0);
  const F0 = Math.max(0.0001,num("localF0",0.37));
  const d90 = Math.max(0.000001,num("localD90",0.0543));
  const h0 = Math.max(0.0001,num("localH0",1.46));
  const hd = Math.max(0.0001,num("localHd",1.46));
  const phi = rad(num("localPhi",35.7));
  const delta = rad(num("localDelta",90));
  const betaP = 0.316*Math.sin(delta) + 0.15*Math.log((Dp+h0)/h0) + 0.13*Math.log(hd/h0) - 0.05*Math.log(F0);
  const alpha = betaP;
  const ratio = 1.25 * Math.pow(Math.sin(phi)/Math.sin(phi+alpha),0.8) * Math.pow(h0/d90,0.4) * Math.pow(F0,1.6) * Math.sin(betaP);
  const smax = Math.max(0, ratio*h0 - Dp);
  return {Dp,F0,d90,h0,hd,phi:phi*180/Math.PI,delta:delta*180/Math.PI,betaP,alpha,smax,ratio};
}
function renderLocal(){
  const l = state.local || calcLocalScour();
  $("localResult").textContent = `${fmt(l.smax,3)} m`;
  $("localDetail").textContent = `β′ = ${fmt(l.betaP,3)} rad · α = ${fmt(l.alpha,3)} rad · (Smax + Dp)/h0 = ${fmt(l.ratio,3)}`;
}

function renderReport(){
  const project = escapeHtml(text("projectName"));
  const river = $("riverSelect").value;
  const cond = $("conditionSelect").value;
  const T = $("periodSelect").value;
  const r = state.results;
  const avg = (k)=> r.length ? r.reduce((a,x)=>a+(x[k]||0),0)/r.length : 0;
  const min = (k)=> r.length ? Math.min(...r.map(x=>x[k]||0)) : 0;
  const max = (k)=> r.length ? Math.max(...r.map(x=>x[k]||0)) : 0;
  const crit = r.reduce((a,x)=> !a || x.hsAvg>a.hsAvg ? x : a, null);
  const local = state.local;
  $("reportBox").innerHTML = `
    <h3>${project}</h3>
    <p><strong>Cauce:</strong> ${river}. <strong>Condición:</strong> ${cond}. <strong>Período de retorno:</strong> ${T} años.</p>
    <h3>1. Parámetros de entrada</h3>
    <p>Se usaron ${r.length} perfiles/secciones, con Δx editable y longitud total definida por el usuario. La rugosidad Manning adoptada es n=${fmt(num("nDefault",0.04),3)}. La granulometría considera Dm=${fmt(num("dm",0),2)} mm, D84=${fmt(num("d84",0),2)} mm y D90=${fmt(num("d90",0),2)} mm.</p>
    <h3>2. Arrastre de sedimentos</h3>
    <p>El gasto sólido se calculó por perfil con Meyer‑Peter‑Müller. El promedio del tramo es <strong>${fmt(avg("GsTonHr"),2)} Ton/hr</strong>, con mínimo ${fmt(min("GsTonHr"),2)} y máximo ${fmt(max("GsTonHr"),2)} Ton/hr.</p>
    <h3>3. Socavación generalizada</h3>
    <p>Se aplicaron Neill y Lischtvan‑Levediev. El resultado final corresponde al promedio de ambos métodos. La socavación media es <strong>${fmt(avg("hsAvg"),3)} m</strong>; la máxima es <strong>${fmt(max("hsAvg"),3)} m</strong>${crit?` en ${escapeHtml(crit.pt)} / estación ${fmt(crit.station,2)} m`:""}.</p>
    <h3>4. Frontera móvil</h3>
    <p>El balance temporal considera capacidad de transporte, aporte sólido, porosidad y volumen de control por ancho y Δx. La tabla de frontera móvil muestra degradación cuando Δz es negativo y depósito cuando Δz es positivo.</p>
    <h3>5. Socavación local</h3>
    <p>${local?`La socavación local estimada es <strong>${fmt(local.smax,3)} m</strong>, con β′=${fmt(local.betaP,3)} rad.`:"No se ha calculado la socavación local."}</p>
    <h3>6. Advertencia técnica</h3>
    <p>Estos cálculos son una herramienta preliminar de revisión, comparación y trazabilidad. Para ingeniería de detalle se debe validar con topografía, granulometría, hidrología, calibración hidráulica y un modelo especializado.</p>`;
}

function drawCharts(){
  drawProfileChart();
  drawScourChart();
}
function getRanges(xs, ys){
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  if(Math.abs(maxY-minY)<1e-9){minY-=1;maxY+=1;}
  return {minX,maxX,minY,maxY};
}
function drawBase(canvasId, title, xs, series){
  const c = $(canvasId); if(!c) return;
  const ctx = c.getContext("2d");
  ctx.clearRect(0,0,c.width,c.height);
  const pad = {l:62,r:18,t:30,b:44};
  const allY = series.flatMap(s=>s.data);
  if(xs.length === 0 || allY.length === 0) return;
  const rg = getRanges(xs, allY);
  const w = c.width-pad.l-pad.r, h = c.height-pad.t-pad.b;
  const X = x => pad.l + (x-rg.minX)/(rg.maxX-rg.minX || 1)*w;
  const Y = y => pad.t + (rg.maxY-y)/(rg.maxY-rg.minY || 1)*h;
  ctx.strokeStyle = "#d8e1ec"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.l,pad.t); ctx.lineTo(pad.l,pad.t+h); ctx.lineTo(pad.l+w,pad.t+h); ctx.stroke();
  ctx.fillStyle = "#51647f"; ctx.font = "13px Segoe UI, Arial";
  ctx.fillText(title, pad.l, 20);
  for(let i=0;i<=4;i++){
    const y = rg.minY+(rg.maxY-rg.minY)*i/4;
    const py = Y(y);
    ctx.strokeStyle = "#edf2f7"; ctx.beginPath(); ctx.moveTo(pad.l,py); ctx.lineTo(pad.l+w,py); ctx.stroke();
    ctx.fillStyle = "#65748b"; ctx.fillText(fmt(y,2), 8, py+4);
  }
  const colors = ["#0f5c8c","#0b9a88","#b76e00","#7c3aed"];
  series.forEach((s,idx)=>{
    ctx.strokeStyle = colors[idx%colors.length]; ctx.lineWidth = 3; ctx.beginPath();
    s.data.forEach((y,i)=>{ const px=X(xs[i]), py=Y(y); if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); });
    ctx.stroke();
    ctx.fillStyle = colors[idx%colors.length]; ctx.fillText(s.name, pad.l+idx*150, c.height-12);
  });
}
function drawProfileChart(){
  const r = state.results;
  const xs = r.map(x=>x.station);
  const mobileMap = new Map((state.mobile||[]).map(x=>[x.pt,x.bedFinal]));
  drawBase("profileChart","Perfil longitudinal: fondo inicial, agua y frontera móvil",xs,[
    {name:"Fondo inicial", data:r.map(x=>x.bed)},
    {name:"Lámina de agua", data:r.map(x=>x.waterElev)},
    {name:"Fondo final", data:r.map(x=>mobileMap.get(x.pt) ?? x.finalBed)}
  ]);
}
function drawScourChart(){
  const r = state.results;
  drawBase("scourChart","Socavación generalizada por método",r.map(x=>x.station),[
    {name:"Neill", data:r.map(x=>x.hsNeill)},
    {name:"Lischtvan", data:r.map(x=>x.hsLL)},
    {name:"Promedio", data:r.map(x=>x.hsAvg)}
  ]);
}

function exportCsv(){
  if(!state.results.length) calculateAll();
  const headers = ["Cauce","Condicion","Periodo","PT","Estacion_m","Dx_m","Q_m3s","Fondo_m","EH_m","J","Vel_ms","Area_m2","Ancho_m","R_m","Froude","Tirante_m","n","Dm_mm","D84_mm","D90_mm","Ks","Kr","gs_kg_s_m","Gs_Ton_hr","Gs_m3_hr","Hs_Neill_m","Hs_LL_m","Hs_prom_m","Cota_socavada_m"];
  const rows = state.results.map(x=>[$("riverSelect").value,$("conditionSelect").value,$("periodSelect").value,x.pt,x.station,x.dx,x.Q,x.bed,x.waterElev,x.J,x.velocity,x.area,x.topWidth,x.R,x.froude,x.depth,x.n,x.dm,x.d84,x.d90,x.Ks,x.Kr,x.gs,x.GsTonHr,x.GsM3Hr,x.hsNeill,x.hsLL,x.hsAvg,x.finalBed]);
  downloadText("resultados_sedimentos_socavacion.csv", [headers,...rows].map(row=>row.map(csvCell).join(";")).join("\n"), "text/csv");
}
function saveProjectJson(){
  const project = collectProject();
  downloadText("proyecto_sedimentos_socavacion.json", JSON.stringify(project,null,2), "application/json");
}
function loadProjectJson(e){
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const p = JSON.parse(reader.result);
      applyProject(p); calculateAll();
    }catch(err){ alert("No se pudo leer el JSON: "+err.message); }
  };
  reader.readAsText(file);
}
function collectProject(){
  const ids = ["projectName","riverSelect","conditionSelect","periodSelect","totalLength","dxDefault","nDefault","slopeDefault","d50","d84","d90","dm","gammaW","gammaS","psi","chi","porosity","bulkDensity","localDp","localF0","localD90","localH0","localHd","localPhi","localDelta","solidSupply","solidSupplyType","armorFactor","maxDzStep","hydrographBox"];
  const inputs = {};
  ids.forEach(id=>inputs[id]=$(id).value);
  return {version:"1.0", inputs, sections:state.sections};
}
function applyProject(p){
  if(!p || !p.inputs) throw new Error("estructura inválida");
  Object.entries(p.inputs).forEach(([id,value])=>{ if($(id)) $(id).value=value; });
  state.sections = Array.isArray(p.sections) ? p.sections : [];
  renderSections();
}
function exportReportHtml(){
  if(!state.results.length) calculateAll();
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe sedimentos y socavación</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#172033}h1,h2,h3{color:#0f385a}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccd6e3;padding:6px;text-align:right}th{background:#eef5fb}td:first-child,th:first-child{text-align:left}.box{border:1px solid #ccd6e3;padding:14px;border-radius:12px;margin:14px 0}</style></head><body><h1>Informe de transporte de sedimentos y socavación</h1><div class="box">${$("reportBox").innerHTML}</div><h2>Resultados</h2>${$("resultsTable").outerHTML}<h2>Frontera móvil</h2>${$("mobileTable").outerHTML}</body></html>`;
  downloadText("informe_sedimentos_socavacion.html", html, "text/html");
}
function downloadText(filename, content, type){
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function csvCell(v){
  if(v === null || v === undefined) return "";
  const s = String(v).replace(/\./g,",");
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}

init();
