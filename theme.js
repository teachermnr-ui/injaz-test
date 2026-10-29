// إصدار: 2026-10-05.1 · الاختبار
/* =====================================================================
   theme.js — مظهر الموقع الموحّد (يُحمَّل في <head> قبل أي محتوى)
   - المظهر العام: «الياسمين» افتراضيًا، أو «الأساسي» — يختاره الأدمن من الإعدادات
     (settings/appearance.theme = 'theme-base' للأساسي، وأي قيمة أخرى = الياسمين).
   - الوضع: «تلقائي» (يتبع الجوال) أو «فاتح» أو «داكن» — يختاره كل مستخدم لنفسه،
     ويُحفظ على جهازه فقط (localStorage: injaz_mode).
   - لا يمس أي بيانات أو منطق؛ يضيف أصنافًا على <html> و<body> فقط:
       html.t-jasmine | html.t-base ، html.dark ، body.theme-jasmine + body.alt-theme (للياسمين)
   ===================================================================== */
(function(){
  var KEY_MODE = 'injaz_mode', KEY_THEME = 'injaz_theme';
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var HEAD = { jasmine:{ light:'#3f6659', dark:'#1f2e27' }, base:{ light:'#0f766e', dark:'#0d2a28' } };

  function get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }

  function mode(){ var m = get(KEY_MODE); return (m === 'light' || m === 'dark') ? m : 'auto'; }
  function theme(){ return get(KEY_THEME) === 'base' ? 'base' : 'jasmine'; }
  function isDark(){ var m = mode(); return m === 'dark' || (m === 'auto' && !!(mq && mq.matches)); }

  function paintBody(){
    var b = document.body; if(!b) return;
    var jas = theme() === 'jasmine';
    b.classList.toggle('theme-jasmine', jas);
    b.classList.toggle('alt-theme', jas);   // الشريط السفلي في إدارة الصف خاص بالياسمين
  }
  function paintMeta(){
    var c = HEAD[theme()][isDark() ? 'dark' : 'light'];
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    if(!metas.length && document.head){ var m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); metas = [m]; }
    for(var i = 0; i < metas.length; i++) metas[i].setAttribute('content', c);
  }
  var lastSig = '';
  function paint(){
    var th = theme(), dk = isDark();
    root.classList.toggle('t-jasmine', th === 'jasmine');
    root.classList.toggle('t-base', th === 'base');
    root.classList.toggle('dark', dk);
    root.setAttribute('data-mode', mode());
    paintBody();
    paintMeta();
    var sig = th + '|' + dk + '|' + mode();
    if(sig !== lastSig){
      lastSig = sig;
      try{ window.dispatchEvent(new CustomEvent('injaz-theme', { detail:{ theme:th, dark:dk, mode:mode() } })); }catch(e){}
    }
  }

  paint();
  if(!document.body) document.addEventListener('DOMContentLoaded', paint);
  if(mq){
    var onChange = function(){ if(mode() === 'auto') paint(); };
    if(mq.addEventListener) mq.addEventListener('change', onChange); else if(mq.addListener) mq.addListener(onChange);
  }
  // تبويب آخر غيّر الوضع أو المظهر
  window.addEventListener('storage', function(e){ if(e.key === KEY_MODE || e.key === KEY_THEME) paint(); });

  /* تصدير الصور/PDF (html2canvas) يُلتقط دائمًا بالفاتح حتى لا تخرج المستندات داكنة */
  function wrapCapture(fn){
    if(!fn || fn.__injazWrapped) return fn;
    var w = function(){
      var wasDark = root.classList.contains('dark');
      if(wasDark) root.classList.remove('dark');
      var restore = function(){ if(wasDark && isDark()) root.classList.add('dark'); };
      try{
        var r = fn.apply(this, arguments);
        if(r && typeof r.then === 'function') return r.then(function(v){ restore(); return v; }, function(err){ restore(); throw err; });
        restore(); return r;
      }catch(err){ restore(); throw err; }
    };
    w.__injazWrapped = true;
    return w;
  }
  try{
    var _h2c = window.html2canvas;
    Object.defineProperty(window, 'html2canvas', {
      configurable: true,
      get: function(){ return _h2c; },
      set: function(v){ _h2c = wrapCapture(v); }
    });
    if(_h2c) _h2c = wrapCapture(_h2c);
  }catch(e){}

  window.InjazTheme = {
    /* قيمة الإعداد العام كما في Firestore */
    applyRemote: function(t){ set(KEY_THEME, t === 'theme-base' ? 'base' : 'jasmine'); paint(); },
    getTheme: theme,
    getMode: mode,
    isDark: isDark,
    setMode: function(m){ set(KEY_MODE, (m === 'light' || m === 'dark') ? m : 'auto'); paint(); },
    /* عنصر اختيار «تلقائي / فاتح / داكن» جاهز لأي قائمة */
    modePicker: function(){
      var wrap = document.createElement('div');
      wrap.className = 'ij-mode';
      wrap.setAttribute('role', 'radiogroup');
      wrap.setAttribute('aria-label', 'الوضع');
      [['auto','تلقائي'],['light','فاتح'],['dark','داكن']].forEach(function(o){
        var b = document.createElement('button');
        b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.mode = o[0]; b.textContent = o[1];
        b.addEventListener('click', function(e){ e.stopPropagation(); window.InjazTheme.setMode(o[0]); sync(); });
        wrap.appendChild(b);
      });
      function sync(){
        var m = mode();
        Array.prototype.forEach.call(wrap.children, function(b){ var on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      }
      sync();
      window.addEventListener('injaz-theme', sync);
      return wrap;
    },
    paint: paint,

    /* ---------- أدوات الترويسة الموحّدة (شكل فقط) ---------- */
    icon: function(name, size, sw){
      var p = ICONS[name] || '';
      return '<svg width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.8) +
        '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
    },
    initials: function(name){
      var w = String(name || '').trim().split(/\s+/).filter(Boolean);
      if(!w.length) return '';
      var first = function(x){ return (x.length > 2 && x.indexOf('ال') === 0) ? x.charAt(2) : x.charAt(0); };   // «النمري» ← ن
      return first(w[0]) + (w.length > 1 ? ' ' + first(w[1]) : '');
    },
    /* التاريخ بسطر واحد: اليوم · الهجري (والميلادي على الشاشات العريضة) */
    dateHTML: function(){
      try{
        var d = new Date();
        var wd = new Intl.DateTimeFormat('ar-SA', { weekday:'long' }).format(d);
        var g = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { day:'numeric', month:'long', year:'numeric' }).format(d);
        var h = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day:'numeric', month:'long', year:'numeric' }).format(d);
        return '<span class="d-wd">' + wd + '</span><span class="d-h">' + h + 'هـ</span><span class="d-g">' + g + 'م</span>';
      }catch(e){ return ''; }
    },
    /* فتح/إغلاق قائمة الحساب: زر + قائمة؛ تُغلق بالضغط خارجها أو على أي بند أو بزر Esc */
    bindMenu: function(btn, menu){
      if(!btn || !menu) return;
      var scrim = null;
      function close(){
        menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
        if(scrim){ scrim.remove(); scrim = null; }
      }
      function open(){
        menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
        scrim = document.createElement('div'); scrim.className = 'ijh-scrim';
        scrim.addEventListener('click', close);
        menu.parentNode.insertBefore(scrim, menu);
        var first = menu.querySelector('.ijh-mitem'); if(first) try{ first.focus({ preventScroll:true }); }catch(e){}
      }
      btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false');
      menu.hidden = true;
      btn.addEventListener('click', function(e){ e.stopPropagation(); if(menu.hidden) open(); else close(); });
      menu.addEventListener('click', function(e){ if(e.target.closest('.ijh-mitem')) close(); });
      document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !menu.hidden){ close(); btn.focus(); } });
      return { open:open, close:close };
    }
  };
  var ICONS = {
    home:'<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    omr:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    chev:'<path d="M6 9l6 6 6-6"/>',
    chevL:'<path d="M15 18l-6-6 6-6"/>',
    accounts:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18.5 15c1.6.7 2.6 2.3 3 5"/>',
    key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2"/><path d="M17 6l3 3"/><path d="M14.5 8.5l2 2"/>',
    out:'<path d="M12 3v9"/><path d="M6.6 6.8a8 8 0 1 0 10.8 0"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
    cal:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    calCheck:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M9 15l2 2 4-4"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    sign:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 17c1.5-2 2.5-2 3.5 0s2 2 3.5 0"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    people:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18.5 15c1.6.7 2.6 2.3 3 5"/>',
    bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    bellOff:'<path d="M8.7 3A6 6 0 0 1 18 8c0 2.6.5 4.5 1.1 5.9"/><path d="M17 17H3s3-2 3-9c0-.7.1-1.3.3-1.9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M2 2l20 20"/>',
    phone:'<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
    beach:'<path d="M17.5 21H3"/><path d="M12 21L8 9"/><path d="M3 9.5C4 5 8.5 2.5 13 3.5s7.5 5 7 9.5z"/>',
    moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    pray:'<path d="M12 3c2 2 3 4 3 6H9c0-2 1-4 3-6z"/><path d="M6 21V11h12v10"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/>',
    apple:'<path d="M12 7c-1-2-3-3-5-2-3 1.5-3 6-1 10 1.5 3 3.5 5 6 4 2.5 1 4.5-1 6-4 2-4 2-8.5-1-10-2-1-4 0-5 2z"/><path d="M12 7c0-2 1-4 3-4"/>',
    flag:'<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
    pen:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'
  };
})();
