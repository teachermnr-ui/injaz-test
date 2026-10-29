// إصدار: 2026-10-30.1 · الاختبار
/* إعداد Firebase الموحّد لكل صفحات «منجز المدرسي» وعامل الخدمة.
   يختار المشروع حسب النطاق الذي فُتح منه الموقع:
   - test.injaz.awraqai.com  ← منصة الاختبار (مشروع injaz-test-14849)
   - أي نطاق آخر             ← المنصة الأساسية (مشروع injaz-classroom)
   الصفحات تقرأ window.FB_CONFIG بدل أن يحمل كل ملف مفاتيحه. يجب تحميله قبل أي سكربت يستعمل Firebase. */
(function(g){
  var PROD = {
    apiKey: "AIzaSyCEW-BTrfkqLUFXj7drtts7GkN6PXpbV4A",
    authDomain: "injaz-classroom.firebaseapp.com",
    projectId: "injaz-classroom",
    storageBucket: "injaz-classroom.firebasestorage.app",
    messagingSenderId: "640060389242",
    appId: "1:640060389242:web:37e42c456d7b4e015e88c3"
  };
  var TEST = {
    apiKey: "AIzaSyDoyxJRrB-odeleKh0qSJjMYeQyIrldJb4",
    authDomain: "injaz-test-14849.firebaseapp.com",
    projectId: "injaz-test-14849",
    storageBucket: "injaz-test-14849.firebasestorage.app",
    messagingSenderId: "732762071500",
    appId: "1:732762071500:web:74b01df9fcde2441de3d69"
  };
  var host = (g.location && g.location.hostname) || '';
  var isTest = host === 'test.injaz.awraqai.com';
  g.FB_ENV = isTest ? 'test' : 'prod';
  g.FB_CONFIG = isTest ? TEST : PROD;
  g.FB_SITE = isTest ? 'https://test.injaz.awraqai.com/' : 'https://injaz.awraqai.com/';
  // مفتاح الإشعارات (Web Push) خاص بكل مشروع؛ منصة الاختبار بلا مفتاح بعدُ فتُعطَّل فيها الإشعارات
  g.FB_VAPID = isTest ? null : 'BCEyCU1TOigaMw7C_FGk_auXKWT1RIKjsydSX6VKQYtRot80K8ur0CzyuJxit0KBR0iTz2LFK-VhQwI79C87dz8';

  /* حسابات النسخ التجريبية: معرّفها dm + ٨ خانات + _ + الدور. لا وجود لها في المنصة الأساسية فتعطي دائمًا false هناك.
     تستعملها الصفحات لإخفاء ما لا يصلح في النسخة التجريبية (تغيير كلمة المرور وحذف الحساب وإضافة المستخدمين). */
  var DEMO_RE = /^dm[a-z0-9]{8}_/;
  g.FB_isDemoUid = function (uid) { return DEMO_RE.test(String(uid || '')); };
  g.FB_isDemo = function () {
    try { var u = g.firebase.auth().currentUser; return !!(u && DEMO_RE.test(u.uid)); } catch (e) { return false; }
  };

  /* شريط أعلى كل صفحة (في منصة الاختبار وحدها). لا يعمل في المنصة الأساسية ولا في عامل الخدمة.
     - «منصة الاختبار» بنفسجي: يعرض الدور عند الدخول بحساب من مدرسة الاختبار مع زر «رجوع لحساب الأدمن».
     - «نسخة تجريبية» ذهبي: لمن يدخل بحساب نسخة تجريبية، مع زر «تبديل الدور» يعيده إلى صفحة الأدوار التسعة. وفيه لا يظهر أي ذكر لمنصة الاختبار.
     - صفحة «جرّب المنصة» (try.html) بلا شريط. */
  if (isTest && g.document) {
    var NAMES = { tst_principal: 'مدير المدرسة', tst_counselor: 'الموجه الطلابي', tst_agent_school: 'وكيل الشؤون المدرسية',
      tst_agent_edu: 'وكيل الشؤون التعليمية', tst_agent_st: 'وكيل الشؤون الطلابية', tst_admin_staff: 'الشؤون الإدارية',
      tst_teacher: 'معلم المادة', tst_teacher_asst: 'مساعد معلم', tst_activity: 'رائد النشاط' };
    var st = g.document.createElement('style'); st.textContent = 'html.is-demo [data-nodemo]{display:none!important}'; (g.document.head || g.document.documentElement).appendChild(st);
    var onTry = /(^|\/)try(\.html)?\/?$/.test((g.location && g.location.pathname) || '');
    var demoKey = function () { try { return g.localStorage.getItem('demo_k') || ''; } catch (e) { return ''; } };
    var paint = function (u) {
      var d = g.document, b = d.getElementById('teEnvBar');
      if (!d.body) return;
      if (onTry) { if (b && b.parentNode) b.parentNode.removeChild(b); return; }
      // قبل أن يُعرف المستخدم: من معه رمز نسخة تجريبية محفوظ يُفترض أنه فيها (لا وميض بنفسجي ثم ذهبي)
      var demo = u ? DEMO_RE.test(u.uid) : !!demoKey();
      // الحساب التجريبي: يُخفى كل عنصر موسوم data-nodemo (تغيير كلمة المرور وحذف الحساب)
      try { d.documentElement.classList.toggle('is-demo', demo); } catch (e) {}
      if (!b) {
        b = d.createElement('div'); b.id = 'teEnvBar'; b.dir = 'rtl';
        d.body.insertBefore(b, d.body.firstChild);
      }
      var base = 'position:sticky;top:0;z-index:2147483000;font:600 13px Tajawal,sans-serif;padding:7px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;';
      if (demo) {
        b.style.cssText = base + 'background:#fbf4e6;color:#6a4c16;border-bottom:1px solid #ecd9b3';
        b.innerHTML = '<span><b>نسخة تجريبية</b></span><button type="button" style="background:#b8893a;color:#fff;border:0;border-radius:8px;padding:4px 10px;font:700 12px Tajawal,sans-serif;cursor:pointer">تبديل الدور</button>';
        var sw = b.querySelector('button');
        if (sw) sw.onclick = function () { var k = demoKey(); g.location.href = 'try.html' + (k ? '?k=' + encodeURIComponent(k) : ''); };
        return;
      }
      var who = u && NAMES[u.uid];
      b.style.cssText = base + 'background:#7a4fb5;color:#fff';
      b.innerHTML = '<span>منصة الاختبار' + (who ? ' · أنت الآن: <b>' + who + '</b> · مدرسة نسخة الاختبار' : '') + '</span>'
        + (who ? '<button type="button" style="background:#fff;color:#7a4fb5;border:0;border-radius:8px;padding:4px 10px;font:700 12px Tajawal,sans-serif;cursor:pointer">رجوع لحساب الأدمن</button>' : '');
      var btn = b.querySelector('button');
      if (btn) btn.onclick = function () {
        try { g.localStorage.removeItem('cls_session'); } catch (e) {}
        g.firebase.auth().signOut().then(function () { g.location.href = 'index.html'; }, function () { g.location.href = 'index.html'; });
      };
    };
    var onUser = function (u) {
      // دخول بحساب غير تجريبي يمسح رمز النسخة المحفوظ (حتى لا يبقى الشريط الذهبي لأدمن في المتصفح نفسه)
      if (u && !DEMO_RE.test(u.uid)) { try { g.localStorage.removeItem('demo_k'); } catch (e) {} }
      paint(u);
    };
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (tries > 120) { clearInterval(iv); return; }
      if (!g.document.body) return;
      if (!g.document.getElementById('teEnvBar')) paint(null);
      try {
        if (!g.firebase || !g.firebase.apps || !g.firebase.apps.length || typeof g.firebase.auth !== 'function') return;
        clearInterval(iv);
        g.firebase.auth().onAuthStateChanged(onUser);
      } catch (e) {}
    }, 400);
  }
})(typeof self !== 'undefined' ? self : window);
