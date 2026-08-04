/* ============================================================
   런코치 (RunCoach) - 마라톤 러닝 코치 PWA
   저장: IndexedDB(기록/러닝화/플랜/파일) + localStorage(설정)
   ============================================================ */

'use strict';

/* 앱 버전 (sw.js 캐시 버전과 동일하게 유지) */
const APP_VERSION = 'v23';

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
    raceDate: '',            // 목표 대회일 (YYYY-MM-DD, 선택)
    planStyle: 'nsm',        // 'nsm'=NSM 중심 / 'mixed'=인터벌·템포·LSD 등 다양한 훈련
    voice: {                 // 러닝 중 음성 안내
      enabled: true,
      pace: true,            // 현재 페이스
      lapPace: true,         // 구간(인터벌) 페이스
      cadence: true,         // 케이던스
      hr: false,             // 심박(센서 연결 시)
      distance: true,        // 누적 거리
      time: false,           // 경과 시간
      periodicKm: 1,         // N km마다 자동 안내(0=끄기)
      voiceURI: '',          // 선택한 음성(기기별)
      rate: 0.92,            // 말하기 속도(0.7~1.3, 낮을수록 천천히)
      pitch: 1.15            // 음높이(0.7~1.4, 높을수록 부드러운 느낌)
    }
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
function closeSheet(){ $('#modal').classList.remove('open'); if('speechSynthesis' in window) speechSynthesis.cancel(); }
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
function classifyRun({distanceKm, avgPaceSec, avgHr, durationSec, hint, phases}){
  const kw = keywordType(hint); if(kw) return kw;
  // 단계(워밍업/러닝/회복/쿨다운) 화면이면 인터벌 vs NSM 판정
  if(phases && isPhaseWorkout(phases)){
    const zz = state.metrics && state.metrics.zones;
    const works = phases.filter(p=>p.kind==='work' && p.pace);
    const wp = works.length ? median(works.map(w=>w.pace)) : (avgPaceSec||null);
    const avgWorkMin = works.length ? (works.reduce((s,w)=>s+w.tSec,0)/works.length)/60 : 0;
    if(zz && wp){
      const di = zz.interval ? Math.abs(wp-zz.interval) : 1e9;
      const dn = zz.nsm ? Math.abs(wp-zz.nsm) : 1e9;
      const dt = zz.tempo ? Math.abs(wp-zz.tempo) : 1e9;
      if(dn<=di && dn<=dt) return 'nsm';           // 서브스레숄드에 가장 가까움
      if(dt<di && avgWorkMin>=4) return 'nsm';     // 긴 반복(4분↑) + 템포 근처 → NSM
      return 'interval';
    }
    return avgWorkMin>=4 ? 'nsm' : 'interval';
  }
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
  // 범위(운동 세부사항 화면): 심박/케이던스/페이스 min~max
  let r;
  r = t.match(/(\d{2,3})\s*[~〜―–—\-]\s*(\d{2,3})\s*b\s*p\s*m/i);
  if(r){ const a=+r[1],b=+r[2]; if(a>=50&&b<=230){ out.hrMin=Math.min(a,b); out.hrMax=Math.max(a,b); } }
  r = t.match(/(\d{2,3})\s*[~〜―–—\-]\s*(\d{2,3})\s*s\s*p\s*m/i);
  if(r){ const a=+r[1],b=+r[2]; if(a>=100&&b<=260){ out.cadMin=Math.min(a,b); out.cadMax=Math.max(a,b); } }
  r = t.match(/(\d{1,2})\s*['’‘`´′:]\s*(\d{2})\s*["”“''′″]?\s*[~〜―–—\-]\s*(\d{1,2})\s*['’‘`´′:]\s*(\d{2})/);
  if(r){ const p1=(+r[1])*60+(+r[2]), p2=(+r[3])*60+(+r[4]);
    if(p1>=120&&p1<=1200&&p2>=120&&p2<=1200){ out.paceSlow=Math.max(p1,p2); out.paceFast=Math.min(p1,p2); } }
  // 파생: 페이스<->시간/거리
  if(out.distanceKm && out.durationSec && !out.avgPaceSec) out.avgPaceSec = out.durationSec / out.distanceKm;
  if(out.distanceKm && out.avgPaceSec && !out.durationSec) out.durationSec = Math.round(out.avgPaceSec * out.distanceKm);
  return out;
}

/* 스플릿(구간) 표 파싱: "1 04:50 4'50"/KM 155BPM 175SPM" 행들을 추출 */
function parseSplits(text){
  // 줄 단위 관대한 파서: 한 줄에 '구간시간(mm:ss)'과 '페이스(m'ss")'가 있으면 스플릿 행으로 인식
  // (BPM/SPM 글자를 OCR이 틀려도 인식되도록, 심박·케이던스는 있으면 채움)
  const rows = [];
  const lines = (text||'').replace(/\u00A0/g,' ').split(/[\n\r]+/);
  for(const raw of lines){
    const line = raw.trim(); if(!line || rows.length>=80) continue;
    // 시간형 토큰(m:ss / m'ss" 등) 모두 추출
    const toks = [...line.matchAll(/(\d{1,2})\s*[:'’‘`´′″"]\s*(\d{2})(?!\d)/g)];
    if(toks.length < 2) continue;                 // 시간 + 페이스, 최소 2개 필요
    const tSec = (+toks[0][1])*60 + (+toks[0][2]); // 첫 토큰 = 구간 시간
    const pace = (+toks[1][1])*60 + (+toks[1][2]); // 둘째 토큰 = 페이스
    if(!(tSec>=15 && tSec<=1200 && pace>=120 && pace<=1200)) continue;
    // 심박(bpm)·케이던스(spm): 라벨이 있으면 우선, 없으면 남은 2~3자리 숫자로 추정
    let hr=null, cad=null;
    const bpm = line.match(/(\d{2,3})\s*b\s*p\s*m/i); if(bpm) hr=+bpm[1];
    const spm = line.match(/(\d{2,3})\s*s\s*p\s*m/i); if(spm) cad=+spm[1];
    if(hr==null || cad==null){
      const nums=[...line.matchAll(/(\d{2,3})(?!\d)/g)].map(x=>+x[1])
        .filter(n=>n>=90 && n<=210);               // 심박/케이던스 대역
      for(const n of nums){
        if(hr==null && n>=90 && n<=200){ hr=n; continue; }
        if(cad==null && n>=120 && n<=210){ cad=n; }
      }
    }
    rows.push({ tSec, pace, hr, cad, km:+((tSec/pace).toFixed(3)) });
  }
  return rows;
}
/* 인터벌/NSM '단계' 화면 파싱: 워밍업 / 러닝(반복) / 회복 / 쿨다운 라벨 행 추출
   행 예: "워밍업 16:04.7 3.00 5:22" · "1 러닝 3:00.0 0.61 4:57" · "체력 회복 1:00.0 0.18 5:36" */
function parseIntervalPhases(text){
  const lines = (text||'').replace(/\u00A0/g,' ').split(/[\n\r]+/);
  const phases = []; let repIdx = 0;
  for(const raw of lines){
    const line = raw.trim(); if(!line || phases.length>=60) continue;
    let kind = null;
    if(/워\s*밍\s*업|warm/i.test(line)) kind='warmup';
    else if(/쿨\s*다운|cool/i.test(line)) kind='cooldown';
    else if(/회\s*복|휴\s*식|조\s*깅|recover|rest/i.test(line)) kind='recovery';
    else if(/러\s*닝|구\s*간|인\s*터\s*벌|반\s*복|run(?!way)|interval|work|lap/i.test(line)) kind='work';
    if(!kind) continue;
    // 시간형 토큰(m:ss[.d]) 모두 추출 → 첫 토큰=구간시간, 마지막=페이스
    const times = [...line.matchAll(/(\d{1,2})\s*:\s*(\d{2})(?:\.\d)?/g)];
    if(!times.length) continue;
    const tSec = (+times[0][1])*60 + (+times[0][2]);
    if(!(tSec>=3 && tSec<=3600)) continue;
    const pace = times.length>=2 ? (+times[times.length-1][1])*60 + (+times[times.length-1][2]) : null;
    // 거리: 시간 토큰 제거 후 남은 소수(x.xx)  (룩비하인드 없이 iOS 호환)
    const rest = line.replace(/(\d{1,2})\s*:\s*(\d{2})(?:\.\d)?/g, ' ');
    const dm = rest.match(/(\d{1,3}\.\d{1,2})/);
    const distanceKm = dm ? parseFloat(dm[1]) : null;
    if(kind==='work') repIdx++;
    const label = kind==='work' ? `러닝 ${repIdx}` : kind==='warmup' ? '워밍업' : kind==='cooldown' ? '쿨다운' : '회복';
    phases.push({ kind, label, tSec, pace, distanceKm });
  }
  return phases;
}
/* 단계 화면인지 판별 (러닝 반복 2회 이상 + 총 3단계 이상) */
function isPhaseWorkout(phases){
  return phases.length>=3 && phases.filter(p=>p.kind==='work').length>=2;
}
/* 단계에서 총합 역산 */
function phasesTotals(ph){
  const durationSec = ph.reduce((s,x)=>s+(x.tSec||0),0);
  const dists = ph.map(x=>x.distanceKm).filter(v=>v!=null);
  const distanceKm = dists.length ? +dists.reduce((a,b)=>a+b,0).toFixed(2) : null;
  const avgPaceSec = (distanceKm && durationSec) ? Math.round(durationSec/distanceKm) : null;
  return { durationSec, distanceKm, avgPaceSec };
}
/* 스플릿에서 총합 역산 */
function splitsTotals(sp){
  const n = sp.length;
  const durationSec = sp.reduce((s,x)=>s+x.tSec,0);        // 총시간 = 구간 시간 합(견고)
  // 애플 스플릿은 각 구간=정확히 1.00km, 마지막만 부분 → 페이스 OCR 오류에 안 흔들리게 계산
  const last = sp[n-1];
  const lastFrac = (last && last.pace) ? Math.min(1.0, Math.max(0.05, last.tSec/last.pace)) : 1.0;
  const distanceKm = +((n-1) + lastFrac).toFixed(2);
  const avgPaceSec = distanceKm? Math.round(durationSec/distanceKm) : null;
  const wavg = (f)=>{ const r=sp.filter(x=>x[f]!=null); if(!r.length) return null;
    const w=r.reduce((s,x)=>s+x.tSec,0); return w? Math.round(r.reduce((s,x)=>s+x[f]*x.tSec,0)/w):null; };
  return { durationSec, distanceKm, avgPaceSec, avgHr:wavg('hr'), cadence:wavg('cad') };
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
/* OCR 전처리: 그레이스케일 → 어두운 배경 반전 → 대비 강화 → 업스케일
   (애플 피트니스처럼 '검은 배경 + 컬러 숫자'는 그대로면 인식률이 낮음) */
function preprocessForOCR(dataUrl){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=>{
      try{
        const targetW = 1600;
        const scale = img.width < targetW ? Math.min(targetW/img.width, 2.5) : 1;
        const w = Math.round(img.width*scale), h = Math.round(img.height*scale);
        const cv = document.createElement('canvas'); cv.width=w; cv.height=h;
        const ctx = cv.getContext('2d', { willReadFrequently:true });
        ctx.drawImage(img, 0, 0, w, h);
        const id = ctx.getImageData(0,0,w,h), d = id.data;
        let sum=0; for(let i=0;i<d.length;i+=4){ sum += 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; }
        const dark = (sum/(d.length/4)) < 128;     // 배경이 어두우면 반전
        const contrast = 1.7, mid = 128;
        for(let i=0;i<d.length;i+=4){
          let g = 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
          if(dark) g = 255 - g;
          g = (g - mid)*contrast + mid;
          g = g<0?0:g>255?255:g;
          d[i]=d[i+1]=d[i+2]=g;
        }
        ctx.putImageData(id,0,0);
        resolve(cv.toDataURL('image/png'));
      }catch(e){ resolve(dataUrl); }
    };
    img.onerror = ()=> resolve(dataUrl);
    img.src = dataUrl;
  });
}
async function ocrImage(dataUrl){
  await ensureOCR();
  let src = dataUrl;
  try{ src = await preprocessForOCR(dataUrl); }catch(e){}
  // 한국어+영어: '7월 13일' 같은 날짜와 라벨까지 인식
  const { data } = await Tesseract.recognize(src, 'kor+eng');
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
  ['distanceKm','durationSec','avgPaceSec','avgHr','cadence','hrMin','hrMax','cadMin','cadMax','paceFast','paceSlow'].forEach(k=>{
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

/* GPX / TCX / FIT 파싱 (Amazfit Active 3 · Zepp 내보내기 대응) */
function xmlLocalAll(root, name){
  return Array.from(root.getElementsByTagName('*')).filter(el => el.localName === name);
}
function xmlLocalOne(root, name){
  return xmlLocalAll(root, name)[0] || null;
}
function xmlLocalText(root, name){
  const el = xmlLocalOne(root, name);
  return el ? (el.textContent || '').trim() : '';
}
function xmlLocalNum(root, name){
  const t = xmlLocalText(root, name); if(!t) return null;
  const n = +t; return Number.isFinite(n) ? n : null;
}

/* GPX 파싱 — 네임스페이스·확장(HR/CAD)·rtept 지원 */
function parseGPX(xmlText){
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if(doc.querySelector('parsererror')) return null;
  let pts = xmlLocalAll(doc, 'trkpt');
  if(pts.length < 2) pts = xmlLocalAll(doc, 'rtept');
  if(pts.length < 2) return null;
  const points = pts.map(p=>{
    const lat = +p.getAttribute('lat'), lon = +p.getAttribute('lon');
    const time = xmlLocalText(p, 'time') || null;
    let hr = xmlLocalNum(p, 'hr');
    let cad = xmlLocalNum(p, 'cad');
    // 일부 파일은 extensions 안 태그명이 다름
    if(hr==null){ const h = xmlLocalOne(p, 'heartrate') || xmlLocalOne(p, 'HeartRate'); if(h) hr = +h.textContent; }
    return { lat, lon, time, hr: (hr>0&&hr<250)?hr:null, cad: (cad>0&&cad<300)?cad:null };
  }).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
  if(points.length < 2) return null;
  let dist=0; for(let i=1;i<points.length;i++) dist += haversine(points[i-1], points[i]);
  const t0 = points.find(p=>p.time)?.time;
  const t1 = [...points].reverse().find(p=>p.time)?.time;
  let dur = (t0&&t1) ? (new Date(t1)-new Date(t0))/1000 : null;
  if(!(dur>0)) dur = null;
  const hrs = points.map(p=>p.hr).filter(v=>v!=null);
  const cads = points.map(p=>p.cad).filter(v=>v!=null);
  // GPX TrackPointExtension cad: Amazfit/Garmin은 종종 SPM/2 → 중앙값이 낮으면 ×2
  let cadence = cads.length ? Math.round(cads.reduce((a,b)=>a+b,0)/cads.length) : null;
  if(cadence!=null && cadence < 90) cadence = Math.round(cadence * 2);
  const km = dist/1000;
  if(!(km>0.01) && !(dur>0)) return null;
  return {
    distanceKm: km>0 ? +km.toFixed(2) : null,
    durationSec: dur ? Math.round(dur) : null,
    avgPaceSec: (dur&&km) ? dur/km : null,
    avgHr: hrs.length ? Math.round(hrs.reduce((a,b)=>a+b,0)/hrs.length) : null,
    cadence,
    date: t0 || new Date().toISOString(),
    path: downsamplePath(points.map(p=>[p.lat,p.lon]), 2000)
  };
}

/* TCX 파싱 — Lap 요약 + Trackpoint 폴백, RunCadence(러닝 SPM) 지원 */
function parseTCX(xmlText){
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if(doc.querySelector('parsererror')) return null;
  const laps = xmlLocalAll(doc, 'Lap');
  let dist=0, dur=0;
  laps.forEach(l=>{
    dist += xmlLocalNum(l, 'DistanceMeters') || 0;
    dur  += xmlLocalNum(l, 'TotalTimeSeconds') || 0;
  });
  // Lap 거리가 비면 트랙포인트로 보정
  const tps = xmlLocalAll(doc, 'Trackpoint');
  if(!(dist>0) && tps.length >= 2){
    let last = null;
    tps.forEach(tp=>{
      const lat = xmlLocalNum(tp, 'LatitudeDegrees');
      const lon = xmlLocalNum(tp, 'LongitudeDegrees');
      if(lat==null || lon==null) return;
      const p = { lat, lon };
      if(last) dist += haversine(last, p);
      last = p;
      const dm = xmlLocalNum(tp, 'DistanceMeters');
      if(dm!=null && dm > dist) dist = dm;
    });
  }
  if(!(dur>0) && tps.length >= 2){
    const tFirst = xmlLocalText(tps[0], 'Time');
    const tLast  = xmlLocalText(tps[tps.length-1], 'Time');
    if(tFirst && tLast) dur = (new Date(tLast)-new Date(tFirst))/1000;
  }
  let hrSum=0, hrN=0, cadSum=0, cadN=0, runCad=false;
  xmlLocalAll(doc, 'HeartRateBpm').forEach(h=>{
    const v = xmlLocalNum(h, 'Value') ?? (+h.textContent||null);
    if(v>0 && v<250){ hrSum+=v; hrN++; }
  });
  // 러닝: Extensions/RunCadence 가 SPM. Cadence 태그는 사이클링 rpm 인 경우가 많음
  xmlLocalAll(doc, 'RunCadence').forEach(c=>{
    const v = +c.textContent; if(v>0 && v<300){ cadSum+=v; cadN++; runCad=true; }
  });
  if(!cadN){
    xmlLocalAll(doc, 'Cadence').forEach(c=>{
      const v = +c.textContent; if(v>0 && v<300){ cadSum+=v; cadN++; }
    });
  }
  let cadence = cadN ? Math.round(cadSum/cadN) : null;
  if(cadence!=null && !runCad && cadence < 90) cadence = Math.round(cadence * 2);
  const act = xmlLocalOne(doc, 'Activity');
  const t0 = xmlLocalText(doc, 'Id')
    || (act && act.getAttribute && act.getAttribute('Id'))
    || xmlLocalText(doc, 'Time')
    || (laps[0] && laps[0].getAttribute && laps[0].getAttribute('StartTime'))
    || '';
  const km = dist/1000;
  if(!(km>0.01) && !(dur>0)) return null;
  return {
    distanceKm: km>0 ? +km.toFixed(2) : null,
    durationSec: dur>0 ? Math.round(dur) : null,
    avgPaceSec: (dur>0 && km>0) ? dur/km : null,
    avgHr: hrN ? Math.round(hrSum/hrN) : null,
    cadence,
    date: t0 || new Date().toISOString()
  };
}

/* ── FIT 바이너리 파서 (세션/랩/레코드 요약 · Amazfit/Zepp) ── */
const FIT_EPOCH_MS = Date.UTC(1989, 11, 31, 0, 0, 0);
function fitReadValue(dv, offset, size, baseType, little){
  const t = baseType & 0x1F;
  try{
    if(t===0 || t===2 || t===10 || t===13){ // enum/uint8/uint8z/byte
      if(size===1){ const v=dv.getUint8(offset); return v===0xFF?null:v; }
      return null;
    }
    if(t===1){ const v=dv.getInt8(offset); return v===0x7F?null:v; }
    if(t===3 || t===4){ // sint16 / uint16 (+z)
      if(size<2) return null;
      if(t===3){ const v=dv.getInt16(offset,little); return v===0x7FFF?null:v; }
      const v=dv.getUint16(offset,little); return v===0xFFFF?null:v;
    }
    if(t===5 || t===6 || t===11 || t===12){ // sint32/uint32 (+z)
      if(size<4) return null;
      if(t===5){ const v=dv.getInt32(offset,little); return v===0x7FFFFFFF?null:v; }
      const v=dv.getUint32(offset,little); return v===0xFFFFFFFF?null:v;
    }
    if(t===7){ // string
      let s=''; for(let i=0;i<size;i++){ const c=dv.getUint8(offset+i); if(!c) break; s+=String.fromCharCode(c); }
      return s || null;
    }
    if(t===8){ if(size<4) return null; const v=dv.getFloat32(offset,little); return Number.isFinite(v)?v:null; }
    if(t===9){ if(size<8) return null; const v=dv.getFloat64(offset,little); return Number.isFinite(v)?v:null; }
  }catch(e){ return null; }
  return null;
}
function parseFIT(buf){
  try{
    const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer||buf);
    if(u8.length < 14) return null;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const headerSize = u8[0];
    if(headerSize < 12 || headerSize > 64) return null;
    const dataSize = dv.getUint32(4, true);
    const dataEnd = Math.min(headerSize + dataSize, u8.length);
    let offset = headerSize;
    const defs = Object.create(null);
    let session = null;
    const laps = [];
    const records = [];

    while(offset < dataEnd){
      const hdr = u8[offset++];
      if(hdr & 0x80){
        // compressed timestamp header
        const localId = (hdr >> 5) & 0x03;
        const def = defs[localId];
        if(!def) break;
        const msg = {};
        for(const f of def.fields){
          msg[f.num] = fitReadValue(dv, offset, f.size, f.baseType, def.little);
          offset += f.size;
          if(offset > dataEnd) break;
        }
        if(def.devSize) offset += def.devSize;
        if(def.global === 20) records.push(msg);
        else if(def.global === 19) laps.push(msg);
        else if(def.global === 18) session = msg;
        continue;
      }
      const localId = hdr & 0x0F;
      const isDef = !!(hdr & 0x40);
      const hasDev = !!(hdr & 0x20);
      if(isDef){
        if(offset + 5 > dataEnd) break;
        offset++; // reserved
        const arch = u8[offset++];
        const little = arch === 0;
        const global = little ? dv.getUint16(offset, true) : dv.getUint16(offset, false);
        offset += 2;
        const nFields = u8[offset++];
        const fields = [];
        let fieldBytes = 0;
        for(let i=0;i<nFields;i++){
          if(offset+3 > dataEnd) break;
          const num = u8[offset++], size = u8[offset++], baseType = u8[offset++];
          fields.push({ num, size, baseType });
          fieldBytes += size;
        }
        let devSize = 0;
        if(hasDev){
          if(offset >= dataEnd) break;
          const nDev = u8[offset++];
          for(let i=0;i<nDev;i++){
            if(offset+3 > dataEnd) break;
            offset++; // field num
            const size = u8[offset++];
            offset++; // dev data index
            devSize += size;
          }
        }
        defs[localId] = { global, fields, little, devSize };
      } else {
        const def = defs[localId];
        if(!def) break;
        const msg = {};
        for(const f of def.fields){
          msg[f.num] = fitReadValue(dv, offset, f.size, f.baseType, def.little);
          offset += f.size;
          if(offset > dataEnd) break;
        }
        if(def.devSize) offset += def.devSize;
        if(def.global === 18) session = msg;
        else if(def.global === 19) laps.push(msg);
        else if(def.global === 20) records.push(msg);
      }
    }

    // Session 우선, 없으면 Lap/Record 합산
    let distM=null, durSec=null, avgHr=null, cadence=null, startMs=null, sport=null;
    const applySession = (s)=>{
      if(!s) return;
      if(s[5]!=null) sport = s[5];
      if(s[2]!=null) startMs = FIT_EPOCH_MS + s[2]*1000;
      // total_timer_time / total_elapsed_time: scale 1000
      const tTimer = s[8]!=null ? s[8]/1000 : null;
      const tElap  = s[7]!=null ? s[7]/1000 : null;
      durSec = tTimer || tElap;
      if(s[9]!=null) distM = s[9]/100; // scale 100 → meters
      if(s[16]!=null) avgHr = s[16];
      // avg_running_cadence(21) 우선, 없으면 avg_cadence(17)
      if(s[21]!=null) cadence = s[21];
      else if(s[17]!=null){
        cadence = s[17];
        if(sport===1 || sport===11 || cadence < 90) cadence = Math.round(cadence * 2);
      }
    };
    applySession(session);
    if((distM==null || !(distM>0)) && laps.length){
      let d=0, t=0, hrS=0, hrN=0, cadS=0, cadN=0;
      laps.forEach(l=>{
        if(l[9]!=null) d += l[9]/100;
        if(l[8]!=null) t += l[8]/1000;
        else if(l[7]!=null) t += l[7]/1000;
        if(l[16]!=null){ hrS+=l[16]; hrN++; }
        if(l[21]!=null){ cadS+=l[21]; cadN++; }
        else if(l[17]!=null){ cadS+=l[17]*2; cadN++; }
        if(startMs==null && l[2]!=null) startMs = FIT_EPOCH_MS + l[2]*1000;
      });
      if(d>0) distM = d;
      if(t>0) durSec = t;
      if(avgHr==null && hrN) avgHr = Math.round(hrS/hrN);
      if(cadence==null && cadN) cadence = Math.round(cadS/cadN);
    }
    if((distM==null || !(distM>0) || durSec==null) && records.length >= 2){
      const semi = (v)=> v==null?null: v * (180 / 0x80000000);
      let last=null, trackDist=0, maxDistField=0;
      const hrs=[], cads=[];
      let tFirst=null, tLast=null;
      records.forEach(r=>{
        if(r[253]!=null){ if(tFirst==null) tFirst=r[253]; tLast=r[253]; }
        if(r[5]!=null) maxDistField = Math.max(maxDistField, r[5]/100);
        const lat = semi(r[0]), lon = semi(r[1]);
        if(lat!=null && lon!=null){
          const p={lat,lon};
          if(last) trackDist += haversine(last, p);
          last = p;
        }
        if(r[3]!=null) hrs.push(r[3]);
        if(r[4]!=null) cads.push(r[4]);
      });
      if(!(distM>0)) distM = maxDistField || trackDist || null;
      if(!(durSec>0) && tFirst!=null && tLast!=null) durSec = tLast - tFirst;
      if(startMs==null && tFirst!=null) startMs = FIT_EPOCH_MS + tFirst*1000;
      if(avgHr==null && hrs.length) avgHr = Math.round(hrs.reduce((a,b)=>a+b,0)/hrs.length);
      if(cadence==null && cads.length){
        let c = Math.round(cads.reduce((a,b)=>a+b,0)/cads.length);
        if(c < 90) c *= 2;
        cadence = c;
      }
    }
    const km = distM!=null ? distM/1000 : null;
    if(!(km>0.01) && !(durSec>0)) return null;
    return {
      distanceKm: km>0 ? +km.toFixed(2) : null,
      durationSec: durSec>0 ? Math.round(durSec) : null,
      avgPaceSec: (durSec>0 && km>0) ? durSec/km : null,
      avgHr: avgHr>0 ? avgHr : null,
      cadence: cadence>0 ? cadence : null,
      date: startMs ? new Date(startMs).toISOString() : new Date().toISOString()
    };
  }catch(e){ return null; }
}

function isFitBuffer(buf){
  try{
    const u8 = new Uint8Array(buf);
    if(u8.length < 12) return false;
    return u8[8]===0x2E && u8[9]===0x46 && u8[10]===0x49 && u8[11]===0x54; // .FIT
  }catch(e){ return false; }
}

/* 파일 → 기록 후보 */
async function fileToRecord(file){
  const name = file.name || '';
  const lower = name.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  const base = { id:uid(), date:new Date(file.lastModified||Date.now()).toISOString(),
                 source:'file', fileName:name, notes:'', autoType:true };
  const applyParsed = (p)=>{
    if(!p){ Object.assign(base, { type:'easy', needsReview:true, notes:'파일에서 거리/시간을 읽지 못했어요' }); return; }
    Object.assign(base, p, {
      type: classifyRun({ ...p, hint: name + ' amazfit zepp active' }),
      notes: /amazfit|zepp|active\s*3/i.test(name) ? 'Amazfit Active 3' : (base.notes||'')
    });
    if(!(p.distanceKm>0) || !(p.durationSec>0)) base.needsReview = true;
  };

  if(/\.(gpx)$/i.test(lower) || mime.includes('gpx')){
    applyParsed(parseGPX(await file.text()));
  } else if(/\.(tcx)$/i.test(lower) || mime.includes('tcx')){
    applyParsed(parseTCX(await file.text()));
  } else if(/\.(fit)$/i.test(lower) || mime.includes('fit')){
    applyParsed(parseFIT(await file.arrayBuffer()));
  } else if(/\.(txt|csv)$/i.test(lower)){
    const txt = await file.text(); const p = parseTextMetrics(txt);
    Object.assign(base, {distanceKm:p.distanceKm||null, durationSec:p.durationSec||null,
      avgPaceSec:p.avgPaceSec||null, avgHr:p.avgHr||null, cadence:p.cadence||null,
      type:classifyRun({...p, hint:txt+' '+name})});
  } else if((file.type||'').startsWith('image/')){
    const dataUrl = await new Promise(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(file); });
    await DB.put('files', { id:base.id, dataUrl });
    const p = parseTextMetrics(name);
    Object.assign(base, {hasImage:true, distanceKm:p.distanceKm||null, durationSec:p.durationSec||null,
      avgPaceSec:p.avgPaceSec||null, type:guessType(name,p.distanceKm,p.avgPaceSec), needsReview:true});
  } else {
    // 확장자/MIME 애매함(iOS·Zepp 공유): 매직바이트·XML 헤더로 판별
    const buf = await file.arrayBuffer();
    if(isFitBuffer(buf)) applyParsed(parseFIT(buf));
    else {
      const txt = new TextDecoder('utf-8', { fatal:false }).decode(buf);
      if(/<gpx[\s>]/i.test(txt)) applyParsed(parseGPX(txt));
      else if(/TrainingCenterDatabase|<Activity[\s>]/i.test(txt)) applyParsed(parseTCX(txt));
      else Object.assign(base, {type:'easy', needsReview:true, notes:'지원 형식: GPX · TCX · FIT (Amazfit/Zepp 내보내기)'});
    }
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
  // 총거리/총시간은 요약(primary) 값을 신뢰, 없으면 최댓값
  const distanceKm  = primary.p.distanceKm!=null ? primary.p.distanceKm : (dists.length? Math.max(...dists):null);
  const durationSec = primary.p.durationSec!=null ? primary.p.durationSec : (durs.length? Math.max(...durs):null);
  const pick = (f)=> primary.p[f]!=null ? primary.p[f] : median(ps.map(p=>p[f])); // 요약값 우선
  let avgPaceSec = pick('avgPaceSec');
  const avgHr = pick('avgHr'), cadence = pick('cadence');
  if(distanceKm && durationSec && !avgPaceSec) avgPaceSec = durationSec/distanceKm;
  const iso = group.map(g=>g.iso).find(Boolean) || new Date().toISOString();
  const splitsItem = group.find(g=>g.splits && g.splits.length>=2);
  const splits = splitsItem ? splitsItem.splits : null;
  const phasesItem = group.find(g=>g.phases && g.phases.length>=3);
  const phases = phasesItem ? phasesItem.phases : null;
  const mtime = group.map(g=>g.mtime).find(v=>v!=null) || null;
  const firstOf = (f)=>{ for(const g of group){ if(g.p[f]!=null) return g.p[f]; } return null; }; // 범위(세부사항) 값
  const hrMin=firstOf('hrMin'), hrMax=firstOf('hrMax'), cadMin=firstOf('cadMin'), cadMax=firstOf('cadMax'),
        paceFast=firstOf('paceFast'), paceSlow=firstOf('paceSlow');
  const rec = { id:uid(), date:iso, source:'image', fileName:primary.fileName||'', notes:'',
    hasImage:true, distanceKm, durationSec, avgPaceSec, avgHr, cadence, splits, phases, autoType:true, mtime,
    hrMin, hrMax, cadMin, cadMax, paceFast, paceSlow,
    type: classifyRun({distanceKm, durationSec, avgPaceSec, avgHr, phases, hint:(primary.text||'')+' '+(primary.fileName||'')}),
    needsReview: !distanceKm, imageCount: group.length,
    ocrText: group.map(g=>g.text||'').filter(Boolean).join('\n---\n').slice(0,1500) };
  rec._images = [primary.dataUrl, ...group.filter(g=>g!==primary).map(g=>g.dataUrl)];
  return rec;
}

/* 요약↔스플릿 매칭 비용 (정확도 우선).
   같은 러닝이면 스플릿 합계와 요약 수치가 '매우' 근접해야 함.
   신뢰도 높은 신호는 하드 게이트: 하나라도 크게 어긋나면 즉시 배제(Infinity).
   sp=스플릿쪽 프로필, sm=요약쪽 프로필 */
function matchCost(sp, sm){
  // ── 하드 게이트: 같은 러닝이라면 반드시 통과해야 하는 조건 (정확도 우선으로 강화) ──
  if(sp.dist!=null && sm.dist!=null && Math.abs(sp.dist-sm.dist) > 0.3) return Infinity;         // 거리 0.3km↑ 차 → 다른 러닝
  if(sp.time!=null && sm.time!=null && Math.abs(sp.time-sm.time) > 45)  return Infinity;         // 총시간 45초↑ 차
  if(sp.rows   && sm.dist!=null && Math.abs(sp.rows-Math.ceil(sm.dist)) > 1) return Infinity;    // 구간 수 ≠ 거리
  if(sp.pace!=null && sm.pace!=null && Math.abs(sp.pace-sm.pace) > 30)  return Infinity;         // 평균 페이스 30초/km↑ 차
  if(sp.hr!=null   && sm.hr!=null   && Math.abs(sp.hr-sm.hr)   > 12)    return Infinity;         // 평균 심박 12bpm↑ 차

  // ── 확증: 비교 가능한 '강한 신호'(거리/시간/구간수)가 최소 하나는 있어야 매칭 ──
  const strongCmp = (sp.dist!=null&&sm.dist!=null) || (sp.time!=null&&sm.time!=null) || (sp.rows&&sm.dist!=null);
  if(!strongCmp) return Infinity;

  const terms=[];
  if(sp.dist!=null&&sm.dist!=null) terms.push(Math.abs(sp.dist-sm.dist)/0.5);
  if(sp.time!=null&&sm.time!=null) terms.push(Math.abs(sp.time-sm.time)/45);
  if(sp.pace!=null&&sm.pace!=null) terms.push(Math.abs(sp.pace-sm.pace)/25);
  if(sp.rows&&sm.dist!=null)       terms.push(Math.abs(sp.rows-Math.ceil(sm.dist))/1);
  if(sp.hr!=null&&sm.hr!=null)     terms.push(Math.abs(sp.hr-sm.hr)/6);
  if(sp.mtime&&sm.mtime)           terms.push(Math.min(Math.abs(sp.mtime-sm.mtime)/60000/5, 2)); // 촬영시각 5분 스케일(보조)
  return terms.length ? terms.reduce((a,b)=>a+b,0)/terms.length : Infinity;
}
function itemProfile(it){
  return { dist:it.p.distanceKm, time:it.p.durationSec, pace:it.p.avgPaceSec, hr:it.p.avgHr,
           rows: it.isSplit ? (it.splits?it.splits.length:0) : 0, isSplit: it.isSplit, mtime: it.mtime };
}
function recProfile(r){
  return { dist:r.distanceKm, time:r.durationSec, pace:r.avgPaceSec, hr:r.avgHr,
           rows: (r.splits?r.splits.length:0), mtime: r.mtime };
}
/* 두 화면이 '같은 러닝'인가: 같은 러닝의 요약/세부사항/스플릿은 거리·시간·페이스·심박·케이던스가 동일.
   p=이미지 프로필(p객체), g=그룹 대표. 하나라도 어긋나면 false, 강한 신호(거리/시간)가 일치하면 true. */
function sameRun(p, g){
  const d=p.distanceKm, t=p.durationSec, pc=p.avgPaceSec, h=p.avgHr, c=p.cadence;
  // ── 하드 조건: 하나라도 어긋나면 즉시 다른 러닝 (오차 범위 축소로 정확도↑) ──
  if(d!=null  && g.dist!=null && Math.abs(d - g.dist) > 0.2) return false;   // 거리 0.2km 이내여야
  if(t!=null  && g.time!=null && Math.abs(t - g.time) > 25)  return false;   // 총시간 25초 이내여야
  if(pc!=null && g.pace!=null && Math.abs(pc- g.pace) > 10)  return false;   // 평균 페이스 10초/km 이내
  if(h!=null  && g.hr!=null   && Math.abs(h - g.hr)   > 7)   return false;   // 평균 심박 7bpm 이내
  if(c!=null  && g.cad!=null  && Math.abs(c - g.cad)  > 5)   return false;   // 평균 케이던스 5spm 이내
  const dMatch = d!=null  && g.dist!=null && Math.abs(d - g.dist) <= 0.2;
  const tMatch = t!=null  && g.time!=null && Math.abs(t - g.time) <= 25;
  const pMatch = pc!=null && g.pace!=null && Math.abs(pc- g.pace) <= 10;
  const hMatch = h!=null  && g.hr!=null   && Math.abs(h - g.hr)   <= 7;
  // ── 확증: 독립 신호 2개 이상 일치해야 매칭(단일 우연 일치 방지) ──
  if(dMatch && tMatch) return true;               // 거리+시간 → 확실
  if(dMatch && (pMatch||hMatch)) return true;      // 거리+페이스/심박
  if(tMatch && pMatch && hMatch) return true;      // 시간+페이스+심박
  if(dMatch && t==null && pc==null && h==null) return true; // 거리만 읽힌 스플릿(다른 신호 없음)
  return false;
}
/* OCR이 '명백히 다른 러닝'이라고 반박하는가 (미사용 · 참고용) */
function contradicts(sp, sm){
  if(sp.dist!=null && sm.dist!=null && Math.abs(sp.dist-sm.dist) > 1.5) return true;
  if(sp.time!=null && sm.time!=null && Math.abs(sp.time-sm.time) > 180) return true;
  if(sp.rows && sm.dist!=null && Math.abs(sp.rows-Math.ceil(sm.dist)) > 4) return true;
  if(sp.pace!=null && sm.pace!=null && Math.abs(sp.pace-sm.pace) > 90) return true;
  return false;
}
/* 촬영 시각(lastModified)으로 이미지 클러스터링: gap 이내 연속 촬영 = 같은 세션 */
function clusterByTime(items, gapMs){
  const withT = items.filter(it=>it.mtime).sort((a,b)=>a.mtime-b.mtime);
  const clusters=[]; let cur=[];
  for(const it of withT){
    if(!cur.length || it.mtime - cur[cur.length-1].mtime <= gapMs) cur.push(it);
    else { clusters.push(cur); cur=[it]; }
  }
  if(cur.length) clusters.push(cur);
  return clusters;
}
/* 헝가리안 알고리즘: n×n 비용행렬의 최소비용 완전 매칭. res[i]=배정된 열 j */
function hungarian(cost){
  const n=cost.length; if(!n) return [];
  const u=Array(n+1).fill(0), v=Array(n+1).fill(0), p=Array(n+1).fill(0), way=Array(n+1).fill(0);
  for(let i=1;i<=n;i++){
    p[0]=i; let j0=0;
    const minv=Array(n+1).fill(Infinity), used=Array(n+1).fill(false);
    do{
      used[j0]=true; const i0=p[j0]; let delta=Infinity, j1=-1;
      for(let j=1;j<=n;j++) if(!used[j]){
        const cur=cost[i0-1][j-1]-u[i0]-v[j];
        if(cur<minv[j]){ minv[j]=cur; way[j]=j0; }
        if(minv[j]<delta){ delta=minv[j]; j1=j; }
      }
      for(let j=0;j<=n;j++){ if(used[j]){ u[p[j]]+=delta; v[j]-=delta; } else minv[j]-=delta; }
      j0=j1;
    } while(p[j0]!==0);
    do{ const j1=way[j0]; p[j0]=p[j1]; j0=j1; } while(j0);
  }
  const res=Array(n).fill(-1);
  for(let j=1;j<=n;j++) if(p[j]>0) res[p[j]-1]=j-1;
  return res;
}
/* 새 이미지를 이미 저장된 상호보완 기록(요약↔스플릿)과 매칭 (엄격 임계값) */
function findMergeTarget(item, maxCost){
  const need = item.isSplit ? 'summary' : 'splits';
  const prof = itemProfile(item);
  let best=null, bestC=Infinity;
  for(const ex of state.records){
    if(ex.source!=='image' || ex.imgKind!==need) continue;
    const ep = recProfile(ex);
    const c = item.isSplit ? matchCost(prof, ep) : matchCost(ep, prof);
    if(c<bestC){ bestC=c; best=ex; }
  }
  return (bestC <= (maxCost!=null?maxCost:1.4)) ? best : null;
}

/* 기존 기록에 이미지 한 장을 추가하고 수치를 합침 */
async function attachImageToRecord(ex, item){
  const n = ex.imageCount||1;
  await DB.put('files', { id: ex.id+'#'+n, dataUrl:item.dataUrl });
  ex.imageCount = n+1;
  if(!item.isSplit){ // 요약이 합류 → 요약 값 우선(더 정확)
    if(item.p.distanceKm!=null) ex.distanceKm=item.p.distanceKm;
    if(item.p.durationSec!=null) ex.durationSec=item.p.durationSec;
    if(item.p.avgPaceSec!=null) ex.avgPaceSec=item.p.avgPaceSec;
    if(item.p.avgHr!=null) ex.avgHr=item.p.avgHr;
    if(item.p.cadence!=null) ex.cadence=item.p.cadence;
    if(item.iso) ex.date=item.iso;
    if(item.text) ex.ocrText=((ex.ocrText?ex.ocrText+'\n---\n':'')+(item.text||'')).slice(0,1500);
  } else {           // 스플릿이 합류 → 빈 값만 보완 + 구간 데이터 저장
    if(item.splits && item.splits.length>=2 && !(ex.splits&&ex.splits.length>=2)) ex.splits=item.splits;
    ['avgHr','cadence'].forEach(k=>{ if(ex[k]==null && item.p[k]!=null) ex[k]=item.p[k]; });
    if(item.text) ex.ocrText=((ex.ocrText?ex.ocrText+'\n---\n':'')+(item.text||'')).slice(0,1500);
  }
  // 인터벌/NSM 단계 데이터 보완 + 단계 있으면 타입 재판정
  if(item.phases && item.phases.length>=3 && !(ex.phases&&ex.phases.length>=3)){
    ex.phases = item.phases;
    if(ex.autoType!==false) ex.type = classifyRun({distanceKm:ex.distanceKm, durationSec:ex.durationSec,
      avgPaceSec:ex.avgPaceSec, avgHr:ex.avgHr, phases:ex.phases, hint:(ex.ocrText||'')}) || ex.type;
  }
  // 범위(운동 세부사항) 값 보완
  ['hrMin','hrMax','cadMin','cadMax','paceFast','paceSlow'].forEach(k=>{ if(ex[k]==null && item.p[k]!=null) ex[k]=item.p[k]; });
  if(ex.distanceKm && ex.durationSec && !ex.avgPaceSec) ex.avgPaceSec=ex.durationSec/ex.distanceKm;
  ex.imgKind='both'; ex.needsReview=!ex.distanceKm;
  await DB.put('records', ex);
}

/* 자동 분류된 기록을 현재 훈련 존(전체 데이터) 기준으로 재분류 (사용자가 직접 지정한 건 유지) */
async function reclassifyAllAuto(){
  let changed = false;
  for(const r of state.records){
    if(r.autoType===false) continue;
    if(!(r.distanceKm || r.avgPaceSec || r.avgHr)) continue;
    const t = classifyRun({distanceKm:r.distanceKm, durationSec:r.durationSec, avgPaceSec:r.avgPaceSec, avgHr:r.avgHr,
                           phases:r.phases, hint:(r.notes||'')+' '+(r.fileName||'')+' '+(r.ocrText||'')});
    if(t && t!==r.type){ r.type=t; await DB.put('records', r); changed=true; }
  }
  return changed;
}

/* 이미지 1장 → OCR + 파싱 → 매칭용 item 객체 (첨부/분리 재인식에 공용) */
async function buildImageItem(dataUrl, fileName, mtime, ocrReady){
  let text = '';
  if(ocrReady!==false){ try{ text = await ocrImage(dataUrl); }catch(e){} }
  const p = parseTextMetrics(text||fileName||'');
  // 인터벌/NSM 단계 화면 우선 판별 (워밍업/러닝/회복/쿨다운 라벨)
  const phases = parseIntervalPhases(text||'');
  const isPhase = isPhaseWorkout(phases);
  const splits = isPhase ? [] : parseSplits(text||'');
  // 스플릿 '전용' 화면 판별: 구간표 2행↑ + 총시간(h:mm:ss) 없음
  const hasHMS = /\d{1,2}:\d{2}:\d{2}/.test(text||'');
  const isSplit = !isPhase && splits.length>=2 && !hasHMS;
  if(isPhase){
    const tot = phasesTotals(phases);
    if(tot.distanceKm!=null) p.distanceKm = tot.distanceKm;
    if(tot.durationSec) p.durationSec = tot.durationSec;
    if(!p.avgPaceSec && tot.avgPaceSec) p.avgPaceSec = tot.avgPaceSec;
  } else if(isSplit){
    const tot = splitsTotals(splits);
    p.distanceKm = tot.distanceKm; p.durationSec = tot.durationSec; p.avgPaceSec = tot.avgPaceSec;
    if(p.avgHr==null) p.avgHr = tot.avgHr; if(p.cadence==null) p.cadence = tot.cadence;
  } else if(!hasHMS && /스\s*플\s*릿|킬로\s*미터|split/i.test(text||'') && p.distanceKm!=null && p.distanceKm<=1.6){
    p.distanceKm = null; // 파싱 실패한 스플릿 화면의 '1.00킬로미터' 라벨 오인 방지
  }
  return { dataUrl, fileName:fileName||'', text, p, iso:parseDateFromText(text||''),
           splits: isSplit ? splits : null, phases: isPhase ? phases : null, isSplit, mtime: mtime||null };
}

async function handleFiles(files){
  const arr = Array.from(files);
  const images = arr.filter(f=> (f.type||'').startsWith('image/'));
  const others = arr.filter(f=> !(f.type||'').startsWith('image/'));
  let added = 0;

  // 1) 비이미지(GPX/TCX/FIT/TXT): Amazfit·Zepp 내보내기 포함
  let fileOk = 0, fileBad = 0;
  for(const f of others){
    const rec = await fileToRecord(f);
    await DB.put('records', rec); state.records.push(rec); added++;
    if(rec.distanceKm>0 && rec.durationSec>0) fileOk++; else fileBad++;
  }
  if(others.length){ state.records.sort((a,b)=>new Date(b.date)-new Date(a.date)); recompute(); renderRecords(); }

  // 2) 이미지: OCR → 요약/스플릿 구분 → 거리·시간으로 스플릿을 요약에 1:1 매칭
  if(images.length){
    toast(`이미지 인식 준비 중… (${images.length}장, 첫 실행은 다소 걸려요)`);
    let ocrReady = true;
    try{ await ensureOCR(); }catch(e){ ocrReady=false; toast('인식 엔진 로드 실패 · 이미지는 저장하고 수동 보정으로 진행'); }
    const items = [];
    for(let i=0;i<images.length;i++){
      toast(`이미지 인식 중… ${i+1}/${images.length}`);
      const f = images[i]; const dataUrl = await fileToDataUrl(f);
      items.push(await buildImageItem(dataUrl, f.name, f.lastModified, ocrReady));
    }
    let recCount = 0, mergedCount = 0;

    // ── 같은 러닝 클러스터링: 거리·시간·페이스·심박·케이던스가 동일한 화면들을 하나의 기록으로 ──
    // 기존 이미지 기록을 시드로 두어, 새 사진이 기존 러닝에도 붙게 함(다른 배치 첨부 대응)
    const seedGroups = state.records.filter(r=>r.source==='image').map(r=>({
      existing:r, add:[], dist:r.distanceKm, time:r.durationSec, pace:r.avgPaceSec, hr:r.avgHr, cad:r.cadence }));
    const newGroups = [];
    const bump = (g,it)=>{ g.add.push(it);
      if(g.dist==null)g.dist=it.p.distanceKm; if(g.time==null)g.time=it.p.durationSec;
      if(g.pace==null)g.pace=it.p.avgPaceSec; if(g.hr==null)g.hr=it.p.avgHr; if(g.cad==null)g.cad=it.p.cadence; };
    for(const it of items){
      let g = null;
      for(const cg of seedGroups){ if(sameRun(it.p, cg)){ g=cg; break; } }
      if(!g) for(const cg of newGroups){ if(sameRun(it.p, cg)){ g=cg; break; } }
      if(g) bump(g, it);
      else { const ng={ existing:null, add:[], dist:it.p.distanceKm, time:it.p.durationSec,
                        pace:it.p.avgPaceSec, hr:it.p.avgHr, cad:it.p.cadence }; bump(ng,it); newGroups.push(ng); }
    }

    // 기존 기록에 새 사진 붙이기
    for(const g of seedGroups){
      if(!g.add.length) continue;
      for(const it of g.add){ await attachImageToRecord(g.existing, it); }
      mergedCount += g.add.length;
    }
    // 새 그룹 → 새 기록(여러 화면이면 사진 여러 장이 한 기록에)
    for(const g of newGroups){
      const rec = mergeImageGroup(g.add); const imgs = rec._images; delete rec._images;
      rec.imgKind = g.add.length>1 ? 'both' : (g.add[0].isSplit ? 'splits' : 'summary');
      await DB.put('records', rec);
      await DB.put('files', { id:rec.id, dataUrl:imgs[0] });
      for(let i=1;i<imgs.length;i++) await DB.put('files', { id:rec.id+'#'+i, dataUrl:imgs[i] });
      state.records.push(rec); recCount++; added++;
      if(g.add.length>1) mergedCount += g.add.length-1;
    }
    state.records.sort((a,b)=>new Date(b.date)-new Date(a.date));
    recompute();                 // 전체 데이터로 훈련 존/학습치 계산
    await reclassifyAllAuto();    // 존이 갖춰진 뒤 자동 분류 기록 재판정
    recompute(); renderRecords();
    toast(`정리 완료 · 새 기록 ${recCount}개${mergedCount?` · 사진 ${mergedCount}장 같은 러닝에 매칭`:''}`);
  } else if(added){
    recompute(); await reclassifyAllAuto(); recompute(); renderRecords();
    toast(fileBad
      ? `${fileOk}개 정상 · ${fileBad}개는 수치 확인 필요(기록 탭에서 보정)`
      : `${fileOk}개 기록 추가 (GPX/TCX/FIT)`);
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
      needsReview: false,
      autoType: false
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

  // 인터벌/NSM 단계 구성 (워밍업·러닝·회복·쿨다운)
  let phasesHtml = '';
  const ph = r.phases;
  if(ph && ph.length>=3){
    const kColor = { warmup:'#4aa8ff', work:'#ff8a3d', recovery:'#39d98a', cooldown:'#a78bfa' };
    const head = `<div style="display:flex;gap:8px;font-size:10.5px;color:var(--sub);padding-bottom:5px;border-bottom:1px solid var(--line)">
        <span style="flex:1">단계</span><span style="width:54px;text-align:right">시간</span><span style="width:54px;text-align:right">거리</span><span style="width:62px;text-align:right">페이스</span></div>`;
    const rows = ph.map(p=>{
      const c = kColor[p.kind]||'var(--sub)';
      return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:5px 0;border-bottom:1px solid var(--line)">
        <span style="flex:1;color:${c};font-weight:700">${p.label}</span>
        <span style="width:54px;text-align:right">${fmtDuration(p.tSec)}</span>
        <span style="width:54px;text-align:right;color:var(--sub)">${p.distanceKm!=null?p.distanceKm.toFixed(2):'-'}</span>
        <span style="width:62px;text-align:right;font-weight:700">${p.pace?fmtPace(p.pace)+'/km':'-'}</span>
      </div>`;
    }).join('');
    const works = ph.filter(p=>p.kind==='work');
    const recs  = ph.filter(p=>p.kind==='recovery');
    let summary = '';
    if(works.length){
      const wp = works.map(w=>w.pace).filter(Boolean);
      const avgW = wp.length? Math.round(wp.reduce((a,b)=>a+b,0)/wp.length):null;
      const rp = recs.map(w=>w.pace).filter(Boolean);
      const avgR = rp.length? Math.round(rp.reduce((a,b)=>a+b,0)/rp.length):null;
      summary = kv('러닝 반복', `${works.length}회`)
        + (avgW?kv('반복 평균 페이스', `${fmtPace(avgW)}/km`):'')
        + (avgR?kv('회복 평균 페이스', `${fmtPace(avgR)}/km`):'');
      if(wp.length>=2){ const mn=Math.min(...wp), mx=Math.max(...wp), spread=mx-mn;
        if(spread<=8) fb.push(`🎯 반복 ${works.length}개 페이스가 매우 균일합니다(편차 ${spread}초). 훌륭한 인터벌 조절이에요.`);
        else if(spread>=25) fb.push(`⚠️ 반복 페이스 편차가 큽니다(${spread}초). 초반 반복을 너무 빠르게 시작하지 않았는지 확인하세요.`);
        else fb.push(`반복 페이스 편차 ${spread}초로 대체로 안정적입니다.`);
      }
    }
    phasesHtml = summary + `<div style="margin-top:8px">${head}${rows}</div>`;
  }

  // 구간(스플릿) 분석
  let splitsHtml = '';
  const sp = r.splits;
  if(sp && sp.length>=2){
    const fastest = sp.reduce((a,b)=>b.pace<a.pace?b:a);
    const slowest = sp.reduce((a,b)=>b.pace>a.pace?b:a);
    const fi = sp.indexOf(fastest)+1, si = sp.indexOf(slowest)+1;
    const half = Math.floor(sp.length/2);
    const wAvg = (arr,key)=>{ const T=arr.reduce((s,x)=>s+x.tSec,0); return T?Math.round(arr.reduce((s,x)=>s+x[key]*x.tSec,0)/T):0; };
    const p1 = wAvg(sp.slice(0,half),'pace'), p2 = wAvg(sp.slice(half),'pace');
    const neg = p2<p1, gap = Math.abs(p2-p1);
    const third = Math.max(1, Math.floor(sp.length/3));
    const hrStart = wAvg(sp.slice(0,third),'hr'), hrEnd = wAvg(sp.slice(-third),'hr');
    const drift = hrEnd-hrStart;
    const maxP = Math.max(...sp.map(s=>s.pace)), minP = Math.min(...sp.map(s=>s.pace));
    const rowsHtml = sp.map((s,i)=>{
      const w = maxP===minP?100:Math.round((maxP-s.pace)/(maxP-minP)*92)+8; // 빠를수록 길게
      return `<div style="display:flex;align-items:center;gap:7px;font-size:11.5px;padding:3px 0">
        <span style="width:16px;color:var(--sub)">${i+1}</span>
        <span style="width:52px;font-weight:700">${fmtPace(s.pace)}</span>
        <div style="flex:1;background:var(--line);border-radius:4px;height:7px;overflow:hidden"><i style="display:block;height:100%;width:${w}%;background:linear-gradient(90deg,var(--acc),var(--acc2))"></i></div>
        <span style="width:40px;text-align:right;color:#ff5d6c">♥${s.hr}</span>
        <span style="width:44px;text-align:right;color:var(--sub)">${s.cad}</span>
      </div>`;
    }).join('');
    splitsHtml = kv('구간 수', `${sp.length}개`)
      + kv('최고 구간', `${fi}번째 · ${fmtPace(fastest.pace)}/km`)
      + kv('최저 구간', `${si}번째 · ${fmtPace(slowest.pace)}/km`)
      + kv('전·후반 페이스', `${fmtPace(p1)} → ${fmtPace(p2)} <b style="color:${neg?'var(--ok)':'var(--acc2)'}">(${neg?'네거티브':'포지티브'} ${gap}초)</b>`)
      + kv('심박 드리프트', `${hrStart} → ${hrEnd} bpm <b style="color:${drift>8?'var(--acc2)':'var(--sub)'}">${drift>0?'+':''}${drift}</b>`)
      + `<div class="sectitle" style="margin:12px 2px 6px">구간별 · 페이스 / ♥심박 / 케이던스</div>${rowsHtml}`;
    // 코칭
    if(neg && gap>=5) fb.push('📈 후반이 더 빠른 네거티브 스플릿입니다. 이상적인 페이스 운영이에요.');
    else if(!neg && gap>=20) fb.push('📉 후반에 페이스가 크게 떨어졌습니다. 초반을 조금 보수적으로 시작해 보세요.');
    if(drift>=12) fb.push('🫀 후반 심박 드리프트가 큽니다(+'+drift+'bpm). 더위·탈수·초반 과속 가능성 — 수분 보충과 페이스 관리를 권장합니다.');
  }

  // 운동 세부사항(범위) 기반 상세 피드백
  let detailHtml = '';
  const hrMin=r.hrMin, hrMax=r.hrMax, cadMin=r.cadMin, cadMax=r.cadMax, pFast=r.paceFast, pSlow=r.paceSlow;
  if((hrMin&&hrMax) || (pFast&&pSlow) || (cadMin&&cadMax)){
    if(hrMin&&hrMax){
      const spread=hrMax-hrMin, maxPct=Math.round(hrMax/maxHR*100);
      detailHtml += kv('심박 범위', `${hrMin}–${hrMax} bpm <span class="k" style="font-size:11px">(변동폭 ${spread})</span>`);
      detailHtml += kv('최고 심박 강도', `${maxPct}% HRmax`);
      if(spread<=25) fb.push('🫀 심박 변동폭이 작아 처음부터 끝까지 강도가 일정했습니다. 안정적인 유산소 러닝이에요.');
      else if(spread>=45) fb.push('🫀 심박 변동폭이 큽니다(±'+spread+'bpm). 오르막·인터벌·초반 과속 등 강도 기복이 있었어요.');
      if(maxPct>=92) fb.push('🔥 순간 최고심박이 최대심박의 '+maxPct+'%까지 올랐습니다. 상당히 힘든 구간이 있었어요.');
      else if(['easy','recovery','lsd'].includes(r.type) && maxPct>=85) fb.push('⚠️ 이지/회복 목적인데 최고심박이 '+maxPct+'%까지 튀었습니다. 오르막·과속 구간을 줄여보세요.');
    }
    if(pFast&&pSlow){
      const dev=pSlow-pFast;
      detailHtml += kv('페이스 범위', `${fmtPace(pSlow)} ~ ${fmtPace(pFast)}/km <span class="k" style="font-size:11px">(편차 ${dev}초)</span>`);
      if(dev>=90) fb.push('🎢 페이스 편차가 큽니다('+dev+'초/km). 지형 영향이거나 페이스 운영이 들쭉날쭉했어요. 더 균일하게 달리면 효율이 올라갑니다.');
      else if(dev<=35) fb.push('🎯 페이스가 매우 균일했습니다. 페이스 감각이 좋아요.');
    }
    if(cadMin&&cadMax){
      detailHtml += kv('케이던스 범위', `${cadMin}–${cadMax} spm`);
      if(cadMin<160) fb.push('👣 일부 구간 케이던스가 '+cadMin+'까지 떨어졌습니다. 지치거나 내리막에서 스텝이 느려졌을 수 있어요.');
      else if((cadMax-cadMin)<=12) fb.push('👣 케이던스가 전 구간 일정했습니다. 안정적인 리듬이에요.');
    }
  }

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
    ${detailHtml?`<div class="hr"></div><div class="sectitle">운동 세부 피드백 (심박·페이스·케이던스 범위)</div>${detailHtml}`:''}
    <div class="hr"></div><div class="sectitle">이 기록 기반 레이스 예측</div>${predHtml}
    <div class="hr"></div><div class="sectitle">평균 대비</div>${cmp}
    ${phasesHtml?`<div class="hr"></div><div class="sectitle">인터벌 구성 (워밍업·러닝·회복·쿨다운)</div>${phasesHtml}`:''}
    ${splitsHtml?`<div class="hr"></div><div class="sectitle">구간(스플릿) 분석</div>${splitsHtml}`:''}
    <div class="hr"></div><div class="sectitle">코치 피드백</div>
    ${fb.map(x=>`<div class="note" style="font-size:12.5px;color:var(--txt);line-height:1.55">${x}</div>`).join('')}
    ${r.notes?`<div class="hr"></div><div class="sectitle">메모</div><div class="note" style="color:var(--txt)">${r.notes}</div>`:''}
    ${r.ocrText?`<div class="hr"></div><details><summary style="font-size:12px;color:var(--sub);cursor:pointer">🔍 인식 원문 보기(진단용)</summary>
      <pre style="white-space:pre-wrap;font-size:11px;color:var(--sub);background:var(--line);padding:8px;border-radius:8px;margin-top:6px;overflow:auto">${(r.ocrText||'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</pre></details>`:''}
    <div class="row" style="margin-top:16px">
      <button class="btn danger" id="rr_del">삭제</button>
      <button class="btn" id="rr_edit">✏️ 편집</button>
      <button class="btn primary block" id="rr_close">확인</button>
    </div>
    <button class="btn block" id="rr_merge" style="margin-top:8px">🔗 다른 기록과 합치기(사진 모으기)</button>
    ${(r.imageCount>1)?'<button class="btn block" id="rr_split" style="margin-top:6px">✂️ 사진 분리(잘못 합쳐진 사진 떼기)</button>':''}`);
  $('#rr_edit').onclick = ()=> editRecord(id);
  $('#rr_del').onclick = ()=> deleteRecord(id);
  $('#rr_close').onclick = ()=> closeSheet();
  $('#rr_merge').onclick = ()=> openMergePicker(id);
  if($('#rr_split')) $('#rr_split').onclick = ()=> openSplitPicker(id);
  if(r.hasImage){ (async ()=>{
    const keys=[r.id]; for(let i=1;i<(r.imageCount||1);i++) keys.push(r.id+'#'+i);
    const imgs=[]; for(const k of keys){ const f=await DB.get('files',k); if(f) imgs.push(f.dataUrl); }
    const box=$('#rr_thumb'); if(box&&imgs.length) box.innerHTML = imgs.map(u=>`<img src="${u}" style="width:100%;border-radius:12px;margin-bottom:8px;display:block">`).join('');
  })(); }
}

/* 수동 합치기: 대상 기록 목록을 보여주고 선택하면 두 기록을 하나로 병합 */
function openMergePicker(id){
  const base = state.records.find(r=>r.id===id); if(!base) return;
  // 매칭 비용 기준으로 정렬 → 가장 그럴듯한 짝을 맨 위에 '추천'으로
  const baseSplit = base.splits && base.splits.length>=2;
  const bp = recProfile(base);
  const scored = state.records.filter(r=>r.id!==id && r.source==='image').map(r=>{
    const rp = recProfile(r); const rSplit = r.splits && r.splits.length>=2;
    // 한쪽이 스플릿, 다른쪽이 요약일 때만 비용 계산(그 외는 거리만 참고)
    let c = Infinity;
    if(baseSplit !== rSplit){ c = baseSplit ? matchCost(bp, rp) : matchCost(rp, bp); }
    else if(base.distanceKm!=null && r.distanceKm!=null){ c = 100 + Math.abs(base.distanceKm-r.distanceKm); }
    return { r, c };
  }).sort((a,b)=> a.c - b.c || new Date(b.r.date)-new Date(a.r.date));
  if(!scored.length){ toast('합칠 다른 사진 기록이 없어요'); return; }
  const rows = scored.map(({r,c},i)=>{
    const t=TYPES[r.type]||TYPES.easy;
    const meta=[r.distanceKm!=null?r.distanceKm.toFixed(2)+'km':'', r.durationSec?fmtDuration(r.durationSec):'',
                r.splits&&r.splits.length>=2?'스플릿':(r.imageCount>1?'사진'+r.imageCount:'요약')].filter(Boolean).join(' · ');
    const rec = (i===0 && isFinite(c) && c<3) ? '<span style="color:var(--ok);font-weight:700">· 추천</span>' : '';
    return `<button class="btn block" data-mid="${r.id}" style="text-align:left;margin-bottom:6px">
      <span class="tag ${t.css}" style="margin-right:6px">${t.label}</span>${fmtDate(r.date)} ${rec}
      <span style="color:var(--sub);font-size:12px"> · ${meta}</span></button>`;
  }).join('');
  openSheet(`<h3 style="margin-top:0">이 기록에 합칠 기록 선택</h3>
    <div class="note" style="margin-bottom:10px">선택한 기록의 사진·데이터가 <b>${fmtDate(base.date)}</b> 기록으로 합쳐지고, 선택한 기록은 삭제됩니다.</div>
    ${rows}
    <button class="btn block" id="mg_cancel" style="margin-top:6px">취소</button>`);
  document.querySelectorAll('[data-mid]').forEach(b=>{
    b.onclick = async ()=>{ await mergeTwoRecords(id, b.dataset.mid); };
  });
  $('#mg_cancel').onclick = ()=> openRecordReport(id);
}

/* base 기록에 other의 사진(들)과 데이터를 합치고 other 삭제 */
async function mergeTwoRecords(baseId, otherId){
  const base = state.records.find(r=>r.id===baseId);
  const other = state.records.find(r=>r.id===otherId);
  if(!base || !other) return;
  // other의 이미지들을 base 뒤에 이어붙임
  const otherKeys=[other.id]; for(let i=1;i<(other.imageCount||1);i++) otherKeys.push(other.id+'#'+i);
  let n = base.imageCount||1;
  for(const k of otherKeys){
    const f = await DB.get('files', k);
    if(f && f.dataUrl){ await DB.put('files', { id: base.id+'#'+n, dataUrl:f.dataUrl }); n++; }
  }
  base.imageCount = n; base.hasImage = true;
  // 데이터 보완: 요약(거리+시간 둘 다 있는 쪽) 우선, 스플릿은 있는 쪽 사용
  const baseComplete = base.distanceKm && base.durationSec;
  const otherComplete = other.distanceKm && other.durationSec;
  if(!baseComplete && otherComplete){
    base.distanceKm=other.distanceKm; base.durationSec=other.durationSec;
    if(other.avgPaceSec) base.avgPaceSec=other.avgPaceSec;
    if(other.date) base.date=other.date;
  }
  ['avgHr','cadence','avgPaceSec','distanceKm','durationSec'].forEach(k=>{ if(base[k]==null && other[k]!=null) base[k]=other[k]; });
  if((!base.splits||base.splits.length<2) && other.splits && other.splits.length>=2) base.splits=other.splits;
  if(base.distanceKm && base.durationSec && !base.avgPaceSec) base.avgPaceSec=base.durationSec/base.distanceKm;
  base.imgKind='both'; base.needsReview=!base.distanceKm;
  await DB.put('records', base);
  // other 삭제(파일 포함)
  await DB.del('records', other.id);
  for(const k of otherKeys) await DB.del('files', k).catch(()=>{});
  state.records = state.records.filter(r=>r.id!==other.id);
  recompute(); await reclassifyAllAuto(); recompute();
  renderRecords();
  toast('합쳤어요 · 사진과 데이터가 한 기록으로');
  openRecordReport(baseId);
}

/* 사진 분리: 여러 장이 든 기록에서 사진을 골라 개별 기록으로 떼어냄 */
async function openSplitPicker(id){
  const rec = state.records.find(r=>r.id===id);
  if(!rec || !(rec.imageCount>1)){ toast('분리할 사진이 없어요'); return; }
  const keys=[id]; for(let i=1;i<rec.imageCount;i++) keys.push(id+'#'+i);
  const urls=[]; for(const k of keys){ const f=await DB.get('files',k); urls.push(f?f.dataUrl:null); }
  const cards = urls.map((u,i)=> u?`<div style="margin-bottom:12px">
      <img src="${u}" style="width:100%;border-radius:12px;display:block;margin-bottom:6px">
      <button class="btn block" data-sep="${i}">이 사진을 개별 기록으로 분리</button></div>`:'').join('');
  openSheet(`<h3 style="margin-top:0">사진 분리</h3>
    <div class="note" style="margin-bottom:10px">잘못 합쳐진 사진을 골라 개별 기록으로 떼어냅니다. 떼어낸 사진과 남은 기록 모두 다시 인식해 수치를 갱신합니다.</div>
    ${cards}
    <button class="btn block" id="sp_cancel" style="margin-top:4px">취소</button>`);
  document.querySelectorAll('[data-sep]').forEach(b=> b.onclick = ()=> separateImage(id, +b.dataset.sep));
  $('#sp_cancel').onclick = ()=> openRecordReport(id);
}

async function separateImage(recId, idx){
  const rec = state.records.find(r=>r.id===recId);
  if(!rec || !(rec.imageCount>1)) return;
  const keys=[recId]; for(let i=1;i<rec.imageCount;i++) keys.push(recId+'#'+i);
  const urls=[]; for(const k of keys){ const f=await DB.get('files',k); urls.push(f?f.dataUrl:null); }
  if(idx<0 || idx>=urls.length || !urls[idx]) return;
  closeSheet(); toast('사진 분리 중… 재인식');
  await ensureOCR().catch(()=>{});

  // 1) 떼어낸 사진 → 새 개별 기록 (재인식)
  const sepItem = await buildImageItem(urls[idx], rec.fileName||'', rec.mtime||null);
  const nrec = mergeImageGroup([sepItem]); const nimgs = nrec._images; delete nrec._images;
  nrec.imgKind = sepItem.isSplit ? 'splits' : 'summary';
  await DB.put('records', nrec);
  await DB.put('files', { id:nrec.id, dataUrl:nimgs[0] });
  state.records.push(nrec);

  // 2) 남은 사진으로 원본 재구성 (기존 파일 정리 후 재기록)
  const remain = urls.filter((u,i)=> i!==idx && u);
  for(const k of keys) await DB.del('files', k).catch(()=>{});
  const remItems=[]; for(const u of remain) remItems.push(await buildImageItem(u, rec.fileName||'', rec.mtime||null));
  const rebuilt = mergeImageGroup(remItems); const rimgs = rebuilt._images; delete rebuilt._images;
  rebuilt.id = recId;                       // 원본 id/메모 유지
  rebuilt.notes = rec.notes || '';
  rebuilt.imgKind = remItems.length>1 ? 'both' : (remItems[0].isSplit ? 'splits' : 'summary');
  if(rec.autoType===false){ rebuilt.type = rec.type; rebuilt.autoType = false; } // 수동 지정 종류 유지
  await DB.put('records', rebuilt);
  await DB.put('files', { id:recId, dataUrl:rimgs[0] });
  for(let i=1;i<rimgs.length;i++) await DB.put('files', { id:recId+'#'+i, dataUrl:rimgs[i] });
  const ix = state.records.findIndex(r=>r.id===recId); if(ix>=0) state.records[ix]=rebuilt;

  recompute(); await reclassifyAllAuto(); recompute();
  state.records.sort((a,b)=>new Date(b.date)-new Date(a.date));
  renderRecords();
  toast('사진을 분리했어요');
  openRecordReport(recId);
}

async function deleteRecord(id){
  const rec = state.records.find(r=>r.id===id);
  await DB.del('records', id);
  await DB.del('files', id).catch(()=>{});
  if(rec && rec.imageCount>1){ for(let i=1;i<rec.imageCount;i++) await DB.del('files', id+'#'+i).catch(()=>{}); }
  state.records = state.records.filter(r=>r.id!==id);
  recompute(); renderRecords(); closeSheet(); toast('삭제됨');
}

/* 기록 탭 상단 · 데이터로 학습된 내 상태 프로필 */
function renderAthleteProfile(){
  const card=$('#profileCard'); if(!card) return;
  const m=state.metrics;
  if(!m || !m.count){ card.style.display='none'; return; }
  card.style.display='';

  // 학습 수준(기록 수 기반)
  const lv = m.count>=20?['숙련 프로필','badge-ok']: m.count>=8?['학습 중','badge-ok']:['초기 학습','badge-warn'];
  $('#profileLevel').innerHTML = `<span class="riskbadge ${lv[1]}" style="font-size:11px">${lv[0]} · ${m.count}회</span>`;

  const kv=(k,v,sub)=>`<div class="kv"><span class="k">${k}</span><span class="v">${v}${sub?` <span class="k" style="font-size:11px">${sub}</span>`:''}</span></div>`;
  const hz=m.hr||{};
  const rows=[];

  // 심박
  rows.push(kv('추정 최대심박', `${m.maxHR} bpm`, m.learnedMaxHR&&!state.settings.maxHRManual?'자동 학습':(state.settings.maxHRManual?'직접 설정':'')));
  if(hz.easy)     rows.push(kv('이지런 심박존', `${hz.easy[0]}–${hz.easy[1]} bpm`, '유산소 65–70%'));
  if(hz.recovery) rows.push(kv('회복 심박존', `${hz.recovery[0]}–${hz.recovery[1]} bpm`, '60–65%'));
  if(m.easyHrLearned)      rows.push(kv('실측 이지 평균심박', `${m.easyHrLearned} bpm`, '내 이지런 기록 기반'));
  if(m.thresholdHrLearned) rows.push(kv('실측 템포 평균심박', `${m.thresholdHrLearned} bpm`, '역치 근처'));

  // 페이스/체력
  if(m.easyPaceLearned) rows.push(kv('내 이지 페이스', `${fmtPace(m.easyPaceLearned)}/km`, '실측 학습'));
  if(m.vdot)  rows.push(kv('현재 체력(VDOT)', `${m.vdot}`, m.pace5k?`5K ${fmtPace(m.pace5k)}/km`:''));
  if(m.vdot)  rows.push(kv('예상 기록', `10K ${fmtDuration(m.racePred['10k'])} · 풀 ${fmtDuration(m.racePred['full'])}`));
  if(m.cadenceAvg) rows.push(kv('평균 케이던스', `${m.cadenceAvg} spm`));

  // 부하 상태
  const a=m.acwr;
  if(a){ const st=a<0.8?['부하 낮음','var(--acc2)']:a<=1.3?['최적 ✓','var(--ok)']:a<=1.5?['주의','var(--acc2)']:['위험','var(--bad)'];
    rows.push(kv('훈련 부하(ACWR)', `<span style="color:${st[1]};font-weight:700">${a.toFixed(2)} · ${st[0]}</span>`, `주 ${m.chronicWeekly.toFixed(0)}km`)); }

  // 코멘트
  const notes=[];
  if(m.effTrend>0) notes.push(`📈 유산소 효율이 좋아지고 있어요 (같은 심박에 km당 약 ${m.effTrend}회 낮아짐).`);
  else if(m.effTrend<0) notes.push('최근 이지런 심박이 다소 높아요. 회복/수면을 점검해 보세요.');
  if(m.learnedMaxHR && !state.settings.maxHRManual) notes.push('최대심박은 기록이 쌓일수록 더 정확해집니다(설정에서 직접 지정 가능).');

  $('#profileBody').innerHTML = rows.join('')
    + (notes.length?`<div class="hr"></div>`+notes.map(n=>`<div class="note" style="font-size:12px;color:var(--txt)">${n}</div>`).join(''):'');
}

async function renderRecords(){
  renderAthleteProfile();
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
  // ── 학습: 최대심박 자동 추정 (스플릿 구간 심박 / 고강도 평균심박 기반) ──
  const splitHRs = [], splitCads = [];
  recs.forEach(r=>{ if(Array.isArray(r.splits)) r.splits.forEach(s=>{ if(s.hr) splitHRs.push(s.hr); if(s.cad) splitCads.push(s.cad); }); });
  const highAvgHr = recs.filter(r=>['interval','nsm','tempo','race'].includes(r.type)&&r.avgHr).map(r=>r.avgHr);
  let learnedMaxHR = null;
  if(splitHRs.length) learnedMaxHR = Math.max(...splitHRs) + 2;          // 구간 최고심박은 실제 최대의 하한 → +2 보정
  else if(highAvgHr.length) learnedMaxHR = Math.round(Math.max(...highAvgHr)/0.94); // 고강도 평균 ≈ 최대의 94%
  if(learnedMaxHR) learnedMaxHR = Math.min(215, Math.max(150, learnedMaxHR));
  // 사용자가 설정에서 직접 지정하지 않았으면 학습값을 자동 반영
  if(learnedMaxHR && !state.settings.maxHRManual && state.settings.maxHR !== learnedMaxHR){
    state.settings.maxHR = learnedMaxHR;
    try{ localStorage.setItem('rc_settings', JSON.stringify(state.settings)); }catch(e){}
  }
  // 심박 존
  const maxHR = state.settings.maxHR || 190;
  const hr = NSM.hrZones(maxHR);

  // ── 학습: 실제 데이터로 본 이지/역치 심박·페이스, 케이던스, 유산소 효율 추세 ──
  const easyRuns = recs.filter(r=>['easy','recovery','lsd'].includes(r.type));
  const easyHrLearned = median(easyRuns.filter(r=>r.avgHr).map(r=>r.avgHr));
  const easyPaceLearned = median(easyRuns.filter(r=>r.avgPaceSec).map(r=>r.avgPaceSec));
  const thresholdHrLearned = median(recs.filter(r=>r.type==='tempo'&&r.avgHr).map(r=>r.avgHr));
  const cadenceAvg = median([...splitCads, ...recs.filter(r=>r.cadence).map(r=>r.cadence)]);
  // 유산소 효율(같은 심박 대비 속도): 이지런 km당 심박수 추세 (낮아질수록 개선)
  const effSeries = easyRuns.filter(r=>r.avgHr&&r.avgPaceSec&&r.distanceKm&&r.durationSec)
    .sort((a,b)=>new Date(a.date)-new Date(b.date))
    .map(r=> r.avgHr*(r.durationSec/60)/r.distanceKm);
  let effTrend = null;
  if(effSeries.length>=4){ const h=effSeries.length>>1, av=a=>a.reduce((s,x)=>s+x,0)/a.length;
    effTrend = Math.round(av(effSeries.slice(0,h)) - av(effSeries.slice(h))); } // >0 개선

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
                    tenKSec, weeklyHours, hr, maxHR,
                    learnedMaxHR, easyHrLearned, easyPaceLearned, thresholdHrLearned, cadenceAvg, effTrend };
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

/* ============================================================
   구조화된 워크아웃 (인터벌/템포/NSM) — 실시간 음성 안내에 사용
   step: { kind:'warmup'|'work'|'recover'|'cooldown'|'steady', label,
           durationSec? | distanceKm?, paceLo?, paceHi? }
   ============================================================ */
function repsWorkout(name, warmMin, reps, work, rec, coolMin, workPace, recPace){
  const wLo = Math.max(120, workPace-6), wHi = workPace+6;
  const rLo = recPace, rHi = recPace+60;
  const steps = [{ kind:'warmup', label:'워밍업', durationSec:warmMin*60, paceLo:recPace, paceHi:recPace+40 }];
  for(let i=1;i<=reps;i++){
    steps.push(Object.assign({ kind:'work', label:`반복 ${i}/${reps}`, paceLo:wLo, paceHi:wHi }, work));
    if(i<reps) steps.push(Object.assign({ kind:'recover', label:'회복 조깅', paceLo:rLo, paceHi:rHi }, rec));
  }
  steps.push({ kind:'cooldown', label:'쿨다운', durationSec:coolMin*60, paceLo:recPace, paceHi:recPace+40 });
  return { name, steps };
}
function buildIntervalWorkout(m, weekNo){
  const z = m.zones||{}; const ip = z.interval||300; const rp = z.recovery||420;
  const variants = [
    { name:'400m 반복 ×8', reps:8, work:{distanceKm:0.4}, rec:{distanceKm:0.2} },
    { name:'800m 반복 ×5', reps:5, work:{distanceKm:0.8}, rec:{distanceKm:0.4} },
    { name:'1km 반복 ×5',  reps:5, work:{distanceKm:1.0}, rec:{durationSec:90} },
    { name:'3분 반복 ×6',  reps:6, work:{durationSec:180}, rec:{durationSec:90} },
  ];
  const v = variants[weekNo % variants.length];
  return repsWorkout(v.name, 12, v.reps, v.work, v.rec, 10, ip, rp);
}
function buildTempoWorkout(m, weekNo){
  const z = m.zones||{}; const tp = z.tempo||270; const rp = z.recovery||420;
  const warm = { kind:'warmup', label:'워밍업', durationSec:600, paceLo:rp, paceHi:rp+40 };
  const cool = { kind:'cooldown', label:'쿨다운', durationSec:600, paceLo:rp, paceHi:rp+40 };
  const variants = [
    { name:'템포 20분 지속주', steps:[warm, { kind:'work', label:'템포 지속주 20분', durationSec:1200, paceLo:tp-5, paceHi:tp+5 }, cool] },
    { name:'템포 2×10분',
      steps:[warm, { kind:'work', label:'템포 1/2 · 10분', durationSec:600, paceLo:tp-5, paceHi:tp+5 },
                   { kind:'recover', label:'회복 조깅 3분', durationSec:180, paceLo:rp, paceHi:rp+60 },
                   { kind:'work', label:'템포 2/2 · 10분', durationSec:600, paceLo:tp-5, paceHi:tp+5 }, cool] },
    { name:'템포 2km ×3',
      steps:[warm, { kind:'work', label:'템포 1/3 · 2km', distanceKm:2, paceLo:tp-5, paceHi:tp+5 },
                   { kind:'recover', label:'회복 조깅 3분', durationSec:180, paceLo:rp, paceHi:rp+60 },
                   { kind:'work', label:'템포 2/3 · 2km', distanceKm:2, paceLo:tp-5, paceHi:tp+5 },
                   { kind:'recover', label:'회복 조깅 3분', durationSec:180, paceLo:rp, paceHi:rp+60 },
                   { kind:'work', label:'템포 3/3 · 2km', distanceKm:2, paceLo:tp-5, paceHi:tp+5 }, cool] },
  ];
  return variants[weekNo % variants.length];
}
function buildNsmWorkout(r, easyPace, recPace){
  // r: {min, reps, rec(sec), wu, cd, pace:[lo,hi]}
  const wp = Math.round((r.pace[0]+r.pace[1])/2);
  const steps = [{ kind:'warmup', label:'워밍업', durationSec:r.wu*60, paceLo:easyPace, paceHi:easyPace+40 }];
  for(let i=1;i<=r.reps;i++){
    steps.push({ kind:'work', label:`서브T ${i}/${r.reps} · ${r.min}분`, durationSec:r.min*60, paceLo:r.pace[0], paceHi:r.pace[1] });
    if(i<r.reps) steps.push({ kind:'recover', label:'회복 조깅', durationSec:r.rec, paceLo:recPace, paceHi:recPace+60 });
  }
  steps.push({ kind:'cooldown', label:'쿨다운', durationSec:r.cd*60, paceLo:easyPace, paceHi:easyPace+40 });
  return { name:`NSM ${r.min}분 ×${r.reps}`, steps };
}

/* 다양한 훈련(폴라라이즈드) 플랜: 인터벌·템포·LSD·이지·리커버리 */
function generateMixedPlan(monday){
  const m = state.metrics;
  const base = (m.chronicWeekly>5)? m.chronicWeekly : state.settings.weeklyGoalKm;
  let target = Math.min(base*1.08, base+8);
  if(m.acwr>1.4) target = base*0.95;
  target = Math.max(15, Math.round(target));

  const S = (type, km, title, detail, extra={})=>({ type, km, title, detail, done:false, ...extra });
  const phase = trainingPhase(monday);
  const weekNo = Math.abs(Math.round((monday - mondayOf(Date.now()))/(7*86400000)));
  const isDownWeek = (weekNo % 3 === 2) && phase!=='taper';

  const easyPace = (m.zones?.easy) || 360, recPace = (m.zones?.recovery) || 420;
  const hrTxt = (zoneKey)=>{ const h=m.hr; if(!h) return ''; const z=h[zoneKey]; return z? ` · 심박 ${z[0]}~${z[1]}` : ` · 심박 <${h.longCeil}`; };
  const woDetail = (w)=> w.steps.map(s=>{
    const amt = s.durationSec
      ? (s.durationSec>=60 ? `${+(s.durationSec/60).toFixed(s.durationSec%60?1:0)}분` : `${s.durationSec}초`)
      : `${s.distanceKm}km`;
    return `${s.label} ${amt}`;
  }).join(' → ');

  // 롱런(시간 기준)
  const longMin = longRunMinutes(phase, isDownWeek);
  const longKm = +((longMin*60)/((m.zones?.lsd)||360)).toFixed(1);

  // 품질 세션(테이퍼면 1개, 그 외 2개: 인터벌 + 템포)
  const ivWo = buildIntervalWorkout(m, weekNo);
  const tpWo = buildTempoWorkout(m, weekNo);
  const quality = phase==='taper' ? [{type:'interval',wo:ivWo}] : [{type:'interval',wo:ivWo},{type:'tempo',wo:tpWo}];

  // 주간 스켈레톤: 월 휴식 / 화 품질1 / 수 이지 / 목 품질2 / 금 회복 / 토 이지 / 일 롱런
  const skel = phase==='taper'
    ? ['rest','interval','easy','easy','recovery','rest','lsd']
    : ['rest','interval','easy','tempo','recovery','easy','lsd'];

  const qualityKm = quality.reduce((s,q)=> s + estWorkoutKm(q.wo), 0);
  let remain = Math.max(0, target - qualityKm - longKm);
  const easyIdx = skel.map((t,i)=>({t,i})).filter(x=>x.t==='easy'||x.t==='recovery').map(x=>x.i);
  const perEasy = easyIdx.length? remain/easyIdx.length : 0;

  const mpWeek = phase==='mp';
  const sessions = skel.map((t,i)=>{
    if(mpWeek && i===6){ const mpText=mpBlockText(m.tenKSec||270);
      return S('lsd', longKm, `MP 롱런 ${longKm}km`, `${paceText('lsd')} 베이스 + ${mpText} · 보급 연습`, {mp:true}); }
    if(t==='interval'){ const km=estWorkoutKm(ivWo);
      return S('interval', km, `인터벌 · ${ivWo.name}`, `${woDetail(ivWo)} · ${paceText('interval')}`, {workout:ivWo}); }
    if(t==='tempo'){ const km=estWorkoutKm(tpWo);
      return S('tempo', km, `템포 · ${tpWo.name}`, `${woDetail(tpWo)} · ${paceText('tempo')}`, {workout:tpWo}); }
    if(t==='lsd'){ return S('lsd', longKm, `이지 롱런 ${longKm}km (${longMin}분)`, `${paceText('lsd')}${hrTxt('easy')} · 거리보다 시간, 끝까지 이지`); }
    if(t==='rest'){ return S('rest', 0, '휴식', '완전 휴식 또는 스트레칭/코어'); }
    if(t==='recovery'){ const km=Math.max(3,Math.round(perEasy*0.7)); return S('recovery', km, `회복 조깅 ${km}km`, `${paceText('recovery')}${hrTxt('recovery')} · 아주 편하게`); }
    const km=Math.max(4,Math.round(perEasy)); return S('easy', km, `이지런 ${km}km`, `${paceText('easy')}${hrTxt('easy')} · 심박 상한 우선`);
  });

  const totalKm = Math.round(sessions.reduce((s,x)=>s+(x.km||0),0));
  const phaseLbl = { base:'기본기', mp:'마라톤 특이', taper:'테이퍼' }[phase] || '기본기';
  const dLbl = isDownWeek ? ' · 회복주' : '';
  const qCnt = sessions.filter(s=>s.workout).length;
  const plan = { weekStart: isoDay(monday), target:totalKm, sessions, createdAt:Date.now(),
                 vdot:m.vdot, phase, isDownWeek, style:'mixed',
                 note:`다양한 훈련 · ${phaseLbl}${dLbl} · 주 ${totalKm}km · 품질 ${qCnt}회(인터벌·템포)` };
  state.plans[plan.weekStart] = plan;
  DB.put('plans', plan);
  return plan;
}
/* 워크아웃 총거리 추정(km) */
function estWorkoutKm(w){
  const easy = (state.metrics.zones?.easy)||360;
  let km = 0;
  for(const s of w.steps){
    if(s.distanceKm) km += s.distanceKm;
    else if(s.durationSec){ const p=(s.paceLo&&s.paceHi)?(s.paceLo+s.paceHi)/2:easy; km += s.durationSec/p; }
  }
  return +km.toFixed(1);
}

function generatePlan(monday){
  if(state.settings.planStyle==='mixed') return generateMixedPlan(monday);
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
      {variant:r.paceKey, subTmin:r.subTmin, workout:buildNsmWorkout(r, easyPace, recPace)});
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
  renderStyleToggle();
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
        ${s.workout?`<button class="btn ghost sm" data-run="${i}" style="margin-top:8px">▶︎ 이 워크아웃으로 러닝 (음성 안내)</button>`:''}
      </div>
      ${s.type!=='rest'?`<div class="chk ${s.done?'on':''}" data-chk="${i}">${s.done?'✓':''}</div>`:''}
    </div>`;
  }).join('');
  $$('[data-chk]', box).forEach(el=> el.addEventListener('click',(e)=>{
    e.stopPropagation();
    const i = +el.dataset.chk; plan.sessions[i].done = !plan.sessions[i].done;
    DB.put('plans', plan); renderPlan();
  }));
  $$('[data-run]', box).forEach(el=> el.addEventListener('click',(e)=>{
    e.stopPropagation();
    const s = plan.sessions[+el.dataset.run];
    loadWorkout(s.workout, s.type); go('run');
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

function renderStyleToggle(){
  const nsm = state.settings.planStyle!=='mixed';
  const a=$('#btnStyleNsm'), b=$('#btnStyleMixed'); if(!a||!b) return;
  a.classList.toggle('primary', nsm); b.classList.toggle('primary', !nsm);
}
function setPlanStyle(style){
  state.settings.planStyle = style;
  localStorage.setItem('rc_settings', JSON.stringify(state.settings));
  renderStyleToggle();
  if(!state.metrics.count){ toast('먼저 기록을 첨부하세요'); return; }
  const monday = new Date(mondayOf(Date.now())); monday.setDate(monday.getDate()+state.planWeekOffset*7);
  generatePlan(monday); renderPlan();
  toast(style==='mixed'?'다양한 훈련 플랜으로 생성했어요':'NSM 중심 플랜으로 생성했어요');
}
$('#btnStyleNsm').onclick = ()=> setPlanStyle('nsm');
$('#btnStyleMixed').onclick = ()=> setPlanStyle('mixed');

/* ============================================================
   러닝 맵 (Leaflet + OSM) · 날씨 (Open-Meteo)
   ============================================================ */
let _leafletLoading;
const runMapState = {
  map:null, marker:null, poly:null, ready:false,
  wxAt:0, wxKey:''
};
function ensureLeaflet(){
  if(window.L) return Promise.resolve();
  if(_leafletLoading) return _leafletLoading;
  _leafletLoading = new Promise((res, rej)=>{
    if(!document.querySelector('link[data-leaflet]')){
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.dataset.leaflet = '1';
      document.head.appendChild(link);
    }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = ()=>res();
    s.onerror = ()=>rej(new Error('지도 로드 실패'));
    document.head.appendChild(s);
  });
  return _leafletLoading;
}
function wmoLabel(code){
  const c = +code;
  if(c===0) return '맑음';
  if(c<=3) return '구름';
  if(c<=48) return '안개';
  if(c<=57) return '이슬비';
  if(c<=67) return '비';
  if(c<=77) return '눈';
  if(c<=82) return '소나기';
  if(c<=86) return '눈소나기';
  if(c<=99) return '뇌우';
  return '날씨';
}
async function fetchWeather(lat, lon){
  const el = $('#runWx'); if(!el) return;
  const key = lat.toFixed(2)+','+lon.toFixed(2);
  if(runMapState.wxKey===key && Date.now()-runMapState.wxAt < 10*60*1000) return;
  try{
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&timezone=auto&wind_speed_unit=ms`;
    const r = await fetch(url);
    if(!r.ok) throw new Error('wx');
    const j = await r.json();
    const c = j.current; if(!c) throw new Error('wx');
    runMapState.wxKey = key; runMapState.wxAt = Date.now();
    el.innerHTML = `<b>${Math.round(c.temperature_2m)}°</b> ${wmoLabel(c.weather_code)} · 습도 ${Math.round(c.relative_humidity_2m)}% · 체감 ${Math.round(c.apparent_temperature)}° · 풍속 ${(+c.wind_speed_10m).toFixed(1)}m/s`;
  }catch(e){
    if(!runMapState.wxKey) el.textContent = '날씨 정보를 불러오지 못했어요';
  }
}
function updateRunMarker(lat, lon, center){
  if(!runMapState.ready) return;
  runMapState.marker.setLatLng([lat, lon]);
  if(center) runMapState.map.setView([lat, lon], Math.max(runMapState.map.getZoom(), 15));
}
function updateRunPolyline(){
  if(!runMapState.ready || !run.path.length) return;
  runMapState.poly.setLatLngs(run.path);
  const last = run.path[run.path.length-1];
  updateRunMarker(last[0], last[1], true);
}
function clearRunPolyline(){
  if(runMapState.poly) runMapState.poly.setLatLngs([]);
}
function downsamplePath(path, maxPts){
  if(!path || !path.length) return [];
  if(path.length<=maxPts) return path.slice();
  const step = Math.ceil(path.length / maxPts);
  const out = [];
  for(let i=0;i<path.length;i+=step) out.push(path[i]);
  const last = path[path.length-1];
  const prev = out[out.length-1];
  if(!prev || prev[0]!==last[0] || prev[1]!==last[1]) out.push(last);
  return out;
}
async function initRunMap(){
  const box = $('#runMap'); if(!box) return;
  try{ await ensureLeaflet(); }
  catch(e){
    box.innerHTML = '<div style="padding:24px;text-align:center;color:var(--sub);font-size:12px">지도를 불러오지 못했어요</div>';
    return;
  }
  if(!runMapState.map){
    box.innerHTML = '';
    runMapState.map = L.map(box, { zoomControl:true }).setView([37.5665, 126.978], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
    }).addTo(runMapState.map);
    runMapState.marker = L.circleMarker([37.5665, 126.978], {
      radius:8, color:'#ff6a3d', fillColor:'#ff6a3d', fillOpacity:0.95, weight:2
    }).addTo(runMapState.map);
    runMapState.poly = L.polyline([], { color:'#4aa8ff', weight:4, opacity:0.9 }).addTo(runMapState.map);
    runMapState.ready = true;
  }
  setTimeout(()=>{ try{ runMapState.map.invalidateSize(); }catch(e){} }, 120);
  if(run.active && run.path.length){
    updateRunPolyline();
    return;
  }
  if(!('geolocation' in navigator)){
    const el=$('#runWx'); if(el) el.textContent='이 기기에서 위치를 사용할 수 없어요';
    return;
  }
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    updateRunMarker(lat, lon, true);
    await fetchWeather(lat, lon);
    if(!run.active){
      if(pos.coords.accuracy<=35) setGps('ok','GPS 양호');
      else setGps('weak','GPS 정확도 낮음');
    }
  }, ()=>{
    const el=$('#runWx');
    if(el && !runMapState.wxKey) el.textContent='위치 권한이 필요해요';
  }, { enableHighAccuracy:true, maximumAge:30000, timeout:15000 });
}

/* ============================================================
   실시간 러닝 (GPS + 동작센서 케이던스)
   ============================================================ */
const run = {
  active:false, paused:false, startTs:0, elapsed:0, dist:0,
  lastPos:null, watchId:null, timer:null, wakeLock:null,
  steps:0, lastPeak:0, cadWindow:[], path:[], recentPace:0, motionHandler:null,
  workout:null, stepIdx:0, stepBaseElapsed:0, stepBaseDist:0, lastPeriodicKm:0, hr:null
};

/* ── 음성 안내 (Web Speech API, ko-KR) ── */
let _voices = [];
function _loadVoices(){ try{ _voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; }catch(e){} }
if('speechSynthesis' in window){ _loadVoices(); speechSynthesis.onvoiceschanged = _loadVoices; }
function koVoices(){ if(!_voices.length) _loadVoices();
  return _voices.filter(x=>/^ko/i.test(x.lang) && !/microsoft/i.test(x.name||'')); }
/* 음성 샘플 10종(여5·남5): 기기에 설치된 한국어 음성 + 음높이/속도 조합으로 톤을 만든다.
   (기기에 남성/여성 한국어 음성이 여러 개면 자동으로 분산 배정) */
function voiceSamples(){
  const ko = koVoices();
  const base = ko.length ? ko : [null];
  const pick = (i)=> base[i % base.length];               // 설치된 음성 순환 배정
  const F = [
    { label:'여성 1 · 부드럽게', rate:0.92, pitch:1.15 },
    { label:'여성 2 · 밝고 친근', rate:1.00, pitch:1.28 },
    { label:'여성 3 · 차분하게', rate:0.88, pitch:1.05 },
    { label:'여성 4 · 또렷한 코치', rate:1.03, pitch:1.12 },
    { label:'여성 5 · 나긋하게', rate:0.9,  pitch:1.22 },
  ];
  const M = [
    { label:'남성 1 · 낮고 부드럽게', rate:0.92, pitch:0.82 },
    { label:'남성 2 · 차분한 저음', rate:0.88, pitch:0.72 },
    { label:'남성 3 · 또렷한 코치', rate:1.0,  pitch:0.86 },
    { label:'남성 4 · 편안하게', rate:0.9,  pitch:0.78 },
    { label:'남성 5 · 활기차게', rate:1.05, pitch:0.9 },
  ];
  const out = [];
  F.forEach((f,i)=> out.push({ ...f, gender:'F', voice: pick(i) }));
  M.forEach((m,i)=> out.push({ ...m, gender:'M', voice: pick(i) }));
  return out;
}
function speakWith(text, opt){
  if(!('speechSynthesis' in window) || !text) return;
  try{
    speechSynthesis.cancel();   // 재생 중이던 음성 즉시 중지 후 새 음성 시작
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = (opt && opt.rate) || 1.0;
    u.pitch = (opt && opt.pitch!=null) ? opt.pitch : 1.0;
    u.volume = 1.0;
    let voice = null;
    const uri = opt && opt.voiceURI;
    if(uri) voice = _voices.find(x=>x.voiceURI===uri);
    if(!voice) voice = koVoices()[0] || _voices.find(x=>/^ko/i.test(x.lang));
    if(voice) u.voice = voice;
    speechSynthesis.speak(u);
  }catch(e){}
}
function speak(text){
  const v = state.settings.voice;
  if(!v || !v.enabled) return;
  speakWith(text, { voiceURI:v.voiceURI, rate:v.rate||1.0, pitch:v.pitch!=null?v.pitch:1.0 });
}
function paceKor(sec){ if(!sec||!isFinite(sec)) return ''; const m=Math.floor(sec/60), s=Math.round(sec%60);
  return s? `${m}분 ${s}초` : `${m}분`; }
function durKor(sec){ sec=Math.round(sec); const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  return (h?`${h}시간 `:'')+(m?`${m}분 `:'')+(s&&!h?`${s}초`:'').trim() || '0초'; }
/* 설정된 항목으로 현재 상태 음성 문장 만들기 */
function statPhrases(pace, cad, km, elapsed){
  const v = state.settings.voice, out=[];
  if(v.pace && pace>0) out.push(`페이스 ${paceKor(pace)}`);
  if(v.cadence && cad>60) out.push(`케이던스 ${cad}`);
  if(v.hr && run.hr) out.push(`심박 ${run.hr}`);
  if(v.distance) out.push(`거리 ${km.toFixed(2)} 킬로미터`);
  if(v.time) out.push(`시간 ${durKor(elapsed)}`);
  return out;
}
function curCadence(){
  const w = run.cadWindow;
  return w.length>=2 ? Math.round(w.length/((w[w.length-1]-w[0])/60000)) : 0;
}

/* 워크아웃을 러닝 화면에 적재(플랜에서 선택 시) */
function loadWorkout(wo, type){
  if(run.active){ toast('러닝 중에는 워크아웃을 바꿀 수 없어요'); return; }
  state.loadedWorkout = wo ? JSON.parse(JSON.stringify(wo)) : null;
  state.loadedWorkoutType = type || null;
  renderRunTab();
  if(wo) toast(`워크아웃 준비: ${wo.name}`);
}

function renderRunTab(){
  // 러닝화 셀렉트 채우기
  const sel = $('#runShoe');
  const active = state.shoes.filter(s=>!s.retired);
  sel.innerHTML = `<option value="">선택 안 함</option>` +
    active.map(s=>`<option value="${s.id}">${s.name} (${(s.totalKm||0).toFixed(0)}km)</option>`).join('');
  $('#runShoeWrap').style.display = active.length? 'block':'none';
  $('#watchNote').innerHTML = `⌚️ <b>애플워치 연동 안내</b> — iOS 웹앱은 애플워치 센서에 직접 접근할 수 없습니다. 이 화면은 iPhone의 <b>GPS</b>로 페이스·거리·시간을, <b>동작센서</b>로 케이던스를 실시간 측정합니다. (Strava/Garmin과 동일한 원리) 워치 데이터는 러닝 후 이미지/파일로 <b>기록 탭</b>에 첨부하면 학습에 반영됩니다.`;

  // 워크아웃 셀렉트: 이번 주 플랜의 구조화된 세션 + 현재 적재된 워크아웃
  const woSel = $('#runWorkout'); if(!woSel) return;
  state._runWorkouts = [];
  const monday = new Date(mondayOf(Date.now()));
  const plan = state.plans[isoDay(monday)];
  const opts = ['<option value="">자유 러닝 (안내 없음)</option>'];
  if(plan){
    plan.sessions.forEach((s,i)=>{ if(s.workout){ state._runWorkouts.push({wo:s.workout, type:s.type});
      opts.push(`<option value="${state._runWorkouts.length-1}">${s.title}</option>`); } });
  }
  // 플랜 밖에서 적재된 워크아웃(플랜의 다른 주 등)
  if(state.loadedWorkout && !state._runWorkouts.some(x=>x.wo.name===state.loadedWorkout.name)){
    state._runWorkouts.push({wo:state.loadedWorkout, type:state.loadedWorkoutType});
    opts.push(`<option value="${state._runWorkouts.length-1}">${state.loadedWorkout.name}</option>`);
  }
  woSel.innerHTML = opts.join('');
  // 현재 적재된 워크아웃 선택 상태 반영
  if(state.loadedWorkout){ const idx=state._runWorkouts.findIndex(x=>x.wo.name===state.loadedWorkout.name);
    if(idx>=0) woSel.value = String(idx); }
  woSel.onchange = ()=>{
    const v = woSel.value;
    if(v===''){ state.loadedWorkout=null; state.loadedWorkoutType=null; }
    else { const it=state._runWorkouts[+v]; state.loadedWorkout=JSON.parse(JSON.stringify(it.wo)); state.loadedWorkoutType=it.type; if($('#runType')) $('#runType').value=it.type||'easy'; }
  };
  if(state.loadedWorkoutType && $('#runType')) $('#runType').value = state.loadedWorkoutType;
  initRunMap();
}

async function startRun(){
  if(!('geolocation' in navigator)){ toast('GPS를 사용할 수 없습니다'); return; }
  // 동작센서 권한 (iOS)
  if(typeof DeviceMotionEvent!=='undefined' && typeof DeviceMotionEvent.requestPermission==='function'){
    try{ await DeviceMotionEvent.requestPermission(); }catch(e){}
  }
  run.active=true; run.paused=false; run.startTs=Date.now(); run.elapsed=0; run.dist=0;
  run.lastPos=null; run.steps=0; run.cadWindow=[]; run.path=[];
  clearRunPolyline();
  // 워크아웃 적재
  run.workout = state.loadedWorkout ? JSON.parse(JSON.stringify(state.loadedWorkout)) : null;
  run.stepIdx = 0; run.stepBaseElapsed = 0; run.stepBaseDist = 0; run.lastPeriodicKm = 0;
  $('#woPick').style.display = 'none';
  $('#btnRunStart').classList.add('hidden');
  $('#btnRunPause').classList.remove('hidden');
  $('#btnRunStop').classList.remove('hidden');

  if(run.workout){
    const first = run.workout.steps[0];
    $('#woActive').style.display = 'block';
    $('#woName').textContent = run.workout.name;
    renderWorkoutStep(0, 0);
    speak(`${run.workout.name} 시작합니다. 첫 단계, ${first.label}. ${stepTargetPhrase(first)}`);
  } else {
    $('#woActive').style.display = 'none';
    if(state.settings.voice && state.settings.voice.enabled) speak('러닝을 시작합니다.');
  }

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
  updateRunPolyline();
  fetchWeather(p.lat, p.lon);
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

  if(run.paused) return;
  // 워크아웃 진행/전환 안내
  if(run.workout) updateWorkoutProgress(km, cur, cad);
  // 주기적 안내 (Nkm마다) — 워크아웃 유무와 무관
  const per = state.settings.voice && state.settings.voice.periodicKm;
  if(per>0 && km - run.lastPeriodicKm >= per){
    run.lastPeriodicKm = +(Math.floor(km/per)*per).toFixed(2);
    const mark = run.lastPeriodicKm % 1 === 0 ? String(run.lastPeriodicKm) : run.lastPeriodicKm.toFixed(1);
    const ph = statPhrases(cur, cad, km, run.elapsed);
    if(ph.length) speak(`${mark}킬로미터 지점. ${ph.join(', ')}`);
  }
}

/* 워크아웃 스텝 타겟 설명 문장 */
function stepTargetPhrase(step){
  if(!step) return '';
  const amt = step.durationSec ? paceKor(step.durationSec) : (step.distanceKm!=null? `${step.distanceKm} 킬로미터` : '');
  let tp = '';
  if(step.paceLo && step.paceHi){
    tp = step.kind==='work'
      ? ` 목표 페이스 ${paceKor(step.paceLo)}에서 ${paceKor(step.paceHi)}`
      : '';
  }
  return `${amt}${tp}`.trim();
}
/* 진행 중 스텝 UI 갱신 */
function renderWorkoutStep(elapsedInStep, distInStep){
  const step = run.workout && run.workout.steps[run.stepIdx];
  const box = $('#woActive'); if(!box) return;
  if(!step){ $('#woStep').textContent='완료'; $('#woRemain').textContent=''; $('#woBar').style.width='100%';
    $('#woTarget').textContent=''; $('#woNext').textContent=''; return; }
  const total = run.workout.steps.length;
  $('#woStep').textContent = `${step.label}`;
  let frac = 0, remainTxt = '';
  if(step.durationSec){ frac = Math.min(1, elapsedInStep/step.durationSec);
    remainTxt = `남은 ${fmtDuration(Math.max(0, step.durationSec-elapsedInStep))}`; }
  else if(step.distanceKm){ frac = Math.min(1, distInStep/step.distanceKm);
    remainTxt = `남은 ${Math.max(0,(step.distanceKm-distInStep)).toFixed(2)}km`; }
  $('#woBar').style.width = Math.round(frac*100)+'%';
  $('#woRemain').textContent = remainTxt;
  $('#woTarget').textContent = (step.paceLo&&step.paceHi)? `목표 ${fmtPace(step.paceLo)}~${fmtPace(step.paceHi)}/km` : '';
  const next = run.workout.steps[run.stepIdx+1];
  $('#woNext').textContent = next ? `다음: ${next.label}` : '마지막 단계';
  $('#woName').textContent = `${run.workout.name} · ${run.stepIdx+1}/${total}`;
}
/* 스텝 완료 판정 + 전환 음성 안내 */
function updateWorkoutProgress(km, curPace, cad){
  const step = run.workout.steps[run.stepIdx];
  if(!step) return;
  const inElapsed = run.elapsed - run.stepBaseElapsed;
  const inDist = km - run.stepBaseDist;
  renderWorkoutStep(inElapsed, inDist);
  let done = false;
  if(step.durationSec) done = inElapsed >= step.durationSec;
  else if(step.distanceKm) done = inDist >= step.distanceKm;
  // 카운트다운(마지막 3초)은 시간 기반 스텝만
  if(step.durationSec){ const left = step.durationSec - inElapsed;
    if(left<=3.2 && left>3.2-0.26 && run._lastCd!==run.stepIdx){ run._lastCd=run.stepIdx; speak('삼, 이, 일'); } }
  if(!done) return;
  // 구간 결과
  const lapPace = inDist>0 ? inElapsed/inDist : 0;
  const v = state.settings.voice;
  run.stepIdx++;
  run.stepBaseElapsed = run.elapsed; run.stepBaseDist = km;
  const next = run.workout.steps[run.stepIdx];
  // 음성: 이전 구간 결과 + 다음 안내
  const parts = [`${step.label} 완료.`];
  if(v.lapPace && (step.kind==='work') && lapPace>0) parts.push(`구간 페이스 ${paceKor(lapPace)}.`);
  if(v.cadence && cad>60 && step.kind==='work') parts.push(`케이던스 ${cad}.`);
  if(next){ parts.push(`다음 단계, ${next.label}.`); const tgt=stepTargetPhrase(next); if(tgt) parts.push(tgt+'.'); }
  else parts.push('워크아웃 완료! 수고하셨습니다.');
  speak(parts.join(' '));
  if(!next){ renderWorkoutStep(0,0); run.workout=null; toast('워크아웃 완료 🎉'); }
  else renderWorkoutStep(0,0);
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
    notes:'실시간 측정',
    path: downsamplePath(run.path, 2000)
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
  run.workout=null; run._lastCd=undefined; run.path=[];
  clearRunPolyline();
  const wa=$('#woActive'); if(wa) wa.style.display='none';
  const wp=$('#woPick'); if(wp) wp.style.display='block';
  renderRunTab();
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
  const vc = s.voice || {};
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
      <div><label class="f">최대심박 (bpm)${(!s.maxHRManual && state.metrics && state.metrics.learnedMaxHR)?' <span style="color:var(--ok);font-size:11px">· 자동 학습됨</span>':''}</label><input type="number" id="set_maxhr" value="${s.maxHR||190}"></div>
    </div>
    <label class="f">체중 (kg)</label>
    <input type="number" id="set_wt" value="${s.weightKg}">
    <div class="note">최대심박은 이지런/롱런 심박 상한(60~70%) 계산에 쓰입니다. <b>기록(특히 스플릿·고강도 세션)이 쌓이면 자동으로 학습·갱신</b>됩니다. 값을 직접 바꿔 저장하면 자동 학습이 멈추고, 학습값과 같게 두면 자동 학습이 유지됩니다.</div>

    <div class="hr"></div>
    <label class="f">훈련 플랜 스타일</label>
    <select id="set_style">
      <option value="nsm" ${s.planStyle!=='mixed'?'selected':''}>NSM 중심 (서브스레숄드)</option>
      <option value="mixed" ${s.planStyle==='mixed'?'selected':''}>다양한 훈련 (인터벌·템포·LSD)</option>
    </select>

    <div class="hr"></div>
    <h3 style="margin:0 0 8px">🔊 러닝 음성 안내</h3>
    <label class="switchrow"><span>음성 안내 사용</span><input type="checkbox" id="v_enabled" ${vc.enabled?'checked':''}></label>
    <div class="note" style="margin:2px 0 10px">인터벌/템포/NSM 워크아웃의 단계가 바뀔 때, 그리고 아래 주기마다 현재 상태를 음성으로 안내합니다.</div>
    <label class="f">안내에 포함할 항목</label>
    <div class="chipwrap">
      <label class="vchk"><input type="checkbox" id="v_pace" ${vc.pace?'checked':''}> 현재 페이스</label>
      <label class="vchk"><input type="checkbox" id="v_lap" ${vc.lapPace?'checked':''}> 구간 페이스</label>
      <label class="vchk"><input type="checkbox" id="v_cad" ${vc.cadence?'checked':''}> 케이던스</label>
      <label class="vchk"><input type="checkbox" id="v_hr" ${vc.hr?'checked':''}> 심박(센서 연결 시)</label>
      <label class="vchk"><input type="checkbox" id="v_dist" ${vc.distance?'checked':''}> 누적 거리</label>
      <label class="vchk"><input type="checkbox" id="v_time" ${vc.time?'checked':''}> 경과 시간</label>
    </div>
    <label class="f" style="margin-top:12px">음성 샘플 · 눌러서 들어보고 선택</label>
    <div id="v_samples" class="vsamp"></div>
    <div class="note" style="margin-top:6px">여성 5종·남성 5종을 눌러 들어보고 마음에 드는 걸 고르세요(선택하면 아래 값에 자동 반영). 더 자연스러운 목소리는 iPhone <b>설정 → 손쉬운 사용 → 콘텐츠 말하기 → 음성 → 한국어</b>에서 '유나(고급)' 등을 받으면 샘플이 더 다양해집니다.</div>

    <label class="f" style="margin-top:12px">안내 음성 <span style="color:var(--sub);font-weight:400">· 직접 조절</span></label>
    <select id="v_voice"></select>
    <div class="inline" style="margin-top:8px">
      <div><label class="f" style="margin-top:0">속도 <span id="v_rate_l" style="color:var(--acc)"></span></label>
        <input type="range" id="v_rate" min="0.7" max="1.3" step="0.05" value="${vc.rate!=null?vc.rate:0.92}"></div>
      <div><label class="f" style="margin-top:0">음높이 <span id="v_pitch_l" style="color:var(--acc)"></span></label>
        <input type="range" id="v_pitch" min="0.7" max="1.4" step="0.05" value="${vc.pitch!=null?vc.pitch:1.15}"></div>
    </div>
    <button class="btn block sm" id="v_test" style="margin-top:10px">🔊 이 목소리로 미리듣기</button>
    <div class="note" style="margin-top:6px">목소리가 딱딱하거나 무섭게 들리면 <b>음높이를 조금 올리고 속도를 살짝 낮춰</b> 보세요. 더 자연스러운 한국어 음성은 iPhone <b>설정 → 손쉬운 사용 → 콘텐츠 말하기 → 음성 → 한국어</b>에서 '유나(고급/프리미엄)' 등을 내려받으면 이 목록에 추가됩니다.</div>

    <label class="f" style="margin-top:12px">자동 안내 주기</label>
    <select id="v_period">
      <option value="0" ${vc.periodicKm===0?'selected':''}>끄기 (단계 전환 때만)</option>
      <option value="0.5" ${vc.periodicKm===0.5?'selected':''}>0.5km 마다</option>
      <option value="1" ${vc.periodicKm===1?'selected':''}>1km 마다</option>
      <option value="2" ${vc.periodicKm===2?'selected':''}>2km 마다</option>
    </select>

    <div class="hr"></div>
    <button class="btn block" id="set_shoes">👟 러닝화 관리</button>
    <div style="height:10px"></div>
    <button class="btn primary block" id="set_save">저장</button>
    <div class="note">앱 데이터는 이 기기에만 저장됩니다(IndexedDB). 홈 화면에 추가하면 오프라인에서도 동작해요.</div>
    <div style="text-align:center;font-size:12px;color:var(--mut);margin-top:14px">런코치 · 버전 ${APP_VERSION}</div>
  `);
  $('#set_shoes').onclick=()=>{ closeSheet(); go('shoes'); };

  // 음성 목록 채우기 (기기별) — 한국어 우선
  const fillVoices = ()=>{
    const sel = $('#v_voice'); if(!sel) return;
    const ko = koVoices();
    if(!ko.length){ sel.innerHTML = '<option value="">기본 음성 (한국어 음성 없음 · 아래 안내 참고)</option>'; return; }
    sel.innerHTML = ko.map(v=>`<option value="${v.voiceURI}" ${vc.voiceURI===v.voiceURI?'selected':''}>${v.name}</option>`).join('');
    if(vc.voiceURI && ko.some(v=>v.voiceURI===vc.voiceURI)) sel.value = vc.voiceURI;
  };
  // 슬라이더 값 라벨
  const rL=$('#v_rate_l'), pL=$('#v_pitch_l'), rI=$('#v_rate'), pI=$('#v_pitch');
  const syncLabels = ()=>{ if(rL) rL.textContent=(+rI.value).toFixed(2)+'x'; if(pL) pL.textContent=(+pI.value).toFixed(2); };
  if(rI) rI.oninput = syncLabels; if(pI) pI.oninput = syncLabels; syncLabels();

  const SAMPLE = '1킬로미터 지점, 페이스 5분 30초, 케이던스 178';
  // 샘플 10종 렌더 (들어보고 선택 → 아래 컨트롤에 반영)
  const renderSamples = ()=>{
    const box=$('#v_samples'); if(!box) return;
    state._vsamples = voiceSamples();
    box.innerHTML = state._vsamples.map((s,i)=>
      `<button type="button" class="vsampbtn" data-i="${i}">${s.gender==='M'?'👨':'👩'} ${s.label}</button>`).join('');
    box.querySelectorAll('.vsampbtn').forEach(b=> b.onclick=()=>{
      const s = state._vsamples[+b.dataset.i];
      if($('#v_voice') && s.voice) $('#v_voice').value = s.voice.voiceURI;
      if(rI) rI.value = s.rate; if(pI) pI.value = s.pitch; syncLabels();
      box.querySelectorAll('.vsampbtn').forEach(x=>x.classList.remove('on')); b.classList.add('on');
      speakWith(SAMPLE, { voiceURI:s.voice?s.voice.voiceURI:'', rate:s.rate, pitch:s.pitch });
    });
  };
  fillVoices(); renderSamples();
  if('speechSynthesis' in window){ speechSynthesis.onvoiceschanged = ()=>{ _loadVoices(); fillVoices(); renderSamples(); }; }

  $('#v_test').onclick=()=>{
    speakWith(SAMPLE, { voiceURI:$('#v_voice').value, rate:parseFloat($('#v_rate').value)||1, pitch:parseFloat($('#v_pitch').value)||1 });
  };
  $('#set_save').onclick=()=>{
    if('speechSynthesis' in window) speechSynthesis.cancel();  // 미리듣기 재생 중이면 중지
    state.settings.targetRace=$('#set_race').value;
    state.settings.weeklyGoalKm=parseInt($('#set_goal').value)||40;
    state.settings.weightKg=parseInt($('#set_wt').value)||65;
    const enteredMax=parseInt($('#set_maxhr').value)||190;
    const learned=state.metrics&&state.metrics.learnedMaxHR;
    state.settings.maxHRManual = !(learned && enteredMax===learned); // 학습값과 다르면 수동(자동 학습 중단)
    state.settings.maxHR=enteredMax;
    state.settings.raceDate=$('#set_race_date').value||'';
    const prevStyle = state.settings.planStyle;
    state.settings.planStyle = $('#set_style').value;
    state.settings.voice = {
      enabled: $('#v_enabled').checked,
      pace: $('#v_pace').checked, lapPace: $('#v_lap').checked, cadence: $('#v_cad').checked,
      hr: $('#v_hr').checked, distance: $('#v_dist').checked, time: $('#v_time').checked,
      periodicKm: parseFloat($('#v_period').value),
      voiceURI: $('#v_voice').value || '',
      rate: parseFloat($('#v_rate').value)||0.95,
      pitch: parseFloat($('#v_pitch').value)||1.1
    };
    localStorage.setItem('rc_settings',JSON.stringify(state.settings));
    // 스타일이 바뀌었으면 이번 주 플랜 재생성
    if(prevStyle!==state.settings.planStyle && state.metrics.count){
      const monday = new Date(mondayOf(Date.now())); monday.setDate(monday.getDate()+state.planWeekOffset*7);
      generatePlan(monday);
    }
    recompute(); closeSheet(); renderHome(); renderRunTab(); toast('설정 저장됨');
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
  try{
    const defVoice = Object.assign({}, state.settings.voice);
    const s=localStorage.getItem('rc_settings');
    if(s) state.settings=Object.assign(state.settings,JSON.parse(s));
    state.settings.voice = Object.assign(defVoice, state.settings.voice||{});   // 새 음성 옵션 기본값 보장
    if(!state.settings.planStyle) state.settings.planStyle='nsm';
  }catch(e){}
  await loadAll();
  await reclassifyAllAuto(); recompute();   // 기존 기록도 최신 존 기준으로 재판정
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
