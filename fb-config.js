// إصدار: 2026-10-29.1 · الاختبار
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

  /* شريط «منصة الاختبار» أعلى كل صفحة (في منصة الاختبار وحدها): يذكّر بالمنصة، ويعرض الدور عند الدخول بحساب من حسابات مدرسة الاختبار
     مع زر «رجوع لحساب الأدمن». لا يعمل في المنصة الأساسية ولا في عامل الخدمة. */
  if (isTest && g.document) {
    var NAMES = { tst_principal: 'مدير المدرسة', tst_counselor: 'الموجه الطلابي', tst_agent_school: 'وكيل الشؤون المدرسية',
      tst_agent_edu: 'وكيل الشؤون التعليمية', tst_agent_st: 'وكيل الشؤون الطلابية', tst_admin_staff: 'الشؤون الإدارية',
      tst_teacher: 'معلم المادة', tst_teacher_asst: 'مساعد معلم', tst_activity: 'رائد النشاط' };
    var paint = function (u) {
      var d = g.document, b = d.getElementById('teEnvBar');
      if (!d.body) return;
      if (!b) {
        b = d.createElement('div'); b.id = 'teEnvBar'; b.dir = 'rtl';
        b.style.cssText = 'position:sticky;top:0;z-index:2147483000;background:#7a4fb5;color:#fff;font:600 13px Tajawal,sans-serif;padding:7px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap';
        d.body.insertBefore(b, d.body.firstChild);
      }
      var who = u && NAMES[u.uid];
      b.innerHTML = '<span>منصة الاختبار' + (who ? ' · أنت الآن: <b>' + who + '</b> · مدرسة نسخة الاختبار' : '') + '</span>'
        + (who ? '<button type="button" style="background:#fff;color:#7a4fb5;border:0;border-radius:8px;padding:4px 10px;font:700 12px Tajawal,sans-serif;cursor:pointer">رجوع لحساب الأدمن</button>' : '');
      var btn = b.querySelector('button');
      if (btn) btn.onclick = function () {
        try { g.localStorage.removeItem('cls_session'); } catch (e) {}
        g.firebase.auth().signOut().then(function () { g.location.href = 'index.html'; }, function () { g.location.href = 'index.html'; });
      };
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
        g.firebase.auth().onAuthStateChanged(paint);
      } catch (e) {}
    }, 400);
  }
})(typeof self !== 'undefined' ? self : window);
