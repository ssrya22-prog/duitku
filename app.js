/* ============================================================
   DUITKU — Aplikasi Keuangan Pribadi (Final Version)
   ============================================================ */
'use strict';

/* ============ KONSTANTA ============ */
const KEY="keuangan_gue_data_v4";
const DEFAULT_MIN_RESERVE=20000;
const INCOME_CATEGORIES=["Gaji","Service Charge","Bonus","Usaha","Lainnya"];
const EXPENSE_CATEGORIES=["Makanan","Transportasi","Tagihan","Belanja","Hiburan","Kesehatan","Keluarga","Lainnya"];
const CHART_COLORS=["#a9d4b6","#9db8e0","#c0a8e0","#e8d9a8","#d9aaaa","#a8d4d0","#d4b8a8","#b8a8d4","#a8c4d4","#d4a8b8","#c4d4a8","#d4c4a8"];

/* Tanggal tetap pemasukan rutin */
const INCOME_DAY_1=15;  // gaji
const INCOME_DAY_2=28;  // bonus

/* ============ STATE ============ */
let data=loadData();
let currentType="expense";
let currentSubType="normal";
let currentWallet="nontunai";
let currentFilter="all";
let currentDebtFilter="all";
let currentSearch="";
let editingTransactionId=null;
let editingRecurringId=null;
let editingDebtId=null;
let currentRecurringType="expense";
let currentChart="donut";
let selectedMonth=currentMonth();

/* State untuk interaksi grafik */
let chartRange="month";
let hiddenCategories=new Set();
let selectedDonutSlice=null;
let selectedBars=[];
let lineZoomLevel=0;
let lineScrubIndex=null;
let linePanOffset=0;

/* ============ LOAD DATA ============ */
function loadData(){
 let raw=null;
 try{raw=JSON.parse(localStorage.getItem(KEY));}catch(e){raw=null;}
 if(!raw){
  try{raw=JSON.parse(localStorage.getItem("keuangan_gue_data_v3"));}catch(e){}
 }
 return normalizeData(raw);
}

function normalizeData(imported){
 const result={
  name:"Duitku",initialCash:0,initialNontunai:0,
  transactions:[],debts:[],recurring:[],
  nextId:1,logo:null,lastBackupDate:null,
  minReserve:DEFAULT_MIN_RESERVE
 };
 if(!imported||typeof imported!=="object") return result;

 if(typeof imported.name==="string"&&imported.name.trim()) result.name=imported.name.trim();
 if(typeof imported.logo==="string"&&imported.logo.startsWith("data:image/")) result.logo=imported.logo;
 if(typeof imported.lastBackupDate==="string") result.lastBackupDate=imported.lastBackupDate;
 if(imported.minReserve!=null){const v=Number(imported.minReserve);if(isFinite(v)&&v>=0) result.minReserve=v;}

 if(imported.initialCash!=null){const v=Number(imported.initialCash);if(isFinite(v)) result.initialCash=v;}
 if(imported.initialNontunai!=null){const v=Number(imported.initialNontunai);if(isFinite(v)) result.initialNontunai=v;}
 else if(imported.initial!=null){const v=Number(imported.initial);if(isFinite(v)) result.initialNontunai=v;}

 let maxId=0;

 if(Array.isArray(imported.transactions)){
  imported.transactions.forEach(raw=>{
   if(!raw||typeof raw!=="object") return;
   const amount=Number(raw.amount);
   if(!isFinite(amount)||amount<=0) return;
   let type=raw.type;
   if(type!=="income"&&type!=="expense"&&type!=="transfer") type="expense";
   const date=(typeof raw.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(raw.date))?raw.date:today();
   const category=(typeof raw.category==="string"&&raw.category.trim())?raw.category.trim():(type==="transfer"?"Transfer":"Lainnya");
   const description=typeof raw.description==="string"?raw.description:"";
   let wallet=raw.wallet;
   if(wallet!=="cash"&&wallet!=="nontunai") wallet="nontunai";
   let fromWallet=raw.fromWallet;
   let toWallet=raw.toWallet;
   if(type==="transfer"){
    if(fromWallet!=="cash"&&fromWallet!=="nontunai") fromWallet="nontunai";
    if(toWallet!=="cash"&&toWallet!=="nontunai") toWallet="cash";
   }
   let id=Number(raw.id);
   if(!isFinite(id)||id<=0) id=0;
   const obj={id,type,amount,category,description,date,wallet};
   if(type==="transfer"){obj.fromWallet=fromWallet;obj.toWallet=toWallet;}
   if(raw.debtId){obj.debtId=raw.debtId;}
   if(raw.paymentForDebtId){obj.paymentForDebtId=raw.paymentForDebtId;}
   result.transactions.push(obj);
   if(id>maxId) maxId=id;
  });
 }
 result.transactions.forEach(t=>{if(!t.id){maxId++;t.id=maxId;}});

 if(Array.isArray(imported.debts)){
  imported.debts.forEach(raw=>{
   if(!raw||typeof raw!=="object") return;
   const name=typeof raw.name==="string"?raw.name.trim():"";
   if(!name) return;
   const amount=Number(raw.amount);
   if(!isFinite(amount)||amount<=0) return;
   const type=raw.type==="utang"?"utang":"piutang";
   let paid=Number(raw.paid);
   if(!isFinite(paid)||paid<0) paid=0;
   if(paid>amount) paid=amount;
   const date=(typeof raw.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(raw.date))?raw.date:today();
   const dueDate=(typeof raw.dueDate==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate))?raw.dueDate:"";
   const note=typeof raw.note==="string"?raw.note:"";
   let id=Number(raw.id);
   if(!isFinite(id)||id<=0) id=0;
   result.debts.push({id,name,type,amount,paid,date,dueDate,note});
   if(id>maxId) maxId=id;
  });
 }
 result.debts.forEach(d=>{if(!d.id){maxId++;d.id=maxId;}});

 if(Array.isArray(imported.recurring)){
  imported.recurring.forEach(raw=>{
   if(!raw||typeof raw!=="object") return;
   const name=typeof raw.name==="string"?raw.name.trim():"";
   if(!name) return;
   const amount=Number(raw.amount);
   if(!isFinite(amount)||amount<=0) return;
   const type=raw.type==="income"?"income":"expense";
   let day=Number(raw.day);
   if(!isFinite(day)||day<1) day=1;
   if(day>31) day=31;
   const category=typeof raw.category==="string"?raw.category:"Lainnya";
   const description=typeof raw.description==="string"?raw.description:"";
   let wallet=raw.wallet;
   if(wallet!=="cash"&&wallet!=="nontunai") wallet="nontunai";
   const startMonth=(typeof raw.startMonth==="string"&&/^\d{4}-\d{2}$/.test(raw.startMonth))?raw.startMonth:currentMonth();
   const active=raw.active!==false;
   const lastConfirmed=(typeof raw.lastConfirmed==="string")?raw.lastConfirmed:"";
   let id=Number(raw.id);
   if(!isFinite(id)||id<=0) id=0;
   result.recurring.push({id,name,type,amount,category,description,wallet,day,startMonth,active,lastConfirmed});
   if(id>maxId) maxId=id;
  });
 }
 result.recurring.forEach(r=>{if(!r.id){maxId++;r.id=maxId;}});

 result.nextId=maxId+1;
 return result;
}

function newId(){
 const id=data.nextId;
 data.nextId=id+1;
 return id;
}

function saveData(){
 try{
  localStorage.setItem(KEY,JSON.stringify(data));
 }catch(e){
  showToast("Gagal menyimpan data. Storage penuh?");
 }
}

/* ============ FORMAT ============ */
function cleanNumber(v){
 return Number(String(v||"").replace(/\D/g,""))||0;
}
function formatMoney(v){
 return Number(v||0).toLocaleString("id-ID");
}
function rupiah(v){
 return "Rp "+formatMoney(Math.round(Number(v)||0));
}
function formatMoneyInput(el){
 const raw=el.value;
 let caret=raw.length;
 try{if(typeof el.selectionStart==="number") caret=el.selectionStart;}catch(e){}
 const digitsBefore=raw.slice(0,caret).replace(/\D/g,"").length;
 const digits=raw.replace(/\D/g,"");
 if(!digits){el.value="";return;}
 const formatted=Number(digits).toLocaleString("id-ID");
 el.value=formatted;
 let pos=0,count=0;
 while(pos<formatted.length&&count<digitsBefore){
  if(/\d/.test(formatted[pos])) count++;
  pos++;
 }
 try{el.setSelectionRange(pos,pos);}catch(e){}
}

/* ============ TANGGAL ============ */
function today(){
 const d=new Date();
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function currentMonth(){
 const d=new Date();
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function formatDate(date){
 if(!date) return "-";
 const d=new Date(date+"T00:00:00");
 return d.toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"});
}
function formatMonthLabel(ym){
 if(!ym||!/^\d{4}-\d{2}$/.test(ym)) return "-";
 const [y,m]=ym.split("-");
 const d=new Date(Number(y),Number(m)-1,1);
 return d.toLocaleDateString("id-ID",{month:"long",year:"numeric"});
}
function monthLabelShort(ym){
 if(!ym||!/^\d{4}-\d{2}$/.test(ym)) return "-";
 const [y,m]=ym.split("-");
 const d=new Date(Number(y),Number(m)-1,1);
 return d.toLocaleDateString("id-ID",{month:"short"});
}
function daysBetween(dateA,dateB){
 const a=new Date(dateA+"T00:00:00");
 const b=new Date(dateB+"T00:00:00");
 return Math.round((b-a)/86400000);
}

/* ============ SALDO ============ */
function balances(){
 let cash=Number(data.initialCash)||0;
 let nontunai=Number(data.initialNontunai)||0;
 const todayDate=today();

 data.transactions.forEach(t=>{
  if(t.date>todayDate) return;
  const amt=Number(t.amount)||0;
  if(t.type==="income"){
   if(t.wallet==="cash") cash+=amt;
   else nontunai+=amt;
  }
  else if(t.type==="expense"){
   if(t.wallet==="cash") cash-=amt;
   else nontunai-=amt;
  }
  else if(t.type==="transfer"){
   if(t.fromWallet==="cash") cash-=amt;
   else nontunai-=amt;
   if(t.toWallet==="cash") cash+=amt;
   else nontunai+=amt;
  }
 });

 return{cash,nontunai,total:cash+nontunai};
}

function monthTotalsFor(ym){
 let income=0,expense=0;
 const todayDate=today();
 data.transactions.forEach(t=>{
  if(!t.date.startsWith(ym)) return;
  if(t.date>todayDate) return;
  const amt=Number(t.amount)||0;
  if(t.type==="income") income+=amt;
  else if(t.type==="expense") expense+=amt;
 });
 return{income,expense};
}

function monthTotals(){
 return monthTotalsFor(selectedMonth);
}

/* ============ DAFTAR BULAN ============ */
function availableMonths(){
 const set={};
 data.transactions.forEach(t=>{
  const ym=t.date.slice(0,7);
  set[ym]=true;
 });
 set[currentMonth()]=true;
 return Object.keys(set).sort((a,b)=>b.localeCompare(a));
}

function renderMonthFilter(){
 const sel=document.getElementById("monthFilter");
 if(!sel) return;
 const months=availableMonths();
 sel.innerHTML=months.map(ym=>{
  const isSel=ym===selectedMonth?" selected":"";
  return `<option value="${ym}"${isSel}>${formatMonthLabel(ym)}</option>`;
 }).join("");
}

function onMonthChange(ym){
 selectedMonth=ym;
 renderDashboard();
 renderTransactions();
 renderStats();
}

/* ============ PERKIRAAN PEMASUKAN ============ */
/* Logika: pemasukan rutin dikunci tanggal 15 & 28.
   - Hari ini < 15   -> berikutnya 15 bulan ini
   - Hari ini = 15   -> berikutnya 28 bulan ini
   - 15 < hari < 28  -> berikutnya 28 bulan ini
   - Hari ini >= 28  -> berikutnya 15 bulan depan
*/
function getNextIncomeDate(){
 const now=new Date();
 const day=now.getDate();
 const y=now.getFullYear();
 const m=now.getMonth();

 if(day<INCOME_DAY_1){
  return new Date(y,m,INCOME_DAY_1);
 }
 if(day>=INCOME_DAY_1 && day<INCOME_DAY_2){
  return new Date(y,m,INCOME_DAY_2);
 }
 /* day >= 28 -> tanggal 15 bulan depan */
 return new Date(y,m+1,INCOME_DAY_1);
}

function getDaysUntilIncome(){
 const now=new Date();
 now.setHours(0,0,0,0);
 const next=getNextIncomeDate();
 next.setHours(0,0,0,0);
 return Math.max(0,Math.round((next-now)/86400000));
}

function formatNextIncomeShort(){
 const d=getNextIncomeDate();
 return d.toLocaleDateString("id-ID",{day:"numeric",month:"short"});
}

function formatNextIncomeLabel(){
 const days=getDaysUntilIncome();
 const date=formatNextIncomeShort();
 if(days===0) return date+" (hari ini)";
 if(days===1) return date+" (besok)";
 return date+" ("+days+" hari lagi)";
}

/* ============ ANALISIS KEUANGAN ============ */
function financialAnalysis(){
 const bal=balances();
 const mt=monthTotals();
 const now=new Date();
 const isCurrent=selectedMonth===currentMonth();

 /* Sisa hari dihitung sampai pemasukan berikutnya, bukan akhir bulan */
 const daysLeft=Math.max(1,getDaysUntilIncome()+1);

 /* Untuk bulan yang dipilih bukan bulan berjalan, tetap pakai jumlah hari bulan tsb */
 const daysInSelectedMonth=new Date(
  Number(selectedMonth.slice(0,4)),
  Number(selectedMonth.slice(5,7)),
  0
 ).getDate();
 const elapsed=isCurrent?Math.max(1,now.getDate()):daysInSelectedMonth;

 const startOfMonthBalance=bal.total-mt.income+mt.expense;

 const minReserve=Number(data.minReserve)||DEFAULT_MIN_RESERVE;
 let reserve=0;
 let reserveNote="";
 if(bal.total>0){
  const candidate=bal.total*0.20;
  if(candidate>=minReserve){
   reserve=candidate;
   reserveNote="20% dari saldo saat ini";
  }else{
   reserve=0;
   reserveNote="20% saldo (Rp "+formatMoney(candidate)+") di bawah batas minimum Rp "+formatMoney(minReserve)+" — tidak dikunci";
  }
 }else{
  reserveNote="Saldo kosong — tidak ada yang dikunci";
 }

 const spendable=Math.max(0,bal.total-reserve);
 const dailyLimit=spendable/daysLeft;

 let expenseToday=0;
 if(isCurrent){
  const todayStr=today();
  data.transactions.forEach(t=>{
   if(t.type==="expense"&&t.date===todayStr){
    expenseToday+=Number(t.amount)||0;
   }
  });
 }

 const remainingToday=dailyLimit-expenseToday;
 const overLimit=expenseToday>dailyLimit;

 let usagePercent=0;
 if(dailyLimit>0) usagePercent=(expenseToday/dailyLimit)*100;
 else if(expenseToday>0) usagePercent=100;

 const avgDaily=elapsed>0?mt.expense/elapsed:0;

 let status="AMAN";
 if(mt.expense===0) status="MULAI";
 else if(avgDaily>dailyLimit) status="BOROS";
 else if(avgDaily>dailyLimit*0.80) status="WASPADA";
 else status="AMAN";

 let advice="";
 if(status==="MULAI") advice="Belum ada pengeluaran bulan ini.";
 else if(status==="AMAN") advice="Pengeluaran masih dalam batas aman.";
 else if(status==="WASPADA") advice="Pengeluaran mulai mendekati batas harian.";
 else if(status==="BOROS") advice="Rata-rata pengeluaran melewati batas harian.";
 if(overLimit) advice="⚠️ Pengeluaran hari ini sudah melewati batas harian.";

 return{
  startOfMonthBalance,reserve,reserveNote,spendable,dailyLimit,daysLeft,avgDaily,
  status,advice,expenseToday,remainingToday,overLimit,usagePercent,isCurrent,minReserve,
  nextIncome:formatNextIncomeLabel()
 };
}

/* ============ DASHBOARD ============ */
function renderDashboard(){
 const bal=balances();
 const mt=monthTotals();
 const analysis=financialAnalysis();

 document.title=data.name;
 document.getElementById("appName").textContent=data.name;
 document.getElementById("monthText").textContent=formatMonthLabel(selectedMonth);

 document.getElementById("balanceCash").textContent=rupiah(bal.cash);
 document.getElementById("balanceNontunai").textContent=rupiah(bal.nontunai);
 document.getElementById("balanceTotal").textContent=rupiah(bal.total);
 document.getElementById("balanceInfo").textContent=bal.total<0?"Saldo minus":"Total semua transaksi";

 document.getElementById("incomeTotal").textContent=rupiah(mt.income);
 document.getElementById("expenseTotal").textContent=rupiah(mt.expense);
 document.getElementById("summaryMonth").textContent="Ringkasan "+formatMonthLabel(selectedMonth);

 let barColor="#22c55e";
 if(analysis.usagePercent>=100) barColor="#ef4444";
 else if(analysis.usagePercent>=80) barColor="#eab308";
 const barWidth=Math.min(analysis.usagePercent,100);

 const todayRows = analysis.isCurrent ? `
  <div class="analysis-row">
   <span class="analysis-label">Pengeluaran hari ini</span>
   <span class="analysis-value">${rupiah(analysis.expenseToday)}</span>
  </div>
  <div class="analysis-row">
   <span class="analysis-label">Sisa batas hari ini</span>
   <span class="analysis-value" style="color:${analysis.overLimit?'#ef4444':'#a9d4b6'}">
    ${analysis.overLimit?"Lewat batas!":rupiah(analysis.remainingToday)}
   </span>
  </div>
  <div style="padding:9px 0 0">
   <div class="analysis-progress-track">
    <div class="analysis-progress-fill" style="width:${barWidth}%;background:${barColor}"></div>
   </div>
   <div class="analysis-progress-meta">
    <span>${analysis.usagePercent.toFixed(0)}% dari batas harian</span>
    <span>${analysis.daysLeft} hari lagi ke pemasukan</span>
   </div>
  </div>
 ` : `
  <div class="analysis-row">
   <span class="analysis-label">Sisa hari</span>
   <span class="analysis-value">${analysis.daysLeft} hari</span>
  </div>
 `;

 document.getElementById("analysisCard").innerHTML=`
  <div class="analysis-row"><span class="analysis-label">Saldo awal bulan</span><span class="analysis-value">${rupiah(analysis.startOfMonthBalance)}</span></div>
  <div class="analysis-row"><span class="analysis-label">Dana darurat dikunci</span><span class="analysis-value">${rupiah(analysis.reserve)}</span></div>
  <div class="analysis-row" style="padding-top:0;border-bottom:0"><span class="analysis-label" style="font-size:10px;font-style:italic;color:#5a6377">${escapeHTML(analysis.reserveNote||"")}</span><span></span></div>
  <div class="analysis-row"><span class="analysis-label">Dana boleh dipakai</span><span class="analysis-value">${rupiah(analysis.spendable)}</span></div>
  <div class="analysis-row"><span class="analysis-label">Batas belanja / hari</span><span class="analysis-value">${rupiah(analysis.dailyLimit)}</span></div>
  ${todayRows}
  <div class="analysis-row"><span class="analysis-label">Rata-rata pengeluaran</span><span class="analysis-value">${rupiah(analysis.avgDaily)}/hari</span></div>
  <div class="analysis-row"><span class="analysis-label">Status</span><span class="analysis-value"><span class="status">${analysis.status}</span></span></div>
  <div class="analysis-row"><span class="analysis-label">Perkiraan pemasukan berikutnya</span><span class="analysis-value">${analysis.nextIncome}</span></div>
  <div class="advice">${analysis.advice}</div>
 `;

 renderChart();
 renderRecent();
 renderMonthFilter();
 renderConfirmBanner();
 renderRecurringBadge();
 renderBackupReminder();
 renderLastBackupText();
 renderMinReserveDesc();
}

function renderMinReserveDesc(){
 const el=document.getElementById("minReserveDesc");
 if(!el) return;
 const val=Number(data.minReserve)||DEFAULT_MIN_RESERVE;
 el.textContent="Saat ini: Rp "+formatMoney(val)+". Kalau 20% saldo di bawah angka ini, dana darurat tidak dikunci.";
}

/* ============ DATA GRAFIK ============ */
function getRangeMonths(){
 const now=new Date();
 const n={month:1,"3month":3,"6month":6,year:12}[chartRange]||1;
 const arr=[];
 for(let i=n-1;i>=0;i--){
  const d=new Date(now.getFullYear(),now.getMonth()-i,1);
  arr.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
 }
 return arr;
}

function categoryExpenses(){
 const map={};
 const monthsSet=new Set(getRangeMonths());
 data.transactions.forEach(t=>{
  if(t.type!=="expense") return;
  const ym=t.date.slice(0,7);
  if(!monthsSet.has(ym)) return;
  let key=t.category||"Lainnya";
  if(t.category==="Lainnya"){
   const desc=(t.description||"").trim();
   key=desc?desc:"(tanpa keterangan)";
  }
  if(hiddenCategories.has(key)) return;
  map[key]=(map[key]||0)+(Number(t.amount)||0);
 });
 return Object.entries(map).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
}

function dailyExpenses(){
 const months=getRangeMonths();
 if(months.length===1){
  const ym=months[0];
  const [y,m]=ym.split("-").map(Number);
  const days=new Date(y,m,0).getDate();
  const arr=new Array(days).fill(0);
  data.transactions.forEach(t=>{
   if(t.type!=="expense") return;
   if(!t.date.startsWith(ym)) return;
   const d=Number(t.date.slice(8,10))-1;
   if(d>=0&&d<days) arr[d]+=Number(t.amount)||0;
  });
  return{labels:arr.map((_,i)=>String(i+1)),values:arr};
 }
 const allDays=[];
 months.forEach(ym=>{
  const [y,m]=ym.split("-").map(Number);
  const days=new Date(y,m,0).getDate();
  for(let d=1;d<=days;d++){
   allDays.push({ym,day:d,label:`${d}/${m}`});
  }
 });
 const values=allDays.map(({ym,day})=>{
  const dateStr=`${ym}-${String(day).padStart(2,"0")}`;
  let sum=0;
  data.transactions.forEach(t=>{
   if(t.type!=="expense") return;
   if(t.date===dateStr) sum+=Number(t.amount)||0;
  });
  return sum;
 });
 return{labels:allDays.map(x=>x.label),values};
}

function transactionsByCategory(catName){
 const monthsSet=new Set(getRangeMonths());
 return data.transactions.filter(t=>{
  if(t.type!=="expense") return false;
  if(!monthsSet.has(t.date.slice(0,7))) return false;
  let key=t.category||"Lainnya";
  if(t.category==="Lainnya"){
   const desc=(t.description||"").trim();
   key=desc?desc:"(tanpa keterangan)";
  }
  return key===catName;
 }).sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);
}

function transactionsByDate(dateStr){
 return data.transactions.filter(t=>t.date===dateStr&&t.type==="expense")
  .sort((a,b)=>b.id-a.id);
}

/* ============ ESCAPE ============ */
function escapeHTML(value){
 return String(value||"")
  .replace(/&/g,"&amp;")
  .replace(/</g,"&lt;")
  .replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;")
  .replace(/'/g,"&#039;");
}

/* ============ GRAFIK: SWITCH TAB ============ */
function showChart(name,btn){
 currentChart=name;
 document.querySelectorAll(".chart-tab").forEach(t=>t.classList.remove("active"));
 if(btn) btn.classList.add("active");
 document.querySelectorAll(".chart-panel").forEach(p=>p.classList.remove("active"));
 const panel=document.getElementById("panel-"+name);
 if(panel) panel.classList.add("active");
 if(name==="donut") renderDonut();
 if(name==="bar") renderBar();
 if(name==="line") renderLine();
}

function setChartRange(range,btn){
 chartRange=range;
 lineZoomLevel=0;
 linePanOffset=0;
 lineScrubIndex=null;
 document.querySelectorAll(".range-btn").forEach(b=>b.classList.remove("active"));
 if(btn) btn.classList.add("active");
 renderChart();
}

function renderChart(){
 if(currentChart==="donut") renderDonut();
 else if(currentChart==="bar") renderBar();
 else if(currentChart==="line") renderLine();
}

/* ============ GRAFIK DONAT (INTERAKTIF) ============ */
function renderDonut(){
 const canvas=document.getElementById("chartDonut");
 const legend=document.getElementById("legendDonut");
 if(!canvas) return;

 const items=categoryExpenses();
 const dpr=window.devicePixelRatio||1;
 const cssW=canvas.clientWidth||300;
 const cssH=220;
 canvas.width=Math.round(cssW*dpr);
 canvas.height=Math.round(cssH*dpr);
 const ctx=canvas.getContext("2d");
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.clearRect(0,0,cssW,cssH);

 if(!items.length){
  ctx.fillStyle="#858b96";
  ctx.font="12px Arial";
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.fillText("Belum ada pengeluaran.",cssW/2,cssH/2);
  legend.innerHTML="";
  return;
 }

 const total=items.reduce((s,x)=>s+x.value,0);
 const cx=cssW/2,cy=cssH/2;
 const outerR=Math.min(cssW,cssH)/2-14;
 const innerR=outerR*0.58;
 let startAngle=-Math.PI/2;

 const slices=[];

 items.forEach((item,i)=>{
  const slice=(item.value/total)*Math.PI*2;
  const endAngle=startAngle+slice;
  const color=CHART_COLORS[i%CHART_COLORS.length];
  const isSelected=selectedDonutSlice===i;
  const r=isSelected?outerR+6:outerR;
  const mid=(startAngle+endAngle)/2;
  const offsetX=isSelected?Math.cos(mid)*4:0;
  const offsetY=isSelected?Math.sin(mid)*4:0;

  ctx.beginPath();
  ctx.arc(cx+offsetX,cy+offsetY,r,startAngle,endAngle,false);
  ctx.arc(cx+offsetX,cy+offsetY,innerR,endAngle,startAngle,true);
  ctx.closePath();
  ctx.fillStyle=color;
  ctx.fill();
  ctx.strokeStyle="#12151b";
  ctx.lineWidth=2;
  ctx.stroke();

  slices.push({startAngle,endAngle,i,item});
  startAngle=endAngle;
 });

 canvas._slices=slices;

 let centerAmount=total;
 let centerLabel="Total";
 if(selectedDonutSlice!==null&&items[selectedDonutSlice]){
  centerAmount=items[selectedDonutSlice].value;
  centerLabel=items[selectedDonutSlice].name;
 }
 ctx.fillStyle="#f2f3f5";
 ctx.font="bold 15px Arial";
 ctx.textAlign="center";
 ctx.textBaseline="middle";
 ctx.fillText(rupiah(centerAmount),cx,cy-6);
 ctx.fillStyle="#858b96";
 ctx.font="10px Arial";
 const label=centerLabel.length>18?centerLabel.slice(0,17)+"…":centerLabel;
 ctx.fillText(label,cx,cy+12);

 legend.innerHTML=items.map((item,i)=>{
  const pct=total>0?Math.round((item.value/total)*100):0;
  const isSel=selectedDonutSlice===i;
  return `<div class="legend-row ${isSel?'highlight':''}" onclick="tapDonutLegend(${i})">
   <span class="legend-color" style="background:${CHART_COLORS[i%CHART_COLORS.length]}"></span>
   <span class="legend-name">${escapeHTML(item.name)} · ${pct}%</span>
   <span class="legend-amount">${rupiah(item.value)}</span>
  </div>`;
 }).join("");

 if(!canvas._hasClick){
  canvas._hasClick=true;
  canvas.addEventListener("click",donutClick);
  canvas.addEventListener("touchstart",donutTouch,{passive:true});
 }
}

function hitDonut(canvas,x,y){
 if(!canvas._slices) return null;
 const rect=canvas.getBoundingClientRect();
 const cx=(rect.width)/2;
 const cy=(rect.height)/2;
 const dx=x-cx,dy=y-cy;
 const dist=Math.sqrt(dx*dx+dy*dy);
 const outerR=Math.min(rect.width,rect.height)/2-14;
 const innerR=outerR*0.58;
 if(dist<innerR||dist>outerR+10) return null;
 let ang=Math.atan2(dy,dx);
 if(ang< -Math.PI/2) ang+=Math.PI*2;
 for(const s of canvas._slices){
  if(ang>=s.startAngle&&ang<s.endAngle) return s.i;
 }
 return null;
}

function donutClick(e){
 const canvas=e.currentTarget;
 const rect=canvas.getBoundingClientRect();
 const x=e.clientX-rect.left;
 const y=e.clientY-rect.top;
 const idx=hitDonut(canvas,x,y);
 if(idx===null){
  selectedDonutSlice=null;
  renderDonut();
  return;
 }
 if(selectedDonutSlice===idx){
  openCategoryDetail(canvas._slices.find(s=>s.i===idx).item.name);
  return;
 }
 selectedDonutSlice=idx;
 renderDonut();
}

function donutTouch(e){
 const canvas=e.currentTarget;
 const t=e.touches[0];
 if(!t) return;
 const rect=canvas.getBoundingClientRect();
 const x=t.clientX-rect.left;
 const y=t.clientY-rect.top;
 const idx=hitDonut(canvas,x,y);
 if(idx===null){
  if(selectedDonutSlice!==null){
   selectedDonutSlice=null;
   renderDonut();
  }
  return;
 }
 if(selectedDonutSlice===idx){
  openCategoryDetail(canvas._slices.find(s=>s.i===idx).item.name);
  selectedDonutSlice=null;
  renderDonut();
  return;
 }
 selectedDonutSlice=idx;
 renderDonut();
}

function tapDonutLegend(i){
 if(selectedDonutSlice===i){
  const items=categoryExpenses();
  if(items[i]) openCategoryDetail(items[i].name);
  return;
 }
 selectedDonutSlice=selectedDonutSlice===i?null:i;
 renderDonut();
}

/* ============ GRAFIK BATANG (INTERAKTIF) ============ */
function renderBar(){
 const box=document.getElementById("barList");
 if(!box) return;
 const items=categoryExpenses();
 if(!items.length){
  box.innerHTML=`<div class="empty">Belum ada pengeluaran.</div>`;
  return;
 }
 const max=items[0].value;
 selectedBars=selectedBars.filter(b=>items.some(it=>it.name===b));

 box.innerHTML=items.map((item,i)=>{
  const pct=max>0?(item.value/max)*100:0;
  const isSel=selectedBars.indexOf(item.name)>=0;
  const dim=selectedBars.length>0&&!isSel?"dimmed":"";
  return `<div class="bar-row ${isSel?'highlight':''} ${dim}"
    data-cat="${escapeHTML(item.name)}"
    onclick="tapBarCategory('${escapeHTML(item.name).replace(/'/g,"\\'")}')"
    ontouchstart="barLongPressStart(event,'${escapeHTML(item.name).replace(/'/g,"\\'")}')"
    ontouchend="barLongPressEnd(event)"
    ontouchmove="barLongPressEnd(event)"
    oncontextmenu="return false">
   <span class="bar-label">${escapeHTML(item.name)}</span>
   <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${CHART_COLORS[i%CHART_COLORS.length]}"></div></div>
   <span class="bar-value">${rupiah(item.value)}</span>
  </div>`;
 }).join("");

 if(selectedBars.length===2){
  const a=items.find(x=>x.name===selectedBars[0]);
  const b=items.find(x=>x.name===selectedBars[1]);
  if(a&&b){
   const diff=a.value-b.value;
   const bigger=diff>0?a.name:b.name;
   const smaller=diff>0?b.name:a.name;
   const ratio=smaller.value>0?(bigger===a.name?a.value/b.value:b.value/a.value):0;
   const info=`<div class="advice" style="margin-top:12px">📊 <b>${escapeHTML(bigger)}</b> lebih besar ${ratio>0?(ratio.toFixed(1)+"×"):""} dari <b>${escapeHTML(smaller)}</b> · selisih ${rupiah(Math.abs(diff))}</div>`;
   box.innerHTML+=info;
  }
 }
}

let barLongTimer=null;
function barLongPressStart(e,catName){
 barLongTimer=setTimeout(()=>{
  barLongTimer=null;
  toggleHideCategory(catName);
  if(navigator.vibrate) navigator.vibrate(30);
 },650);
}
function barLongPressEnd(e){
 if(barLongTimer){clearTimeout(barLongTimer);barLongTimer=null;}
}

function tapBarCategory(catName){
 if(barLongTimer) return;
 if(selectedBars.length===1&&selectedBars[0]===catName){
  openCategoryDetail(catName);
  selectedBars=[];
  renderBar();
  return;
 }
 const idx=selectedBars.indexOf(catName);
 if(idx>=0){
  selectedBars.splice(idx,1);
 }else{
  if(selectedBars.length>=2) selectedBars=[];
  selectedBars.push(catName);
 }
 renderBar();
}

function toggleHideCategory(catName){
 if(hiddenCategories.has(catName)) hiddenCategories.delete(catName);
 else hiddenCategories.add(catName);
 selectedBars=[];
 selectedDonutSlice=null;
 renderChart();
 showToast(hiddenCategories.has(catName)?"Kategori disembunyikan":"Kategori ditampilkan");
}

/* ============ GRAFIK GARIS (INTERAKTIF + PAN) ============ */
function calcWindowSize(total){
 if(lineZoomLevel===0) return total;
 const seg=Math.pow(2,lineZoomLevel);
 return Math.max(3,Math.ceil(total/seg));
}

function lineZoom(dir){
 const {values}=dailyExpenses();
 const total=values.length;
 const maxZoom=Math.max(0,Math.floor(Math.log2(total))-1);

 if(dir<0){
  const oldWindow=calcWindowSize(total);
  lineZoomLevel=Math.min(maxZoom,lineZoomLevel+1);
  const newWindow=calcWindowSize(total);
  const centerIndex=linePanOffset+Math.floor(oldWindow/2);
  linePanOffset=Math.max(0,Math.min(total-newWindow,centerIndex-Math.floor(newWindow/2)));
 }else{
  const oldWindow=calcWindowSize(total);
  lineZoomLevel=Math.max(0,lineZoomLevel-1);
  const newWindow=calcWindowSize(total);
  const centerIndex=linePanOffset+Math.floor(oldWindow/2);
  linePanOffset=Math.max(0,Math.min(total-newWindow,centerIndex-Math.floor(newWindow/2)));
 }

 if(lineZoomLevel===0) linePanOffset=0;
 renderLine();
}

function linePan(dir){
 const {values}=dailyExpenses();
 const total=values.length;
 const windowSize=calcWindowSize(total);
 const maxOffset=Math.max(0,total-windowSize);
 linePanOffset=Math.max(0,Math.min(maxOffset,linePanOffset+dir));
 renderLine();
}

function renderLine(){
 const canvas=document.getElementById("chartLine");
 const cap=document.getElementById("lineCaption");
 if(!canvas) return;

 const {labels,values}=dailyExpenses();
 const total=values.length;

 if(!total){
  cap.textContent="Belum ada data.";
  return;
 }

 const windowSize=calcWindowSize(total);
 const maxOffset=Math.max(0,total-windowSize);

 if(linePanOffset>maxOffset) linePanOffset=maxOffset;
 if(linePanOffset<0) linePanOffset=0;

 const start=linePanOffset;
 const end=Math.min(total,start+windowSize);

 const sliced=values.slice(start,end);
 const slicedLabels=labels.slice(start,end);
 const n=sliced.length;

 const leftBtn=document.getElementById("linePanLeftBtn");
 const rightBtn=document.getElementById("linePanRightBtn");
 if(leftBtn) leftBtn.disabled=(start<=0);
 if(rightBtn) rightBtn.disabled=(end>=total);

 const zl=document.getElementById("lineZoomLabel");
 if(zl){
  if(lineZoomLevel===0) zl.textContent="Semua";
  else zl.textContent=slicedLabels[0]+" — "+slicedLabels[n-1];
 }

 if(!n){cap.textContent="";return;}

 const dpr=window.devicePixelRatio||1;
 const cssW=canvas.clientWidth||300;
 const cssH=220;
 canvas.width=Math.round(cssW*dpr);
 canvas.height=Math.round(cssH*dpr);
 const ctx=canvas.getContext("2d");
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.clearRect(0,0,cssW,cssH);

 const padL=42,padR=12,padT=12,padB=22;
 const chartW=cssW-padL-padR;
 const chartH=cssH-padT-padB;
 const max=Math.max(...sliced,1);
 const niceMax=Math.ceil(max/50000)*50000||50000;
 const stepX=n>1?chartW/(n-1):0;
 const xFor=i=>padL+i*stepX;
 const yFor=v=>padT+chartH-(v/niceMax)*chartH;

 ctx.strokeStyle="#252a33";
 ctx.lineWidth=1;
 ctx.fillStyle="#858b96";
 ctx.font="10px Arial";
 ctx.textAlign="right";
 ctx.textBaseline="middle";
 for(let i=0;i<=4;i++){
  const v=(niceMax/4)*i;
  const y=yFor(v);
  ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(cssW-padR,y);ctx.stroke();
  const label=v>=1000?Math.round(v/1000)+"rb":v;
  ctx.fillText(label,padL-6,y);
 }

 const grad=ctx.createLinearGradient(0,padT,0,padT+chartH);
 grad.addColorStop(0,"rgba(169,212,182,.3)");
 grad.addColorStop(1,"rgba(169,212,182,0)");
 ctx.beginPath();
 ctx.moveTo(xFor(0),yFor(sliced[0]));
 for(let i=1;i<n;i++) ctx.lineTo(xFor(i),yFor(sliced[i]));
 ctx.lineTo(xFor(n-1),padT+chartH);
 ctx.lineTo(xFor(0),padT+chartH);
 ctx.closePath();
 ctx.fillStyle=grad;
 ctx.fill();

 ctx.beginPath();
 ctx.moveTo(xFor(0),yFor(sliced[0]));
 for(let i=1;i<n;i++) ctx.lineTo(xFor(i),yFor(sliced[i]));
 ctx.strokeStyle="#a9d4b6";
 ctx.lineWidth=2.2;
 ctx.lineJoin="round";
 ctx.lineCap="round";
 ctx.stroke();

 ctx.fillStyle="#a9d4b6";
 for(let i=0;i<n;i++){
  ctx.beginPath();
  ctx.arc(xFor(i),yFor(sliced[i]),n>40?1.8:2.6,0,Math.PI*2);
  ctx.fill();
 }

 if(lineScrubIndex!==null&&lineScrubIndex>=start&&lineScrubIndex<end){
  const i=lineScrubIndex-start;
  const x=xFor(i);
  const y=yFor(sliced[i]);
  ctx.strokeStyle="rgba(169,212,182,.4)";
  ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(x,padT);
  ctx.lineTo(x,padT+chartH);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x,y,5,0,Math.PI*2);
  ctx.fillStyle="#a9d4b6";
  ctx.fill();
  ctx.strokeStyle="#090b0f";
  ctx.lineWidth=2;
  ctx.stroke();

  const label=slicedLabels[i];
  const val=sliced[i];
  const tooltip=`Tgl ${label} · ${rupiah(val)}`;
  ctx.font="bold 11px Arial";
  const tw=ctx.measureText(tooltip).width+16;
  const th=24;
  let tx=x-tw/2;
  let ty=y-th-10;
  if(tx<4) tx=4;
  if(tx+tw>cssW-4) tx=cssW-4-tw;
  if(ty<4) ty=y+14;
  ctx.fillStyle="rgba(242,243,245,.95)";
  ctx.beginPath();
  const r=6;
  ctx.moveTo(tx+r,ty);
  ctx.arcTo(tx+tw,ty,tx+tw,ty+th,r);
  ctx.arcTo(tx+tw,ty+th,tx,ty+th,r);
  ctx.arcTo(tx,ty+th,tx,ty,r);
  ctx.arcTo(tx,ty,tx+tw,ty,r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle="#090b0f";
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.fillText(tooltip,tx+tw/2,ty+th/2);
 }

 ctx.fillStyle="#858b96";
 ctx.font="10px Arial";
 ctx.textAlign="center";
 ctx.textBaseline="top";
 const stepLbl=Math.max(1,Math.floor(n/6));
 for(let i=0;i<n;i+=stepLbl){
  ctx.fillText(slicedLabels[i],xFor(i),padT+chartH+6);
 }

 const sum=sliced.reduce((s,v)=>s+v,0);
 const avg=Math.round(sum/n);
 cap.textContent=`Total ${rupiah(sum)} · rata-rata ${rupiah(avg)}/hari`;

 canvas._lineData={start,end,sliced,slicedLabels,xFor,yFor,padL,padR,padT,padB,chartW,chartH,n,cssW};

 if(!canvas._hasScrub){
  canvas._hasScrub=true;
  canvas.addEventListener("touchstart",lineScrubStart,{passive:false});
  canvas.addEventListener("touchmove",lineScrubMove,{passive:false});
  canvas.addEventListener("touchend",lineScrubEnd);
  canvas.addEventListener("touchcancel",lineScrubEnd);
  canvas.addEventListener("mousemove",lineScrubMouse);
  canvas.addEventListener("mouseleave",()=>{lineScrubIndex=null;renderLine();});
  canvas.addEventListener("click",lineClickDetail);
 }
}

function lineScrubPos(canvas,clientX){
 const info=canvas._lineData;
 if(!info) return null;
 const rect=canvas.getBoundingClientRect();
 const x=clientX-rect.left;
 if(x<info.padL||x>info.cssW-info.padR) return null;
 const relX=x-info.padL;
 const step=info.n>1?info.chartW/(info.n-1):0;
 if(step<=0) return info.start;
 let idx=Math.round(relX/step);
 idx=Math.max(0,Math.min(info.n-1,idx));
 return info.start+idx;
}

let lineTouchStartX=0;
let lineTouchStartPanOffset=0;
let lineTouchIsPanning=false;

function lineScrubStart(e){
 const canvas=e.currentTarget;
 if(e.touches.length>=2){
  e.preventDefault();
  lineTouchIsPanning=true;
  lineScrubIndex=null;
  const t1=e.touches[0];
  const t2=e.touches[1];
  lineTouchStartX=(t1.clientX+t2.clientX)/2;
  lineTouchStartPanOffset=linePanOffset;
  return;
 }
 const t=e.touches[0];
 if(!t) return;
 const idx=lineScrubPos(canvas,t.clientX);
 if(idx!==null){
  e.preventDefault();
  lineScrubIndex=idx;
  renderLine();
 }
}

function lineScrubMove(e){
 const canvas=e.currentTarget;
 if(lineTouchIsPanning||e.touches.length>=2){
  e.preventDefault();
  if(e.touches.length>=2){
   const t1=e.touches[0];
   const t2=e.touches[1];
   const curX=(t1.clientX+t2.clientX)/2;
   const info=canvas._lineData;
   if(!info) return;
   const pxPerDay=info.n>1?info.chartW/(info.n-1):1;
   const deltaDay=Math.round((lineTouchStartX-curX)/pxPerDay);
   const {values}=dailyExpenses();
   const total=values.length;
   const windowSize=calcWindowSize(total);
   const maxOffset=Math.max(0,total-windowSize);
   linePanOffset=Math.max(0,Math.min(maxOffset,lineTouchStartPanOffset+deltaDay));
   renderLine();
  }
  return;
 }
 const t=e.touches[0];
 if(!t) return;
 const idx=lineScrubPos(canvas,t.clientX);
 if(idx!==null){
  e.preventDefault();
  lineScrubIndex=idx;
  renderLine();
 }
}

function lineScrubEnd(e){
 lineTouchIsPanning=false;
}
function lineScrubMouse(e){
 const canvas=e.currentTarget;
 const idx=lineScrubPos(canvas,e.clientX);
 if(idx!==null){
  lineScrubIndex=idx;
  renderLine();
 }
}
function lineClickDetail(e){
 const canvas=e.currentTarget;
 if(!canvas._lineData) return;
 const idx=lineScrubPos(canvas,e.clientX);
 if(idx===null) return;
 const info=canvas._lineData;
 const idxInSlice=idx-info.start;
 const label=info.slicedLabels[idxInSlice];
 let dateStr=null;
 if(/^\d+$/.test(label)){
  const ym=selectedMonth;
  dateStr=`${ym}-${String(label).padStart(2,"0")}`;
 }else if(/^\d+\/\d+$/.test(label)){
  const parts=label.split("/");
  const d=Number(parts[0]),m=Number(parts[1]);
  const y=new Date().getFullYear();
  dateStr=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
 }
 if(dateStr) openDateDetail(dateStr);
}

/* ============ MODAL DETAIL KATEGORI ============ */
function openCategoryDetail(catName){
 const list=transactionsByCategory(catName);
 const total=list.reduce((s,t)=>s+(Number(t.amount)||0),0);

 document.getElementById("categoryDetailTitle").textContent="Detail: "+catName;

 const listHTML=list.length?list.map(t=>`
  <div class="cat-detail-item" onclick="closeCategoryDetail();editTransaction(${t.id})">
   <div>
    <div>${escapeHTML(t.category)}${t.description?` · ${escapeHTML(t.description)}`:""}</div>
    <div class="cat-detail-date">${formatDate(t.date)} · ${walletLabel(t.wallet)}</div>
   </div>
   <div class="cat-detail-amt expense-text">−${rupiah(t.amount)}</div>
  </div>
 `).join(""):`<div class="empty">Tidak ada transaksi.</div>`;

 document.getElementById("categoryDetailBody").innerHTML=`
  <div class="cat-detail-summary">
   <div class="cat-detail-amount expense-text">${rupiah(total)}</div>
   <div class="cat-detail-count">${list.length} transaksi · tap item untuk edit</div>
  </div>
  <div class="cat-detail-list">${listHTML}</div>
 `;

 document.getElementById("categoryDetailModal").classList.add("show");
}

function closeCategoryDetail(){
 document.getElementById("categoryDetailModal").classList.remove("show");
}

function openDateDetail(dateStr){
 const list=transactionsByDate(dateStr);
 if(!list.length){
  showToast("Tidak ada transaksi tanggal ini.");
  return;
 }
 const total=list.reduce((s,t)=>s+(Number(t.amount)||0),0);

 document.getElementById("categoryDetailTitle").textContent="Transaksi "+formatDate(dateStr);

 const listHTML=list.map(t=>`
  <div class="cat-detail-item" onclick="closeCategoryDetail();editTransaction(${t.id})">
   <div>
    <div>${escapeHTML(t.category)}${t.description?` · ${escapeHTML(t.description)}`:""}</div>
    <div class="cat-detail-date">${walletLabel(t.wallet)}</div>
   </div>
   <div class="cat-detail-amt expense-text">−${rupiah(t.amount)}</div>
  </div>
 `).join("");

 document.getElementById("categoryDetailBody").innerHTML=`
  <div class="cat-detail-summary">
   <div class="cat-detail-amount expense-text">${rupiah(total)}</div>
   <div class="cat-detail-count">${list.length} transaksi</div>
  </div>
  <div class="cat-detail-list">${listHTML}</div>
 `;

 document.getElementById("categoryDetailModal").classList.add("show");
}

/* ============ TRANSAKSI: FORM ============ */
function openTransaction(type){
 editingTransactionId=null;
 currentType=type;
 currentSubType="normal";
 currentWallet="nontunai";
 document.getElementById("transactionTitle").textContent=
  type==="income"?"Tambah Pemasukan":type==="expense"?"Tambah Pengeluaran":"Transfer antar Dompet";
 document.getElementById("amount").value="";
 document.getElementById("description").value="";
 document.getElementById("debtPerson").value="";
 document.getElementById("debtDueDate").value="";
 updateTransactionTypeButtons();
 updateSubTypeButtons();
 updateWalletButtons();
 updateTransactionFormVisibility();
 const dateEl=document.getElementById("date");
 dateEl.max=today();
 dateEl.value=today();
 document.getElementById("deleteTransactionBtn").style.display="none";
 document.getElementById("transactionModal").classList.add("show");
}

function editTransaction(id){
 const t=data.transactions.find(x=>x.id===id);
 if(!t) return;
 editingTransactionId=id;
 currentType=t.type;
 currentSubType=t.debtId?"debt":"normal";
 currentWallet=t.wallet||"nontunai";
 document.getElementById("transactionTitle").textContent="Edit Transaksi";
 document.getElementById("amount").value=formatMoney(t.amount);
 updateTransactionTypeButtons();
 updateSubTypeButtons();
 updateWalletButtons();
 if(t.type==="transfer"){
  document.getElementById("transferFrom").value=t.fromWallet||"nontunai";
  document.getElementById("transferTo").value=t.toWallet||"cash";
 }else{
  rebuildCategories();
  document.getElementById("category").value=t.category;
 }
 document.getElementById("description").value=t.description||"";

 if(t.debtId){
  const d=data.debts.find(x=>x.id===t.debtId);
  if(d){
   document.getElementById("debtPerson").value=d.name;
   document.getElementById("debtDueDate").value=d.dueDate||"";
  }
 }else{
  document.getElementById("debtPerson").value="";
  document.getElementById("debtDueDate").value="";
 }

 updateTransactionFormVisibility();
 const dateEl=document.getElementById("date");
 dateEl.max=today();
 dateEl.value=t.date;
 document.getElementById("deleteTransactionBtn").style.display="block";
 document.getElementById("transactionModal").classList.add("show");
}

function closeTransaction(){
 document.getElementById("transactionModal").classList.remove("show");
 editingTransactionId=null;
}

function setTransactionType(type){
 currentType=type;
 if(type==="transfer") currentSubType="normal";
 updateTransactionTypeButtons();
 updateSubTypeButtons();
 updateTransactionFormVisibility();
 if(type==="transfer"){
  document.getElementById("transferFrom").value="nontunai";
  document.getElementById("transferTo").value="cash";
 }else{
  rebuildCategories();
  document.getElementById("category").value="";
 }
 document.getElementById("description").value="";
}

function setSubType(sub){
 currentSubType=sub;
 updateSubTypeButtons();
 updateTransactionFormVisibility();
}

function setWallet(w){currentWallet=w;updateWalletButtons();}

function updateTransactionTypeButtons(){
 const inc=document.getElementById("incomeType");
 const exp=document.getElementById("expenseType");
 const trf=document.getElementById("transferType");
 inc.className="type-btn";
 exp.className="type-btn";
 trf.className="type-btn";
 if(currentType==="income") inc.classList.add("active","income-active");
 else if(currentType==="expense") exp.classList.add("active","expense-active");
 else trf.classList.add("active","transfer-active");
}

function updateSubTypeButtons(){
 const grp=document.getElementById("subTypeGroup");
 const nor=document.getElementById("subNormalBtn");
 const deb=document.getElementById("subDebtBtn");
 if(currentType==="transfer"){grp.style.display="none";return;}
 grp.style.display="grid";
 nor.className="type-btn";
 deb.className="type-btn";
 if(currentSubType==="normal"){
  nor.classList.add("active","income-active");
 }else{
  if(currentType==="income") deb.classList.add("active","utang-active");
  else deb.classList.add("active","piutang-active");
 }
}

function updateWalletButtons(){
 const c=document.getElementById("walletCashBtn");
 const n=document.getElementById("walletNontunaiBtn");
 c.className="wallet-btn";
 n.className="wallet-btn";
 if(currentWallet==="cash") c.classList.add("active","wallet-cash-active");
 else n.classList.add("active","wallet-nontunai-active");
}

function updateTransactionFormVisibility(){
 const wg=document.getElementById("walletGroup");
 const tg=document.getElementById("transferGroup");
 const cg=document.getElementById("categoryGroup");
 const dg=document.getElementById("debtInfoGroup");
 const dpl=document.getElementById("debtPersonLabel");
 const dh=document.getElementById("debtHint");

 if(currentType==="transfer"){
  wg.style.display="block";
  tg.style.display="block";
  cg.style.display="none";
  document.getElementById("descriptionGroup").style.display="none";
  dg.style.display="none";
  return;
 }
 tg.style.display="none";
 cg.style.display="block";
 wg.style.display="block";

 if(currentSubType==="debt"){
  dg.style.display="block";
  if(currentType==="income"){
   dpl.textContent="Nama pemberi utang";
   document.getElementById("debtPerson").placeholder="Contoh: Budi";
   dh.textContent="Catat pemasukan ini sebagai utang. Uang masuk ke saldo, dan tercatat di halaman Utang sebagai kewajiban Anda.";
  }else{
   dpl.textContent="Nama penerima piutang";
   document.getElementById("debtPerson").placeholder="Contoh: Ani";
   dh.textContent="Catat pengeluaran ini sebagai piutang. Uang keluar dari saldo, dan tercatat di halaman Utang sebagai hak Anda.";
  }
 }else{
  dg.style.display="none";
 }

 rebuildCategories();
 toggleDescription();
}

function rebuildCategories(){
 const sel=document.getElementById("category");
 if(!sel) return;
 let list;
 if(currentSubType==="debt"){
  list = currentType==="income" ? ["Utang"] : ["Piutang"];
 }else{
  list = currentType==="income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
 }
 const current=sel.value;
 sel.innerHTML='<option value="">Pilih kategori</option>'+
  list.map(c=>`<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join("");
 if(current&&list.indexOf(current)>=0) sel.value=current;
 if(list.length===1){
  sel.value=list[0];
  document.getElementById("descriptionGroup").style.display="none";
 }
}

function toggleDescription(){
 const cat=document.getElementById("category").value;
 const grp=document.getElementById("descriptionGroup");
 const inp=document.getElementById("description");
 if(currentSubType==="debt"){
  grp.style.display="none";
  inp.value="";
  return;
 }
 if(cat==="Lainnya") grp.style.display="block";
 else{grp.style.display="none";inp.value="";}
}

function findSimilar(payload){
 const baseDate=payload.date;
 const candidates=data.transactions.filter(t=>{
  if(editingTransactionId!==null && t.id===editingTransactionId) return false;
  if(t.paymentForDebtId) return false;
  if(t.type!==payload.type) return false;
  if(Number(t.amount)!==Number(payload.amount)) return false;
  if(t.category!==payload.category) return false;
  const diff=Math.abs(daysBetween(t.date,baseDate));
  return diff<=1;
 });
 return candidates;
}

function saveTransaction(){
 const amount=cleanNumber(document.getElementById("amount").value);
 const date=document.getElementById("date").value;
 if(amount<=0){showToast("Masukkan nominal yang benar.");return;}
 if(!date){showToast("Pilih tanggal transaksi.");return;}
 if(date>today()){showToast("Tanggal masa depan tidak bisa digunakan.");return;}

 let payload;
 if(currentType==="transfer"){
  const from=document.getElementById("transferFrom").value;
  const to=document.getElementById("transferTo").value;
  if(from===to){showToast("Dompet asal dan tujuan harus berbeda.");return;}
  payload={type:"transfer",amount,category:"Transfer",description:"",date,fromWallet:from,toWallet:to};
 }else if(currentSubType==="debt"){
  const person=document.getElementById("debtPerson").value.trim();
  const dueDate=document.getElementById("debtDueDate").value;
  if(!person){showToast("Isi nama orangnya.");return;}
  payload={
   type:currentType,amount,
   category:currentType==="income"?"Utang":"Piutang",
   description:"",date,wallet:currentWallet,
   isDebt:true,debtPerson:person,debtDueDate:dueDate||""
  };
 }else{
  const category=document.getElementById("category").value;
  const description=document.getElementById("description").value.trim();
  if(!category){showToast("Pilih kategori dulu.");return;}
  if(category==="Lainnya"&&!description){showToast("Isi keterangan untuk kategori Lainnya.");return;}
  payload={type:currentType,amount,category,description:category==="Lainnya"?description:"",date,wallet:currentWallet};
 }

 if(payload.type!=="transfer"){
  const sim=findSimilar(payload);
  if(sim.length){
   const s=sim[0];
   const msg="⚠️ Transaksi mirip sudah ada:\n\n"+
    s.category+" · "+rupiah(s.amount)+"\n"+
    formatDate(s.date)+" · "+walletLabel(s.wallet)+"\n\n"+
    "Tetap simpan?";
   if(!confirm(msg)) return;
  }
 }

 if(payload.type==="expense"){
  const bal=balances();
  const w=payload.wallet==="cash"?bal.cash:bal.nontunai;
  if(w-payload.amount<0){
   const nm=payload.wallet==="cash"?"Cash":"Non-tunai";
   if(!confirm("⚠️ Pengeluaran ini akan membuat saldo "+nm+" minus:\n\nSaldo sekarang: "+rupiah(w)+"\nSetelah ini: -"+rupiah(Math.abs(w-payload.amount))+"\n\nTetap simpan?")) return;
  }
 }

 if(payload.type==="transfer"){
  const bal=balances();
  const w=payload.fromWallet==="cash"?bal.cash:bal.nontunai;
  if(w-payload.amount<0){
   const nm=payload.fromWallet==="cash"?"Cash":"Non-tunai";
   if(!confirm("⚠️ Transfer ini akan membuat saldo "+nm+" minus:\n\nSaldo sekarang: "+rupiah(w)+"\nSetelah ini: -"+rupiah(Math.abs(w-payload.amount))+"\n\nTetap simpan?")) return;
  }
 }

 if(editingTransactionId!==null){
  const t=data.transactions.find(x=>x.id===editingTransactionId);
  if(t){
   if(t.debtId && payload.isDebt){
    const d=data.debts.find(x=>x.id===t.debtId);
    if(d){
     d.name=payload.debtPerson;
     d.dueDate=payload.debtDueDate;
     d.amount=payload.amount;
    }
   }else if(t.debtId && !payload.isDebt){
    if(confirm("Catatan utang/piutang terkait akan dihapus. Lanjut?")){
     data.debts=data.debts.filter(x=>x.id!==t.debtId);
    }else{
     return;
    }
   }
   delete t.debtId;
   Object.assign(t,payload);
   delete t.isDebt;
   delete t.debtPerson;
   delete t.debtDueDate;
  }
  saveData();closeTransaction();renderDashboard();renderTransactions();renderDebts();
  showToast("Transaksi diperbarui.");
  return;
 }

 let debtId=null;
 if(payload.isDebt){
  const d={
   id:newId(),
   name:payload.debtPerson,
   type:currentType==="income"?"utang":"piutang",
   amount:payload.amount,
   paid:0,
   date:payload.date,
   dueDate:payload.debtDueDate,
   note:payload.description||""
  };
  data.debts.push(d);
  debtId=d.id;
 }

 const newTx={id:newId(),...payload};
 if(debtId) newTx.debtId=debtId;
 delete newTx.isDebt;
 delete newTx.debtPerson;
 delete newTx.debtDueDate;

 data.transactions.push(newTx);
 saveData();closeTransaction();renderDashboard();renderTransactions();renderDebts();
 showToast("Transaksi disimpan.");
}

function deleteTransaction(){
 if(editingTransactionId===null) return;
 if(!confirm("Hapus transaksi ini?")) return;
 const t=data.transactions.find(x=>x.id===editingTransactionId);

 if(t && t.debtId){
  if(!confirm("Transaksi ini terhubung ke catatan utang/piutang. Hapus catatan itu juga?")) return;
  data.debts=data.debts.filter(x=>x.id!==t.debtId);
 }

 data.transactions=data.transactions.filter(x=>x.id!==editingTransactionId);
 editingTransactionId=null;
 saveData();closeTransaction();renderDashboard();renderTransactions();renderDebts();
 showToast("Transaksi dihapus.");
}

/* ============ RENDER TRANSAKSI ============ */
function walletTag(t){
 if(t.type==="transfer") return `<span class="transaction-wallet wallet-transfer">⇄ ${walletLabel(t.fromWallet)} → ${walletLabel(t.toWallet)}</span>`;
 if(t.category==="Utang") return `<span class="transaction-wallet wallet-utang">💸 Utang</span>`;
 if(t.category==="Piutang") return `<span class="transaction-wallet wallet-piutang">💰 Piutang</span>`;
 if(t.wallet==="cash") return `<span class="transaction-wallet wallet-cash">💵 Cash</span>`;
 return `<span class="transaction-wallet wallet-nontunai">🏦 Non-tunai</span>`;
}

function walletLabel(w){return w==="cash"?"Cash":"Non-tunai";}

function transactionHTML(t){
 let sign="-",cls="expense-text",typeLabel="Pengeluaran";
 if(t.type==="income"){sign="+";cls="income-text";typeLabel="Pemasukan";}
 else if(t.type==="transfer"){sign="";cls="transfer-text";typeLabel="Transfer";}

 let lunasTag="";
 if(t.debtId){
  const d=data.debts.find(x=>x.id===t.debtId);
  if(d && d.paid>=d.amount){
   lunasTag=' <span style="color:#858b96;font-size:10px">(Lunas)</span>';
  }
 }

 return `<div class="transaction" onclick="editTransaction(${t.id})">
  <div class="transaction-left">
   <div class="transaction-category">${escapeHTML(t.category)}${lunasTag}</div>
   ${t.category==="Lainnya"&&t.description?`<div class="transaction-description">${escapeHTML(t.description)}</div>`:""}
   ${walletTag(t)}
   <div class="transaction-date">${formatDate(t.date)}</div>
  </div>
  <div class="transaction-right">
   <div class="transaction-type">${typeLabel}</div>
   <div class="transaction-amount ${cls}">${sign}${rupiah(t.amount)}</div>
  </div>
 </div>`;
}

function sortTransactions(list){
 return list.sort((a,b)=>{
  const d=b.date.localeCompare(a.date);
  if(d!==0) return d;
  return b.id-a.id;
 });
}

function renderRecent(){
 const box=document.getElementById("recentTransactions");
 const list=sortTransactions(data.transactions.slice()).slice(0,5);
 if(!list.length){box.innerHTML=`<div class="empty">Belum ada transaksi.</div>`;return;}
 box.innerHTML=list.map(transactionHTML).join("");
}

function renderTransactions(){
 const box=document.getElementById("allTransactions");
 let list=data.transactions.filter(t=>t.date.startsWith(selectedMonth));

 if(currentFilter==="income") list=list.filter(t=>t.type==="income");
 else if(currentFilter==="expense") list=list.filter(t=>t.type==="expense");
 else if(currentFilter==="cash") list=list.filter(t=>t.type!=="transfer"&&t.wallet==="cash");
 else if(currentFilter==="nontunai") list=list.filter(t=>t.type!=="transfer"&&t.wallet==="nontunai");
 else if(currentFilter==="transfer") list=list.filter(t=>t.type==="transfer");
 else if(currentFilter==="debt") list=list.filter(t=>t.debtId);

 if(currentSearch){
  const q=currentSearch.toLowerCase();
  list=list.filter(t=>{
   const hay=[t.category,t.description,String(t.amount)].join(" ").toLowerCase();
   return hay.indexOf(q)>=0;
  });
 }

 list=sortTransactions(list);
 document.getElementById("transactionCount").textContent=list.length+" transaksi di "+formatMonthLabel(selectedMonth);
 if(!list.length){box.innerHTML=`<div class="empty">Tidak ada transaksi bulan ini.</div>`;return;}
 box.innerHTML=list.map(transactionHTML).join("");
}

function setFilter(filter,button){
 currentFilter=filter;
 document.querySelectorAll("#transactionsPage .filter").forEach(x=>x.classList.remove("active"));
 button.classList.add("active");
 renderTransactions();
}

function onSearchInput(){
 currentSearch=document.getElementById("searchInput").value.trim();
 renderTransactions();
}

/* ============ UTANG & PIUTANG ============ */
function setDebtFilter(filter,button){
 currentDebtFilter=filter;
 const filters=document.querySelectorAll("#debtsPage .filter");
 filters.forEach(x=>x.classList.remove("active"));
 button.classList.add("active");
 renderDebts();
}

function renderDebts(){renderDebtSummary();renderDebtList();}

function renderDebtSummary(){
 let utang=0,piutang=0;
 data.debts.forEach(d=>{
  const sisa=d.amount-d.paid;
  if(sisa<=0) return;
  if(d.type==="utang") utang+=sisa;
  else piutang+=sisa;
 });
 document.getElementById("totalUtang").textContent=rupiah(utang);
 document.getElementById("totalPiutang").textContent=rupiah(piutang);
}

function renderDebtList(){
 const box=document.getElementById("debtList");
 if(!box) return;

 let list=data.debts.slice();
 if(currentDebtFilter==="utang") list=list.filter(d=>d.type==="utang");
 else if(currentDebtFilter==="piutang") list=list.filter(d=>d.type==="piutang");
 else if(currentDebtFilter==="belum") list=list.filter(d=>d.paid<d.amount);
 else if(currentDebtFilter==="lunas") list=list.filter(d=>d.paid>=d.amount);

 list.sort((a,b)=>{
  const aLunas=a.paid>=a.amount;
  const bLunas=b.paid>=b.amount;
  if(aLunas!==bLunas) return aLunas?1:-1;
  return b.date.localeCompare(a.date);
 });

 if(!list.length){
  box.innerHTML=`<div class="empty">Belum ada catatan utang/piutang.</div>`;
  return;
 }

 box.innerHTML=list.map(d=>{
  const sisa=d.amount-d.paid;
  const lunas=sisa<=0;
  const pct=d.amount>0?Math.min(100,(d.paid/d.amount)*100):0;
  const badgeClass=lunas?"lunas":d.type;
  const badgeText=lunas?"LUNAS":(d.type==="utang"?"UTANG":"PIUTANG");

  let dueText="";
  if(d.dueDate){
   const diff=daysBetween(today(),d.dueDate);
   if(lunas) dueText="";
   else if(diff<0) dueText='<span style="color:#d9aaaa">Lewat '+Math.abs(diff)+' hari</span>';
   else if(diff<=3) dueText='<span style="color:#e8d9a8">'+(diff===0?"Jatuh tempo hari ini":diff+" hari lagi")+'</span>';
   else dueText="Jatuh tempo: "+formatDate(d.dueDate);
  }

  return `<div class="debt-item">
   <div class="debt-top">
    <div>
     <div class="debt-name">
      ${escapeHTML(d.name)}
      <span class="debt-badge ${badgeClass}">${badgeText}</span>
     </div>
    </div>
    <div>
     <div class="debt-amount ${badgeClass}">${rupiah(d.amount)}</div>
     ${!lunas?`<div class="debt-amount-sub">Sisa ${rupiah(sisa)}</div>`:""}
    </div>
   </div>
   <div class="debt-meta">
    <span>Dibuat: ${formatDate(d.date)}</span>
    <span>${dueText}</span>
   </div>
   ${d.note?`<div class="debt-note">${escapeHTML(d.note)}</div>`:""}
   ${!lunas?`<div class="debt-progress"><div class="debt-progress-bar ${d.type==="piutang"?"piutang":""}" style="width:${pct}%"></div></div>`:""}
   <div class="debt-actions">
    ${!lunas?`<button class="small-btn bayar" onclick="openPayDebt(${d.id})">${d.type==="utang"?"Bayar":"Terima"}</button>`:""}
    ${!lunas?`<button class="small-btn lunas" onclick="markDebtLunas(${d.id})">Lunasi</button>`:""}
    <button class="small-btn danger" onclick="deleteDebt(${d.id})">Hapus</button>
   </div>
  </div>`;
 }).join("");
}

function openPayDebt(id){
 const d=data.debts.find(x=>x.id===id);
 if(!d) return;
 const sisa=d.amount-d.paid;
 if(sisa<=0){showToast("Sudah lunas.");return;}
 editingDebtId=id;

 document.getElementById("payDebtTitle").textContent=d.type==="utang"?"Bayar Utang":"Terima Piutang";
 document.getElementById("payDebtInfo").innerHTML=
  "<b>"+escapeHTML(d.name)+"</b><br>"+
  "Total: "+rupiah(d.amount)+"<br>"+
  "Sudah "+(d.type==="utang"?"dibayar":"diterima")+": "+rupiah(d.paid)+"<br>"+
  "Sisa: <b>"+rupiah(sisa)+"</b>";

 document.getElementById("payDebtAmount").value=formatMoney(sisa);
 document.getElementById("payDebtWallet").value="nontunai";
 document.getElementById("payDebtDate").value=today();
 document.getElementById("payDebtModal").classList.add("show");
}

function closePayDebt(){
 document.getElementById("payDebtModal").classList.remove("show");
 editingDebtId=null;
}

function saveDebtPayment(){
 if(editingDebtId===null) return;
 const d=data.debts.find(x=>x.id===editingDebtId);
 if(!d) return;

 const amount=cleanNumber(document.getElementById("payDebtAmount").value);
 const wallet=document.getElementById("payDebtWallet").value;
 const date=document.getElementById("payDebtDate").value;

 if(amount<=0){showToast("Masukkan nominal.");return;}
 if(!date){showToast("Pilih tanggal.");return;}
 if(date>today()){showToast("Tanggal masa depan tidak bisa.");return;}

 const sisa=d.amount-d.paid;
 if(amount>sisa){showToast("Nominal melebihi sisa "+rupiah(sisa)+".");return;}

 const tx={
  id:newId(),
  type:d.type==="utang"?"expense":"income",
  amount,
  category:d.type==="utang"?"Bayar Utang":"Terima Piutang",
  description:"",date,wallet,
  paymentForDebtId:d.id
 };
 data.transactions.push(tx);
 d.paid+=amount;

 saveData();closePayDebt();renderDashboard();renderTransactions();renderDebts();
 showToast("Pembayaran tercatat.");
}

function markDebtLunas(id){
 const d=data.debts.find(x=>x.id===id);
 if(!d) return;
 const sisa=d.amount-d.paid;
 if(sisa<=0){showToast("Sudah lunas.");return;}

 const action=d.type==="utang"?"Bayar":"Terima";
 const wallet=confirm(action+" sisa "+rupiah(sisa)+" dan tandai lunas?\n\nOK = pakai Cash\nCancel = pakai Non-tunai")?"cash":"nontunai";

 const tx={
  id:newId(),
  type:d.type==="utang"?"expense":"income",
  amount:sisa,
  category:d.type==="utang"?"Bayar Utang":"Terima Piutang",
  description:"",date:today(),wallet,
  paymentForDebtId:d.id
 };
 data.transactions.push(tx);
 d.paid=d.amount;

 saveData();renderDashboard();renderTransactions();renderDebts();
 showToast("Ditandai lunas.");
}

function deleteDebt(id){
 const d=data.debts.find(x=>x.id===id);
 if(!d) return;
 const related=data.transactions.filter(t=>t.debtId===id||t.paymentForDebtId===id);

 let msg="Hapus catatan ini?";
 if(related.length) msg="Catatan ini punya "+related.length+" transaksi terkait.\n\nHapus catatan + semua transaksinya?";
 if(!confirm(msg)) return;

 data.debts=data.debts.filter(x=>x.id!==id);
 data.transactions=data.transactions.filter(t=>t.debtId!==id&&t.paymentForDebtId!==id);

 saveData();renderDashboard();renderTransactions();renderDebts();
 showToast("Catatan dihapus.");
}

/* ============ CONFIRM BANNER (BERULANG) ============ */
function getDueDate(rule,ym){
 const [y,m]=ym.split("-").map(Number);
 const lastDay=new Date(y,m,0).getDate();
 const day=Math.min(rule.day,lastDay);
 return `${ym}-${String(day).padStart(2,"0")}`;
}

function getDueRecurrings(){
 const thisMonth=currentMonth();
 return data.recurring.filter(r=>{
  if(!r.active) return false;
  const dueDate=getDueDate(r,thisMonth);
  if(!dueDate) return false;
  if(dueDate>today()) return false;
  if(r.startMonth>thisMonth) return false;
  if(r.lastConfirmed===thisMonth) return false;
  return true;
 });
}

function renderConfirmBanner(){
 const wrap=document.getElementById("confirmBannerWrap");
 const due=getDueRecurrings();
 if(!due.length){wrap.innerHTML="";return;}

 const itemsHTML=due.map(r=>{
  const sign=r.type==="income"?"+":"-";
  const cls=r.type==="income"?"income-text":"expense-text";
  return `<div class="confirm-item">
   <span class="confirm-item-name">${escapeHTML(r.name)}</span>
   <span class="confirm-item-amount ${cls}">${sign}${rupiah(r.amount)}</span>
  </div>`;
 }).join("");

 wrap.innerHTML=`
  <div class="confirm-banner">
   <div class="confirm-title">⏰ ${due.length} transaksi menunggu konfirmasi</div>
   ${itemsHTML}
   <div class="confirm-actions">
    <button class="confirm-btn" onclick="gotoPage('recurring')">Tinjau</button>
    <button class="confirm-btn primary-confirm" onclick="confirmAllDue()">Konfirmasi Semua</button>
   </div>
  </div>
 `;
}

function renderRecurringBadge(){
 const badge=document.getElementById("recurringBadge");
 if(!badge) return;
 const due=getDueRecurrings();
 if(due.length){badge.style.display="flex";badge.textContent=due.length;}
 else{badge.style.display="none";}
}

function confirmAllDue(){
 const due=getDueRecurrings();
 if(!due.length) return;
 const thisMonth=currentMonth();
 due.forEach(r=>{
  const dueDate=getDueDate(r,thisMonth);
  data.transactions.push({id:newId(),type:r.type,amount:r.amount,category:r.category,description:r.description||"",date:dueDate,wallet:r.wallet});
  r.lastConfirmed=thisMonth;
 });
 saveData();renderDashboard();renderTransactions();
 showToast(due.length+" transaksi berhasil dikonfirmasi.");
}

function confirmOneRecurring(id){
 const r=data.recurring.find(x=>x.id===id);
 if(!r) return;
 const thisMonth=currentMonth();
 const dueDate=getDueDate(r,thisMonth);
 data.transactions.push({id:newId(),type:r.type,amount:r.amount,category:r.category,description:r.description||"",date:dueDate,wallet:r.wallet});
 r.lastConfirmed=thisMonth;
 saveData();renderDashboard();renderTransactions();
 showToast("Transaksi dikonfirmasi.");
}

function skipOneRecurring(id){
 const r=data.recurring.find(x=>x.id===id);
 if(!r) return;
 if(!confirm("Lewati transaksi berulang bulan ini?")) return;
 r.lastConfirmed=currentMonth();
 saveData();renderDashboard();renderRecurringList();
 showToast("Dilewati untuk bulan ini.");
}

/* ============ BERULANG ============ */
function openRecurring(){
 editingRecurringId=null;
 currentRecurringType="expense";
 document.getElementById("recurringTitle").textContent="Aturan Berulang";
 document.getElementById("recurringName").value="";
 document.getElementById("recurringAmount").value="";
 document.getElementById("recurringDescription").value="";
 document.getElementById("recurringDay").value="";
 document.getElementById("recurringWallet").value="nontunai";
 document.getElementById("recurringStartMonth").value=currentMonth();
 updateRecurringTypeButtons();
 rebuildRecurringCategories();
 document.getElementById("recurringCategory").value="";
 toggleRecurringDescription();
 document.getElementById("deleteRecurringBtn").style.display="none";
 document.getElementById("recurringModal").classList.add("show");
}

function editRecurring(id){
 const r=data.recurring.find(x=>x.id===id);
 if(!r) return;
 editingRecurringId=id;
 currentRecurringType=r.type;
 document.getElementById("recurringTitle").textContent="Edit Aturan";
 document.getElementById("recurringName").value=r.name;
 document.getElementById("recurringAmount").value=formatMoney(r.amount);
 document.getElementById("recurringDescription").value=r.description||"";
 document.getElementById("recurringDay").value=r.day;
 document.getElementById("recurringWallet").value=r.wallet;
 document.getElementById("recurringStartMonth").value=r.startMonth;
 updateRecurringTypeButtons();
 rebuildRecurringCategories();
 document.getElementById("recurringCategory").value=r.category;
 toggleRecurringDescription();
 document.getElementById("deleteRecurringBtn").style.display="block";
 document.getElementById("recurringModal").classList.add("show");
}

function closeRecurring(){
 document.getElementById("recurringModal").classList.remove("show");
 editingRecurringId=null;
}

function setRecurringType(type){
 currentRecurringType=type;
 updateRecurringTypeButtons();
 rebuildRecurringCategories();
 document.getElementById("recurringCategory").value="";
 document.getElementById("recurringDescription").value="";
 toggleRecurringDescription();
}

function updateRecurringTypeButtons(){
 const inc=document.getElementById("recIncomeType");
 const exp=document.getElementById("recExpenseType");
 inc.className="type-btn";
 exp.className="type-btn";
 if(currentRecurringType==="income") inc.classList.add("active","income-active");
 else exp.classList.add("active","expense-active");
}

function rebuildRecurringCategories(){
 const sel=document.getElementById("recurringCategory");
 const list=currentRecurringType==="income"?INCOME_CATEGORIES:EXPENSE_CATEGORIES;
 const current=sel.value;
 sel.innerHTML='<option value="">Pilih kategori</option>'+
  list.map(c=>`<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join("");
 if(current&&list.indexOf(current)>=0) sel.value=current;
}

function toggleRecurringDescription(){
 const cat=document.getElementById("recurringCategory").value;
 const grp=document.getElementById("recurringDescriptionGroup");
 const inp=document.getElementById("recurringDescription");
 if(cat==="Lainnya") grp.style.display="block";
 else{grp.style.display="none";inp.value="";}
}

function saveRecurring(){
 const name=document.getElementById("recurringName").value.trim();
 const amount=cleanNumber(document.getElementById("recurringAmount").value);
 const category=document.getElementById("recurringCategory").value;
 const description=document.getElementById("recurringDescription").value.trim();
 const wallet=document.getElementById("recurringWallet").value;
 const day=Number(document.getElementById("recurringDay").value);
 const startMonth=document.getElementById("recurringStartMonth").value;

 if(!name){showToast("Masukkan nama aturan.");return;}
 if(amount<=0){showToast("Masukkan nominal.");return;}
 if(!category){showToast("Pilih kategori dulu.");return;}
 if(category==="Lainnya"&&!description){showToast("Isi keterangan untuk kategori Lainnya.");return;}
 if(!isFinite(day)||day<1||day>31){showToast("Tanggal harus antara 1-31.");return;}
 if(!startMonth){showToast("Pilih bulan mulai.");return;}

 const payload={name,type:currentRecurringType,amount,category,description:category==="Lainnya"?description:"",wallet,day,startMonth,active:true};

 if(editingRecurringId!==null){
  const r=data.recurring.find(x=>x.id===editingRecurringId);
  if(r) Object.assign(r,payload);
  saveData();closeRecurring();renderDashboard();renderRecurringList();
  showToast("Aturan diperbarui.");
  return;
 }

 data.recurring.push({id:newId(),...payload,lastConfirmed:""});
 saveData();closeRecurring();renderDashboard();renderRecurringList();
 showToast("Aturan berulang ditambahkan.");
}

function deleteRecurring(){
 if(editingRecurringId===null) return;
 if(!confirm("Hapus aturan ini?")) return;
 data.recurring=data.recurring.filter(x=>x.id!==editingRecurringId);
 editingRecurringId=null;
 saveData();closeRecurring();renderDashboard();renderRecurringList();
 showToast("Aturan dihapus.");
}

function toggleRecurringActive(id){
 const r=data.recurring.find(x=>x.id===id);
 if(!r) return;
 r.active=!r.active;
 saveData();renderDashboard();renderRecurringList();
 showToast(r.active?"Aturan diaktifkan.":"Aturan dinonaktifkan.");
}

function renderRecurringList(){
 const box=document.getElementById("recurringList");
 if(!box) return;
 if(!data.recurring.length){box.innerHTML=`<div class="empty">Belum ada aturan berulang.</div>`;return;}

 const thisMonth=currentMonth();

 box.innerHTML=data.recurring.map(r=>{
  const dueDate=getDueDate(r,thisMonth);
  const isDue=r.active&&r.startMonth<=thisMonth&&dueDate<=today()&&r.lastConfirmed!==thisMonth;

  const statusTag=!r.active
   ?`<span class="recurring-tag inactive">Nonaktif</span>`
   :isDue
    ?`<span class="recurring-tag active">Menunggu konfirmasi</span>`
    :`<span class="recurring-tag active">Aktif</span>`;

  const typeTag=r.type==="income"
   ?`<span class="recurring-tag" style="background:#18221c;color:#a9d4b6">Pemasukan</span>`
   :`<span class="recurring-tag" style="background:#211818;color:#d9aaaa">Pengeluaran</span>`;

  const walletTag2=r.wallet==="cash"
   ?`<span class="recurring-tag" style="background:#18221c;color:#a9d4b6">💵 Cash</span>`
   :`<span class="recurring-tag" style="background:#181e2a;color:#9db8e0">🏦 Non-tunai</span>`;

  const actionButtons=isDue
   ?`<button class="small-btn" style="background:#e8d9a8;color:#1f1a10;border-color:#e8d9a8" onclick="confirmOneRecurring(${r.id})">Konfirmasi</button>
     <button class="small-btn" onclick="skipOneRecurring(${r.id})">Lewati bulan ini</button>`
   :"";

  return `<div class="recurring-item">
   <div class="recurring-top">
    <div class="recurring-name">${escapeHTML(r.name)}</div>
    <div class="recurring-percent">${rupiah(r.amount)}</div>
   </div>
   <div>${typeTag}${walletTag2}${statusTag}</div>
   <div class="recurring-info">
    <span>Jatuh tempo tanggal ${r.day}</span>
    <span>Mulai ${formatMonthLabel(r.startMonth)}</span>
   </div>
   <div class="recurring-actions">
    ${actionButtons}
    <button class="small-btn" onclick="editRecurring(${r.id})">Edit</button>
    <button class="small-btn" onclick="toggleRecurringActive(${r.id})">${r.active?"Nonaktifkan":"Aktifkan"}</button>
   </div>
  </div>`;
 }).join("");
}

/* ============ STATISTIK ============ */
function lastNMonths(n){
 const arr=[];
 const now=new Date();
 for(let i=n-1;i>=0;i--){
  const d=new Date(now.getFullYear(),now.getMonth()-i,1);
  arr.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
 }
 return arr;
}

function renderStats(){
 renderCompareChart();
 renderMonthlyDetail();
}

function renderCompareChart(){
 const canvas=document.getElementById("compareChart");
 if(!canvas) return;

 const months=lastNMonths(6);
 const dataIn=[],dataEx=[];
 months.forEach(ym=>{
  const tot=monthTotalsFor(ym);
  dataIn.push(tot.income);
  dataEx.push(tot.expense);
 });

 const dpr=window.devicePixelRatio||1;
 const cssW=canvas.clientWidth||300;
 const cssH=240;
 canvas.width=Math.round(cssW*dpr);
 canvas.height=Math.round(cssH*dpr);
 const ctx=canvas.getContext("2d");
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.clearRect(0,0,cssW,cssH);

 const padL=42,padR=8,padT=14,padB=36;
 const chartW=cssW-padL-padR;
 const chartH=cssH-padT-padB;

 const allVals=[...dataIn,...dataEx];
 const max=Math.max(...allVals,1);
 const niceMax=Math.ceil(max/500000)*500000||500000;

 ctx.strokeStyle="#252a33";
 ctx.lineWidth=1;
 ctx.fillStyle="#858b96";
 ctx.font="10px Arial";
 ctx.textAlign="right";
 ctx.textBaseline="middle";

 for(let i=0;i<=4;i++){
  const v=(niceMax/4)*i;
  const y=padT+chartH-(v/niceMax)*chartH;
  ctx.beginPath();
  ctx.moveTo(padL,y);
  ctx.lineTo(cssW-padR,y);
  ctx.stroke();
  let label="0";
  if(v>=1000000) label=(v/1000000).toFixed(v>=10000000?0:1)+"jt";
  else if(v>=1000) label=Math.round(v/1000)+"rb";
  ctx.fillText(label,padL-6,y);
 }

 const n=months.length;
 const groupW=chartW/n;
 const barW=Math.min(18,groupW*0.35);
 const gap=3;

 ctx.textAlign="center";

 months.forEach((ym,i)=>{
  const gx=padL+groupW*i+groupW/2;
  const hIn=(dataIn[i]/niceMax)*chartH;
  ctx.fillStyle="#a9d4b6";
  ctx.fillRect(gx-barW-gap/2,padT+chartH-hIn,barW,hIn);

  const hEx=(dataEx[i]/niceMax)*chartH;
  ctx.fillStyle="#d9aaaa";
  ctx.fillRect(gx+gap/2,padT+chartH-hEx,barW,hEx);

  ctx.fillStyle="#858b96";
  ctx.font="10px Arial";
  ctx.textBaseline="top";
  ctx.fillText(monthLabelShort(ym),gx,padT+chartH+8);
 });
}

function renderMonthlyDetail(){
 const box=document.getElementById("monthlyDetail");
 if(!box) return;
 const months=lastNMonths(6).reverse();
 box.innerHTML=months.map(ym=>{
  const t=monthTotalsFor(ym);
  return `<div class="monthly-row">
   <div class="monthly-name">${formatMonthLabel(ym)}</div>
   <div class="monthly-values">
    <div class="income-text">+${rupiah(t.income)}</div>
    <div class="expense-text">−${rupiah(t.expense)}</div>
   </div>
  </div>`;
 }).join("");
}

/* ============ BACKUP REMINDER ============ */
function renderBackupReminder(){
 const el=document.getElementById("backupReminder");
 if(!el) return;
 if(!data.lastBackupDate){
  el.textContent="⚠️ Belum pernah backup — tap untuk backup";
  el.classList.add("warn");
  return;
 }
 const diff=daysBetween(data.lastBackupDate,today());
 if(diff<=0){
  el.textContent="✓ Backup terakhir: hari ini";
  el.classList.remove("warn");
 }else if(diff===1){
  el.textContent="Backup terakhir: kemarin";
  el.classList.remove("warn");
 }else if(diff<=7){
  el.textContent="Backup terakhir: "+diff+" hari lalu";
  el.classList.remove("warn");
 }else{
  el.textContent="⚠️ Sudah "+diff+" hari tidak backup — tap untuk backup";
  el.classList.add("warn");
 }
}

function renderLastBackupText(){
 const el=document.getElementById("lastBackupText");
 if(!el) return;
 if(!data.lastBackupDate){el.textContent="Belum pernah backup";return;}
 const diff=daysBetween(data.lastBackupDate,today());
 if(diff<=0) el.textContent="Terakhir: hari ini";
 else if(diff===1) el.textContent="Terakhir: kemarin";
 else el.textContent="Terakhir: "+diff+" hari lalu";
}

/* ============ LOGO ============ */
function renderLogo(){
 const box=document.getElementById("logoBox");
 if(!box) return;
 if(data.logo&&typeof data.logo==="string"){
  box.innerHTML=`<img src="${data.logo}" alt="logo">`;
 }else{
  box.innerHTML="₿";
 }
}

function importLogo(input){
 const file=input.files[0];
 if(!file) return;
 if(!file.type.startsWith("image/")){showToast("File harus berupa gambar.");input.value="";return;}

 const reader=new FileReader();
 reader.onload=function(e){
  const img=new Image();
  img.onload=function(){
   const maxSize=512;
   let w=img.width,h=img.height;
   if(w>maxSize||h>maxSize){
    if(w>h){h=Math.round(h*(maxSize/w));w=maxSize;}
    else{w=Math.round(w*(maxSize/h));h=maxSize;}
   }
   const canvas=document.createElement("canvas");
   canvas.width=w;
   canvas.height=h;
   const ctx=canvas.getContext("2d");
   ctx.drawImage(img,0,0,w,h);
   const dataUrl=canvas.toDataURL("image/jpeg",0.85);
   if(dataUrl.length>2*1024*1024){showToast("Logo terlalu besar.");input.value="";return;}
   data.logo=dataUrl;
   saveData();renderLogo();
   showToast("Logo berhasil diubah.");
   input.value="";
  };
  img.onerror=function(){showToast("Gambar tidak bisa dibaca.");input.value="";};
  img.src=e.target.result;
 };
 reader.readAsDataURL(file);
}

function resetLogo(){
 if(!data.logo){showToast("Logo masih default.");return;}
 if(!confirm("Kembalikan logo ke default ₿?")) return;
 delete data.logo;
 saveData();renderLogo();
 showToast("Logo dikembalikan ke default.");
}

/* ============ SETTINGS ============ */
function changeName(){
 showPrompt("Nama aplikasi","Nama yang tampil di header",data.name,function(name){
  const clean=name.trim();
  if(!clean){showToast("Nama tidak boleh kosong.");return;}
  data.name=clean;
  saveData();renderDashboard();
  showToast("Nama berhasil diubah.");
 });
}

function changeInitial(which){
 const current=which==="cash"?data.initialCash:data.initialNontunai;
 const label=which==="cash"?"Saldo awal Cash":"Saldo awal Non-tunai";
 showPrompt(label,"Angka saja, contoh: 500000",formatMoney(current),function(value){
  if(/-/.test(value)){showToast("Saldo tidak boleh negatif.");return;}
  const amount=cleanNumber(value);
  if(which==="cash") data.initialCash=amount;
  else data.initialNontunai=amount;
  saveData();renderDashboard();
  showToast(label+" berhasil diubah.");
 });
}

function changeMinReserve(){
 const current=Number(data.minReserve)||DEFAULT_MIN_RESERVE;
 showPrompt(
  "Batas minimal dana darurat",
  "Kalau 20% saldo di bawah angka ini, dana darurat tidak dikunci. Contoh: 20000",
  formatMoney(current),
  function(value){
   if(/-/.test(value)){showToast("Angka tidak boleh minus.");return;}
   const amount=cleanNumber(value);
   if(amount>10000000){showToast("Maksimal Rp 10.000.000.");return;}
   data.minReserve=amount;
   saveData();renderDashboard();
   showToast("Batas minimal diubah ke "+rupiah(amount)+".");
  }
 );
}

/* ============ BACKUP ============ */
function openBackup(){document.getElementById("backupModal").classList.add("show");}
function closeBackup(){document.getElementById("backupModal").classList.remove("show");}

function backupFileName(){
 const d=new Date();
 return "duitku-backup-"+d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0")+".json";
}

function buildBackupBlob(){
 const exportData={...data};
 exportData.lastBackupDate=today();
 return new Blob([JSON.stringify(exportData,null,2)],{type:"application/json"});
}

function markBackupDone(){
 data.lastBackupDate=today();
 saveData();renderBackupReminder();renderLastBackupText();
}

function downloadBackup(){
 const blob=buildBackupBlob();
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=url;
 a.download=backupFileName();
 document.body.appendChild(a);
 a.click();
 a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 markBackupDone();closeBackup();
 showToast("Backup tersimpan di folder Download.");
}

function shareBackup(){
 const blob=buildBackupBlob();
 const filename=backupFileName();
 const file=new File([blob],filename,{type:"application/json"});

 if(navigator.canShare && navigator.canShare({files:[file]})){
  navigator.share({
   files:[file],
   title:"Backup Duitku",
   text:"File backup Duitku tanggal "+new Date().toLocaleDateString("id-ID")
  }).then(()=>{
   markBackupDone();closeBackup();
   showToast("Backup berhasil dibagikan.");
  }).catch(err=>{
   if(err.name!=="AbortError"){
    closeBackup();
    downloadBackup();
   }
  });
 }else{
  closeBackup();
  showToast("HP tidak mendukung. File disimpan ke Download.");
  setTimeout(()=>downloadBackup(),800);
 }
}

function restore(input){
 const file=input.files[0];
 if(!file) return;
 const reader=new FileReader();
 reader.onload=function(e){
  let imported=null;
  try{imported=JSON.parse(e.target.result);}
  catch(err){showToast("File backup tidak valid.");input.value="";return;}
  if(!imported||typeof imported!=="object"){showToast("File backup tidak valid.");input.value="";return;}
  if(!confirm("Restore akan mengganti data saat ini. Lanjut?")){input.value="";return;}
  data=normalizeData(imported);
  selectedMonth=currentMonth();
  currentFilter="all";
  currentDebtFilter="all";
  currentSearch="";
  chartRange="month";
  hiddenCategories=new Set();
  selectedDonutSlice=null;
  selectedBars=[];
  const si=document.getElementById("searchInput");
  if(si) si.value="";
  document.querySelectorAll("#transactionsPage .filter").forEach((x,i)=>{
   x.classList.remove("active");
   if(i===0) x.classList.add("active");
  });
  document.querySelectorAll("#debtsPage .filter").forEach((x,i)=>{
   x.classList.remove("active");
   if(i===0) x.classList.add("active");
  });
  document.querySelectorAll(".range-btn").forEach((x,i)=>{
   x.classList.remove("active");
   if(i===0) x.classList.add("active");
  });
  saveData();renderDashboard();renderTransactions();renderStats();renderDebts();renderLogo();
  showToast("Data berhasil dipulihkan.");
  input.value="";
 };
 reader.readAsText(file);
}

function exportCSV(){
 if(!data.transactions.length){showToast("Belum ada transaksi.");return;}

 const rows=[["Tanggal","Tipe","Kategori","Dompet","Keterangan","Nominal"]];
 const sorted=[...data.transactions].sort((a,b)=>{
  const d=a.date.localeCompare(b.date);
  if(d!==0) return d;
  return a.id-b.id;
 });

 sorted.forEach(t=>{
  let walletText="";
  if(t.type==="transfer") walletText=walletLabel(t.fromWallet)+" → "+walletLabel(t.toWallet);
  else walletText=walletLabel(t.wallet);
  rows.push([t.date,t.type==="income"?"Pemasukan":t.type==="expense"?"Pengeluaran":"Transfer",t.category,walletText,t.description||"",String(t.amount)]);
 });

 const csv=rows.map(r=>r.map(cell=>{
  const s=String(cell).replace(/"/g,'""');
  return '"'+s+'"';
 }).join(",")).join("\n");

 const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=url;
 a.download="duitku-transaksi.csv";
 document.body.appendChild(a);
 a.click();
 a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 showToast("CSV berhasil dibuat.");
}

function resetData(){
 if(!confirm("Semua data akan dihapus. Lanjut?")) return;
 data={name:"Duitku",initialCash:0,initialNontunai:0,transactions:[],debts:[],recurring:[],nextId:1,logo:null,lastBackupDate:null,minReserve:DEFAULT_MIN_RESERVE};
 selectedMonth=currentMonth();
 currentFilter="all";
 currentDebtFilter="all";
 currentSearch="";
 chartRange="month";
 hiddenCategories=new Set();
 selectedDonutSlice=null;
 selectedBars=[];
 const si=document.getElementById("searchInput");
 if(si) si.value="";
 document.querySelectorAll("#transactionsPage .filter").forEach((x,i)=>{
  x.classList.remove("active");
  if(i===0) x.classList.add("active");
 });
 document.querySelectorAll("#debtsPage .filter").forEach((x,i)=>{
  x.classList.remove("active");
  if(i===0) x.classList.add("active");
 });
 document.querySelectorAll(".range-btn").forEach((x,i)=>{
  x.classList.remove("active");
  if(i===0) x.classList.add("active");
 });
 saveData();renderDashboard();renderTransactions();renderStats();renderDebts();renderLogo();
 showToast("Semua data telah dihapus.");
}

/* ============ NAVIGASI ============ */
const NAV_ORDER=["home","transactions","stats","debts"];

function gotoPage(page){
 if(page==="recurring"){showPage("recurring");return;}
 const idx=NAV_ORDER.indexOf(page);
 const btns=document.querySelectorAll(".nav-btn");
 if(idx>=0&&btns[idx]) showPage(page,btns[idx]);
 else showPage(page);
}

function showPage(page,button){
 document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
 const map={home:"homePage",transactions:"transactionsPage",stats:"statsPage",debts:"debtsPage",recurring:"recurringPage",settings:"settingsPage"};
 const target=document.getElementById(map[page]);
 if(target) target.classList.add("active");

 const navButtons=document.querySelectorAll(".nav-btn");
 navButtons.forEach(x=>x.classList.remove("active"));
 if(button) button.classList.add("active");

 if(page==="transactions"){renderMonthFilter();renderTransactions();}
 if(page==="stats") renderStats();
 if(page==="debts") renderDebts();
 if(page==="recurring") renderRecurringList();
 if(page==="home") renderChart();
}

/* ============ TOAST ============ */
let toastTimer;
function showToast(message){
 const toast=document.getElementById("toast");
 toast.textContent=message;
 toast.classList.add("show");
 clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>toast.classList.remove("show"),2200);
}

/* ============ PROMPT CUSTOM ============ */
let promptCallback=null;

function showPrompt(title,label,defaultValue,callback){
 document.getElementById("promptTitle").textContent=title;
 document.getElementById("promptLabel").textContent=label;
 const input=document.getElementById("promptInput");
 input.value=defaultValue||"";
 promptCallback=callback;
 document.getElementById("promptModal").classList.add("show");
 setTimeout(()=>{
  input.focus();
  try{input.setSelectionRange(input.value.length,input.value.length);}catch(e){}
 },100);
}

function closePrompt(){
 document.getElementById("promptModal").classList.remove("show");
 promptCallback=null;
}

function submitPrompt(){
 if(!promptCallback) return;
 const value=document.getElementById("promptInput").value;
 const cb=promptCallback;
 closePrompt();
 cb(value);
}

/* ============ EVENTS MODAL ============ */
document.getElementById("transactionModal").addEventListener("click",function(e){
 if(e.target===this) closeTransaction();
});
document.getElementById("recurringModal").addEventListener("click",function(e){
 if(e.target===this) closeRecurring();
});
document.getElementById("promptModal").addEventListener("click",function(e){
 if(e.target===this) closePrompt();
});
document.getElementById("backupModal").addEventListener("click",function(e){
 if(e.target===this) closeBackup();
});
document.getElementById("payDebtModal").addEventListener("click",function(e){
 if(e.target===this) closePayDebt();
});
document.getElementById("categoryDetailModal").addEventListener("click",function(e){
 if(e.target===this) closeCategoryDetail();
});
document.getElementById("promptInput").addEventListener("keydown",function(e){
 if(e.key==="Enter"){e.preventDefault();submitPrompt();}
});
document.getElementById("date").addEventListener("focus",function(){
 this.max=today();
});

window.addEventListener("resize",function(){
 renderChart();
 if(document.getElementById("statsPage").classList.contains("active")) renderCompareChart();
});

/* ============ INIT ============ */
document.getElementById("date").max=today();
document.getElementById("payDebtDate").max=today();
document.getElementById("debtDueDate").min=today();
rebuildCategories();
updateRecurringTypeButtons();
rebuildRecurringCategories();

renderLogo();
renderDashboard();
renderMonthFilter();
renderTransactions();
renderStats();
renderDebts();

updateTransactionTypeButtons();
updateSubTypeButtons();
updateWalletButtons();
updateTransactionFormVisibility();

showToast("Aplikasi siap digunakan.");
