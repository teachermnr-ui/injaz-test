// إصدار: 2026-10-29.1 · الاختبار
/* عامل الخدمة لتطبيق منجز المدرسي (PWA) والإشعارات الفورية — ص-١٢
   - يجب أن يبقى في جذر الموقع وبهذا الاسم (تطلبه مكتبة Firebase Messaging).
   - الإشعار القادم من دوال Firebase يُعرض تلقائيًا، والضغط عليه يفتح الصفحة المعنية (fcmOptions.link).
   - بلا تخزين مؤقت للصفحات: الموقع يُحمَّل من الشبكة دائمًا (لا نسخ قديمة بعد كل نشر)،
     وعند انقطاع الاتصال تظهر صفحة «لا يوجد اتصال» بدل خطأ المتصفح. */
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js');

importScripts('fb-config.js');
firebase.initializeApp(self.FB_CONFIG);
const messaging = firebase.messaging();
// رسالة بيانات بلا notification (احتياطًا): تُعرض يدويًا
messaging.onBackgroundMessage(payload=>{
  if(payload.notification) return;   // تُعرض تلقائيًا
  const d = payload.data || {};
  if(!d.title) return;
  self.registration.showNotification(d.title, { body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/badge-72.png', dir: 'rtl', lang: 'ar', tag: d.tag || undefined, data: { link: d.link || '' } });
});
self.addEventListener('notificationclick', e=>{
  const link = e.notification && e.notification.data && e.notification.data.link;
  if(!link) return;   // إشعارات FCM العادية تتولاها المكتبة
  e.notification.close();
  e.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(list=>{
    for(const c of list){ if('focus' in c){ c.navigate(link); return c.focus(); } }
    return clients.openWindow(link);
  }));
});

self.addEventListener('install', ()=>self.skipWaiting());
self.addEventListener('activate', e=>e.waitUntil(self.clients.claim()));
const OFFLINE = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>لا يوجد اتصال</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f9f4;font-family:Tahoma,system-ui,sans-serif;color:#23312b;text-align:center;padding:20px}
.c{background:#fff;border:1px solid #d8e2e0;border-radius:16px;padding:26px 22px;max-width:380px}h1{font-size:19px;margin:10px 0}p{color:#5b6f76;font-size:14.5px}
button{font:inherit;font-weight:700;background:#3f6659;color:#fff;border:none;border-radius:10px;padding:10px 22px;margin-top:8px}</style></head>
<body><div class="c"><div style="font-size:40px">📡</div><h1>لا يوجد اتصال بالإنترنت</h1><p>تحقّق من الاتصال ثم أعد المحاولة.</p><button onclick="location.reload()">إعادة المحاولة</button></div></body></html>`;
self.addEventListener('fetch', e=>{
  if(e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(()=>new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
