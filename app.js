/* ============================================================
   런코치 (RunCoach) - 마라톤 러닝 코치 PWA
   저장: IndexedDB(기록/러닝화/플랜/파일) + localStorage(설정)
   ============================================================ */

'use strict';

/* ---------- 세션 타입 정의 ---------- */
const TYPES = {
  nsm:      { key:'nsm',      label:'NSM',    css:'nsm',      desc:'노르웨이식 싱글 · 역치 바로 아래(서브스레숄드) 반복' },
  tempo:    { key:'tempo',    label:'템포',   css:'tempo',    desc:'임계(LT) 지속주 · 편안하게 힘든 페이스' },
  interval: { key:'interval', label:'인터벌', css:'interval', desc:'VO2max 반복주 · 고강도 + 조깅 회복' },
  lsd:      { key:'lsd',      label:'LSD',    css:'lsd',      desc:'롱 슬로우 디스턴스 · 저강도 장거리' },
  recovery: { key:'recovery', label:'리커버리',css:'recovery',desc:'회복주 · 매우 느리게, 짧게' },
  easy:     { key:'easy',     label:'이지',   css:'easy',     desc:'편안한 유산소 러닝' },
  rest:     { key:'rest',     label:'휴식',   css:'rest',     desc:'완전 휴식 또는 크로스 트레이닝' },
  race:     { key:'race',     label:'레이스', css:'race',     desc:'대회 / 최대 노력' }
};

/* ============================================================
   NSM 지식 모듈 (Norwegian Singles Method)
   "NSM 러닝 훈련법.txt" 문서를 학습해 규칙/표를 그대로 인코딩
   - 서브스레숄드(역치 바로 아래) 반복. 반복 가능한 강도.
   - 페이스=강도, 반복횟수=훈련량, 주간 비율=피로 관리(서브T 15~25%)
   ============================================================ */
const NSM = {
  // 10km 기록(분)별 보수적 NSM 페이스 (sec/km) — 문서 표 그대로
  // row: [10K분, [3분lo,hi], [6분lo,hi], [10분lo,hi]]  (10K페이스 = 분*6)
  table: [
    [32,[194,196],[201,206],[206,210]],[33,[200,203],[207,212],[212,217]],
    [34,[206,209],[214,219],[219,223]],[35,[212,215],[220,225],[225,230]],
    [36,[218,221],[226,232],[232,236]],[37,[224,227],[233,238],[238,243]],
    [38,[230,234],[239,245],[245,250]],[39,[236,240],[245,251],[251,256]],
    [40,[243,246],[252,258],[258,263]],[41,[249,252],[258,264],[264,269]],
    [42,[255,258],[265,271],[271,275]],[43,[261,265],[271,277],[277,282]],
    [44,[267,271],[277,284],[284,288]],[45,[273,277],[284,290],[290,295]],
    [46,[279,283],[290,296],[296,301]],[47,[285,289],[296,303],[303,307]],
    [48,[291,296],[303,309],[309,314]],[49,[297,302],[309,316],[316,320]],
    [50,[303,308],[315,322],[322,326]],[51,[310,314],[322,328],[328,333]],
    [52,[316,320],[328,335],[335,339]],[53,[322,327],[334,341],[341,345]],
    [54,[328,333],[341,347],[347,352]],[55,[334,339],[347,354],[354,358]],
    [56,[340,345],[353,360],[360,364]],[57,[346,351],[359,366],[366,370]],
    [58,[352,358],[366,372],[372,376]],[59,[358,364],[372,379],[379,383]],
    [60,[364,370],[378,385],[385,389]]
  ],
  // 반복 형태별 템플릿 (문서 기준): 회복(초), 워밍업/쿨다운(분), 단계별 반복수
  formats: {
    3:  { key:'nsm3',  min:3,  rec:60,  wu:15, cd:10, reps:{intro:[6,8],  base:[8,10], adapt:[10,12]} },
    6:  { key:'nsm6',  min:6,  rec:90,  wu:15, cd:10, reps:{intro:[3,4],  base:[4,5],  adapt:[5,6]} },
    10: { key:'nsm10', min:10, rec:120, wu:15, cd:10, reps:{intro:[2,2],  base:[3,3],  adapt:[3,4]} }
  },
  // 주간 총 훈련시간(시간)별 가이드: 서브T 비율/총량(분)/세션수
  volume: [
    { maxH:3,   pct:[10,15], subT:[15,25],  sessions:1,   label:'주 3시간 미만' },
    { maxH:4,   pct:[12,18], subT:[25,40],  sessions:1.5, label:'주 3~4시간' },
    { maxH:5,   pct:[15,20], subT:[40,60],  sessions:2,   label:'주 4~5시간' },
    { maxH:6,   pct:[18,22], subT:[55,75],  sessions:2.5, label:'주 5~6시간' },
    { maxH:8,   pct:[18,23], subT:[70,105], sessions:3,   label:'주 6~8시간' },
    { maxH:99,  pct:[20,25], subT:[95,120], sessions:3,   label:'주 8시간 이상' }
  ],
  // 이지런 페이스 표 (10K분 → [70%상한 빠른쪽, 60%회복 느린쪽] sec/km) — 문서 표 그대로
  easyTable: [
    [32,[241,273]],[33,[248,281]],[34,[255,289]],[35,[262,297]],[36,[269,305]],
    [37,[277,313]],[38,[284,321]],[39,[291,329]],[40,[298,337]],[41,[305,345]],
    [42,[312,352]],[43,[319,360]],[44,[326,368]],[45,[332,376]],[46,[339,383]],
    [47,[346,391]],[48,[353,399]],[49,[360,406]],[50,[367,414]],[51,[373,421]],
    [52,[380,429]],[53,[387,436]],[54,[394,444]],[55,[400,451]],[56,[407,459]],
    [57,[414,466]],[58,[421,474]],[59,[427,481]],[60,[434,488]]
  ],
  easyFor(tenKSec){
    const mn = clamp(Math.round(tenKSec/60),32,60);
    const row = this.easyTable.find(r=>r[0]===mn) || this.easyTable[this.easyTable.length-1];
    return row[1]; // [fast(70%), slow(60%)]
  },
  // 심박 존 (최대심박 대비 %) — 이지런은 심박 상한 우선
  hrZones(maxHR){
    return {
      recovery: [Math.round(maxHR*0.60), Math.round(maxHR*0.65)],
      easy:     [Math.round(maxHR*0.65), Math.round(maxHR*0.70)],
      longCeil: Math.round(maxHR*0.70)
    };
  },
  // 주간 배치 템플릿 (문서 "주간 구성 예시" 그대로). 월~일. NSM 요일/반복형태 지정
  layouts: {
    1: { skel:['easy','nsm','easy','recovery','rest','easy','lsd'], days:[1],     variants:[6] },
    2: { skel:['easy','nsm','recovery','easy','nsm','easy','lsd'],  days:[1,4],   variants:[6,10] },
    3: { skel:['easy','nsm','easy','nsm','recovery','nsm','lsd'],   days:[1,3,5], variants:[3,6,10] }
  },
  fmtRange([lo,hi]){ return lo===hi ? fmtPace(lo) : `${fmtPace(lo)}~${fmtPace(hi)}`; },
  // 10K 기록(초)으로 표에서 페이스 범위 조회 (형태 3/6/10)
  paceFor(tenKSec, min){
    const mn = clamp(Math.round(tenKSec/60), 32, 60);
    const row = this.table.find(r=>r[0]===mn) || this.table[this.table.length-1];
    const idx = min===3?1 : min===6?2 : 3;
    return row[idx]; // [lo,hi] sec/km
  },
  // 주간 훈련시간(시간)에 맞는 볼륨 가이드
  volumeFor(hours){ return this.volume.find(v=>hours<v.maxH) || this.volume[this.volume.length-1]; },
  // 개인 맞춤 처방: {nSessions, layout, sessions[]} 반환
  prescribe(tenKSec, weeklyHours, level='base', maxSessions=3){
    const vg = this.volumeFor(weeklyHours);
    let nSessions = clamp(Math.round(vg.sessions), 1, Math.min(3, maxSessions));
    const layout = this.layouts[nSessions];
    const budget = (vg.subT[0]+vg.subT[1])/2;            // 목표 서브T 총량(분)
    const per = budget / layout.variants.length;         // 세션당 목표 분
    const sessions = layout.variants.map(min=>{
      const f = this.formats[min];
      const [rlo,rhi] = f.reps[level] || f.reps.base;
      const reps = clamp(Math.round(per/min), rlo, rhi);
      const pace = this.paceFor(tenKSec, min);
      return { min, reps, rec:f.rec, wu:f.wu, cd:f.cd, paceKey:f.key,
               pace, subTmin: reps*min, label:`${min}분 반복`, level };
    });
    return { nSessions, layout, sessions, subTtotal: sessions.reduce((s,x)=>s+x.subTmin,0), vg };
  }
};

/* ---------- IndexedDB 래퍼 ---------- */
const DB = (() => {
  let db = null;
  const NAME = 'runcoach', VER = 1;
  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(NAME, VER);
      r.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('records')) {
          const s = d.createObjectStore('records', { keyPath:'id' });
          s.createIndex('date', 'date');
        }
        if (!d.objectStoreNames.contains('shoes'))  d.createObjectStore('shoes',  { keyPath:'id' });
        if (!d.objectStoreNames.contains('plans'))  d.createObjectStore('plans',  { keyPath:'weekStart' });
        if (!d.objectStoreNames.contains('files'))  d.createObjectStore('files',  { keyPath:'id' });
        if (!d.objectStoreNames.contains('meta'))   d.createObjectStore('meta',   { keyPath:'k' });
      };
      r.onsuccess = () => { db = r.result; res(db); };
      r.onerror = () => rej(r.error);
    });
  }
  function tx(store, mode='readonly') { return db.transaction(store, mode).objectStore(store); }
  function req(r) { return new Promise((res, rej) => { r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  return {
    async init(){ if(!db) await open(); return db; },
    put(store, val){ return req(tx(store,'readwrite').put(val)); },
    get(store, key){ return req(tx(store).get(key)); },
    del(store, key){ return req(tx(store,'readwrite').delete(key)); },
    all(store){ return req(tx(store).getAll()); },
    clear(store){ return req(tx(store,'readwrite').clear()); }
  };
})();

/* ---------- 앱 상태 ---------- */
const state = {
  records: [],
  shoes: [],
  plans: {},
  settings: {
    weeklyGoalKm: 40,
    targetRace: 'full',      // full/half/10k/5k
    longRunDay: 0,           // 0=일요일
    restDays: [1],           // 월요일
    weightKg: 65,
    maxHR: 190,              // 최대심박 (이지런 심박 상한 계산용)
    raceDate: ''             // 목표 대회일 (YYYY-MM-DD, 선택)
  },
  planWeekOffset: 0,
  metrics: null
};

/* ---------- 유틸 ---------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));

function pad(n){ return String(n).padStart(2,'0'); }
function fmtDuration(sec){
  sec = Math.round(sec||0);
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  return h>0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function fmtPace(secPerKm){
  if(!secPerKm || !isFinite(secPerKm) || secPerKm<=0) return '--:--';
  const m = Math.floor(secPerKm/60), s = Math.round(secPerKm%60);
  return `${m}:${pad(s)}`;
}
function parsePaceStr(str){ // "5:30" or "5'30\"" -> sec/km
  const m = String(str).match(/(\d{1,2})[:'′](\d{2})/);
  return m ? (+m[1])*60 + (+m[2]) : null;
}
function fmtDate(d){
  const dt = new Date(d);
  return `${dt.getMonth()+1}/${dt.getDate()} (${'일월화수목금토'[dt.getDay()]})`;
}
function haversine(a, b){ // {lat,lon} -> meters
  const R=6371000, toRad=x=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}
function mondayOf(date){
  const d = new Date(date); d.setHours(0,0,0,0);
  const day = (d.getDay()+6)%7; // 월=0
  d.setDate(d.getDate()-day);
  return d;
}
function isoDay(d){ return new Date(d).toISOString().slice(0,10); }

/* ---------- 토스트 / 모달 ---------- */
let toastTimer;
function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
}
function openSheet(html){
  $('#sheetBody').innerHTML = html;
  $('#modal').classList.add('open');
}
function closeSheet(){ $('#modal').classList.remove('open'); }
$('#modal').addEventListener('click', (e)=>{ if(e.target.id==='modal') closeSheet(); });

/* ---------- 라우터 ---------- */
function go(tab){
  $$('.page').forEach(p=>p.classList.remove('active'));
  const pg = $('#page-'+tab); if(pg) pg.classList.add('active');
  $$('nav.tabbar button').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  window.scrollTo({top:0, behavior:'instant'});
  if(tab==='home') renderHome();
  if(tab==='plan') renderPlan();
  if(tab==='records') renderRecords();
  if(tab==='shoes') renderShoes();
  if(tab==='analysis') renderAnalysis();
  if(tab==='run') renderRunTab();
}
$$('nav.tabbar button').forEach(b=> b.addEventListener('click', ()=>go(b.dataset.tab)) );

/* 화면 '가로폭'이 바뀔 때만 캔버스만 다시 그림 (DOM 재생성 없음)
   ※ iOS는 세로 스크롤 시 주소창이 접히며 resize가 계속 발생 → 폭 변화만 감지해 스크롤 튐 방지 */
function redrawActiveCharts(){
  const active = document.querySelector('.page.active'); if(!active) return;
  if(active.id==='page-home') drawWeeklyChart();
  else if(active.id==='page-analysis'){ drawZoneChart(); drawPaceChart(); }
}
let _rzTimer, _lastW = window.innerWidth;
window.addEventListener('resize', ()=>{
  if(window.innerWidth === _lastW) return;   // 높이만 변한 경우(주소창 접힘 등) 무시
  _lastW = window.innerWidth;
  clearTimeout(_rzTimer); _rzTimer = setTimeout(redrawActiveCharts, 200);
});
window.addEventListener('orientationchange', ()=> setTimeout(()=>{ _lastW=window.innerWidth; redrawActiveCharts(); }, 300));

/* ============================================================
   기록 첨부 · 파싱 · 학습
   ============================================================ */

/* 파일명/메모의 명시 키워드로 타입 판정 (없으면 null) */
function keywordType(text){
  const t = (text||'').toLowerCase();
  if(/interval|인터벌|반복|repeat|400m|800m|1000m|1km rep/.test(t)) return 'interval';
  if(/tempo|템포|threshold|임계|lt\b/.test(t)) return 'tempo';
  if(/lsd|long run|장거리|롱런|long slow/.test(t)) return 'lsd';
  if(/recovery|회복|리커버리/.test(t)) return 'recovery';
  if(/nsm|서브\s?t|sub[- ]?t|서브스레숄드|neuromuscular|singles/.test(t)) return 'nsm';
  if(/race|대회|레이스|marathon race|마라톤 대회/.test(t)) return 'race';
  return null;
}

/* 타입 자동 추론 (파일명/텍스트 키워드 + 거리/페이스 휴리스틱) */
function guessType(text, distKm, paceSec){
  const kw = keywordType(text); if(kw) return kw;
  if(distKm && distKm >= 18) return 'lsd';
  return 'easy';
}

/* 러닝 자동 분류: 키워드 → 롱런 → 페이스존+심박 → 심박 → 거리 순으로 판정
   페이스·심박·거리·시간을 사용자 훈련 존(state.metrics.zones)과 비교해 이지/템포/인터벌/롱런/회복/NSM 분류 */
function classifyRun({distanceKm, avgPaceSec, avgHr, durationSec, hint}){
  const kw = keywordType(hint); if(kw) return kw;
  const z = state.metrics && state.metrics.zones;
  const maxHR = state.settings.maxHR || 190;
  const durMin = durationSec ? durationSec/60 : (distanceKm && avgPaceSec ? distanceKm*avgPaceSec/60 : null);
  const hrPct = avgHr ? avgHr/maxHR : null;
  const longThresh = (state.settings.targetRace==='full') ? 18 : 16;

  // 1) 롱런: 90분↑ 또는 장거리 + 강도 낮음
  if(((durMin && durMin>=90) || (distanceKm && distanceKm>=longThresh)) && (!hrPct || hrPct<0.83)) return 'lsd';

  // 2) 페이스 존 기반 (가장 가까운 존) + 심박 보정
  if(avgPaceSec && z){
    if(hrPct && hrPct<0.66 && avgPaceSec >= (z.easy||1e9)) return 'recovery';
    const cand = [['interval',z.interval],['nsm',z.nsm],['tempo',z.tempo],['marathon',z.marathon],['easy',z.easy],['recovery',z.recovery]].filter(x=>x[1]);
    let best='easy', bd=1e9; cand.forEach(([t,p])=>{ const d=Math.abs(avgPaceSec-p); if(d<bd){bd=d;best=t;} });
    if(best==='marathon') best = (distanceKm && distanceKm>=longThresh) ? 'lsd' : 'easy'; // marathon은 별도 타입이 없어 롱런/이지로
    return best;
  }

  // 3) 심박%만 있을 때
  if(hrPct){
    if(hrPct<0.66) return 'recovery';
    if(hrPct<0.78) return (distanceKm && distanceKm>=longThresh) ? 'lsd' : 'easy';
    if(hrPct<0.86) return 'tempo';
    return 'interval';
  }

  // 4) 최후: 거리/페이스 휴리스틱
  return guessType(hint||'', distanceKm, avgPaceSec);
}

/* 자유 텍스트/OCR 결과에서 수치 추출 (애플 피트니스·Strava·Garmin·Zepp 형식 대응) */
function parseTextMetrics(text){
  const out = {};
  const t = (text||'').replace(/\u00A0/g,' ').replace(/[Ⅰl|]/g,'1'); // 흔한 OCR 혼동 보정(약하게)
  // 거리: km/킬로 값 중 최댓값(총거리)
  let dist = 0;
  for(const mm of t.matchAll(/(\d{1,3}[.,]\d{1,2})\s*(?:k\s*m|킬로)/gi)){
    const v = parseFloat(mm[1].replace(',','.')); if(v>dist && v<300) dist = v;
  }
  if(!dist){ const one = t.match(/(\d{1,3}[.,]\d{1,2})\s*(?:k\s*m|킬로)/i); if(one) dist=parseFloat(one[1].replace(',','.')); }
  if(dist>0) out.distanceKm = dist;
  // 시간: h:mm:ss 우선 (스플릿의 mm:ss는 오인 방지 위해 사용 안 함)
  let m = t.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if(m){ out.durationSec = (+m[1])*3600+(+m[2])*60+(+m[3]); }
  else {
    const hh = t.match(/(\d{1,2})\s*시간/), mn = t.match(/(\d{1,3})\s*분/), ss = t.match(/(\d{1,2})\s*초/);
    if(hh||mn){ out.durationSec = (hh?+hh[1]*3600:0)+(mn?+mn[1]*60:0)+(ss?+ss[1]:0); }
  }
  // 페이스: m'ss"/km, m:ss/km, m′ss″ 등 (첫 매치 = 평균)
  m = t.match(/(\d{1,2})\s*['’‘`´′:]\s*(\d{2})\s*["”“''′″]?\s*\/?\s*k\s*m/i)
    || t.match(/페이스\D{0,6}(\d{1,2})\D(\d{2})/);
  if(m){ const s=(+m[1])*60+(+m[2]); if(s>=120&&s<=1200) out.avgPaceSec=s; }
  // 심박: 첫 bpm (요약값이 스플릿보다 위에 위치)
  m = t.match(/(\d{2,3})\s*bpm/i) || t.match(/(?:심박|hr)\D{0,5}(\d{2,3})/i);
  if(m){ const v=+m[1]; if(v>=60&&v<=230) out.avgHr=v; }
  // 케이던스: 첫 spm
  m = t.match(/(\d{2,3})\s*spm/i) || t.match(/(?:케이던스|cadence)\D{0,5}(\d{2,3})/i);
  if(m){ const v=+m[1]; if(v>=120&&v<=260) out.cadence=v; }
  // 파생: 페이스<->시간/거리
  if(out.distanceKm && out.durationSec && !out.avgPaceSec) out.avgPaceSec = out.durationSec / out.distanceKm;
  if(out.distanceKm && out.avgPaceSec && !out.durationSec) out.durationSec = Math.round(out.avgPaceSec * out.distanceKm);
  return out;
}

/* ── 이미지 OCR (Tesseract.js, CDN 지연 로딩) ── */
let _ocrLoading;
function ensureOCR(){
  if(window.Tesseract) return Promise.resolve();
  if(_ocrLoading) return _ocrLoading;
  _ocrLoading = new Promise((res, rej)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = ()=>res(); s.onerror = ()=>rej(new Error('OCR 로드 실패'));
    document.head.appendChild(s);
  });
  return _ocrLoading;
}
async function ocrImage(dataUrl){
  await ensureOCR();
  // 한국어+영어: '7월 13일' 같은 날짜와 라벨까지 인식
  const { data } = await Tesseract.recognize(dataUrl, 'kor+eng');
  return data && data.text ? data.text : '';
}
/* 텍스트에서 날짜 추출 (애플/한국어/숫자 형식) */
function mkDateISO(y, mo, d){
  const now = new Date();
  let year = y || now.getFullYear();
  const dt = new Date(year, mo-1, d, 12, 0, 0);
  if(isNaN(dt.getTime())) return null;
  // 연도 미기재인데 미래 날짜면 작년으로 보정
  if(!y && dt.getTime() > now.getTime() + 86400000) dt.setFullYear(year-1);
  return dt.toISOString();
}
function parseDateFromText(text){
  const t = (text||'').replace(/\s+/g,' ');
  let m;
  m = t.match(/(20\d{2})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/); // 2025.7.13 / 2025년 7월 13일
  if(m) return mkDateISO(+m[1], +m[2], +m[3]);
  m = t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);                          // 7월 13일
  if(m && +m[1]>=1 && +m[1]<=12 && +m[2]>=1 && +m[2]<=31) return mkDateISO(null, +m[1], +m[2]);
  return null;
}
/* 한 기록의 첨부 이미지를 OCR해서 수치 + 날짜 채우기 */
async function applyOcrToRecord(rec){
  const f = await DB.get('files', rec.id);
  if(!f || !f.dataUrl) return false;
  const text = await ocrImage(f.dataUrl);
  const p = parseTextMetrics(text);
  let changed = false;
  ['distanceKm','durationSec','avgPaceSec','avgHr','cadence'].forEach(k=>{
    if(p[k]!=null){ rec[k] = p[k]; changed = true; }
  });
  const iso = parseDateFromText(text);
  if(iso){ rec.date = iso; changed = true; }
  if(changed){
    rec.type = classifyRun({distanceKm:rec.distanceKm, durationSec:rec.durationSec, avgPaceSec:rec.avgPaceSec, avgHr:rec.avgHr, hint:(rec.notes||'')+' '+(rec.fileName||'')+' '+text}) || rec.type;
    rec.needsReview = !rec.distanceKm;
    rec.ocrText = text.slice(0, 400);
    await DB.put('records', rec);
    const i = state.records.findIndex(x=>x.id===rec.id); if(i>=0) state.records[i]=rec;
  }
  return changed;
}
/* 수치 없는 이미지 기록 일괄 인식 */
async function ocrAllImages(){
  const targets = state.records.filter(r=>r.hasImage && (r.distanceKm==null || r.avgPaceSec==null));
  if(!targets.length){ toast('인식할 이미지 기록이 없어요 (이미 인식됨)'); return; }
  toast('인식 엔진 준비 중… (첫 실행은 다운로드로 20~40초 걸릴 수 있어요)');
  try{ await ensureOCR(); }
  catch(e){ toast('인식 엔진 로드 실패 · 인터넷 연결 확인 후 다시 시도'); return; }
  let ok = 0;
  for(let i=0;i<targets.length;i++){
    toast(`이미지 인식 중… ${i+1}/${targets.length}`);
    try{ if(await applyOcrToRecord(targets[i])) ok++; }catch(e){ /* 개별 실패 무시 */ }
    state.records.sort((a,b)=>new Date(b.date)-new Date(a.date));
    recompute(); renderRecords();
  }
  toast(ok? `인식 완료 · ${ok}/${targets.length}개 반영 (거리·페이스·심박·케이던스·날짜)` : '수치를 찾지 못했어요 · 스크린샷이 선명한지 확인 후 재시도');
}

/* GPX 파싱 */
function parseGPX(xmlText){
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const pts = Array.from(doc.getElementsByTagName('trkpt')).map(p=>({
    lat:+p.getAttribute('lat'), lon:+p.getAttribute('lon'),
    time: p.getElementsByTagName('time')[0]?.textContent
  }));
  if(pts.length<2) return null;
  let dist=0; for(let i=1;i<pts.length;i++) dist+=haversine(pts[i-1],pts[i]);
  const t0=pts.find(p=>p.time)?.time, t1=[...pts].reverse().find(p=>p.time)?.time;
  const dur = (t0&&t1) ? (new Date(t1)-new Date(t0))/1000 : null;
  const km = dist/1000;
  return { distanceKm:+km.toFixed(2), durationSec:dur?Math.round(dur):null,
           avgPaceSec: dur&&km ? dur/km : null, date: t0||new Date().toISOString() };
}

/* TCX 파싱 */
function parseTCX(xmlText){
  const doc = new DOMParser().parseFromString(xmlText,'application/xml');
  const laps = Array.from(doc.getElementsByTagName('Lap'));
  let dist=0, dur=0, hrSum=0, hrN=0, cadSum=0, cadN=0;
  laps.forEach(l=>{
    const d = +l.getElementsByTagName('DistanceMeters')[0]?.textContent||0;
    const t = +l.getElementsByTagName('TotalTimeSeconds')[0]?.textContent||0;
    dist+=d; dur+=t;
  });
  Array.from(doc.getElementsByTagName('HeartRateBpm')).forEach(h=>{ const v=+h.getElementsByTagName('Value')[0]?.textContent; if(v){hrSum+=v;hrN++;} });
  Array.from(doc.getElementsByTagName('Cadence')).forEach(c=>{ const v=+c.textContent; if(v){cadSum+=v;cadN++;} });
  const t0 = doc.getElementsByTagName('Id')[0]?.textContent || doc.getElementsByTagName('Time')[0]?.textContent;
  const km = dist/1000;
  if(!km) return null;
  return { distanceKm:+km.toFixed(2), durationSec:Math.round(dur),
    avgPaceSec: dur&&km?dur/km:null, avgHr: hrN?Math.round(hrSum/hrN):null,
    cadence: cadN?Math.round(cadSum*2/cadN):null, date: t0||new Date().toISOString() };
}

/* 파일 → 기록 후보 */
async function fileToRecord(file){
  const name = file.name || '';
  const lower = name.toLowerCase();
  const base = { id:uid(), date:new Date(file.lastModified||Date.now()).toISOString(),
                 source:'file', fileName:name, notes:'' };
  if(/\.(gpx)$/i.test(lower)){
    const txt = await file.text(); const p = parseGPX(txt);
    if(p) Object.assign(base, p, {type:classifyRun({...p, hint:name})});
  } else if(/\.(tcx)$/i.test(lower)){
    const txt = await file.text(); const p = parseTCX(txt);
    if(p) Object.assign(base, p, {type:classifyRun({...p, hint:name})});
  } else if(/\.(txt|csv)$/i.test(lower)){
    const txt = await file.text(); const p = parseTextMetrics(txt);
    Object.assign(base, {distanceKm:p.distanceKm||null, durationSec:p.durationSec||null,
      avgPaceSec:p.avgPaceSec||null, avgHr:p.avgHr||null, cadence:p.cadence||null,
      type:classifyRun({...p, hint:txt+' '+name})});
  } else if(file.type.startsWith('image/')){
    // 이미지: 썸네일 저장. 파일명에 수치가 있으면 추출, 없으면 수동 보정 유도
    const dataUrl = await new Promise(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(file); });
    await DB.put('files', { id:base.id, dataUrl });
    const p = parseTextMetrics(name);
    Object.assign(base, {hasImage:true, distanceKm:p.distanceKm||null, durationSec:p.durationSec||null,
      avgPaceSec:p.avgPaceSec||null, type:guessType(name,p.distanceKm,p.avgPaceSec), needsReview:true});
  } else {
    Object.assign(base, {type:'easy', needsReview:true});
  }
  return base;
}

function fileToDataUrl(file){
  return new Promise(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(file); });
}
function median(arr){
  const a = arr.filter(x=>x!=null).sort((x,y)=>x-y); if(!a.length) return null;
  const n=a.length; return n%2? a[(n-1)/2] : Math.round((a[n/2-1]+a[n/2])/2);
}
/* 같은 러닝의 여러 스크린샷(요약+스플릿 등)을 하나의 기록으로 병합 */
function mergeImageGroup(group){
  const withBoth = group.find(g=>g.p.distanceKm && g.p.durationSec);
  const primary = withBoth || group.find(g=>g.p.distanceKm) || group[0];
  const ps = group.map(g=>g.p);
  const dists = ps.map(p=>p.distanceKm).filter(v=>v!=null);
  const durs  = ps.map(p=>p.durationSec).filter(v=>v!=null);
  const distanceKm  = dists.length? Math.max(...dists) : null; // 총거리 = 최댓값
  const durationSec = durs.length?  Math.max(...durs)  : null; // 총시간 = 최댓값
  const pick = (f)=> primary.p[f]!=null ? primary.p[f] : median(ps.map(p=>p[f])); // 요약값 우선
  let avgPaceSec = pick('avgPaceSec');
  const avgHr = pick('avgHr'), cadence = pick('cadence');
  if(distanceKm && durationSec && !avgPaceSec) avgPaceSec = durationSec/distanceKm;
  const iso = group.map(g=>g.iso).find(Boolean) || new Date().toISOString();
  const rec = { id:uid(), date:iso, source:'image', fileName:primary.fileName||'', notes:'',
    hasImage:true, distanceKm, durationSec, avgPaceSec, avgHr, cadence,
    type: classifyRun({distanceKm, durationSec, avgPaceSec, avgHr, hint:(primary.text||'')+' '+(primary.fileName||'')}),
    needsReview: !distanceKm, imageCount: group.length,
    ocrText: (primary.text||'').slice(0,400) };
  rec._images = [primary.dataUrl, ...group.filter(g=>g!==primary).map(g=>g.dataUrl)];
  return rec;
}

async function handleFiles(files){
  const arr = Array.from(files);
  const images = arr.filter(f=> (f.type||'').startsWith('image/'));
  const others = arr.filter(f=> !(f.type||'').startsWith('image/'));
  let added = 0;

  // 1) 비이미지(GPX/TCX/TXT): 기존 개별 처리
  for(const f of others){
    const rec = await fileToRecord(f);
    await DB.put('records', rec); state.records.push(rec); added++;
  }
  if(others.length){ state.records.sort((a,b)=>new Date(b.date)-new Date(a.date)); recompute(); renderRecords(); }

  // 2) 이미지: OCR → 날짜별 그룹 → 같은 러닝 자동 병합
  if(images.length){
    toast(`이미지 인식 준비 중… (${images.length}장, 첫 실행은 다소 걸려요)`);
    let ocrReady = true;
    try{ await ensureOCR(); }catch(e){ ocrReady=false; toast('인식 엔진 로드 실패 · 이미지는 저장하고 수동 보정으로 진행'); }
    const items = [];
    for(let i=0;i<images.length;i++){
      toast(`이미지 인식 중… ${i+1}/${images.length}`);
      const f = images[i]; const dataUrl = await fileToDataUrl(f);
      let text = '';
      if(ocrReady){ try{ text = await ocrImage(dataUrl); }catch(e){} }
      items.push({ dataUrl, fileName:f.name, text, p:parseTextMetrics(text||f.name||''), iso:parseDateFromText(text||'') });
    }
    // 날짜별 그룹핑 (날짜 없으면 개별)
    const groups = new Map(); let solo = 0;
    items.forEach(it=>{ const key = it.iso? ('d'+isoDay(it.iso)) : ('s'+(solo++));
      if(!groups.has(key)) groups.set(key,[]); groups.get(key).push(it); });

    let recCount = 0, mergedCount = 0;
    for(const [,group] of groups){
      // 같은 날 '완전한 요약'이 2개 이상이고 거리차가 크면 → 서로 다른 러닝: 병합하지 않음
      const summaries = group.filter(g=>g.p.distanceKm && g.p.durationSec);
      const sd = summaries.map(g=>g.p.distanceKm);
      const separate = summaries.length>=2 && (Math.max(...sd)-Math.min(...sd) > 0.8);
      const subGroups = separate ? group.map(g=>[g]) : [group];
      for(const sub of subGroups){
        const rec = mergeImageGroup(sub); const imgs = rec._images; delete rec._images;
        await DB.put('records', rec);
        await DB.put('files', { id:rec.id, dataUrl:imgs[0] });
        for(let i=1;i<imgs.length;i++) await DB.put('files', { id:rec.id+'#'+i, dataUrl:imgs[i] });
        state.records.push(rec); recCount++; added++;
        if(sub.length>1) mergedCount++;
      }
    }
    state.records.sort((a,b)=>new Date(b.date)-new Date(a.date));
    recompute(); renderRecords();
    toast(`정리 완료 · ${recCount}개 기록${mergedCount?` (같은 러닝 ${mergedCount}건 자동 병합)`:''}`);
  } else if(added){
    toast(`${added}개 기록 추가`);
  }
}

/* 기록 편집/직접입력 시트 */
function editRecord(id){
  const r = id ? state.records.find(x=>x.id===id) : { id:uid(), date:new Date().toISOString(), source:'manual', type:'easy' };
  const opts = Object.values(TYPES).filter(t=>t.key!=='rest')
    .map(t=>`<option value="${t.key}" ${r.type===t.key?'selected':''}>${t.label}</option>`).join('');
  openSheet(`
    <h3>${id?'기록 편집':'러닝 기록 입력'}</h3>
    <label class="f">날짜</label>
    <input type="date" id="e_date" value="${isoDay(r.date)}">
    <label class="f">훈련 종류</label>
    <select id="e_type">${opts}</select>
    <div class="inline">
      <div><label class="f">거리 (km)</label><input type="number" step="0.01" id="e_dist" value="${r.distanceKm??''}" placeholder="10.0"></div>
      <div><label class="f">시간 (분)</label><input type="number" step="0.1" id="e_dur" value="${r.durationSec?(r.durationSec/60).toFixed(1):''}" placeholder="52.5"></div>
    </div>
    <div class="inline">
      <div><label class="f">평균 심박</label><input type="number" id="e_hr" value="${r.avgHr??''}" placeholder="150"></div>
      <div><label class="f">케이던스</label><input type="number" id="e_cad" value="${r.cadence??''}" placeholder="180"></div>
    </div>
    <label class="f">메모</label>
    <textarea id="e_notes" placeholder="느낌, 코스, 날씨 등">${r.notes||''}</textarea>
    ${r.hasImage?'<button class="btn block" id="e_ocr" style="margin-top:12px">🔍 이미지에서 수치 다시 인식</button>':''}
    <div class="row" style="margin-top:14px">
      ${id?'<button class="btn danger" id="e_del">삭제</button>':''}
      <button class="btn primary block" id="e_save">저장</button>
    </div>
  `);
  if(r.hasImage){ const b=$('#e_ocr'); if(b) b.onclick = async ()=>{
    b.textContent='인식 중…'; b.disabled=true;
    try{
      const changed = await applyOcrToRecord(r);
      if(changed){
        $('#e_date').value = isoDay(r.date);
        $('#e_dist').value = r.distanceKm ?? '';
        $('#e_dur').value  = r.durationSec ? (r.durationSec/60).toFixed(1) : '';
        $('#e_hr').value   = r.avgHr ?? '';
        $('#e_cad').value  = r.cadence ?? '';
        if(r.type) $('#e_type').value = r.type;
        toast('인식 완료 · 날짜/수치 확인 후 저장');
      } else toast('수치를 찾지 못했어요');
    }catch(e){ toast('인식 실패'); }
    b.textContent='🔍 이미지에서 수치 다시 인식'; b.disabled=false;
  }; }
  // 수치 입력 시 종류 자동 분류 (사용자가 종류를 직접 선택하면 중단)
  let typeTouched = false;
  const typeSel = $('#e_type');
  if(typeSel) typeSel.addEventListener('change', ()=> typeTouched=true);
  function autoClassifyEdit(){
    if(typeTouched || !typeSel) return;
    const dist = parseFloat($('#e_dist').value)||null;
    const durMin = parseFloat($('#e_dur').value)||null;
    const hr = parseInt($('#e_hr').value)||null;
    if(!dist && !durMin && !hr) return;
    const durSec = durMin?durMin*60:null;
    const pace = (dist&&durSec)? durSec/dist : (r.avgPaceSec||null);
    const type = classifyRun({distanceKm:dist, durationSec:durSec, avgPaceSec:pace, avgHr:hr, hint:$('#e_notes').value});
    if(type) typeSel.value = type;
  }
  ['e_dist','e_dur','e_hr'].forEach(idf=>{ const el=$('#'+idf); if(el) el.addEventListener('input', autoClassifyEdit); });

  $('#e_save').onclick = async ()=>{
    const dist = parseFloat($('#e_dist').value)||null;
    const durMin = parseFloat($('#e_dur').value)||null;
    const durSec = durMin?durMin*60:null;
    const rec = { ...r,
      date: new Date($('#e_date').value).toISOString(),
      type: $('#e_type').value,
      distanceKm: dist,
      durationSec: durSec,
      avgPaceSec: (dist&&durSec)? durSec/dist : (r.avgPaceSec||null),
      avgHr: parseInt($('#e_hr').value)||null,
      cadence: parseInt($('#e_cad').value)||null,
      notes: $('#e_notes').value.trim(),
      needsReview: false
    };
    await DB.put('records', rec);
    const i = state.records.findIndex(x=>x.id===rec.id);
    if(i>=0) state.records[i]=rec; else state.records.push(rec);
    state.records.sort((a,b)=>new Date(b.date)-new Date(a.date));
    recompute(); renderRecords(); closeSheet(); toast('저장됨');
  };
  if(id) $('#e_del').onclick = ()=> deleteRecord(id);
}

/* ── 개별 기록 상세 분석 리포트 ── */
function openRecordReport(id){
  const r = state.records.find(x=>x.id===id); if(!r) return;
  const m = state.metrics || {};
  const t = TYPES[r.type] || TYPES.easy;
  const dist=r.distanceKm, dur=r.durationSec, pace=r.avgPaceSec, hr=r.avgHr, cad=r.cadence;

  // 수치가 거의 없는 경우
  if(dist==null && pace==null && hr==null){
    openSheet(`
      <h3>${fmtDate(r.date)} · ${t.label}</h3>
      <div class="empty" style="padding:18px 6px">이 기록엔 분석할 수치가 없어요.<br>${r.hasImage?'아래 버튼으로 이미지에서 인식하거나 ':''}직접 보정해 주세요.</div>
      <div class="row" style="margin-top:4px">
        ${r.hasImage?'<button class="btn block" id="rr_ocr">🔍 이미지에서 인식</button>':''}
        <button class="btn primary block" id="rr_edit">✏️ 직접 입력</button>
      </div>`);
    $('#rr_edit').onclick = ()=> editRecord(id);
    if(r.hasImage){ const b=$('#rr_ocr'); if(b) b.onclick=async ()=>{ b.textContent='인식 중…'; b.disabled=true; try{ await applyOcrToRecord(r); }catch(e){} state.records.sort((a,b)=>new Date(b.date)-new Date(a.date)); recompute(); renderRecords(); openRecordReport(id); }; }
    return;
  }

  const wt = state.settings.weightKg||65;
  const maxHR = state.settings.maxHR||190;
  const speedKmh = (dist&&dur)? dist/(dur/3600) : null;
  const kcal = dist? Math.round(dist*wt*1.036) : null;
  let stride=null; if(dist&&dur&&cad){ const steps=cad*(dur/60); if(steps>0) stride=(dist*1000)/steps; }
  let beatsPerKm=null; if(dist&&dur&&hr) beatsPerKm=Math.round(hr*(dur/60)/dist);
  let hrPct=null, hrZone=null;
  if(hr){ hrPct=Math.round(hr/maxHR*100);
    hrZone = hrPct<60?['Z1 매우 가벼움','#4aa8ff']:hrPct<70?['Z2 이지·유산소','#39d98a']:hrPct<80?['Z3 템포','#ffb03d']:hrPct<90?['Z4 역치','#ff8a3d']:['Z5 최대','#ff5d6c'];
  }
  // 페이스가 가장 가까운 훈련 존
  let paceZone=null;
  if(pace && m.zones){ const z=m.zones;
    const cand=[['회복',z.recovery],['이지',z.easy],['마라톤',z.marathon],['NSM(서브T)',z.nsm],['템포(역치)',z.tempo],['인터벌(5K)',z.interval]];
    let bd=1e9; cand.forEach(([n,v])=>{ if(v){const d=Math.abs(pace-v); if(d<bd){bd=d;paceZone=n;}} });
  }
  // 이 기록 기반 레이스 예측
  let pred=null;
  if(dist>=1.5 && dur){ const t5k=dur*Math.pow(5/dist,1.06); const pr=k=>t5k*Math.pow(k/5,1.06);
    pred={ k5:pr(5), k10:pr(10), half:pr(21.0975), full:pr(42.195) }; }
  // 동일 종류 평균 대비
  const sameP=state.records.filter(x=>x.type===r.type&&x.avgPaceSec&&x.id!==r.id);
  let paceCmp=null; if(pace&&sameP.length){ const avg=sameP.reduce((s,x)=>s+x.avgPaceSec,0)/sameP.length; paceCmp={avg,diff:Math.round(pace-avg)}; }
  const sameH=state.records.filter(x=>x.type===r.type&&x.avgHr&&x.id!==r.id);
  let hrCmp=null; if(hr&&sameH.length){ const avg=Math.round(sameH.reduce((s,x)=>s+x.avgHr,0)/sameH.length); hrCmp={avg,diff:hr-avg}; }

  const kv=(k,v)=>`<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  const sig=(n)=> n>0?`+${n}`:`${n}`;

  // 기본 지표
  let core = kv('거리', dist!=null?`${dist.toFixed(2)} km`:'-')
    + kv('시간', dur?fmtDuration(dur):'-')
    + kv('평균 페이스', pace?`${fmtPace(pace)}/km`:'-')
    + kv('평균 속도', speedKmh?`${speedKmh.toFixed(1)} km/h`:'-')
    + kv('평균 심박', hr?`♥ ${hr} bpm`:'-')
    + kv('케이던스', cad?`${cad} spm`:'-')
    + kv('추정 소모', kcal?`${kcal} kcal <span class="k" style="font-size:11px">(${wt}kg 기준)</span>`:'-');

  // 강도 분석
  let intensity='';
  if(hrZone) intensity += kv('심박 강도', `<span class="riskbadge" style="background:${hrZone[1]}22;color:${hrZone[1]}">${hrZone[0]} · ${hrPct}%</span>`);
  if(paceZone) intensity += kv('페이스 존', `<b>${paceZone}</b> 페이스대`);
  if(!intensity) intensity = `<div class="note">최대심박(설정)과 페이스 존이 있으면 강도가 표시됩니다.</div>`;

  // 러닝 폼 / 효율
  let form='';
  if(cad) form += kv('케이던스', `${cad} spm`);
  if(stride) form += kv('추정 보폭', `${stride.toFixed(2)} m`);
  if(beatsPerKm) form += kv('심박 효율', `${beatsPerKm} 회/km <span class="k" style="font-size:11px">(낮을수록 효율↑)</span>`);
  if(!form) form = `<div class="note">거리·시간·케이던스가 있으면 보폭/효율이 계산됩니다.</div>`;

  // 예측
  let predHtml = pred
    ? kv('예상 5K', fmtDuration(pred.k5)) + kv('예상 10K', fmtDuration(pred.k10)) + kv('예상 하프', fmtDuration(pred.half)) + kv('예상 풀', fmtDuration(pred.full))
      + `<div class="note">이 기록 하나를 최대 노력으로 가정한 Riegel 환산치입니다(참고용).</div>`
    : `<div class="note">거리 1.5km 이상 + 시간이 있으면 레이스 예측이 표시됩니다.</div>`;

  // 평균 대비
  let cmp='';
  if(paceCmp) cmp += kv(`${t.label} 평균 페이스 대비`, `${fmtPace(paceCmp.avg)}/km 대비 <b style="color:${paceCmp.diff<0?'var(--ok)':'var(--acc2)'}">${sig(-paceCmp.diff)}초/km ${paceCmp.diff<0?'빠름':'느림'}</b>`);
  if(hrCmp) cmp += kv(`${t.label} 평균 심박 대비`, `${hrCmp.avg}bpm 대비 <b>${sig(hrCmp.diff)}bpm</b>`);
  if(!cmp) cmp = `<div class="note">같은 종류의 기록이 더 쌓이면 평균과 비교해 드려요.</div>`;

  // 코치 피드백
  const fb=[];
  if(cad){ if(cad<170) fb.push('👣 케이던스가 낮습니다(권장 170~185). 보폭을 조금 줄이고 스텝을 빠르게 하면 부상 위험이 줄어요.'); else if(cad>=175) fb.push('👣 케이던스가 양호합니다(175+). 효율적인 스텝이에요.'); }
  if(hrPct){
    if(['easy','recovery','lsd'].includes(r.type)){
      if(hrPct>=76) fb.push('🫀 이지/회복 목적인데 심박이 높습니다(Z3+). 페이스를 더 낮춰 유산소 위주로 달리세요.');
      else fb.push('🫀 심박이 적정 구간(Z1~Z2)입니다. 좋은 이지런이에요.');
    } else if(['interval','nsm','tempo'].includes(r.type)){
      if(hrPct<78) fb.push('🔥 고강도 세션 치고 심박이 낮은 편입니다. 강도를 조금 더 올려도 좋아요.');
      else fb.push('🔥 목표 강도에 잘 도달했습니다.');
    }
  }
  if(stride && stride>1.4) fb.push('보폭이 다소 큽니다. 오버스트라이드는 무릎 부담을 키울 수 있어요.');
  if(paceCmp && paceCmp.diff<-10) fb.push('👍 같은 종류 평균보다 확연히 빠릅니다. 컨디션이 좋았네요.');
  if(!fb.length) fb.push('데이터가 더 쌓이면 개인화된 코칭이 정교해집니다.');

  openSheet(`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
      <span class="tag ${t.css}">${t.label}</span>
      <h3 style="margin:0">${fmtDate(r.date)}</h3>
    </div>
    <div style="font-size:26px;font-weight:800;margin:6px 0 2px">${dist!=null?dist.toFixed(2)+' km':'—'} <span style="font-size:15px;color:var(--sub);font-weight:600">${pace?fmtPace(pace)+'/km':''}</span></div>
    ${r.hasImage?'<div id="rr_thumb" style="margin:8px 0"></div>':''}
    <div class="sectitle">기본 지표</div>${core}
    <div class="hr"></div><div class="sectitle">강도 분석</div>${intensity}
    <div class="hr"></div><div class="sectitle">러닝 폼 · 효율</div>${form}
    <div class="hr"></div><div class="sectitle">이 기록 기반 레이스 예측</div>${predHtml}
    <div class="hr"></div><div class="sectitle">평균 대비</div>${cmp}
    <div class="hr"></div><div class="sectitle">코치 피드백</div>
    ${fb.map(x=>`<div class="note" style="font-size:12.5px;color:var(--txt);line-height:1.55">${x}</div>`).join('')}
    ${r.notes?`<div class="hr"></div><div class="sectitle">메모</div><div class="note" style="color:var(--txt)">${r.notes}</div>`:''}
    <div class="row" style="margin-top:16px">
      <button class="btn danger" id="rr_del">삭제</button>
      <button class="btn" id="rr_edit">✏️ 편집</button>
      <button class="btn primary block" id="rr_close">확인</button>
    </div>`);
  $('#rr_edit').onclick = ()=> editRecord(id);
  $('#rr_del').onclick = ()=> deleteRecord(id);
  $('#rr_close').onclick = ()=> closeSheet();
  if(r.hasImage){ (async ()=>{
    const keys=[r.id]; for(let i=1;i<(r.imageCount||1);i++) keys.push(r.id+'#'+i);
    const imgs=[]; for(const k of keys){ const f=await DB.get('files',k); if(f) imgs.push(f.dataUrl); }
    const box=$('#rr_thumb'); if(box&&imgs.length) box.innerHTML = imgs.map(u=>`<img src="${u}" style="width:100%;border-radius:12px;margin-bottom:8px;display:block">`).join('');
  })(); }
}

async function deleteRecord(id){
  const rec = state.records.find(r=>r.id===id);
  await DB.del('records', id);
  await DB.del('files', id).catch(()=>{});
  if(rec && rec.imageCount>1){ for(let i=1;i<rec.imageCount;i++) await DB.del('files', id+'#'+i).catch(()=>{}); }
  state.records = state.records.filter(r=>r.id!==id);
  recompute(); renderRecords(); closeSheet(); toast('삭제됨');
}

async function renderRecords(){
  const filter = $('#recFilter').value;
  const list = state.records.filter(r=> filter==='all' || r.type===filter);
  $('#recCount').textContent = state.records.length ? `(${state.records.length})` : '';
  const box = $('#recList');
  if(!list.length){ box.innerHTML = `<div class="empty"><div class="big">📎</div>기록이 없습니다.<br>파일을 첨부하거나 직접 입력해 주세요.</div>`; return; }
  const rows = await Promise.all(list.map(async r=>{
    let thumb = `<div class="thumb">${TYPES[r.type]?.label?.[0]||'🏃'}</div>`;
    if(r.hasImage){ const f = await DB.get('files', r.id);
      const badge = (r.imageCount>1)? `<span style="position:absolute;right:3px;bottom:3px;background:rgba(0,0,0,.65);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px">📷${r.imageCount}</span>` : '';
      if(f) thumb = `<div class="thumb" style="position:relative"><img src="${f.dataUrl}">${badge}</div>`; }
    const t = TYPES[r.type]||TYPES.easy;
    const meta = [
      r.distanceKm!=null?`${r.distanceKm.toFixed(2)}km`:null,
      r.durationSec?fmtDuration(r.durationSec):null,
      r.avgPaceSec?`${fmtPace(r.avgPaceSec)}/km`:null,
      r.avgHr?`♥${r.avgHr}`:null,
      r.cadence?`${r.cadence}spm`:null
    ].filter(Boolean).join(' · ') || '수치 없음 · 탭하여 분석/보정';
    return `<div class="rec" data-id="${r.id}">
      ${thumb}
      <div class="info">
        <div class="a"><span class="tag ${t.css}">${t.label}</span> ${fmtDate(r.date)} ${r.needsReview?'<span style="color:var(--warn)">· 보정필요</span>':''}</div>
        <div class="b">${meta}</div>
      </div>
      <button class="del" data-del="${r.id}">✕</button>
    </div>`;
  }));
  box.innerHTML = rows.join('');
  $$('.rec', box).forEach(el=> el.addEventListener('click', (e)=>{
    if(e.target.dataset.del){ deleteRecord(e.target.dataset.del); return; }
    openRecordReport(el.dataset.id);
  }));
}

/* ============================================================
   학습 엔진 · 부하/체력 지표 계산
   ============================================================ */
function recompute(){
  const recs = state.records.filter(r=>r.distanceKm>0);
  const now = Date.now(), DAY = 86400000;

  // 최근 7일 / 28일 부하
  const km7  = recs.filter(r=>now-new Date(r.date)<7*DAY ).reduce((s,r)=>s+r.distanceKm,0);
  const km28 = recs.filter(r=>now-new Date(r.date)<28*DAY).reduce((s,r)=>s+r.distanceKm,0);
  const chronicWeekly = km28/4;
  const acwr = chronicWeekly>0 ? km7/chronicWeekly : (km7>0?1:0);

  // 주간 거리 (최근 8주)
  const weeks = [];
  const thisMon = mondayOf(now);
  for(let i=7;i>=0;i--){
    const start = new Date(thisMon); start.setDate(start.getDate()-i*7);
    const end = new Date(start); end.setDate(end.getDate()+7);
    const km = recs.filter(r=>{ const d=new Date(r.date); return d>=start&&d<end; }).reduce((s,r)=>s+r.distanceKm,0);
    weeks.push({ start, km:+km.toFixed(1) });
  }

  // VDOT: 최근 60일 내 최고 노력 (Riegel로 5K 환산)
  let best5k = Infinity;
  recs.filter(r=>r.durationSec>0 && r.distanceKm>=1.5 && now-new Date(r.date)<60*DAY)
      .forEach(r=>{ const p5=r.durationSec*Math.pow(5/r.distanceKm,1.06); if(p5<best5k) best5k=p5; });
  let vdot=null, pace5k=null, racePred={};
  if(isFinite(best5k)){
    pace5k = best5k/5; // sec/km
    const v = 5000/(best5k/60);               // m/min
    const t = best5k/60;                       // min
    const vo2 = -4.6 + 0.182258*v + 0.000104*v*v;
    const pct = 0.8 + 0.1894393*Math.exp(-0.012778*t) + 0.2989558*Math.exp(-0.1932605*t);
    vdot = Math.round(vo2/pct);
    const predict = (km)=> best5k*Math.pow(km/5,1.06);
    racePred = { '10k':predict(10), 'half':predict(21.0975), 'full':predict(42.195) };
  }

  // 레이스 페이스 파생 (sec/km) - Riegel 예측 기반
  let racePace=null;
  if(isFinite(best5k)){
    const pr=(km)=> best5k*Math.pow(km/5,1.06)/km;
    racePace = { k5:best5k/5, k10:pr(10), k12:pr(12), k15:pr(15),
                 half:pr(21.0975), k30:pr(30), full:pr(42.195) };
  }

  // 10K 추정 기록(초) — NSM 표 조회 기준
  const tenKSec = racePred['10k'] || null;

  // 페이스 존 (sec/km). NSM·이지런 모두 문서 표를 그대로 사용
  let zones=null;
  if(pace5k){
    const mid = (r)=> Math.round((r[0]+r[1])/2);
    const n3 = NSM.paceFor(tenKSec,3), n6 = NSM.paceFor(tenKSec,6), n10 = NSM.paceFor(tenKSec,10);
    const eR = NSM.easyFor(tenKSec);   // [70%상한, 60%회복]
    zones = {
      interval: pace5k,               // I ≈ 5K (VO2max)
      tempo:    racePace.k15,        // T ≈ 역치(약 15K~HM 페이스)
      marathon: racePace.full,       // M
      // 이지런/롱런/회복 - 문서 이지런 표(최대심박 60~70%) 기준
      easy:     mid(eR),              // E (표 중간)
      lsd:      mid(eR),              // 롱런도 이지 강도
      recovery: eR[1],                // 회복 = 느린쪽(60%)
      easyR: eR,
      // NSM(서브스레숄드) - 문서 페이스 표 기준
      nsm:   mid(n6),
      nsm3:  mid(n3), nsm6: mid(n6), nsm10: mid(n10),
      nsm3R:n3, nsm6R:n6, nsm10R:n10
    };
  }
  // 심박 존
  const maxHR = state.settings.maxHR || 190;
  const hr = NSM.hrZones(maxHR);

  // 주간 훈련시간(시간) 추정 — 최근 28일 기록 시간 기반, 없으면 거리×페이스
  let weekMin28 = 0;
  recs.filter(r=>now-new Date(r.date)<28*DAY).forEach(r=>{
    if(r.durationSec>0) weekMin28 += r.durationSec/60;
    else if(r.distanceKm>0) weekMin28 += r.distanceKm*((pace5k?pace5k+95:360)/60);
  });
  const weeklyHours = (weekMin28/4)/60;

  // 강도 분포 (거리 가중)
  const zoneDist = { low:0, mid:0, high:0 };
  recs.filter(r=>now-new Date(r.date)<42*DAY).forEach(r=>{
    if(['interval','nsm','race'].includes(r.type)) zoneDist.high+=r.distanceKm;
    else if(r.type==='tempo') zoneDist.mid+=r.distanceKm;
    else zoneDist.low+=r.distanceKm;
  });
  const zTot = zoneDist.low+zoneDist.mid+zoneDist.high;

  // 이지런 페이스 추세 (최근 easy/lsd)
  const paceTrend = recs.filter(r=>['easy','lsd','recovery'].includes(r.type)&&r.avgPaceSec)
    .sort((a,b)=>new Date(a.date)-new Date(b.date))
    .slice(-12).map(r=>({date:r.date, pace:r.avgPaceSec}));

  state.metrics = { km7, km28, chronicWeekly, acwr, weeks, vdot, pace5k, racePred, racePace,
                    zones, zoneDist, zTot, paceTrend, count:recs.length,
                    tenKSec, weeklyHours, hr, maxHR };
}

/* ============================================================
   홈 대시보드
   ============================================================ */
function renderHome(){
  const m = state.metrics; if(!m) return;
  const g = state.settings.weeklyGoalKm||40;
  const wkKm = m.weeks[m.weeks.length-1]?.km || 0;
  $('#hWeekKm').innerHTML = `${wkKm.toFixed(0)}<small> km</small>`;
  $('#hWeekGoal').textContent = `목표 ${g}km 대비 ${Math.round(wkKm/g*100)}%`;
  $('#hAvgKm').innerHTML = `${m.chronicWeekly.toFixed(0)}<small> km</small>`;

  const last4 = m.weeks.slice(-4).map(w=>w.km);
  const prev = m.weeks.slice(-8,-4).reduce((s,x)=>s+x.km,0)/4 || 0;
  const cur = last4.reduce((s,x)=>s+x,0)/4;
  const diff = prev? Math.round((cur-prev)/prev*100):0;
  $('#hAvgTrend').textContent = prev? `${diff>0?'▲':diff<0?'▼':'▬'} 이전 대비 ${Math.abs(diff)}%` : '데이터 부족';
  $('#hAvgTrend').className = 'd '+(diff>2?'up':diff<-2?'down':'flat');

  $('#hVdot').textContent = m.vdot ?? '—';
  if(m.vdot){
    const target = state.settings.targetRace;
    const t = m.racePred[target] || m.racePred['full'];
    const label = {full:'풀',half:'하프','10k':'10K','5k':'5K'}[target]||'풀';
    $('#hRacePred').textContent = `${label} 예상 ${fmtDuration(t)}`;
    $('#hRacePred').className='d flat';
  } else $('#hRacePred').textContent='기록 첨부 필요';

  // ACWR
  const a = m.acwr;
  $('#hAcwr').textContent = a? a.toFixed(2) : '—';
  let lbl='—', cls='flat';
  if(a){
    if(a<0.8){lbl='부하 낮음(디트레이닝 주의)';cls='flat';}
    else if(a<=1.3){lbl='최적 구간 ✓';cls='up';}
    else if(a<=1.5){lbl='주의 (증가 빠름)';cls='down';}
    else{lbl='위험 (부상 리스크↑)';cls='down';}
  }
  $('#hAcwrLbl').textContent = lbl; $('#hAcwrLbl').className='d '+cls;

  renderTodayWorkout();
  drawWeeklyChart();
}

function renderTodayWorkout(){
  const box = $('#todayWorkout');
  const plan = getPlan(mondayOf(Date.now()));
  if(!plan){ box.innerHTML = `<div class="empty"><div class="big">📅</div>아직 플랜이 없어요.<br><button class="btn primary sm" style="margin-top:10px" onclick="go('plan')">플랜 만들기</button></div>`; return; }
  const todayIdx = (new Date().getDay()+6)%7;
  const s = plan.sessions[todayIdx];
  const t = TYPES[s.type];
  box.innerHTML = `
    <div class="day" style="margin:0">
      <div class="dd"><div class="dn">오늘</div><div class="dnum">${new Date().getDate()}</div></div>
      <div class="body">
        <div class="t"><span class="tag ${t.css}">${t.label}</span> ${s.title}</div>
        <div class="meta">${s.detail}</div>
      </div>
      ${s.type!=='rest'?`<div class="chk" onclick="go('run')">▶</div>`:''}
    </div>`;
}

/* ============================================================
   차트 (경량 캔버스)
   ============================================================ */
function setupCanvas(cv){
  const dpr = window.devicePixelRatio||1;
  const h = cv.getAttribute('height')*1;
  cv.style.height = h + 'px';           // 표시 높이 고정 (고해상도 기기에서 세로 늘어남 방지)
  const w = cv.clientWidth || cv.parentElement.clientWidth;
  cv.width = w*dpr; cv.height = h*dpr;   // 버퍼는 dpr 배율로 선명하게
  const ctx = cv.getContext('2d'); ctx.scale(dpr,dpr);
  return {ctx, w, h};
}
function drawWeeklyChart(){
  const cv = $('#chartWeekly'); if(!cv) return;
  const {ctx,w,h} = setupCanvas(cv);
  const data = state.metrics.weeks;
  const max = Math.max(state.settings.weeklyGoalKm, ...data.map(d=>d.km), 10);
  const pad=22, bw=(w-pad*2)/data.length*0.62, gap=(w-pad*2)/data.length;
  // 목표선
  const gy = h-18-(state.settings.weeklyGoalKm/max)*(h-40);
  ctx.strokeStyle='#39d98a55'; ctx.setLineDash([4,4]); ctx.beginPath();
  ctx.moveTo(pad,gy); ctx.lineTo(w-pad,gy); ctx.stroke(); ctx.setLineDash([]);
  data.forEach((d,i)=>{
    const x = pad + i*gap + (gap-bw)/2;
    const bh = (d.km/max)*(h-40);
    const y = h-18-bh;
    const grad = ctx.createLinearGradient(0,y,0,h-18);
    grad.addColorStop(0,'#ff6a3d'); grad.addColorStop(1,'#ffb03d');
    ctx.fillStyle = i===data.length-1? grad : '#2a3a52';
    roundRect(ctx,x,y,bw,bh,4); ctx.fill();
    ctx.fillStyle='#6b7d94'; ctx.font='9px -apple-system'; ctx.textAlign='center';
    const lbl = `${d.start.getMonth()+1}/${d.start.getDate()}`;
    ctx.fillText(lbl, x+bw/2, h-5);
    if(d.km>0){ ctx.fillStyle='#e9eef5'; ctx.font='bold 9px -apple-system'; ctx.fillText(d.km.toFixed(0), x+bw/2, y-4); }
  });
}
function roundRect(ctx,x,y,w,h,r){
  r=Math.min(r,w/2,h/2); if(h<=0)return;
  ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}

/* ============================================================
   훈련 플랜 (주간 · 자동 생성)
   ============================================================ */
function getPlan(monday){ return state.plans[isoDay(monday)] || null; }

function paceText(type){
  const z = state.metrics.zones;
  if(!z){
    const fallback = { interval:'5K 페이스(빠르게)', tempo:'역치(편안하게 힘든)', lsd:'대화 가능한 편안한',
      easy:'대화 가능한 편안한', recovery:'매우 느린', nsm:'역치 바로 아래(서브T)',
      nsm3:'15K 페이스(통제된)', nsm6:'하프~30K 페이스', nsm10:'30K~마라톤 페이스' };
    return fallback[type]||'편안한';
  }
  const base = z[type] ?? z.easy;
  const lo = base-8, hi = base+8;
  return `${fmtPace(lo)}~${fmtPace(hi)}/km`;
}

/* 대회일(선택) 기준 훈련 페이즈 판정 */
function trainingPhase(monday){
  const rd = state.settings.raceDate;
  if(!rd) return 'base';
  const race = mondayOf(new Date(rd)); // 주 단위 비교
  const weeks = Math.round((race - mondayOf(monday))/(7*86400000));
  if(weeks < 0) return 'base';
  const full = state.settings.targetRace==='full';
  if(weeks <= 2) return 'taper';
  if(full && weeks <= 8) return 'mp';   // 마라톤 특이 훈련기
  return 'base';
}
/* 롱런 목표 시간(분) - 문서: 거리보다 시간 기준 */
function longRunMinutes(phase, isDownWeek){
  const race = state.settings.targetRace;
  let base = { full:110, half:90, '10k':75, '5k':60 }[race] || 90;
  if(phase==='mp') base += 20;          // 마라톤 특이기엔 롱런 확장(최대 150)
  if(phase==='taper') base = Math.round(base*0.6);
  if(isDownWeek) base = Math.round(base*0.8);
  return clamp(base, 40, 150);
}
/* 마라톤 페이스 블록 텍스트 (문서 예시) */
function mpBlockText(tenK){
  const mp = state.metrics.racePace?.full;
  const p = mp ? `${fmtPace(mp)}/km` : '마라톤 페이스';
  const opts = [`3km×4 @ ${p} (사이 1km 조깅)`, `5km×3 @ ${p} (사이 1km 조깅)`, `마지막 8km @ ${p}`];
  return opts[Math.floor(Math.random()*opts.length)];
}

function generatePlan(monday){
  const m = state.metrics;
  const base = (m.chronicWeekly>5)? m.chronicWeekly : state.settings.weeklyGoalKm;
  let target = Math.min(base*1.08, base+8);
  // ACWR 위험 시 증량 억제
  if(m.acwr>1.4) target = base*0.95;
  target = Math.max(15, Math.round(target));

  const S = (type, km, title, detail, extra={})=>({ type, km, title, detail, done:false, ...extra });

  // ── 훈련 주기(페이즈) 판정 ──
  // 대회일이 있으면 D-day 기준: 마라톤은 8주 전부터 특이훈련, 2주 전 테이퍼
  const phase = trainingPhase(monday);
  // 회복주: 3주마다 1회 볼륨 감량 (문서: 2~3주에 한 번 줄이는 주)
  const weekNo = Math.abs(Math.round((monday - mondayOf(Date.now()))/(7*86400000)));
  const isDownWeek = (weekNo % 3 === 2) && phase!=='taper';

  const tenK = m.tenKSec || 270;                       // 10K 추정(초), 없으면 45분 가정
  let hours = m.weeklyHours>0 ? m.weeklyHours : (target*(m.pace5k?m.pace5k+95:360))/3600;
  const level = m.count < 8 ? 'intro' : 'base';
  // 마라톤 특이/테이퍼 주엔 NSM 세션 축소 (문서: MP 롱런 주엔 NSM 줄이기)
  const maxSess = phase==='mp' ? 2 : phase==='taper' ? 1 : 3;
  const rx = NSM.prescribe(tenK, isDownWeek? hours*0.8 : hours, level, maxSess);

  const easyPace = (m.zones?.easy) || 360, recPace = (m.zones?.recovery) || 400;
  const recTxt = (s)=> s<120 ? `${s}초` : `${Math.round(s/60)}분`;
  const hrTxt = (zoneKey)=>{ const h=m.hr; if(!h) return ''; const z=h[zoneKey]; return z? ` · 심박 ${z[0]}~${z[1]}` : ` · 심박 <${h.longCeil}`; };
  const estKm = (r)=>{
    const midPace = (r.pace[0]+r.pace[1])/2;
    const fast = (r.reps*r.min*60)/midPace;
    const jog  = ((r.reps-1)*r.rec)/recPace;
    const wc   = (r.wu+r.cd)*60/easyPace;
    return +(fast+jog+wc).toFixed(1);
  };
  // 첫 반복은 5초 느리게 안내 (문서 웜업 조언)
  const nsmSessions = rx.sessions.map(r=>{
    const km = estKm(r);
    return S('nsm', km, `NSM · ${r.label} ×${r.reps}`,
      `워밍업 ${r.wu}분 → (${r.min}분 @ ${NSM.fmtRange(r.pace)}/km + ${recTxt(r.rec)} 조깅) ×${r.reps} → 쿨다운 ${r.cd}분 · 서브T ${r.subTmin}분${hrTxt('easy')} · 첫 반복은 5초 느리게, 마지막까지 페이스 유지`,
      {variant:r.paceKey, subTmin:r.subTmin});
  });
  const subTtotal = rx.subTtotal;

  // ── 롱런: 시간 기준(문서). 대회 종류/페이즈별 목표 시간 → 거리 환산 ──
  const longMin = longRunMinutes(phase, isDownWeek);
  const longKm = +((longMin*60)/((m.zones?.lsd)||360)).toFixed(1);

  // ── 주간 배치: 문서 템플릿(layout) 사용 ──
  const skeleton = rx.layout.skel.slice();
  const nsmTotalKm = nsmSessions.reduce((s,x)=>s+x.km,0);
  let remain = Math.max(0, target - nsmTotalKm - longKm);
  const easyIdx = skeleton.map((t,i)=>({t,i})).filter(x=>x.t==='easy'||x.t==='recovery').map(x=>x.i);
  const perEasy = easyIdx.length? remain/easyIdx.length : 0;

  // 마라톤 특이 주: 토요일(5)을 MP 포함 롱런으로, 일요일 회복
  const mpWeek = phase==='mp';

  let nsmPick = 0;
  const sessions = skeleton.map((t,i)=>{
    if(mpWeek && i===5){ // 토요일 MP 롱런
      const mpText = mpBlockText(tenK);
      return S('lsd', longKm, `MP 롱런 ${longKm}km`, `${paceText('lsd')} 베이스 + ${mpText} · 보급 연습 병행`, {mp:true});
    }
    if(mpWeek && i===6){ return S('recovery', Math.max(3,Math.round(perEasy*0.6)), '회복 조깅', `${paceText('recovery')}${hrTxt('recovery')} · 완전 회복`); }
    if(t==='nsm'){ return nsmSessions[nsmPick++] || S('easy', Math.round(perEasy), `이지런`, `${paceText('easy')}${hrTxt('easy')}`); }
    if(t==='lsd'){ return S('lsd', longKm, `이지 롱런 ${longKm}km (${longMin}분)`, `${paceText('lsd')}${hrTxt('easy')} · 거리보다 시간, 끝까지 이지`); }
    if(t==='rest'){ return S('rest', 0, '휴식', '완전 휴식 또는 스트레칭/코어 (회복도 훈련)'); }
    if(t==='recovery'){ const km=Math.max(3,Math.round(perEasy*0.7)); return S('recovery', km, `회복 조깅 ${km}km`, `${paceText('recovery')}${hrTxt('recovery')} · 아주 편하게, 다리 풀기`); }
    const km=Math.max(4,Math.round(perEasy)); return S('easy', km, `이지런 ${km}km`, `${paceText('easy')}${hrTxt('easy')} · 심박 상한 우선(느려도 OK)`);
  });

  const totalKm = Math.round(sessions.reduce((s,x)=>s+(x.km||0),0));
  const ratio = Math.round(subTtotal / (hours*60) * 100) || 0;
  const phaseLbl = { base:'기본기', mp:'마라톤 특이', taper:'테이퍼' }[phase] || '기본기';
  const dLbl = isDownWeek ? ' · 회복주' : '';
  const plan = { weekStart: isoDay(monday), target:totalKm, sessions, createdAt:Date.now(),
                 vdot:m.vdot, subTtotal, ratio, nsmCount:nsmSessions.length, phase, isDownWeek,
                 note:`${phaseLbl}${dLbl} · 주 ${totalKm}km · NSM ${nsmSessions.length}회 · 서브T ${subTtotal}분(≈${ratio}%)` };
  state.plans[plan.weekStart] = plan;
  DB.put('plans', plan);
  return plan;
}

function renderPlan(){
  const m = state.metrics;
  const monday = new Date(mondayOf(Date.now()));
  monday.setDate(monday.getDate()+state.planWeekOffset*7);
  let plan = getPlan(monday);

  const end = new Date(monday); end.setDate(end.getDate()+6);
  $('#planWeekTitle').textContent = state.planWeekOffset===0?'이번 주 훈련 플랜'
    : state.planWeekOffset<0?`${-state.planWeekOffset}주 전`:`${state.planWeekOffset}주 후 플랜`;
  $('#planWeekMeta').textContent = `${monday.getMonth()+1}/${monday.getDate()} ~ ${end.getMonth()+1}/${end.getDate()}` + (plan?` · ${plan.note}`:' · 미생성');

  const box = $('#planList');
  if(!plan){
    box.innerHTML = `<div class="card"><div class="empty"><div class="big">🤖</div>
      ${m.count?'기록을 학습해 이번 주 플랜을 만들 수 있어요.':'먼저 러닝 기록을 첨부해 주세요.'}<br>
      <button class="btn primary sm" style="margin-top:12px" id="genNow">플랜 생성</button></div></div>`;
    const g = $('#genNow'); if(g) g.onclick = ()=>{ generatePlan(monday); renderPlan(); toast('플랜 생성됨'); };
    return;
  }
  const days = ['월','화','수','목','금','토','일'];
  box.innerHTML = plan.sessions.map((s,i)=>{
    const t = TYPES[s.type]; const d = new Date(monday); d.setDate(d.getDate()+i);
    return `<div class="day ${s.done?'done':''}" data-i="${i}">
      <div class="dd"><div class="dn">${days[i]}</div><div class="dnum">${d.getDate()}</div></div>
      <div class="body">
        <div class="t"><span class="tag ${t.css}">${t.label}</span> ${s.title} ${s.km?`<span style="color:var(--sub);font-weight:600">${s.km}km</span>`:''}</div>
        <div class="meta">${s.detail}</div>
      </div>
      ${s.type!=='rest'?`<div class="chk ${s.done?'on':''}" data-chk="${i}">${s.done?'✓':''}</div>`:''}
    </div>`;
  }).join('');
  $$('[data-chk]', box).forEach(el=> el.addEventListener('click',(e)=>{
    e.stopPropagation();
    const i = +el.dataset.chk; plan.sessions[i].done = !plan.sessions[i].done;
    DB.put('plans', plan); renderPlan();
  }));
}

/* NSM 가이드 (학습한 방법론 + 개인 맞춤 처방) */
function openNsmGuide(){
  const m = state.metrics;
  const hasData = m.tenKSec && m.count;
  const tenK = m.tenKSec || 270;
  const hours = m.weeklyHours>0 ? m.weeklyHours : 0;
  const vg = NSM.volumeFor(hours||3.5);
  const level = m.count<8 ? 'intro':'base';
  const lvlTxt = level==='intro'?'입문':'기본';

  // 개인 페이스 표 (내 10K 기준)
  const p3=NSM.paceFor(tenK,3), p6=NSM.paceFor(tenK,6), p10=NSM.paceFor(tenK,10);
  const eR=NSM.easyFor(tenK); const hz=NSM.hrZones(state.settings.maxHR||190);
  const paceCard = `
    <div class="card tight" style="margin:0 0 12px">
      <div class="kv"><span class="k">기준 10K 기록</span><span class="v">${hasData?fmtDuration(tenK):'45:00(가정)'} (${fmtPace(tenK/10)}/km)</span></div>
      <div class="kv"><span class="k">3분 반복 (12~15K)</span><span class="v">${NSM.fmtRange(p3)}/km</span></div>
      <div class="kv"><span class="k">6분 반복 (하프~30K)</span><span class="v">${NSM.fmtRange(p6)}/km</span></div>
      <div class="kv"><span class="k">10분 반복 (30K~마라톤)</span><span class="v">${NSM.fmtRange(p10)}/km</span></div>
      <div class="kv"><span class="k">이지런 (심박 우선)</span><span class="v">${NSM.fmtRange(eR)}/km</span></div>
    </div>`;

  // 처방
  const rx = NSM.prescribe(tenK, hours||3.5, level);
  const rxCard = rx.sessions.map(r=>`<div class="day" style="margin:0 0 8px">
      <div class="dd"><div class="dn">서브T</div><div class="dnum" style="font-size:15px">${r.subTmin}'</div></div>
      <div class="body"><div class="t"><span class="tag nsm">${r.label}</span> ×${r.reps}</div>
      <div class="meta">${r.pace?NSM.fmtRange(r.pace)+'/km':''} · 회복 ${r.rec<120?r.rec+'초':Math.round(r.rec/60)+'분'} · 워밍업 ${r.wu}분/쿨다운 ${r.cd}분</div></div>
    </div>`).join('');

  openSheet(`
    <h3>📘 NSM · 노르웨이식 싱글</h3>
    <div class="desc">역치 <b>바로 아래(서브스레숄드)</b>에서 반복 가능한 강도로 꾸준히 쌓는 훈련. "오늘 털리는" 훈련이 아니라 <b>다음 훈련을 남겨두는</b> 훈련이에요. 페이스=강도, 반복수=훈련량, 주간 비율=피로 관리.</div>

    <div class="sectitle" style="margin-top:6px">내 맞춤 페이스 (보수적 기준)</div>
    ${paceCard}

    <div class="sectitle">이지런 심박 존 (최대심박 ${state.settings.maxHR||190})</div>
    <div class="card tight" style="margin:0 0 12px">
      <div class="kv"><span class="k">회복 조깅 (60~65%)</span><span class="v">${hz.recovery[0]}~${hz.recovery[1]} bpm</span></div>
      <div class="kv"><span class="k">이지런 (65~70%)</span><span class="v">${hz.easy[0]}~${hz.easy[1]} bpm</span></div>
      <div class="kv"><span class="k">롱런 상한</span><span class="v">&lt; ${hz.longCeil} bpm</span></div>
      <div class="note" style="margin-top:8px">이지런은 <b>페이스보다 심박 상한</b>이 우선. 70%는 목표가 아니라 상한선 — 더 느려도 좋습니다.</div>
    </div>

    <div class="sectitle">내 주간 처방 · ${vg.label} · ${lvlTxt}단계</div>
    <div class="card tight" style="margin:0 0 12px">
      <div class="kv"><span class="k">추정 주간 훈련시간</span><span class="v">${hours>0?hours.toFixed(1)+'시간':'기록 필요'}</span></div>
      <div class="kv"><span class="k">권장 NSM 세션</span><span class="v">주 ${rx.nSessions}회</span></div>
      <div class="kv"><span class="k">권장 서브T 총량</span><span class="v">${vg.subT[0]}~${vg.subT[1]}분 (${vg.pct[0]}~${vg.pct[1]}%)</span></div>
    </div>
    ${rxCard}

    <div class="sectitle">핵심 원칙</div>
    <div class="note" style="font-size:12px;color:var(--txt);line-height:1.7">
      • <b>처음엔 느린 쪽</b>에서 시작 — 더운 날/피로한 날은 5~15초 더 느리게.<br>
      • 반복수는 <b>같은 강도를 안정적으로 유지</b>할 수 있을 때만 늘리기.<br>
      • 휴식은 짧게 버티는 게 아니라 <b>다음 반복을 정확한 강도로</b> 하기 위한 조절.<br>
      • 서브T 비율 <b>15~25%는 상한선</b> — 수면 부족·다리 피로·심박 상승 시 줄이기.<br>
      • 이지런/롱런은 <b>최대심박 70% 미만</b>, 롱런은 거리보다 <b>시간</b> 기준.<br>
      • 2~3주마다 <b>회복주</b>로 볼륨을 줄이세요.
    </div>

    <div class="sectitle">성공 기준 (훈련 후 체크)</div>
    <div class="note" style="font-size:12px;color:var(--txt);line-height:1.7">
      ✓ 마지막 반복까지 페이스가 크게 무너지지 않았다<br>
      ✓ 호흡은 힘들었지만 통제 가능 · 역치 심박을 계속 넘지 않았다<br>
      ✓ 끝나고 탈진하지 않았고 다음날 가볍게 조깅 가능<br>
      ✓ 이틀 뒤 비슷한 훈련을 다시 할 수 있다
    </div>

    <div class="sectitle">알아둘 점</div>
    <div class="note" style="font-size:12px;color:var(--txt);line-height:1.7">
      • 효과는 <b>6~8주 누적형</b> — 기록보다 "같은 페이스가 편해지는지"를 보세요.<br>
      • 한계: 순수 스피드 자극 부족 · 단조로움 · 대회 특이성 부족.<br>
      • <b>마라톤</b>은 대회 6~8주 전부터 <b>MP 롱런 블록</b>을 넣고 NSM을 줄이세요. (설정에 대회일 입력 시 자동 반영)
    </div>

    <button class="btn primary block" style="margin-top:14px" id="ng_gen">이 처방으로 플랜 생성</button>
    <div class="note">문서(10K 32~60분 NSM·이지런 페이스 표, 주간 볼륨·심박·주기화 규칙)를 학습해 적용합니다.</div>
  `);
  $('#ng_gen').onclick = ()=>{
    if(!m.count){ toast('먼저 기록을 첨부하세요'); closeSheet(); go('records'); return; }
    const monday = new Date(mondayOf(Date.now())); monday.setDate(monday.getDate()+state.planWeekOffset*7);
    generatePlan(monday); closeSheet(); go('plan'); renderPlan(); toast('NSM 플랜 생성됨');
  };
}
$('#btnNsmGuide').onclick = openNsmGuide;

$('#btnGenPlan').onclick = ()=>{
  const monday = new Date(mondayOf(Date.now())); monday.setDate(monday.getDate()+state.planWeekOffset*7);
  if(!state.metrics.count){ toast('먼저 기록을 첨부하세요'); go('records'); return; }
  generatePlan(monday); renderPlan(); toast('플랜을 생성했어요');
};
$('#btnPrevWeek').onclick = ()=>{ state.planWeekOffset--; renderPlan(); };
$('#btnNextWeek').onclick = ()=>{ state.planWeekOffset++; renderPlan(); };

/* ============================================================
   실시간 러닝 (GPS + 동작센서 케이던스)
   ============================================================ */
const run = {
  active:false, paused:false, startTs:0, elapsed:0, dist:0,
  lastPos:null, watchId:null, timer:null, wakeLock:null,
  steps:0, lastPeak:0, cadWindow:[], path:[], recentPace:0, motionHandler:null
};

function renderRunTab(){
  // 러닝화 셀렉트 채우기
  const sel = $('#runShoe');
  const active = state.shoes.filter(s=>!s.retired);
  sel.innerHTML = `<option value="">선택 안 함</option>` +
    active.map(s=>`<option value="${s.id}">${s.name} (${(s.totalKm||0).toFixed(0)}km)</option>`).join('');
  $('#runShoeWrap').style.display = active.length? 'block':'none';
  $('#watchNote').innerHTML = `⌚️ <b>애플워치 연동 안내</b> — iOS 웹앱은 애플워치 센서에 직접 접근할 수 없습니다. 이 화면은 iPhone의 <b>GPS</b>로 페이스·거리·시간을, <b>동작센서</b>로 케이던스를 실시간 측정합니다. (Strava/Garmin과 동일한 원리) 워치 데이터는 러닝 후 이미지/파일로 <b>기록 탭</b>에 첨부하면 학습에 반영됩니다.`;
}

async function startRun(){
  if(!('geolocation' in navigator)){ toast('GPS를 사용할 수 없습니다'); return; }
  // 동작센서 권한 (iOS)
  if(typeof DeviceMotionEvent!=='undefined' && typeof DeviceMotionEvent.requestPermission==='function'){
    try{ await DeviceMotionEvent.requestPermission(); }catch(e){}
  }
  run.active=true; run.paused=false; run.startTs=Date.now(); run.elapsed=0; run.dist=0;
  run.lastPos=null; run.steps=0; run.cadWindow=[]; run.path=[];
  $('#btnRunStart').classList.add('hidden');
  $('#btnRunPause').classList.remove('hidden');
  $('#btnRunStop').classList.remove('hidden');

  // 화면 꺼짐 방지
  try{ if('wakeLock' in navigator) run.wakeLock = await navigator.wakeLock.request('screen'); }catch(e){}

  run.watchId = navigator.geolocation.watchPosition(onPos, onPosErr,
    { enableHighAccuracy:true, maximumAge:1000, timeout:15000 });

  run.motionHandler = (e)=>{
    const a = e.accelerationIncludingGravity || e.acceleration; if(!a) return;
    const mag = Math.sqrt((a.x||0)**2+(a.y||0)**2+(a.z||0)**2);
    const now = Date.now();
    if(mag>12.5 && now-run.lastPeak>260){ // 발디딤 피크
      run.steps++; run.lastPeak=now; run.cadWindow.push(now);
      run.cadWindow = run.cadWindow.filter(t=>now-t<10000);
    }
  };
  window.addEventListener('devicemotion', run.motionHandler);

  run.timer = setInterval(tick, 250);
  toast('러닝 시작! 안전 운동하세요 🏃');
}

function onPos(pos){
  if(!run.active || run.paused) return;
  const c = pos.coords;
  if(c.accuracy>35){ setGps('weak','GPS 정확도 낮음'); return; }
  setGps('ok','GPS 양호');
  const p = { lat:c.latitude, lon:c.longitude, t:Date.now() };
  if(run.lastPos){
    const d = haversine(run.lastPos, p);
    if(d>0.8 && d<40){ // 노이즈 필터
      run.dist += d;
      const dt = (p.t-run.lastPos.t)/1000;
      if(dt>0){ run.recentPace = (dt/(d/1000)); } // sec/km 순간
    }
  }
  run.lastPos = p; run.path.push([p.lat,p.lon]);
}
function onPosErr(){ setGps('weak','GPS 신호 대기'); }
function setGps(cls,txt){ const d=$('#gpsDot'); d.className='gpsdot '+(cls==='ok'?'ok':'weak'); $('#gpsText').textContent=txt; }

function tick(){
  if(!run.active) return;
  if(!run.paused) run.elapsed = (Date.now()-run.startTs)/1000;
  const km = run.dist/1000;
  const avg = km>0 ? run.elapsed/km : 0;
  const cad = run.cadWindow.length>=2 ? Math.round(run.cadWindow.length/((run.cadWindow[run.cadWindow.length-1]-run.cadWindow[0])/60000)) : 0;
  $('#liveTime').textContent = fmtDuration(run.elapsed);
  $('#liveDist').textContent = km.toFixed(2);
  $('#liveAvg').textContent  = fmtPace(avg);
  $('#liveCad').textContent  = cad>60&&cad<260? cad : '--';
  // 순간 페이스: 최근값과 평균 블렌드
  const cur = run.recentPace? (run.recentPace*0.6+avg*0.4) : avg;
  $('#livePace').textContent = km>0.05? fmtPace(cur) : '--:--';
}

function pauseRun(){
  run.paused = !run.paused;
  if(run.paused){ run.pausedAt=Date.now(); $('#btnRunPause').textContent='▶︎ 재개'; }
  else { run.startTs += (Date.now()-run.pausedAt); $('#btnRunPause').textContent='⏸ 일시정지'; run.lastPos=null; }
}

async function stopRun(){
  run.active=false;
  if(run.watchId!=null) navigator.geolocation.clearWatch(run.watchId);
  clearInterval(run.timer);
  window.removeEventListener('devicemotion', run.motionHandler);
  try{ if(run.wakeLock){ run.wakeLock.release(); run.wakeLock=null; } }catch(e){}

  const km = +(run.dist/1000).toFixed(2);
  const dur = Math.round(run.elapsed);
  const cad = run.cadWindow.length>=2 ? Math.round(run.cadWindow.length/((run.cadWindow[run.cadWindow.length-1]-run.cadWindow[0])/60000)) : null;

  $('#btnRunStart').classList.remove('hidden');
  $('#btnRunPause').classList.add('hidden');
  $('#btnRunStop').classList.add('hidden');
  $('#btnRunPause').textContent='⏸ 일시정지';
  ['livePace','liveTime','liveDist','liveCad','liveAvg'].forEach(id=>{});

  if(km<0.05){ toast('거리가 너무 짧아 저장하지 않았어요'); resetLive(); return; }

  const rec = {
    id:uid(), date:new Date().toISOString(), source:'live',
    type:$('#runType').value, distanceKm:km, durationSec:dur,
    avgPaceSec: km>0? dur/km : null, cadence: cad, shoeId:$('#runShoe').value||null,
    notes:'실시간 측정'
  };
  await DB.put('records', rec);
  state.records.unshift(rec);

  // 러닝화 마일리지 반영
  if(rec.shoeId){
    const shoe = state.shoes.find(s=>s.id===rec.shoeId);
    if(shoe){ shoe.totalKm = (shoe.totalKm||0)+km; await DB.put('shoes', shoe); }
  }
  recompute(); resetLive();
  toast(`러닝 저장! ${km.toFixed(2)}km · ${fmtDuration(dur)}`);
  go('home');
}
function resetLive(){
  $('#livePace').textContent='--:--'; $('#liveTime').textContent='00:00';
  $('#liveDist').textContent='0.00'; $('#liveCad').textContent='--'; $('#liveAvg').textContent='--:--';
  setGps('','GPS 대기중');
}
$('#btnRunStart').onclick = startRun;
$('#btnRunPause').onclick = pauseRun;
$('#btnRunStop').onclick  = ()=>{ if(confirm('러닝을 종료하고 저장할까요?')) stopRun(); };

/* ============================================================
   러닝화 마일리지
   ============================================================ */
function renderShoes(){
  const box = $('#shoeList');
  if(!state.shoes.length){ box.innerHTML=`<div class="card"><div class="empty"><div class="big">👟</div>등록된 러닝화가 없습니다.<br>추가 버튼으로 신발을 등록하세요.</div></div>`; return; }
  box.innerHTML = state.shoes.map(s=>{
    const km=s.totalKm||0, max=s.maxKm||700, pct=clamp(km/max*100,0,100);
    const cls = pct>90?'bad':pct>75?'warn':'';
    const status = s.retired?'<span class="tag rest">은퇴</span>'
      : pct>90?'<span style="color:var(--bad);font-weight:700">교체 권장</span>'
      : pct>75?'<span style="color:var(--acc2);font-weight:700">교체 임박</span>':'';
    return `<div class="shoe" data-id="${s.id}">
      <div class="top"><div><div class="name">👟 ${s.name}</div><div class="brand">${s.brand||''} ${s.model||''}</div></div>${status}</div>
      <div class="bar ${cls}"><i style="width:${pct}%"></i></div>
      <div class="km"><span>${km.toFixed(1)} km</span><span>수명 ${max}km</span></div>
    </div>`;
  }).join('');
  $$('.shoe',box).forEach(el=> el.addEventListener('click',()=>editShoe(el.dataset.id)));
}
function editShoe(id){
  const s = id? state.shoes.find(x=>x.id===id) : {id:uid(), maxKm:700, totalKm:0};
  openSheet(`
    <h3>${id?'러닝화 편집':'러닝화 추가'}</h3>
    <label class="f">이름 (별칭)</label><input id="s_name" value="${s.name||''}" placeholder="예: 데일리 트레이너">
    <div class="inline">
      <div><label class="f">브랜드</label><input id="s_brand" value="${s.brand||''}" placeholder="Nike"></div>
      <div><label class="f">모델</label><input id="s_model" value="${s.model||''}" placeholder="Pegasus 41"></div>
    </div>
    <div class="inline">
      <div><label class="f">누적 거리(km)</label><input type="number" step="0.1" id="s_km" value="${s.totalKm||0}"></div>
      <div><label class="f">권장 수명(km)</label><input type="number" id="s_max" value="${s.maxKm||700}"></div>
    </div>
    <label class="f"><input type="checkbox" id="s_ret" ${s.retired?'checked':''} style="width:auto;vertical-align:middle"> 은퇴 처리</label>
    <div class="row" style="margin-top:14px">
      ${id?'<button class="btn danger" id="s_del">삭제</button>':''}
      <button class="btn primary block" id="s_save">저장</button>
    </div>`);
  $('#s_save').onclick = async ()=>{
    const shoe = { ...s, name:$('#s_name').value.trim()||'러닝화', brand:$('#s_brand').value.trim(),
      model:$('#s_model').value.trim(), totalKm:parseFloat($('#s_km').value)||0,
      maxKm:parseInt($('#s_max').value)||700, retired:$('#s_ret').checked };
    await DB.put('shoes', shoe);
    const i=state.shoes.findIndex(x=>x.id===shoe.id); if(i>=0)state.shoes[i]=shoe; else state.shoes.push(shoe);
    renderShoes(); closeSheet(); toast('저장됨');
  };
  if(id) $('#s_del').onclick = async ()=>{ await DB.del('shoes',id); state.shoes=state.shoes.filter(x=>x.id!==id); renderShoes(); closeSheet(); toast('삭제됨'); };
}
$('#btnAddShoe').onclick = ()=>editShoe(null);

/* ============================================================
   심층 분석
   ============================================================ */
function renderAnalysis(){
  const m = state.metrics;
  drawZoneChart(); drawPaceChart(); renderReport(); renderStorage();
}
function drawZoneChart(){
  const cv=$('#chartZone'); if(!cv) return; const {ctx,w,h}=setupCanvas(cv);
  const z=state.metrics.zoneDist, tot=state.metrics.zTot;
  if(!tot){ ctx.fillStyle='#6b7d94'; ctx.font='12px -apple-system'; ctx.textAlign='center'; ctx.fillText('데이터가 쌓이면 표시됩니다', w/2,h/2); $('#zoneLegend').innerHTML=''; return; }
  const segs=[['저강도(이지·LSD·회복)',z.low,'#4aa8ff'],['중강도(템포)',z.mid,'#ffb03d'],['고강도(인터벌·NSM)',z.high,'#ff5d6c']];
  let x=20; const bw=w-40, y=h/2-22, bh=30;
  segs.forEach(([,v,c])=>{ const seg=v/tot*bw; ctx.fillStyle=c; roundRect(ctx,x,y,Math.max(seg-1,0),bh,4); ctx.fill(); x+=seg; });
  $('#zoneLegend').innerHTML = segs.map(([n,v,c])=>`<span class="pill" style="border-color:${c}55"><span style="color:${c}">●</span> ${n} ${Math.round(v/tot*100)}%</span>`).join('');
}
function drawPaceChart(){
  const cv=$('#chartPace'); if(!cv) return; const {ctx,w,h}=setupCanvas(cv);
  const data=state.metrics.paceTrend;
  if(data.length<2){ ctx.fillStyle='#6b7d94'; ctx.font='12px -apple-system'; ctx.textAlign='center'; ctx.fillText('이지런 기록이 2개 이상이면 표시됩니다', w/2,h/2); return; }
  const paces=data.map(d=>d.pace); const min=Math.min(...paces)-10, max=Math.max(...paces)+10;
  const pad=26; const px=(i)=>pad+i/(data.length-1)*(w-pad*2); const py=(p)=>pad+ (p-min)/(max-min)*(h-pad*2);
  // area
  ctx.beginPath(); data.forEach((d,i)=>{ const x=px(i),y=py(d.pace); i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.lineTo(px(data.length-1),h-pad); ctx.lineTo(px(0),h-pad); ctx.closePath();
  const g=ctx.createLinearGradient(0,pad,0,h); g.addColorStop(0,'#4aa8ff44'); g.addColorStop(1,'#4aa8ff00'); ctx.fillStyle=g; ctx.fill();
  ctx.beginPath(); data.forEach((d,i)=>{ const x=px(i),y=py(d.pace); i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.strokeStyle='#4aa8ff'; ctx.lineWidth=2; ctx.stroke();
  data.forEach((d,i)=>{ const x=px(i),y=py(d.pace); ctx.fillStyle='#4aa8ff'; ctx.beginPath(); ctx.arc(x,y,2.5,0,7); ctx.fill(); });
  ctx.fillStyle='#6b7d94'; ctx.font='9px -apple-system'; ctx.textAlign='left';
  ctx.fillText(fmtPace(min)+'/km', 2, pad+3); ctx.fillText(fmtPace(max)+'/km', 2, h-pad+3);
}
function renderReport(){
  const m=state.metrics; const box=$('#reportBox');
  if(!m.count){ box.innerHTML=`<div class="empty">기록을 첨부하면 리포트가 생성됩니다.</div>`; return; }
  const a=m.acwr;
  const risk = a<0.8?['badge-warn','부하 낮음']:a<=1.3?['badge-ok','최적']:a<=1.5?['badge-warn','주의']:['badge-bad','위험'];
  const rows=[
    ['총 기록', `${m.count}회`],
    ['최근 7일 거리', `${m.km7.toFixed(1)} km`],
    ['최근 4주 평균/주', `${m.chronicWeekly.toFixed(1)} km`],
    ['급성:만성 부하비(ACWR)', `${a?a.toFixed(2):'-'} <span class="riskbadge ${risk[0]}">${risk[1]}</span>`],
    ['추정 VDOT', m.vdot??'-'],
    ['추정 5K 페이스', m.pace5k?`${fmtPace(m.pace5k)}/km`:'-'],
  ];
  if(m.vdot){
    rows.push(['예상 10K', fmtDuration(m.racePred['10k'])]);
    rows.push(['예상 하프', fmtDuration(m.racePred['half'])]);
    rows.push(['예상 풀', fmtDuration(m.racePred['full'])]);
  }
  const advice=[];
  if(a>1.5) advice.push('⚠️ 최근 훈련량이 급증했습니다. 이번 주는 회복 위주로 조정하세요.');
  else if(a<0.8&&m.km28>0) advice.push('훈련량이 감소 추세입니다. 점진적으로 늘려도 좋습니다.');
  else if(a) advice.push('✅ 부하가 안전 구간에 있습니다. 10% 룰로 점진적 증량하세요.');
  if(m.zTot){ const hi=m.zoneDist.high/m.zTot; if(hi>0.25) advice.push('고강도 비중이 높습니다. 폴라라이즈드(저강도 80%)를 권장합니다.'); }
  box.innerHTML = rows.map(([k,v])=>`<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')
    + (advice.length?`<div class="hr"></div>`+advice.map(t=>`<div class="note" style="font-size:12px;color:var(--txt)">${t}</div>`).join(''):'');
}
async function renderStorage(){
  const box=$('#storageBox'); let html='';
  if(navigator.storage&&navigator.storage.estimate){
    const est=await navigator.storage.estimate();
    const used=(est.usage/1048576).toFixed(1), quota=(est.quota/1048576).toFixed(0);
    const persisted = navigator.storage.persisted? await navigator.storage.persisted():false;
    html+=`<div class="kv"><span class="k">사용 용량</span><span class="v">${used} MB</span></div>
      <div class="kv"><span class="k">할당 한도</span><span class="v">${(quota/1024).toFixed(1)} GB</span></div>
      <div class="kv"><span class="k">영구 저장</span><span class="v">${persisted?'✅ 보장됨':'⚠️ 미보장'}</span></div>`;
  }
  html+=`<div class="kv"><span class="k">기록 / 러닝화 / 플랜</span><span class="v">${state.records.length} / ${state.shoes.length} / ${Object.keys(state.plans).length}</span></div>`;
  box.innerHTML=html;
}

/* 백업 / 복원 / 초기화 */
$('#btnExport').onclick = async ()=>{
  const files = await DB.all('files');
  const data = { v:1, exportedAt:new Date().toISOString(), records:state.records,
    shoes:state.shoes, plans:state.plans, settings:state.settings, files };
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`runcoach-backup-${isoDay(Date.now())}.json`; a.click(); URL.revokeObjectURL(url);
  toast('백업 파일을 저장했어요');
};
$('#btnImport').onclick = ()=>$('#importInput').click();
$('#importInput').onchange = async (e)=>{
  const f=e.target.files[0]; if(!f) return;
  try{
    const data=JSON.parse(await f.text());
    if(!confirm('현재 데이터를 백업 내용으로 덮어쓸까요?')) return;
    await DB.clear('records'); await DB.clear('shoes'); await DB.clear('plans'); await DB.clear('files');
    for(const r of data.records||[]) await DB.put('records',r);
    for(const s of data.shoes||[]) await DB.put('shoes',s);
    for(const k in (data.plans||{})) await DB.put('plans',data.plans[k]);
    for(const fl of data.files||[]) await DB.put('files',fl);
    if(data.settings){ state.settings=data.settings; localStorage.setItem('rc_settings',JSON.stringify(state.settings)); }
    await loadAll(); toast('복원 완료'); go('home');
  }catch(err){ toast('복원 실패: 파일 확인'); }
  e.target.value='';
};
$('#btnWipe').onclick = async ()=>{
  if(!confirm('모든 데이터를 삭제할까요? 되돌릴 수 없습니다.')) return;
  await DB.clear('records'); await DB.clear('shoes'); await DB.clear('plans'); await DB.clear('files');
  localStorage.removeItem('rc_settings');
  await loadAll(); toast('전체 삭제 완료'); go('home');
};

/* 기록 탭 버튼 */
$('#btnAddFile').onclick = ()=>$('#fileInput').click();
$('#btnAddManual').onclick = ()=>editRecord(null);
$('#btnOcrAll').onclick = ()=>ocrAllImages();
$('#fileInput').onchange = (e)=>{ if(e.target.files.length) handleFiles(e.target.files); e.target.value=''; };
$('#recFilter').onchange = renderRecords;

/* ============================================================
   설정
   ============================================================ */
$('#btnSettings').onclick = ()=>{
  const s=state.settings;
  openSheet(`
    <h3>설정 · 목표</h3>
    <label class="f">목표 대회</label>
    <select id="set_race">
      <option value="5k" ${s.targetRace==='5k'?'selected':''}>5K</option>
      <option value="10k" ${s.targetRace==='10k'?'selected':''}>10K</option>
      <option value="half" ${s.targetRace==='half'?'selected':''}>하프 마라톤</option>
      <option value="full" ${s.targetRace==='full'?'selected':''}>풀 마라톤</option>
    </select>
    <label class="f">목표 대회일 (선택 · 주기화에 사용)</label>
    <input type="date" id="set_race_date" value="${s.raceDate||''}">
    <div class="inline">
      <div><label class="f">주간 목표 거리 (km)</label><input type="number" id="set_goal" value="${s.weeklyGoalKm}"></div>
      <div><label class="f">최대심박 (bpm)</label><input type="number" id="set_maxhr" value="${s.maxHR||190}"></div>
    </div>
    <label class="f">체중 (kg)</label>
    <input type="number" id="set_wt" value="${s.weightKg}">
    <div class="note">최대심박은 이지런/롱런 심박 상한(60~70%) 계산에 쓰입니다. 모르면 대략 220-나이로 넣어도 됩니다.</div>
    <div class="hr"></div>
    <button class="btn block" id="set_shoes">👟 러닝화 관리</button>
    <div style="height:10px"></div>
    <button class="btn primary block" id="set_save">저장</button>
    <div class="note">앱 데이터는 이 기기에만 저장됩니다(IndexedDB). 홈 화면에 추가하면 오프라인에서도 동작해요.</div>
  `);
  $('#set_shoes').onclick=()=>{ closeSheet(); go('shoes'); };
  $('#set_save').onclick=()=>{
    state.settings.targetRace=$('#set_race').value;
    state.settings.weeklyGoalKm=parseInt($('#set_goal').value)||40;
    state.settings.weightKg=parseInt($('#set_wt').value)||65;
    state.settings.maxHR=parseInt($('#set_maxhr').value)||190;
    state.settings.raceDate=$('#set_race_date').value||'';
    localStorage.setItem('rc_settings',JSON.stringify(state.settings));
    recompute(); closeSheet(); renderHome(); toast('설정 저장됨');
  };
};

/* ============================================================
   부팅
   ============================================================ */
async function loadAll(){
  state.records = (await DB.all('records')).sort((a,b)=>new Date(b.date)-new Date(a.date));
  state.shoes   = await DB.all('shoes');
  state.plans   = {};
  (await DB.all('plans')).forEach(p=> state.plans[p.weekStart]=p);
  recompute();
}

async function boot(){
  await DB.init();
  try{ const s=localStorage.getItem('rc_settings'); if(s) state.settings=Object.assign(state.settings,JSON.parse(s)); }catch(e){}
  await loadAll();
  // 영구 저장 요청 (데이터 보존)
  if(navigator.storage&&navigator.storage.persist){ try{ await navigator.storage.persist(); }catch(e){} }
  // 서비스워커
  if('serviceWorker' in navigator){ try{ const reg=await navigator.serviceWorker.register('sw.js'); reg.update&&reg.update(); }catch(e){} }
  go('home');
  // 첫 실행 안내
  if(!state.records.length){
    setTimeout(()=> toast('러닝 기록을 첨부해 시작해 보세요 📎'), 800);
  }
}
window.go = go;
boot();
