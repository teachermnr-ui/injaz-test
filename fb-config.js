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
})(typeof self !== 'undefined' ? self : window);
