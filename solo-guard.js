// إصدار: 2026-10-14.5 · الاختبار
/* حارس اشتراك المعلم الفردي (المرحلة ٤ من الأمان — 2026-10-13).
   - ينتهي الاشتراك ← «قراءة فقط»: يدخل ويرى بياناته ويصدّرها، لكن تُرفض كل كتابة على Firestore (إلا مستند حسابه ورمز جهاز الإشعارات).
   - قبل الانتهاء بخمسة عشر يومًا: شريط تنبيه تجديد (المرحلة ٥). بعد الانتهاء: شريط دائم.
   - يعمل فقط لجلسة سياقها «حساب مستقل» (cls_session.ctxKey==='solo' أو role==='soloTeacher')؛ سياق المدرسة لا علاقة له بالاشتراك الفردي.
   - الحماية الأصلية في firestore.rules (isSolo يشترط عدم الانتهاء)؛ هذا الملف واجهة تمنع الكتابة وتعرض الحالة.
   الاستعمال: SoloGuard.start(async function(){ return <كائن solo من مستند المستخدم أو null> });
   وللصفحات ذات SDK المعيّن (Modular): if(SoloGuard.readOnly()) ... أو SoloGuard.assertWritable(). */
(function(){
  var DAY = 86400000, WARN_DAYS = 15, RECHECK_MS = 5 * 60 * 1000;
  var CONTACT = 'info@awraqai.com';
  var MSG = 'انتهى اشتراكك، وحسابك الآن في وضع القراءة فقط. جدّد اشتراكك لتتمكن من الإضافة والتعديل.';
  var state = { kind: 'unknown', ends: null, days: null, plan: null, covered: null };
  var PLAN_AR = { semester: 'فصل دراسي واحد', year: 'العام الدراسي كامل', trial: 'تجربة مجانية' };
  var PER_AR = { first: 'الفصل الأول', second: 'الفصل الثاني' };
  var started = false, getter = null, timer = null;

  function sess(){ try{ return JSON.parse(localStorage.getItem('cls_session') || 'null'); }catch(e){ return null; } }
  function isSoloSession(s){ return !!s && (s.ctxKey === 'solo' || s.role === 'soloTeacher'); }
  function dstr(ms){ try{ return new Date(ms).toLocaleDateString('ar-SA-u-ca-gregory', { day:'numeric', month:'long', year:'numeric' }); }catch(e){ return new Date(ms).toISOString().slice(0,10); } }

  // الحالة من كائن solo: لا تاريخ = بلا نهاية (للأدمن فقط يُضبط هكذا)
  function compute(solo){
    if(!solo) return { kind: 'none', ends: null, days: null };
    var ex = { plan: solo.plan || null, covered: Array.isArray(solo.coveredPeriods) ? solo.coveredPeriods : null };
    function mk(o){ o.plan = ex.plan; o.covered = ex.covered; return o; }
    if(solo.active === false) return mk({ kind: 'disabled', ends: null, days: null });
    var ends = solo.subscriptionEnds;
    if(!ends) return mk({ kind: 'active', ends: null, days: null });
    var now = Date.now();
    if(now > ends) return mk({ kind: 'expired', ends: ends, days: -Math.ceil((now - ends) / DAY) });
    var d = Math.ceil((ends - now) / DAY);
    return mk({ kind: d <= WARN_DAYS ? 'warn' : 'active', ends: ends, days: d });
  }

  function viewing(){ var s = sess(); return !!(s && s.viewOnly); }
  function readOnly(){ return state.kind === 'expired' || viewing(); }
  // الفصل السابق المسموح عرضه: الأول فقط حين نكون في الثاني، وبشرط أن يشمله اشتراكه (الحسابات القديمة بلا قائمة فصول تُسمح احتياطًا)
  function prevAllowed(){
    var s = sess();
    if(!s || s.viewOnly || s.period !== 'second' || state.kind === 'none' || state.kind === 'disabled') return false;
    return !state.covered || state.covered.indexOf('first') >= 0;
  }
  function openPrev(){
    var s = sess(); if(!s) return;
    if(!confirm('ستعرض ' + PER_AR.first + ' للقراءة فقط: لا يمكنك التعديل فيه، ويمكنك العودة إلى الفصل الحالي في أي وقت. متابعة؟')) return;
    s.period = 'first'; s.viewOnly = true;
    try{ localStorage.setItem('cls_session', JSON.stringify(s)); }catch(e){}
    location.reload();
  }
  function planChip(){
    var old = document.getElementById('soloPlanChip');
    var show = !!(document.body && state.kind !== 'none' && state.kind !== 'unknown' && !viewing() && (state.plan || prevAllowed()));
    if(!show){ if(old) old.remove(); return; }
    var el = old || document.createElement('div');
    el.id = 'soloPlanChip';
    el.setAttribute('dir', 'rtl');
    el.style.cssText = 'position:fixed;bottom:10px;inset-inline-start:10px;z-index:99980;background:#0f3d33;color:#fff;border-radius:12px;padding:6px 12px;font:600 12px/1.6 Tajawal,system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:92vw';
    var t = document.createElement('span');
    t.textContent = (state.plan ? 'اشتراكك: ' + (PLAN_AR[state.plan] || state.plan) : 'اشتراكك') + (state.ends ? (state.kind === 'expired' ? ' — انتهى في ' : ' — ينتهي في ') + dstr(state.ends) : '');
    el.innerHTML = ''; el.appendChild(t);
    if(prevAllowed()){
      var b = document.createElement('button');
      b.textContent = 'عرض ' + PER_AR.first + ' (قراءة فقط)';
      b.style.cssText = 'background:#fff;color:#0f3d33;border:0;border-radius:8px;padding:3px 10px;font:inherit;cursor:pointer';
      b.onclick = openPrev;
      el.appendChild(b);
    }
    if(!old) document.body.appendChild(el);
  }
  function mkErr(){ var e = new Error(MSG); e.code = 'solo-expired'; return e; }
  function assertWritable(){ if(readOnly()) throw mkErr(); }
  function allowedPath(p){ return /^(users|pushTokens)\//.test(p || ''); }

  // منع الكتابة في SDK المتوافق (compat): DocumentReference / CollectionReference.add / WriteBatch / Transaction
  function patchCompat(){
    var fs = window.firebase && window.firebase.firestore;
    if(!fs) return;
    var DR = fs.DocumentReference && fs.DocumentReference.prototype;
    var CR = fs.CollectionReference && fs.CollectionReference.prototype;
    var WB = fs.WriteBatch && fs.WriteBatch.prototype;
    var TX = fs.Transaction && fs.Transaction.prototype;
    function wrap(P, m, kind){
      if(!P || typeof P[m] !== 'function' || P[m].__sg) return;
      var orig = P[m];
      var fn;
      if(kind === 'doc'){ fn = function(){ if(readOnly() && !allowedPath(this.path)) return Promise.reject(mkErr()); return orig.apply(this, arguments); }; }
      else if(kind === 'add'){ fn = function(){ if(readOnly() && !allowedPath(this.path)) return Promise.reject(mkErr()); return orig.apply(this, arguments); }; }
      else if(kind === 'batch'){ fn = function(ref){ if(readOnly() && !(ref && allowedPath(ref.path))) { this.__sgBlocked = true; return this; } return orig.apply(this, arguments); }; }
      else if(kind === 'commit'){ fn = function(){ if(this.__sgBlocked) return Promise.reject(mkErr()); return orig.apply(this, arguments); }; }
      else { fn = function(ref){ if(readOnly() && !(ref && allowedPath(ref.path))) throw mkErr(); return orig.apply(this, arguments); }; }
      fn.__sg = 1; P[m] = fn;
    }
    ['set', 'update', 'delete'].forEach(function(m){ wrap(DR, m, 'doc'); wrap(WB, m, 'batch'); wrap(TX, m, 'tx'); });
    wrap(CR, 'add', 'add');
    wrap(WB, 'commit', 'commit');
  }

  function bannerEl(){ return document.getElementById('soloGuardBar'); }
  function renderBanner(){
    var old = bannerEl();
    var show = state.kind === 'expired' || state.kind === 'warn';
    if(state.kind === 'warn'){ try{ if(sessionStorage.getItem('sg_dismiss_' + state.ends)) show = false; }catch(e){} }
    if(!show){ if(old) old.remove(); document.body && document.body.classList.remove('solo-readonly'); return; }
    if(!document.body) return;
    var expired = state.kind === 'expired';
    var txt = expired
      ? 'انتهى اشتراكك بتاريخ ' + dstr(state.ends) + '. حسابك الآن في وضع القراءة فقط — يمكنك الاطلاع على بياناتك وتصديرها، ولا يمكنك الإضافة أو التعديل حتى تجدّد اشتراكك.'
      : (state.days <= 0 ? 'ينتهي اشتراكك اليوم' : (state.days === 1 ? 'ينتهي اشتراكك غدًا' : (state.days === 2 ? 'ينتهي اشتراكك بعد يومين' : 'ينتهي اشتراكك بعد ' + state.days + ' أيام'))) + ' (بتاريخ ' + dstr(state.ends) + '). جدّد اشتراكك قبل الانتهاء ليستمر عملك دون انقطاع.';
    var el = old || document.createElement('div');
    el.id = 'soloGuardBar';
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:sticky;top:0;z-index:99999;direction:rtl;text-align:center;font:600 14px/1.7 Tajawal,system-ui,sans-serif;padding:10px 44px 10px 14px;color:#fff;background:' + (expired ? '#b3261e' : '#a15c00') + ';box-shadow:0 2px 8px rgba(0,0,0,.25)';
    el.innerHTML = '<span></span> <a style="color:#fff;text-decoration:underline;margin-inline-start:8px" href="mailto:' + CONTACT + '?subject=%D8%AA%D8%AC%D8%AF%D9%8A%D8%AF%20%D8%A7%D8%B4%D8%AA%D8%B1%D8%A7%D9%83%20%D9%85%D9%86%D8%AC%D8%B2%20%D8%A7%D9%84%D9%85%D8%AF%D8%B1%D8%B3%D9%8A">للتجديد: ' + CONTACT + '</a>' +
      (expired ? '' : '<button type="button" aria-label="إخفاء" style="position:absolute;inset-inline-start:10px;top:6px;background:none;border:0;color:#fff;font-size:22px;cursor:pointer">×</button>');
    el.firstChild.textContent = txt;
    var b = el.querySelector('button');
    if(b) b.onclick = function(){ try{ sessionStorage.setItem('sg_dismiss_' + state.ends, '1'); }catch(e){} el.remove(); };
    if(!old) document.body.insertBefore(el, document.body.firstChild);
    document.body.classList.toggle('solo-readonly', expired);
  }

  async function refresh(){
    if(!getter) return;
    var solo = null;
    try{ solo = await getter(); }catch(e){ return; }   // تعذّر الجلب: نُبقي الحالة السابقة
    state = compute(solo);
    patchCompat();
    renderBanner();
    planChip();
  }

  function start(fn){
    var s = sess();
    if(!isSoloSession(s)) return;
    getter = fn;
    patchCompat();
    var run = function(){ refresh(); };
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
    if(!started){
      started = true;
      timer = setInterval(refresh, RECHECK_MS);
      document.addEventListener('visibilitychange', function(){ if(!document.hidden) refresh(); });
    }
  }

  window.SoloGuard = {
    start: start, refresh: refresh, readOnly: readOnly, assertWritable: assertWritable,
    state: function(){ return state; }, compute: compute, MSG: MSG, prevAllowed: prevAllowed
  };
})();
