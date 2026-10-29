// إصدار: 2026-10-14.5 · الاختبار
/* حارس الفصل الدراسي (المرحلة ٢ من الفصلين — 2026-10-13).
   الفصل المغلق (غير مفعَّل، أو مغلق نهائيًا، أو غير مرخَّص، أو انتهى تاريخه بتوقيت الرياض) يختفي عن موظفي المدرسة.
   الحماية الأصلية في firestore.rules (semWritable)؛ هذا الملف:
   - SemGuard.isOpen(school, period): هل الفصل مفتوح؟ (مدرسة بلا semesters = النمط القديم = مفتوح)
   - SemGuard.reason(school, period): سبب الإغلاق نصًّا.
   - SemGuard.start(): في صفحات الأدوات: يقرأ جلسة cls_session ويعرض غطاءً كاملًا «هذا الفصل مغلق» عند الإغلاق، ويعيد الفحص كل دقيقتين.
   لا يعمل لأدمن النظام ولا للمعلم المستقل (لا مدرسة له). */
(function(){
  var RECHECK_MS = 2 * 60 * 1000;
  var NAMES = { first: 'الفصل الأول', second: 'الفصل الثاني' };
  function nm(p){ return NAMES[p] || NAMES.first; }

  /* (2026-10-14.2) الوقت بساعة خوادم Google: فرق الساعة (الخادم − الجهاز) يُحفظ في cls_srvoff كلما استُدعيت currentPeriod،
     فلا تتأثر الحسابات بتاريخ جهاز المستخدم. ولا يوجد «تفعيل يدوي» للفصل: يُفتح تلقائيًا بتاريخه (مرخَّص + غير مقفل + داخل المدة). */
  var OFF_KEY = 'cls_srvoff';
  function off(){ try{ var v = parseInt(localStorage.getItem(OFF_KEY) || '0', 10); return isFinite(v) ? v : 0; }catch(e){ return 0; } }
  function now(){ return Date.now() + off(); }
  function setOff(serverMs){ try{ localStorage.setItem(OFF_KEY, String(serverMs - Date.now())); }catch(e){} }
  function loadFns(){
    return new Promise(function(res, rej){
      if(window.firebase && firebase.functions) return res();
      var sc = document.createElement('script');
      sc.src = 'https://www.gstatic.com/firebasejs/12.14.0/firebase-functions-compat.js';
      sc.onload = function(){ res(); };
      sc.onerror = function(){ rej(new Error('تعذّر تحميل خدمة الدوال. تحقق من الاتصال بالإنترنت.')); };
      document.head.appendChild(sc);
    });
  }
  // الفصل الحالي ووقت الخادم من دالة currentPeriod (يحفظ فرق الساعة)
  async function fetchPeriod(sid){
    await loadFns();
    var r = await firebase.functions().httpsCallable('currentPeriod')(sid ? { schoolId: sid } : {});
    var d = r.data || {};
    if(d.nowMs) setOff(d.nowMs);
    return d;
  }
  /* نافذة الفصل بالمللي ثانية مع تمديد الفصل الأول لهذه المدرسة (semExtend.first): الأول ينتهي بالتمديد، والثاني يبدأ في اليوم التالي */
  function win(sc, period){
    var w = (sc.semDates || {})[period];
    if(!w) return null;
    var e = Number(((sc.semExtend || {}).first) || 0);
    var f = w.fromMs, t = w.toMs;
    if(period === 'second' && e && e >= (f || 0)) f = e + 1;
    if(period !== 'second' && e && e > (t || 0)) t = e;
    return { fromMs: f, toMs: t };
  }
  function isOpen(sc, period){
    if(!sc || !sc.semesters) return true;
    var st = sc.semesters[period];
    if(!st || !st.licensed || st.locked) return false;
    var w = win(sc, period);
    var now_ = now();
    if(w){
      if(w.fromMs && now_ < w.fromMs) return false;
      if(w.toMs && now_ > w.toMs) return false;
    }
    return true;
  }
  function reason(sc, period){
    if(!sc || !sc.semesters) return '';
    var st = sc.semesters[period];
    if(!st || !st.licensed) return nm(period) + ' غير مرخَّص لهذه المدرسة.';
    if(st.locked) return nm(period) + ' مغلق نهائيًا من إدارة النظام.';
    var w = win(sc, period), now_ = now();
    if(w && w.toMs && now_ > w.toMs) return 'انتهى ' + nm(period) + '.';
    if(w && w.fromMs && now_ < w.fromMs) return 'لم يبدأ ' + nm(period) + ' بعد.';
    return '';
  }

  function sess(){ try{ return JSON.parse(localStorage.getItem('cls_session') || 'null'); }catch(e){ return null; } }
  var shown = false;
  function overlay(s, why){
    if(shown) return; shown = true;
    var isDir = s.role === 'schoolAdmin';
    var d = document.createElement('div');
    d.id = 'semGuardOverlay';
    d.setAttribute('dir', 'rtl');
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.94);color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:Tajawal,Tahoma,sans-serif';
    d.innerHTML = '<div style="max-width:420px"><div style="font-size:42px;margin-bottom:8px">🔒</div>'
      + '<h2 style="margin:0 0 10px;font-size:20px">هذا الفصل الدراسي مغلق</h2>'
      + '<p style="margin:0 0 18px;line-height:1.9;font-size:15px;opacity:.92">' + (why || '') + '<br>لا يمكن العمل فيه. ' + (isDir ? 'يمكنك إدارة الفصول من تبويب «الفصول الدراسية».' : 'تواصل مع مدير مدرستك.') + '</p>'
      + '<button id="semGuardBtn" style="background:#0b7a63;color:#fff;border:0;border-radius:12px;padding:12px 22px;font:inherit;font-size:15px;cursor:pointer">'
      + 'العودة إلى صفحة الدخول</button></div>';
    document.body.appendChild(d);
    document.getElementById('semGuardBtn').onclick = function(){
      try{ localStorage.removeItem('cls_session'); }catch(e){}
      location.href = 'index.html';
    };
  }

  /* (2026-10-14.3) إغلاق كامل بعد نهاية العام: غطاء لكل المستخدمين عدا أدمن النظام */
  var yShown = false;
  function yearOverlay(year){
    if(yShown) return; yShown = true;
    var d = document.createElement('div');
    d.id = 'semGuardYearOverlay';
    d.setAttribute('dir', 'rtl');
    d.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(15,23,42,.97);color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:Tajawal,Tahoma,sans-serif';
    d.innerHTML = '<div style="max-width:440px"><div style="font-size:42px;margin-bottom:8px">🔒</div>'
      + '<h2 style="margin:0 0 10px;font-size:20px">انتهى العام الدراسي' + (year ? ' ' + year : '') + '</h2>'
      + '<p style="margin:0 0 18px;line-height:1.9;font-size:15px;opacity:.92">النظام مغلق إلى حين اعتماد العام الدراسي الجديد.<br>للاستفسار تواصل مع إدارة النظام.</p>'
      + '<button id="semGuardYearBtn" style="background:#0b7a63;color:#fff;border:0;border-radius:12px;padding:12px 22px;font:inherit;font-size:15px;cursor:pointer">العودة إلى صفحة الدخول</button></div>';
    document.body.appendChild(d);
    document.getElementById('semGuardYearBtn').onclick = function(){
      try{ localStorage.removeItem('cls_session'); }catch(e){}
      location.href = 'index.html';
    };
  }

  /* تحويل الجلسة تلقائيًا إلى الفصل الحالي (بوقت الخادم) عند تغيّر الفصل أثناء الجلسة، مع إشعار ثم إعادة تحميل مرة واحدة.
     لا يعمل لأدمن النظام. عند تعذّر الاتصال لا يغيّر شيئًا (القواعد هي الحارس). */
  var syncing = false, lastSync = 0, SYNC_EVERY_MS = 10 * 60 * 1000;
  async function sync(force){
    var s = sess();
    if(syncing || !s || !s.userId || s.role === 'admin') return false;
    if(!force && lastSync && Date.now() - lastSync < SYNC_EVERY_MS) return false;   // لا نستدعي الخادم كل دقيقتين
    lastSync = Date.now();
    syncing = true;
    try{
      var d = await fetchPeriod(s.schoolId || '');
      if(d && d.closed){ yearOverlay(d.year); return true; }
      if(!d || !d.period) return false;
      if(s.viewOnly) return false;   // وضع عرض الفصل السابق: لا نحوّل الجلسة
      if((s.period || 'first') !== d.period){
        s.period = d.period;
        try{ localStorage.setItem('cls_session', JSON.stringify(s)); }catch(e){}
        var b = document.createElement('div');
        b.setAttribute('dir', 'rtl');
        b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:100000;background:#0b7a63;color:#fff;padding:14px;text-align:center;font:600 15px Tajawal,Tahoma,sans-serif';
        b.textContent = 'بدأ ' + nm(d.period) + '، تم تحويلك إليه.';
        document.body.appendChild(b);
        setTimeout(function(){ location.reload(); }, 2200);
        return true;
      }
      return false;
    }catch(e){ return false; }
    finally{ syncing = false; }
  }

  async function check(){
    var s = sess();
    if(!s) return;
    if(await sync()) return;
    if(!s.schoolId || s.role === 'admin' || s.role === 'soloTeacher' || s.ctxKey === 'solo' || s.viewOnly) return;
    if(!(window.firebase && firebase.apps && firebase.apps.length && firebase.firestore)) return;
    try{
      var snap = await firebase.firestore().collection('schoolData').doc(s.schoolId).get();
      if(!snap.exists) return;
      var sc = snap.data();
      var p = s.period || 'first';
      if(!isOpen(sc, p)) overlay(s, reason(sc, p));
    }catch(e){ /* بلا اتصال أو صلاحية: لا نمنع، فالقواعد هي الحارس الأصلي */ }
  }
  function start(){
    function go(){
      if(!(window.firebase && firebase.auth)){ return setTimeout(go, 400); }
      try{
        firebase.auth().onAuthStateChanged(function(u){ if(u) check(); });
      }catch(e){ return setTimeout(go, 800); }
      setInterval(check, RECHECK_MS);
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
  /* (2026-10-14.4) وضع «عرض الفصل السابق (قراءة فقط)»: cls_session.viewOnly = true.
     - يمنع كل كتابة من هذه الصفحة إلى Firestore (set/update/delete/add وbatch وtransaction) عدا مجموعتي pushTokens وusers (حساب المستخدم نفسه: آخر ظهور وإعدادات العرض).
       الحماية الفعلية في firestore.rules (الفصل السابق مغلق بتاريخه)، وهذا لإظهار رسالة واضحة بدل خطأ صلاحيات.
     - شريط ثابت أسفل الصفحة مع زر «العودة إلى الفصل الحالي». */
  var VO_MSG = 'أنت تعرض فصلًا سابقًا للقراءة فقط، ولا يمكن التعديل فيه. اضغط «العودة إلى الفصل الحالي» للعمل.';
  function voErr(){ var e = new Error(VO_MSG); e.code = 'permission-denied'; return e; }
  function voAllowed(ref){ var p = (ref && ref.path) || ''; return p.indexOf('pushTokens/') === 0 || p.indexOf('users/') === 0; }
  function installWriteGuard(){
    var F = window.firebase && firebase.firestore;
    if(!F || F.__voGuarded) return !!(F && F.__voGuarded);
    var n = 0;
    function wrap(proto, name, pathOf){
      if(!proto || typeof proto[name] !== 'function') return;
      var orig = proto[name];
      proto[name] = function(){
        if(pathOf && voAllowed(pathOf(this))) return orig.apply(this, arguments);
        return Promise.reject(voErr());
      };
      n++;
    }
    var self = function(x){ return x; };
    wrap(F.DocumentReference && F.DocumentReference.prototype, 'set', self);
    wrap(F.DocumentReference && F.DocumentReference.prototype, 'update', self);
    wrap(F.DocumentReference && F.DocumentReference.prototype, 'delete', self);
    wrap(F.CollectionReference && F.CollectionReference.prototype, 'add', self);
    wrap(F.WriteBatch && F.WriteBatch.prototype, 'commit', null);
    wrap(F.Firestore && F.Firestore.prototype, 'runTransaction', null);
    F.__voGuarded = n > 0;
    return n > 0;
  }
  function viewBanner(s){
    if(document.getElementById('semGuardViewBar')) return;
    var b = document.createElement('div');
    b.id = 'semGuardViewBar';
    b.setAttribute('dir', 'rtl');
    b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99990;background:#7a4b00;color:#fff;padding:8px 12px;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;font:600 13px Tajawal,Tahoma,sans-serif;text-align:center';
    var t = document.createElement('span');
    t.textContent = 'أنت تعرض ' + nm(s.period) + ' — قراءة فقط.' + (s.viewWhy ? ' (' + s.viewWhy + ')' : '');
    var btn = document.createElement('button');
    btn.textContent = 'العودة إلى الفصل الحالي';
    btn.style.cssText = 'background:#fff;color:#7a4b00;border:0;border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer';
    btn.onclick = async function(){
      if((s.ctxKey === 'solo' || s.role === 'soloTeacher')){   // (المرحلة ٥) المعلم المستقل: نعيد الجلسة إلى الفصل الحالي (بوقت الخادم) ونبقى في الصفحة
        var cs = sess() || s; delete cs.viewOnly; delete cs.viewWhy;
        try{ var dd = await fetchPeriod(''); if(dd && dd.period) cs.period = dd.period; }catch(e){}
        try{ localStorage.setItem('cls_session', JSON.stringify(cs)); }catch(e){}
        location.reload(); return;
      }
      var cur = sess() || s; delete cur.viewOnly; delete cur.viewWhy; cur.period = cur.period === 'first' ? 'second' : (cur.period || 'first');
      try{ localStorage.setItem('cls_session', JSON.stringify(cur)); }catch(e){}
      location.href = 'index.html';
    };
    b.appendChild(t); b.appendChild(btn);
    document.body.appendChild(b);
    document.body.style.paddingBottom = '46px';
  }
  function initViewOnly(){
    var s = sess();
    if(!s || !s.viewOnly || s.role === 'admin') return;
    var tries = 0;
    (function go(){
      if(installWriteGuard()) {} else if(tries++ < 60) setTimeout(go, 250);
    })();
    if(document.body) viewBanner(s); else document.addEventListener('DOMContentLoaded', function(){ viewBanner(s); });
  }
  initViewOnly();

  window.SemGuard = { win: win, yearOverlay: yearOverlay, isOpen: isOpen, reason: reason, start: start, check: check, sync: sync, fetchPeriod: fetchPeriod, now: now };
})();
