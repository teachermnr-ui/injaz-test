// إصدار: 2026-10-04.1 · الاختبار
/* =========================================================================
   محرك الجدول المدرسي — [ADMIN-TOOLS] ملف مستقل بالكامل (يُحذف عند إزالة الأدوات الإدارية)
   يعمل في ثلاث بيئات:
     ١) Web Worker: new Worker('timetable-engine.js') — للتوليد في الخلفية دون تجميد الصفحة
     ٢) سكربت عادي داخل الصفحة: self.TTEngine — لفحص التبديل والتعارضات أثناء الصيانة
     ٣) Node (للاختبار): module.exports
   ========================================================================= */
(function(root){
'use strict';

/* ---------- أوزان الرغبات («قدر الإمكان») ---------- */
const W = {
  UNPLACED: 1000,   // حصة لم تُوضع
  DAILY: 30,        // كل حصة زائدة عن الحد اليومي للمعلم
  SPREAD: 8,        // يوم بلا حصص لمعلم نصابه يكفي لكل الأيام
  GOLD: 10,         // اليوم الذهبي لم يتحقق
  GOLD_EXTRA: 2,    // كل حصة بعد الحد في اليوم الذهبي
  CONSEC: 15,       // حصتان متتاليتان لنفس المعلم في نفس الشعبة
  SUBJ3: 25,        // كل حصة فوق حصتين للمادة في اليوم للشعبة
  SUBJ2: 2,         // حصتان للمادة في يوم واحد مع إمكانية التوزيع
  TIME: 5,          // حصة خارج وقت المادة (أولية/متأخرة)
  PREF: 4           // يوم مفضل للمادة لم يتحقق
};

/* ---------- مولّد أرقام عشوائية بذرة ثابتة (لاختبارات قابلة للتكرار) ---------- */
function rng(seed){
  let a = (seed>>>0) || 1;
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* =========================================================================
   بناء المسألة
   input = {
     days:[0..6 weekday], ppd:{weekday:count}, breakAfter:[periodIndex...] (فاصل بعد الحصة ذات الفهرس),
     params:{earlyMax, lateMin, maxDaily, goldenLast},
     units:[{id, classCode, subjectId, subjectName, teacherId|null, len:1|2, timing:'early'|'late'|'any',
             prefDays:[weekday], consec:'no'|'allow'|'require', pin:{day,p}|null}],
     blocked:{teacherId:[[weekday,p],...]},
     loads:{teacherId:number}  // اختياري: النصاب الكلي للمعلم في كل المراحل (لقاعدة التوزيع على الأيام)
   }
   ========================================================================= */
function buildProblem(input){
  const days = (input.days||[]).slice();
  const D = days.length;
  const dayIndex = {}; days.forEach((w,i)=>dayIndex[w]=i);
  const ppd = days.map(w=>Math.max(0, +((input.ppd||{})[w])||0));
  const P = Math.max(1, ...ppd, 1);
  const breakAfter = new Uint8Array(P);
  (input.breakAfter||[]).forEach(p=>{ if(p>=0 && p<P) breakAfter[p]=1; });
  const params = Object.assign({ earlyMax:5, lateMin:4, maxDaily:5, goldenLast:4 }, input.params||{});

  const classes = [], classIdx = {};
  const teachers = [], teacherIdx = {};
  const units = [];
  (input.units||[]).forEach(u0=>{
    if(!(u0.classCode in classIdx)){ classIdx[u0.classCode]=classes.length; classes.push(u0.classCode); }
    let ti = -1;
    if(u0.teacherId){
      if(!(u0.teacherId in teacherIdx)){ teacherIdx[u0.teacherId]=teachers.length; teachers.push(u0.teacherId); }
      ti = teacherIdx[u0.teacherId];
    }
    const prefD = (u0.prefDays||[]).map(w=>dayIndex[w]).filter(x=>x!=null);
    let pin = -1;
    if(u0.pin && dayIndex[u0.pin.day]!=null) pin = dayIndex[u0.pin.day]*P + (+u0.pin.p);
    units.push({ id:String(u0.id), ci:classIdx[u0.classCode], ti, subj:String(u0.subjectId), subjName:u0.subjectName||'',
      len: u0.len===2?2:1, timing:u0.timing||'any', prefD, consec:u0.consec||'no', pin });
  });
  const C = classes.length, T = teachers.length, S = D*P;
  const blocked = new Uint8Array(Math.max(1,T*S));
  Object.keys(input.blocked||{}).forEach(tid=>{
    const ti = teacherIdx[tid]; if(ti==null) return;
    (input.blocked[tid]||[]).forEach(([w,p])=>{ const d=dayIndex[w]; if(d==null || p<0 || p>=P) return; blocked[ti*S + d*P + p]=1; });
  });
  // النصاب الكلي (لكل المراحل) لقاعدة «التوزيع على كامل الأيام»
  const tLoad = new Int32Array(Math.max(1,T));
  units.forEach(u=>{ if(u.ti>=0) tLoad[u.ti]+=u.len; });
  const totalLoad = new Int32Array(Math.max(1,T));
  for(let t=0;t<T;t++){ const ext=(input.loads||{})[teachers[t]]; totalLoad[t] = ext!=null ? Math.max(ext, tLoad[t]) : tLoad[t]; }
  // عدد حصص كل مادة لكل شعبة أسبوعيًا (لتقدير إمكانية التوزيع)
  const subjWeekly = {}, subjRequire = {}, classPref = [];
  for(let c=0;c<C;c++) classPref.push({});
  units.forEach((u,ui)=>{
    const k=u.ci+'|'+u.subj;
    subjWeekly[k]=(subjWeekly[k]||0)+u.len;
    if(u.consec==='require') subjRequire[k]=true;
    if(u.prefD.length && !classPref[u.ci][u.subj]) classPref[u.ci][u.subj] = { days:u.prefD, ui };
  });
  // اليوم الذهبي المستهدف: توزيع متوازن على الأيام، مع تجنّب يوم محجوب كليًا للمعلم
  const goldenTarget = new Int32Array(Math.max(1,T)).fill(-1);
  const perDay = new Array(D).fill(0);
  const order = [...Array(T).keys()].sort((a,b)=>tLoad[b]-tLoad[a]);
  order.forEach(t=>{
    let best=-1, bestN=1e9;
    for(let d=0; d<D; d++){
      if(ppd[d] <= params.goldenLast) continue;       // يوم قصير أصلًا — لا معنى لجعله ذهبيًا
      let free=0; for(let p=0;p<ppd[d];p++) if(!blocked[t*S+d*P+p]) free++;
      if(!free) continue;
      if(perDay[d] < bestN){ bestN=perDay[d]; best=d; }
    }
    if(best>=0){ goldenTarget[t]=best; perDay[best]++; }
  });
  return { days, D, P, S, ppd, breakAfter, params, classes, classIdx, teachers, teacherIdx, units,
    C, T, blocked, tLoad, totalLoad, subjWeekly, subjRequire, classPref, goldenTarget, W };
}

/* =========================================================================
   الحالة: مواقع الحصص + شبكات الشعب والمعلمين
   ========================================================================= */
function newState(pr){
  const st = {
    pos: new Int32Array(pr.units.length).fill(-1),
    cGrid: new Int32Array(Math.max(1,pr.C*pr.S)).fill(-1),
    tGrid: new Int32Array(Math.max(1,pr.T*pr.S)).fill(-1)
  };
  return st;
}
function cloneState(st){ return { pos: st.pos.slice(), cGrid: st.cGrid.slice(), tGrid: st.tGrid.slice() }; }

// صلاحية الموقع هندسيًا (داخل اليوم، والحصة المزدوجة لا تعبر فسحة/صلاة)
function geomOk(pr, u, s){
  const d = Math.floor(s/pr.P), p = s % pr.P;
  if(p + u.len > pr.ppd[d]) return false;
  if(u.len===2 && pr.breakAfter[p]) return false;
  return true;
}
function canPlace(pr, st, ui, s){
  const u = pr.units[ui];
  if(!geomOk(pr,u,s)) return false;
  for(let k=0;k<u.len;k++){
    const x = s+k;
    if(st.cGrid[u.ci*pr.S + x] !== -1) return false;
    if(u.ti>=0){
      if(st.tGrid[u.ti*pr.S + x] !== -1) return false;
      if(pr.blocked[u.ti*pr.S + x]) return false;
    }
  }
  return true;
}
function place(pr, st, ui, s){
  const u = pr.units[ui];
  st.pos[ui] = s;
  for(let k=0;k<u.len;k++){
    st.cGrid[u.ci*pr.S + s+k] = ui;
    if(u.ti>=0) st.tGrid[u.ti*pr.S + s+k] = ui;
  }
}
function unplace(pr, st, ui){
  const u = pr.units[ui], s = st.pos[ui];
  if(s<0) return;
  for(let k=0;k<u.len;k++){
    if(st.cGrid[u.ci*pr.S + s+k]===ui) st.cGrid[u.ci*pr.S + s+k] = -1;
    if(u.ti>=0 && st.tGrid[u.ti*pr.S + s+k]===ui) st.tGrid[u.ti*pr.S + s+k] = -1;
  }
  st.pos[ui] = -1;
}

/* =========================================================================
   التكلفة (الرغبات) — تُحسب لكل معلم ولكل شعبة لتقييم التغيير محليًا
   ========================================================================= */
function inTiming(pr, u, p){
  const last = p + u.len - 1;
  if(u.timing==='early') return last <= pr.params.earlyMax-1;
  if(u.timing==='late') return p >= pr.params.lateMin-1;
  return true;
}
function teacherCost(pr, st, t, out){
  const S=pr.S, P=pr.P, base=t*S, prm=pr.params;
  let cost=0;
  for(let d=0; d<pr.D; d++){
    let cnt=0, last=-1;
    for(let p=0;p<pr.ppd[d];p++){ if(st.tGrid[base+d*P+p]!==-1){ cnt++; last=p; } }
    if(cnt > prm.maxDaily){ cost += (cnt-prm.maxDaily)*W.DAILY; if(out) out.push({type:'daily', t, d, count:cnt}); }
    if(cnt===0 && pr.totalLoad[t] >= pr.D && pr.tLoad[t]>0){ cost += W.SPREAD; if(out) out.push({type:'emptyDay', t, d}); }
    if(pr.goldenTarget[t]===d && last >= prm.goldenLast){
      const extra = last - (prm.goldenLast-1);
      cost += W.GOLD + W.GOLD_EXTRA*extra; if(out) out.push({type:'golden', t, d, last});
    }
    for(let p=0;p<pr.ppd[d]-1;p++){
      if(pr.breakAfter[p]) continue;
      const a = st.tGrid[base+d*P+p], b = st.tGrid[base+d*P+p+1];
      if(a===-1 || b===-1 || a===b) continue;
      const ua = pr.units[a], ub = pr.units[b];
      if(ua.ci!==ub.ci) continue;
      if(ua.subj===ub.subj && ua.consec!=='no') continue;   // مادة مستثناة (مسموح/مطلوب)
      cost += W.CONSEC; if(out) out.push({type:'consec', t, d, p, c:ua.ci});
    }
  }
  return cost;
}
function classCost(pr, st, c, out){
  const S=pr.S, P=pr.P, base=c*S, prm=pr.params;
  let cost=0;
  const pref = pr.classPref[c];
  const got = {};   // subj -> Set(dayIdx) أيام تحققت فيها المادة ضمن وقتها
  let lastU = -1;
  for(let d=0; d<pr.D; d++){
    const cnt = {};
    for(let p=0;p<pr.ppd[d];p++){
      const ui = st.cGrid[base+d*P+p]; if(ui===-1) continue;
      const u = pr.units[ui];
      cnt[u.subj] = (cnt[u.subj]||0)+1;
      if(ui!==lastU){   // أول خلية للوحدة (المزدوجة تشغل خليتين متتاليتين)
        const p0 = st.pos[ui] % P;
        const okT = inTiming(pr,u,p0);
        if(!okT){ cost+=W.TIME; if(out) out.push({type:'timing', c, ui, d, p:p0}); }
        if(okT && pref[u.subj]) (got[u.subj]=got[u.subj]||new Set()).add(d);
      }
      lastU = ui;
    }
    lastU = -1;
    for(const sj in cnt){
      const n = cnt[sj];
      if(n>2){ cost += (n-2)*W.SUBJ3; if(out) out.push({type:'subj3', c, d, subj:sj, count:n}); }
      else if(n===2){
        const k = c+'|'+sj;
        // لا عقوبة إذا كانت المادة مزدوجة مطلوبة أو حصصها أكثر من عدد الأيام
        if((pr.subjWeekly[k]||0) <= pr.D && !pr.subjRequire[k]) cost += W.SUBJ2;
      }
    }
  }
  for(const sj in pref){
    const pn = pref[sj], g = got[sj];
    pn.days.forEach(d=>{ if(!g || !g.has(d)){ cost+=W.PREF; if(out) out.push({type:'pref', c, d, subj:sj, ui:pn.ui}); } });
  }
  return cost;
}
function totalCost(pr, st){
  let c=0;
  for(let t=0;t<pr.T;t++) c+=teacherCost(pr,st,t);
  for(let k=0;k<pr.C;k++) c+=classCost(pr,st,k);
  for(let i=0;i<pr.units.length;i++) if(st.pos[i]<0) c+=W.UNPLACED;
  return c;
}
function localCost(pr, st, ts, cs){
  let c=0;
  ts.forEach(t=>{ if(t>=0) c+=teacherCost(pr,st,t); });
  cs.forEach(k=>{ c+=classCost(pr,st,k); });
  return c;
}

/* =========================================================================
   الإدراج مع الإزاحة (سلسلة إخراج محدودة العمق)
   ========================================================================= */
function shuffled(arr, rand){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; }
  return a;
}
function bestDirectSlot(pr, st, ui, rand, noise){
  const u = pr.units[ui];
  let best=-1, bestC=Infinity;
  const ts=[u.ti], cs=[u.ci];
  for(let s=0;s<pr.S;s++){
    if(!canPlace(pr,st,ui,s)) continue;
    const before = localCost(pr,st,ts,cs);
    place(pr,st,ui,s);
    const after = localCost(pr,st,ts,cs);
    unplace(pr,st,ui);
    const c = after-before + (noise? rand()*noise : 0);
    if(c<bestC){ bestC=c; best=s; }
  }
  return best;
}
function tryPlace(pr, st, ui, depth, rand, budget, banned){
  if(budget.n-- <= 0) return false;
  const direct = bestDirectSlot(pr, st, ui, rand, 0.5);
  if(direct>=0){ place(pr,st,ui,direct); return true; }
  if(depth<=0) return false;
  const u = pr.units[ui];
  const slots = shuffled([...Array(pr.S).keys()], rand);
  for(const s of slots){
    if(!geomOk(pr,u,s)) continue;
    let bad=false; const conf=new Set();
    for(let k=0;k<u.len && !bad;k++){
      const x=s+k;
      if(u.ti>=0 && pr.blocked[u.ti*pr.S+x]){ bad=true; break; }
      const a=st.cGrid[u.ci*pr.S+x]; if(a!==-1) conf.add(a);
      if(u.ti>=0){ const b=st.tGrid[u.ti*pr.S+x]; if(b!==-1) conf.add(b); }
    }
    if(bad || conf.size!==1) continue;
    const w = [...conf][0];
    if(pr.units[w].pin>=0 || banned.has(w)) continue;
    const wOld = st.pos[w];
    unplace(pr,st,w);
    if(!canPlace(pr,st,ui,s)){ place(pr,st,w,wOld); continue; }
    place(pr,st,ui,s);
    banned.add(ui);
    const ok = tryPlace(pr,st,w,depth-1,rand,budget,banned);
    banned.delete(ui);
    if(ok) return true;
    unplace(pr,st,ui);
    place(pr,st,w,wOld);
    if(budget.n<=0) return false;
  }
  return false;
}

/* =========================================================================
   التوليد: بناء أولي ذكي + تحسين متكرر (محاكاة التلدين)
   ========================================================================= */
function solve(pr, opts, onProgress){
  opts = opts||{};
  const rand = rng(opts.seed || 12345);
  const timeLimit = opts.timeLimitMs || 12000;
  const t0 = Date.now();
  const st = newState(pr);
  // ١) الحصص المثبَّتة أولًا
  pr.units.forEach((u,ui)=>{ if(u.pin>=0 && canPlace(pr,st,ui,u.pin)) place(pr,st,ui,u.pin); });
  // ٢) ترتيب الصعوبة: المزدوجة، ثم المعلم الأكثر ضيقًا، ثم عشوائي
  const tFree = new Array(pr.T).fill(0);
  for(let t=0;t<pr.T;t++){ let f=0; for(let s=0;s<pr.S;s++){ const d=Math.floor(s/pr.P), p=s%pr.P; if(p<pr.ppd[d] && !pr.blocked[t*pr.S+s]) f++; } tFree[t]=Math.max(1,f); }
  const order = pr.units.map((u,ui)=>ui).filter(ui=>st.pos[ui]<0);
  const key = ui=>{ const u=pr.units[ui]; return (u.len===2?1000:0) + (u.ti>=0 ? 100*pr.tLoad[u.ti]/tFree[u.ti] : 0) + (u.timing!=='any'?5:0) + rand(); };
  const keys = {}; order.forEach(ui=>keys[ui]=key(ui));
  order.sort((a,b)=>keys[b]-keys[a]);
  const budget = { n: 200000 };
  order.forEach(ui=>{
    const s = bestDirectSlot(pr,st,ui,rand,0.5);
    if(s>=0) place(pr,st,ui,s);
    else tryPlace(pr,st,ui,3,rand,budget,new Set());
  });
  if(onProgress) onProgress(0.05, totalCost(pr,st), countUnplaced(st));

  // ٣) التحسين
  let cur = totalCost(pr,st), best = cur, bestSt = cloneState(st);
  const movable = pr.units.map((u,ui)=>ui).filter(ui=>pr.units[ui].pin<0);
  let it=0, lastRep=Date.now();
  const T0 = opts.t0 || 6, T1 = 0.05;
  while(movable.length){
    const el = Date.now()-t0;
    if(el > timeLimit) break;
    if(opts.maxIter && it>=opts.maxIter) break;
    it++;
    const frac = el/timeLimit;
    const temp = T0*Math.pow(T1/T0, frac);
    // إعادة محاولة الحصص غير الموضوعة دوريًا
    if(it % 400 === 0){
      let changed=false;
      for(let ui=0; ui<pr.units.length; ui++){
        if(st.pos[ui]>=0 || pr.units[ui].pin>=0) continue;
        if(tryPlace(pr,st,ui,3,rand,{n:4000},new Set())) changed=true;
      }
      if(changed){ cur = totalCost(pr,st); if(cur<best){ best=cur; bestSt=cloneState(st); } }
    }
    const ui = movable[Math.floor(rand()*movable.length)];
    const s0 = st.pos[ui]; if(s0<0) continue;
    const u = pr.units[ui];
    const s1 = Math.floor(rand()*pr.S);
    if(s1===s0 || !geomOk(pr,u,s1)) continue;
    // الوحدة الشاغلة للموقع الهدف في نفس الشعبة
    let v=-1, ok=true;
    for(let k=0;k<u.len;k++){
      const occ = st.cGrid[u.ci*pr.S+s1+k];
      if(occ===-1 || occ===ui) continue;
      if(v===-1) v=occ; else if(v!==occ){ ok=false; break; }
    }
    if(!ok) continue;
    if(v!==-1){
      const vu = pr.units[v];
      if(vu.pin>=0 || vu.len!==u.len || st.pos[v]!==s1) continue;
    }
    const ts=[u.ti], cs=[u.ci];
    if(v!==-1) ts.push(pr.units[v].ti);
    const before = localCost(pr,st,ts,cs);
    unplace(pr,st,ui); if(v!==-1) unplace(pr,st,v);
    let good = canPlace(pr,st,ui,s1);
    if(good){ place(pr,st,ui,s1); if(v!==-1){ good = canPlace(pr,st,v,s0); if(good) place(pr,st,v,s0); else unplace(pr,st,ui); } }
    if(!good){ place(pr,st,ui,s0); if(v!==-1) place(pr,st,v,s1); continue; }
    const after = localCost(pr,st,ts,cs);
    const delta = after-before;
    if(delta<=0 || rand() < Math.exp(-delta/temp)){
      cur += delta;
      if(cur < best - 1e-9){ best=cur; bestSt=cloneState(st); }
    } else {
      unplace(pr,st,ui); if(v!==-1) unplace(pr,st,v);
      place(pr,st,ui,s0); if(v!==-1) place(pr,st,v,s1);
    }
    if(onProgress && Date.now()-lastRep > 250){ lastRep=Date.now(); onProgress(Math.min(0.99,0.05+0.95*frac), best, countUnplaced(bestSt)); }
  }
  // محاولة أخيرة للحصص غير الموضوعة على أفضل حالة
  const fin = bestSt;
  for(let ui=0; ui<pr.units.length; ui++){
    if(fin.pos[ui]<0 && pr.units[ui].pin<0) tryPlace(pr,fin,ui,4,rand,{n:20000},new Set());
  }
  if(onProgress) onProgress(1, totalCost(pr,fin), countUnplaced(fin));
  return fin;
}
function countUnplaced(st){ let n=0; for(let i=0;i<st.pos.length;i++) if(st.pos[i]<0) n++; return n; }

/* ---------- تحويل الحالة إلى نتيجة قابلة للحفظ والعكس ---------- */
function exportPlacement(pr, st){
  return pr.units.map((u,ui)=>{
    const s = st.pos[ui];
    return s<0 ? { id:u.id, day:null, p:null } : { id:u.id, day: pr.days[Math.floor(s/pr.P)], p: s % pr.P };
  });
}
// يبني حالة من مواضع محفوظة؛ ما يتعارض يُترك غير موضوع ويُعاد في conflicts
function stateFrom(pr, placement){
  const st = newState(pr);
  const byId = {}; (placement||[]).forEach(x=>{ byId[x.id]=x; });
  const conflicts = [];
  // المثبَّتة أولًا ثم البقية
  const idx = pr.units.map((u,ui)=>ui).sort((a,b)=>(pr.units[b].pin>=0)-(pr.units[a].pin>=0));
  idx.forEach(ui=>{
    const x = byId[pr.units[ui].id];
    if(!x || x.day==null) return;
    const d = pr.days.indexOf(x.day); if(d<0){ conflicts.push(pr.units[ui].id); return; }
    const s = d*pr.P + (+x.p);
    if(canPlace(pr,st,ui,s)) place(pr,st,ui,s); else conflicts.push(pr.units[ui].id);
  });
  return { st, conflicts };
}

/* ---------- تقرير الرغبات غير المتحققة ---------- */
function evaluate(pr, st){
  const v=[];
  for(let t=0;t<pr.T;t++) teacherCost(pr,st,t,v);
  for(let c=0;c<pr.C;c++) classCost(pr,st,c,v);
  const unplaced=[]; pr.units.forEach((u,ui)=>{ if(st.pos[ui]<0) unplaced.push(u.id); });
  return { cost: totalCost(pr,st), violations: v.map(x=>decorate(pr,x)), unplaced };
}
function decorate(pr, x){
  const o = Object.assign({}, x);
  if(x.t!=null) o.teacherId = pr.teachers[x.t];
  if(x.c!=null) o.classCode = pr.classes[x.c];
  if(x.d!=null) o.day = pr.days[x.d];
  if(x.ui!=null){ o.unitId = pr.units[x.ui].id; o.subjectName = pr.units[x.ui].subjName; }
  if(x.subj!=null){ const u=pr.units.find(q=>q.subj===x.subj); o.subjectId=x.subj; if(u) o.subjectName=u.subjName; }
  delete o.t; delete o.c; delete o.d; delete o.ui; delete o.subj;
  return o;
}

/* =========================================================================
   الصيانة: خيارات التبديل لحصة محددة (مباشر / بسلسلة حتى معلمَين إضافيين / مستحيل)
   الحركة الأساسية: تبديل وقتَي حصتين لنفس الشعبة، أو نقل حصة لموقع فارغ في شعبتها
   ========================================================================= */
function swapOptions(pr, st, unitId, opts){
  opts = opts||{};
  const maxExtra = opts.maxExtra==null ? 2 : opts.maxExtra;
  const nodeBudget = opts.nodeBudget || 2500;
  const maxSol = opts.maxSolutions || 3;
  const ui = pr.units.findIndex(u=>u.id===unitId);
  if(ui<0 || st.pos[ui]<0) return [];
  const u = pr.units[ui];
  const s0 = st.pos[ui];
  const out = [];
  const seenTargets = new Set();
  for(let s1=0; s1<pr.S; s1++){
    if(s1===s0 || !geomOk(pr,u,s1)) continue;
    let v=-1, ok=true;
    for(let k=0;k<u.len;k++){
      const occ = st.cGrid[u.ci*pr.S+s1+k];
      if(occ===-1 || occ===ui) continue;
      if(v===-1) v=occ; else if(v!==occ){ ok=false; break; }
    }
    if(!ok) continue;
    if(v!==-1){
      const vu=pr.units[v];
      if(vu.len!==u.len || st.pos[v]!==s1) continue;
      // نفس المادة لنفس الشعبة (ولو لنفس المعلم) تبديلها لا يُحدث أي تغيير فعلي — تُستبعد من نطاق التبديل أصلًا
      if(vu.subj===u.subj) continue;
    }
    const tkey = v!==-1 ? 'u'+v : 's'+s1;
    if(seenTargets.has(tkey)) continue; seenTargets.add(tkey);
    const target = { day: pr.days[Math.floor(s1/pr.P)], p: s1%pr.P, unitId: v!==-1 ? pr.units[v].id : null };
    if(v!==-1 && pr.units[v].pin>=0){ out.push({ target, status:'none', reason:'pinned' }); continue; }
    const baseMoves = [[ui,s1]]; if(v!==-1) baseMoves.push([v,s0]);
    const sols = [];
    const budget = { n: nodeBudget };
    chainSearch(pr, st, baseMoves, maxExtra, budget, sols, maxSol);
    if(!sols.length){ out.push({ target, status:'none' }); continue; }
    sols.forEach(sol=>{ sol.delta = scoreMoves(pr, st, sol.moves); });
    sols.sort((a,b)=> a.moves.length-b.moves.length || a.delta-b.delta);
    out.push({ target, status: sols[0].moves.length===baseMoves.length ? 'direct' : 'chain',
      solutions: sols.map(sol=>({ delta: sol.delta, moves: sol.moves.map(([x,s])=>({
        unitId: pr.units[x].id,
        from: { day: pr.days[Math.floor(st.pos[x]/pr.P)], p: st.pos[x]%pr.P },
        to:   { day: pr.days[Math.floor(s/pr.P)], p: s%pr.P }
      })) })) });
  }
  return out;
}
// يفحص مجموعة حركات متزامنة: يعيد أول تعارض معلم (أو null إن كانت سليمة، أو 'bad' إن كانت مستحيلة)
function movesConflict(pr, st, moves){
  const moved = new Map(); moves.forEach(([x,s])=>moved.set(x,s));
  // إشغال المعلمين والشعب بعد الحركات
  for(const [x,s] of moves){
    const u = pr.units[x];
    if(!geomOk(pr,u,s)) return 'bad';
    for(let k=0;k<u.len;k++){
      const cell = s+k;
      if(u.ti>=0 && pr.blocked[u.ti*pr.S+cell]) return 'bad';
      // الشعبة: الشاغل الحالي يجب أن يكون متحركًا
      const co = st.cGrid[u.ci*pr.S+cell];
      if(co!==-1 && co!==x && !moved.has(co)) return 'bad';
      if(u.ti>=0){
        const to = st.tGrid[u.ti*pr.S+cell];
        if(to!==-1 && to!==x && !moved.has(to)) return { unit: to };   // معلم مشغول بحصة غير متحركة
      }
    }
  }
  // تعارضات بين المتحركين أنفسهم
  const occT = new Map(), occC = new Map();
  for(const [x,s] of moves){
    const u = pr.units[x];
    for(let k=0;k<u.len;k++){
      const cell=s+k;
      const ck = u.ci+':'+cell; if(occC.has(ck)) return 'bad'; occC.set(ck,x);
      if(u.ti>=0){ const tk=u.ti+':'+cell; if(occT.has(tk)) return 'bad'; occT.set(tk,x); }
    }
  }
  return null;
}
function chainSearch(pr, st, moves, extraLeft, budget, sols, maxSol){
  if(budget.n-- <= 0 || sols.length>=maxSol) return;
  const c = movesConflict(pr, st, moves);
  if(c===null){ sols.push({ moves: moves.slice() }); return; }
  if(c==='bad' || extraLeft<=0) return;
  // الحصة المعيقة m يجب أن تتحرك: تبديل مع حصة أخرى من شعبتها أو نقل لموقع فارغ
  const m = c.unit, mu = pr.units[m];
  if(mu.pin>=0) return;
  const movedSet = new Set(moves.map(x=>x[0]));
  const sm = st.pos[m];
  for(let s=0; s<pr.S && sols.length<maxSol && budget.n>0; s++){
    if(s===sm || !geomOk(pr,mu,s)) continue;
    let w=-1, ok=true;
    for(let k=0;k<mu.len;k++){
      const occ = st.cGrid[mu.ci*pr.S+s+k];
      if(occ===-1) continue;
      if(w===-1) w=occ; else if(w!==occ){ ok=false; break; }
    }
    if(!ok) continue;
    if(w!==-1){ const wu=pr.units[w]; if(movedSet.has(w) || wu.pin>=0 || wu.len!==mu.len || st.pos[w]!==s) continue;
      // نفس قاعدة الخيار الأساسي: تبديل حصتين بنفس المادة لنفس الشعبة لا يغيّر شيئًا — لا يُجرَّب داخل السلسلة أيضًا
      if(wu.subj===mu.subj) continue; }
    const next = moves.concat([[m,s]]);
    if(w!==-1) next.push([w,sm]);
    chainSearch(pr, st, next, extraLeft-1, budget, sols, maxSol);
  }
}
function applyMoves(pr, st, moves){
  moves.forEach(([x])=>unplace(pr,st,x));
  moves.forEach(([x,s])=>place(pr,st,x,s));
}
function scoreMoves(pr, st, moves){
  const ts=new Set(), cs=new Set();
  moves.forEach(([x])=>{ const u=pr.units[x]; if(u.ti>=0) ts.add(u.ti); cs.add(u.ci); });
  const before = localCost(pr,st,ts,cs);
  const olds = moves.map(([x])=>[x, st.pos[x]]);
  applyMoves(pr,st,moves);
  const after = localCost(pr,st,ts,cs);
  applyMoves(pr,st,olds);
  return after-before;
}
// تطبيق حل (بمعرّفات الحصص) على حالة
function applySolution(pr, st, solMoves){
  const mv = solMoves.map(m=>{
    const ui = pr.units.findIndex(u=>u.id===m.unitId);
    const d = pr.days.indexOf(m.to.day);
    return [ui, d*pr.P + (+m.to.p)];
  });
  if(movesConflict(pr, st, mv)!==null) return false;
  applyMoves(pr, st, mv);
  return true;
}

/* ---------- واجهة موحّدة ---------- */
const API = { W, rng, buildProblem, newState, cloneState, canPlace, place, unplace, geomOk, solve, exportPlacement,
  stateFrom, evaluate, totalCost, swapOptions, applySolution, movesConflict, countUnplaced };
root.TTEngine = API;
if(typeof module!=='undefined' && module.exports) module.exports = API;

/* ---------- وضع Web Worker ---------- */
if(typeof importScripts==='function' && typeof window==='undefined'){
  self.onmessage = function(ev){
    const msg = ev.data||{};
    if(msg.cmd==='solve'){
      try{
        const pr = buildProblem(msg.input);
        const st = solve(pr, msg.opts||{}, (f,cost,unp)=>self.postMessage({ type:'progress', frac:f, cost, unplaced:unp }));
        self.postMessage({ type:'done', placement: exportPlacement(pr,st), report: evaluate(pr,st) });
      }catch(e){ self.postMessage({ type:'error', message: String(e && e.message || e) }); }
    }
  };
}
})(typeof self!=='undefined' ? self : (typeof globalThis!=='undefined' ? globalThis : this));
