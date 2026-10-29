// إصدار: 2026-10-29.1 · الاختبار
/* =========================================================================
   تطبيق منجز المدرسي (PWA) والإشعارات الفورية — ص-١٢
   مشترك بين index.html و myday.html:
   - تسجيل عامل الخدمة (firebase-messaging-sw.js في الجذر) — يلزم للتثبيت وللإشعارات.
   - شريط «ثبّت التطبيق» بعد الدخول (أندرويد: زر تثبيت · آيفون: مشاركة ← إضافة إلى الشاشة الرئيسية).
   - «تفعيل الإشعارات»: موافقة مرة لكل جهاز؛ رمز الجهاز يُحفظ في pushTokens/{رمز} مربوطًا بالحساب
     (مستقل عن مستند المستخدم لأن مدير المدرسة لا يعدّل مستنده بنفسه).
   - الإشعار أثناء فتح الموقع يظهر بطاقة داخل الصفحة.
   الإرسال نفسه من دوال Firebase (index.js).
   ========================================================================= */
(function(){
  'use strict';
  const VAPID_KEY = window.FB_VAPID || null;   // من fb-config.js (فارغ في منصة الاختبار = لا إشعارات)
  const SW_URL = 'firebase-messaging-sw.js';
  const SNOOZE_DAYS = 7;
  const P = { reg:null, deferred:null, ctx:null, messaging:null, token:null, msgBound:false };

  const ls = {
    get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
    set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} },
    del(k){ try{ localStorage.removeItem(k); }catch(e){} }
  };
  const esc = s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isStandalone = ()=> (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  const isIOS = ()=> /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  const pushCapable = ()=> !!VAPID_KEY && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;

  /* ---------- عامل الخدمة + التقاط طلب التثبيت ---------- */
  window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); P.deferred = e; if(P.ctx) maybeBanner(); });
  window.addEventListener('appinstalled', ()=>{ P.deferred = null; removeBanner(); });
  function registerSW(){
    if(!('serviceWorker' in navigator)) return Promise.resolve(null);
    if(P.reg) return Promise.resolve(P.reg);
    return navigator.serviceWorker.register(SW_URL, { scope:'./' }).then(r=>{ P.reg = r; return r; }).catch(()=>null);
  }
  if(document.readyState==='complete') registerSW(); else window.addEventListener('load', registerSW);

  /* ---------- تحميل مكتبة الإشعارات عند الحاجة فقط ---------- */
  function loadMessaging(){
    if(P.messaging) return Promise.resolve(P.messaging);
    if(typeof firebase==='undefined') return Promise.reject(new Error('firebase'));
    const ready = ()=>{ P.messaging = firebase.messaging(); return P.messaging; };
    if(firebase.messaging) return Promise.resolve(ready());
    const ver = firebase.SDK_VERSION || '12.14.0';
    return new Promise((res, rej)=>{
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/'+ver+'/firebase-messaging-compat.js';
      s.onload = ()=>{ try{ res(ready()); }catch(e){ rej(e); } };
      s.onerror = ()=>rej(new Error('تعذّر تحميل مكتبة الإشعارات'));
      document.head.appendChild(s);
    });
  }

  async function getAndSaveToken(){
    const reg = await registerSW();
    if(!reg) throw new Error('المتصفح لا يدعم عامل الخدمة');
    const m = await loadMessaging();
    const token = await m.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if(!token) throw new Error('لم يُستلم رمز الجهاز');
    P.token = token;
    const c = P.ctx;
    const sigKey = 'injaz_push_saved';
    const sig = token+'|'+c.uid+'|'+c.sid+'|'+new Date().toISOString().slice(0,10);
    if(ls.get(sigKey) !== sig){
      await c.db.collection('pushTokens').doc(token).set({
        uid:c.uid, authUid:(firebase.auth().currentUser||{}).uid||'', sid:c.sid||'', role:c.role||'', standalone:isStandalone(), ios:isIOS(),
        ua:String(navigator.userAgent||'').slice(0,180), updatedAt:Date.now()
      });
      ls.set(sigKey, sig);
    }
    bindForeground(m);
    return token;
  }

  function bindForeground(m){
    if(P.msgBound) return; P.msgBound = true;
    m.onMessage(payload=>{
      const n = payload.notification || {}, d = payload.data || {};
      const link = (payload.fcmOptions && payload.fcmOptions.link) || d.link || '';
      inPageNote(n.title || d.title || 'منجز المدرسي', n.body || d.body || '', link);
    });
  }
  function inPageNote(title, body, link){
    injectCss();
    const el = document.createElement('div'); el.className = 'ipwa-note';
    el.innerHTML = '<b>🔔 '+esc(title)+'</b>'+(body?'<span>'+esc(body)+'</span>':'');
    el.onclick = ()=>{ el.remove(); if(link){ try{ const u = new URL(link, location.href); location.href = u.pathname.split('/').pop()+u.search; }catch(e){ location.href = link; } } };
    document.body.appendChild(el);
    setTimeout(()=>{ try{ el.remove(); }catch(e){} }, 9000);
  }

  /* ---------- الشريط ---------- */
  let cssDone = false;
  function injectCss(){
    if(cssDone) return; cssDone = true;
    const st = document.createElement('style');
    st.textContent = `
.ipwa-bar{position:fixed;left:12px;right:12px;bottom:12px;z-index:9990;max-width:520px;margin:0 auto;background:var(--surface,#fff);border:1px solid var(--line,#d8e2e0);border-radius:16px;box-shadow:0 12px 34px rgba(10,40,40,.22);padding:14px 16px;font-family:'Tajawal',"Segoe UI",Tahoma,sans-serif;color:var(--ink,#15242b);direction:rtl;animation:ipwaUp .25s ease}
.ipwa-bar h4{margin:0 0 4px;font-size:15.5px;font-weight:800;display:flex;align-items:center;gap:8px}
.ipwa-bar h4 img{width:28px;height:28px;border-radius:7px}
.ipwa-bar p{margin:0 0 10px;font-size:13.5px;color:var(--muted,#5b6f76);line-height:1.6}
.ipwa-bar .ipwa-row{display:flex;gap:8px;flex-wrap:wrap}
.ipwa-bar button{font-family:inherit;font-weight:700;font-size:14px;border-radius:10px;padding:9px 16px;min-height:42px;cursor:pointer;border:1.5px solid var(--brand,#0f766e);background:transparent;color:var(--brand-2,#0f766e)}
.ipwa-bar button.pri{background:var(--brand,#0f766e);color:#fff}
.ipwa-bar button.gh{border-color:var(--line,#d8e2e0);color:var(--muted,#5b6f76)}
.ipwa-bar .ipwa-err{color:var(--danger,#a32020);font-size:12.5px;margin-top:6px}
.ipwa-note{position:fixed;top:12px;left:12px;right:12px;z-index:9995;max-width:480px;margin:0 auto;background:#15242b;color:#fff;border-radius:14px;padding:12px 16px;box-shadow:0 10px 30px rgba(0,0,0,.3);font-family:'Tajawal',"Segoe UI",Tahoma,sans-serif;direction:rtl;cursor:pointer;display:flex;flex-direction:column;gap:2px;animation:ipwaUp .25s ease}
.ipwa-note b{font-size:14.5px}.ipwa-note span{font-size:13px;opacity:.9}
@keyframes ipwaUp{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
@media print{.ipwa-bar,.ipwa-note{display:none!important}}`;
    document.head.appendChild(st);
  }
  function removeBanner(){ const b = document.getElementById('ipwaBar'); if(b) b.remove(); }
  const snoozed = k=>{ const t = +ls.get('injaz_pwa_snooze_'+k) || 0; return t && Date.now() < t; };
  const snooze = k=>ls.set('injaz_pwa_snooze_'+k, String(Date.now() + SNOOZE_DAYS*864e5));
  function bar(html){
    injectCss(); removeBanner();
    const b = document.createElement('div'); b.id = 'ipwaBar'; b.className = 'ipwa-bar'; b.setAttribute('role','dialog');
    b.innerHTML = html; document.body.appendChild(b); return b;
  }
  const ICON = '<img src="icons/icon-192.png" alt="">';

  function notifState(){
    if(!pushCapable()) return isIOS() && !isStandalone() ? 'ios-install-first' : 'unsupported';
    return Notification.permission;   // default | granted | denied
  }

  function maybeBanner(force){
    if(!P.ctx || document.getElementById('ipwaBar')) return;
    if(!isStandalone()){
      if(P.deferred && (force || !snoozed('install'))){
        const b = bar('<h4>'+ICON+'ثبّت تطبيق منجز المدرسي</h4><p>افتح جدولك وتنبيهاتك من شاشة جوالك مباشرة، وتصلك الإشعارات فورًا.</p>'+
          '<div class="ipwa-row"><button class="pri" data-a="go">تثبيت</button><button class="gh" data-a="later">لاحقًا</button></div>');
        b.querySelector('[data-a=go]').onclick = async()=>{
          const e = P.deferred; P.deferred = null; removeBanner();
          try{ e.prompt(); await e.userChoice; }catch(_){}
        };
        b.querySelector('[data-a=later]').onclick = ()=>{ snooze('install'); removeBanner(); };
        return;
      }
      if(isIOS() && (force || !snoozed('ios'))){
        const b = bar('<h4>'+ICON+'ثبّت تطبيق منجز المدرسي على الآيفون</h4><p>من متصفح Safari: اضغط زر <b>المشاركة</b> ⬆️ أسفل الشاشة، ثم اختر <b>«إضافة إلى الشاشة الرئيسية»</b>. افتح التطبيق من الأيقونة لتفعيل الإشعارات (يتطلب iOS 16.4 أو أحدث).</p>'+
          '<div class="ipwa-row"><button class="pri" data-a="ok">فهمت</button></div>');
        b.querySelector('[data-a=ok]').onclick = ()=>{ snooze('ios'); removeBanner(); };
        return;
      }
    }
    if(force && !isStandalone()){
      const b = bar('<h4>'+ICON+'تثبيت تطبيق منجز المدرسي</h4><p>افتح قائمة المتصفح <b>⋮</b> ثم اختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>.</p>'+
        '<div class="ipwa-row"><button class="pri" data-a="ok">فهمت</button></div>');
      b.querySelector('[data-a=ok]').onclick = ()=>removeBanner();
      return;
    }
    if(notifState()==='default' && !snoozed('notif')){
      const b = bar('<h4>'+ICON+'فعّل الإشعارات</h4><p>يصلك تنبيه فوري بحصص الانتظار والتعاميم والمناوبة والزيارات، وتذكير صباحي بيومك.</p>'+
        '<div class="ipwa-row"><button class="pri" data-a="on">تفعيل الإشعارات</button><button class="gh" data-a="later">لاحقًا</button></div><div class="ipwa-err"></div>');
      b.querySelector('[data-a=on]').onclick = async(ev)=>{
        ev.target.disabled = true;
        const r = await API.enable();
        if(r.ok) removeBanner();
        else { ev.target.disabled = false; b.querySelector('.ipwa-err').textContent = r.msg; }
      };
      b.querySelector('[data-a=later]').onclick = ()=>{ snooze('notif'); removeBanner(); };
    }
  }

  const API = {
    VAPID_KEY,
    isStandalone, isIOS, notifState,
    /** يُستدعى بعد الدخول: ctx = { db, uid, sid, role, banner:true|false } */
    init(ctx){
      P.ctx = ctx;
      registerSW();
      if(pushCapable() && Notification.permission==='granted'){ getAndSaveToken().catch(()=>{}); }
      if(ctx.banner !== false) setTimeout(maybeBanner, 1200);
    },
    async enable(){
      if(!P.ctx) return { ok:false, msg:'سجّل الدخول أولًا.' };
      const st = notifState();
      if(st==='ios-install-first') return { ok:false, msg:'في الآيفون: ثبّت التطبيق على الشاشة الرئيسية أولًا ثم افتحه منها.' };
      if(st==='unsupported') return { ok:false, msg:'هذا المتصفح لا يدعم الإشعارات.' };
      if(st==='denied') return { ok:false, msg:'الإشعارات محظورة لهذا الموقع — فعّلها من إعدادات المتصفح ثم أعد المحاولة.' };
      try{
        const perm = await Notification.requestPermission();
        if(perm!=='granted') return { ok:false, msg:'لم تُمنح الموافقة على الإشعارات.' };
        await getAndSaveToken();
        try{ window.dispatchEvent(new Event('injaz-push-changed')); }catch(_){}
        return { ok:true };
      }catch(e){ return { ok:false, msg:'تعذّر التفعيل: '+(e && e.message || e) }; }
    },
    /** عند تسجيل الخروج: فك ربط هذا الجهاز بالحساب حتى لا تصله إشعاراته */
    async forget(){
      try{
        if(P.token && P.ctx) await P.ctx.db.collection('pushTokens').doc(P.token).delete();
        ls.del('injaz_push_saved');
      }catch(e){}
    },
    /** بطاقة حالة الإشعارات (لصفحة «يومي») */
    statusHTML(){
      const st = notifState();
      if(st==='granted') return '<span style="color:#1f9d55;font-weight:700">🔔 الإشعارات مفعّلة على هذا الجهاز</span>';
      if(st==='denied') return '<span style="color:#a32020">🔕 الإشعارات محظورة — فعّلها من إعدادات المتصفح لهذا الموقع.</span>';
      if(st==='ios-install-first') return '<span>📲 في الآيفون: ثبّت التطبيق (مشاركة ← إضافة إلى الشاشة الرئيسية) ثم افتحه لتفعيل الإشعارات.</span>';
      if(st==='unsupported') return '<span>هذا المتصفح لا يدعم الإشعارات.</span>';
      return '';
    },
    showBanner(){ removeBanner(); maybeBanner(true); }
  };
  window.InjazPWA = API;
})();
