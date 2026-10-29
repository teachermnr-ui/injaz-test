/* ex-render.js — إصدار: 2026-10-11.1 · الاختبار — محرك عرض «شاشة التميز» المشترك بين صفحة الإدارة (المعاينة) وصفحة التلفاز */
(function(g){
'use strict';
const esc = s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const STAR = '<svg viewBox="0 0 100 100" aria-hidden="true"><path fill="#dfae48" d="M50 4 L60 30 L88 20 L76 46 L96 50 L76 54 L88 80 L60 70 L50 96 L40 70 L12 80 L24 54 L4 50 L24 46 L12 20 L40 30 Z"/></svg>';
const DUR = 10;
const MOE_DOTS=[[7,0,100,"#23B1A4"],[993,0,100,"#23B1A4"],[904,9,91,"#23B1A4"],[96,13,91,"#23B1A4"],[818,25,92,"#0E9C8C"],[183,28,91,"#0E9C8C"],[732,48,78,"#0E9C8C"],[268,50,78,"#0E9C8C"],[650,80,61,"#0E9C8C"],[350,82,61,"#0E9C8C"],[997,104,88,"#6FC9BE"],[3,107,88,"#6FC9BE"],[902,107,80,"#23B1A4"],[95,109,80,"#23B1A4"],[813,122,74,"#23B1A4"],[188,124,74,"#23B1A4"],[573,125,52,"#0E9C8C"],[428,128,52,"#0E9C8C"],[726,149,63,"#0E9C8C"],[274,151,63,"#0E9C8C"],[500,179,48,"#0E9C8C"],[645,188,57,"#0E9C8C"],[356,190,57,"#0E9C8C"],[1000,201,79,"#6FC9BE"],[0,204,80,"#6FC9BE"],[902,201,75,"#6FC9BE"],[101,204,75,"#6FC9BE"],[800,222,62,"#23B1A4"],[200,224,62,"#23B1A4"],[569,237,48,"#0E9C8C"],[432,239,48,"#0E9C8C"],[710,258,44,"#23B1A4"],[290,260,44,"#23B1A4"],[500,300,44,"#0E9C8C"]];
/* شعار وزارة التعليم (نفس رسم omr.html) */
function moeLogoSVG(cx, topY, w){
  const h = w*0.30, sx = w/1000, sy = h/300, x0 = cx - w/2, maxR = w*0.021; let o='';
  for(const d of MOE_DOTS){ o += '<circle cx="'+(x0+d[0]*sx).toFixed(1)+'" cy="'+(topY+d[1]*sy).toFixed(1)+'" r="'+Math.max(1.1,d[2]/100*maxR).toFixed(1)+'" fill="'+d[3]+'"/>'; }
  const wy = topY + h + w*0.14;
  o += '<text x="'+cx+'" y="'+wy+'" text-anchor="middle" font-size="'+(w*0.125).toFixed(1)+'" font-weight="bold" fill="#1f9e90" font-family="Tajawal,sans-serif">وزارة التعليم</text>';
  o += '<text x="'+cx+'" y="'+(wy+w*0.085).toFixed(1)+'" text-anchor="middle" font-size="'+(w*0.05).toFixed(1)+'" letter-spacing="0.5" fill="#8a9a99" font-family="Tajawal,sans-serif">Ministry of Education</text>';
  return o;
}
function moeLogoInline(w){ const h=w*0.30, pad=w*0.03, H=h+w*0.27+pad; return '<svg width="'+w+'" height="'+H+'" viewBox="0 0 '+w+' '+H+'" xmlns="http://www.w3.org/2000/svg">'+moeLogoSVG(w/2,pad,w)+'</svg>'; }

const ICONS={
 trophy:['كأس','M8 4h8v5a4 4 0 0 1-8 0V4z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M9 20h6 M10 17h4'],
 cap:['قبعة تخرج','M2 9l10-5 10 5-10 5L2 9z M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5 M22 9v6'],
 sparkle:['لمعة','M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z'],
 star:['نجمة','M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z'],
 medal:['وسام','M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M8.5 13.5L7 21l5-3 5 3-1.5-7.5'],
 book:['كتاب','M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z M8 7h7'],
 heart:['قلب','M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
 users:['فريق','M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5 M16 11a2.5 2.5 0 1 0 0-5 M17 15c2.5.3 4 1.8 4 5'],
 bulb:['فكرة','M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z'],
 target:['هدف','M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
 chart:['إحصاء','M4 20V4 M4 20h16 M8 16v-4 M12 16V8 M16 16v-6'],
 clock:['ساعة','M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2']
};
const ICON_KEYS=Object.keys(ICONS), ICON_DEF=['trophy','cap','sparkle'];
function ico(k){ const d=(ICONS[k]||ICONS.sparkle)[1]; return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"/></svg>'; }
/* حقول كل نوع فئة */
const FC={
 teacher:{name:'اسم المعلم', sub:'التخصص', mode:'ach'},
 student:{name:'اسم الطالب', sub:'الصف', mode:'ach'},
 amb:{name:'اسم المكرَّم', sub:'الصف أو الصفة', mode:'num'},
 cls:{name:'اسم الفصل', sub:'الصف', mode:'num'},
 other:{name:'اسم المكرَّم', sub:'الصف أو الصفة', mode:'num'}
};
function catKind(n){ for(const c of Object.values(CHAN)){ const f=c.cats.find(x=>x.n===n); if(f) return f.k||'other'; } return 'other'; }
function fcfg(n){ return FC[catKind(n)]||FC.other; }
function catTag(n){ for(const c of Object.values(CHAN)){ const f=c.cats.find(x=>x.n===n); if(f&&f.tag) return f.tag; } return ''; }
function mtxt(r){ return r? ((r[0]?r[0]+' ':'')+r[1]) : ''; }

const CHAN = {
  public:  { label:'الشاشة العامة',  chan:'لوحة الشرف',    tlab:'أخبار المدرسة',
    cats:[ {n:'معلم الشهر', k:'teacher', tag:'عطاءٌ يصنع الفرق', t:'معلمو الشهر', lead:'تقديرًا لعطائهم خلال الشهر'},
           {n:'الطلاب المثاليون', k:'student', tag:'تميّزٌ يلهم الأقران', t:'الطلاب المثاليون', lead:'لانضباطهم وتفوقهم خلال الشهر'},
           {n:'سفير التميز', k:'amb', tag:'طموحٌ يعانق القمة', t:'سفراء التميز', lead:'لمبادراتهم في خدمة المجتمع المدرسي'},
           {n:'الفصل المثالي', k:'cls', tag:'انضباطٌ وتعاون', t:'الفصول المثالية', lead:'الأكثر التزامًا وانضباطًا'} ] },
  teachers:{ label:'شاشة المعلمين', chan:'شاشة المعلمين', tlab:'تنبيهات',
    cats:[ {n:'معلم الشهر', t:'معلمو الشهر', lead:'تقديرًا لعطائهم خلال الشهر'},
           {n:'معلم مبادر', k:'teacher', tag:'مبادرةٌ تُحدث الأثر', t:'المعلمون المبادرون', lead:'لمبادراتهم المتميزة'},
           {n:'شكر وتقدير', tag:'كلمة شكر وتقدير', t:'شكر وتقدير', lead:'لجهودهم المبذولة'} ] },
  admins:  { label:'شاشة الإداريين', chan:'شاشة الإداريين', tlab:'مستجدات',
    cats:[ {n:'إداري متميز', tag:'عطاءٌ إداري متميز', t:'الإداريون المتميزون', lead:'لعطائهم وجهودهم'},
           {n:'إنجاز الإدارة', tag:'إنجازٌ يستحق الفخر', t:'إنجازات الإدارة', lead:'ما تحقق خلال الفترة'} ] }
};
const ORDER = ['public','teachers','admins'];

const CSS = `.exhost{--night:#0b2523;--deep:#113733;--jade:#1d6a5d;--gold:#dfae48;--gold-soft:#f1d995;--ink:#eef5f2;--mute:#9db8b1;--line:rgba(223,174,72,.28);position:relative;overflow:hidden;background:#000;color:var(--ink);font-family:'Tajawal',system-ui,sans-serif}
.exhost *{box-sizing:border-box}
.exhost .hidden{display:none !important}
.exhost .stage{width:1920px;height:1080px;position:absolute;left:0;top:0;transform-origin:top left;overflow:hidden;
  background:
    radial-gradient(1200px 700px at 78% 30%, rgba(29,106,93,.55), transparent 70%),
    radial-gradient(900px 600px at 12% 95%, rgba(223,174,72,.10), transparent 70%),
    var(--night)}
.exhost .stage::before{content:"";position:absolute;inset:0;opacity:.07;pointer-events:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%23dfae48' stroke-width='1.4'%3E%3Cpath d='M60 8 L72 36 L100 24 L88 52 L116 60 L88 68 L100 96 L72 84 L60 112 L48 84 L20 96 L32 68 L4 60 L32 52 L20 24 L48 36 Z'/%3E%3Ccircle cx='60' cy='60' r='14'/%3E%3C/g%3E%3C/svg%3E")}
.exhost .head{position:absolute;inset:0 0 auto 0;height:168px;padding:0 84px;display:flex;align-items:center;gap:28px;border-bottom:1px solid var(--line)}
.exhost .head img{width:78px;height:78px;object-fit:contain;filter:drop-shadow(0 4px 14px rgba(0,0,0,.4))}
.exhost .head .who{display:flex;flex-direction:column;gap:2px}
.exhost .head .school{font-size:34px;font-weight:700}
.exhost .head .chan{font-size:24px;color:var(--gold-soft)}
.exhost .head .sp{flex:1}
.exhost .head .ban{position:absolute;left:50%;top:6px;transform:translateX(-50%);width:900px;text-align:center}
.exhost .head .ban .t1{display:flex;align-items:center;justify-content:center;gap:18px;font-size:23px;color:var(--mute)}
.exhost .head .ban .t1::before,.exhost .head .ban .t1::after{content:"";width:64px;height:1px;background:var(--gold);opacity:.7}
.exhost .head .ban .t2{font-family:'Readex Pro','Tajawal',sans-serif;font-size:62px;font-weight:700;line-height:1.15;margin:2px 0}
.exhost .head .ban .t2 b{color:var(--gold);font-weight:700}
.exhost .head .ban .t3{font-size:22px;color:var(--mute);margin-top:12px}
.exhost .head .ban .orn{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:4px;height:22px;color:var(--gold)}
.exhost .head .ban .orn::before,.exhost .head .ban .orn::after{content:"";width:96px;height:1px;background:var(--gold);opacity:.6}
.exhost .head .ban .orn svg{width:22px;height:22px}
.exhost .head.isban .who{display:none}
.exhost .head:not(.isban) .ban{display:none}
.exhost .head .clock{text-align:left;direction:ltr;display:flex;flex-direction:column;gap:2px}
.exhost .head .time{font-family:'Readex Pro','Tajawal',sans-serif;font-size:60px;font-weight:600;line-height:1;letter-spacing:.02em}
.exhost .head .date{font-size:21px;color:var(--mute);direction:rtl;text-align:left}
.exhost .deck{position:absolute;inset:168px 0 108px 0}
.exhost .deck.noticker{bottom:0}
.exhost .slide{position:absolute;inset:0;padding:48px 84px 36px;opacity:0;visibility:hidden;transition:opacity .7s ease,visibility 0s .7s;display:flex;gap:64px}
.exhost .slide.on{opacity:1;visibility:visible;transition:opacity .7s ease}
.exhost .rail{width:330px;flex:none;display:flex;flex-direction:column;justify-content:center;gap:10px;border-inline-start:1px solid var(--line);padding-inline-start:36px}
.exhost .rail .item{font-size:30px;font-weight:500;color:var(--mute);padding:12px 0;position:relative}
.exhost .rail .item.cur{color:var(--ink);font-weight:800}
.exhost .rail .item .fill{display:block;height:4px;border-radius:2px;background:rgba(255,255,255,.1);margin-top:10px;overflow:hidden}
.exhost .rail .item .fill i{display:block;height:100%;width:0;background:var(--gold)}
.exhost .rail .item.cur .fill i{width:100%;transition:width var(--dur,10s) linear}
.exhost .rail .item:not(.cur) .fill i{width:0;transition:none}
.exhost .slide.full{padding:0;background:#02100e}
.exhost .slide.full .main{justify-content:stretch}
.exhost .fimg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#02100e}
.exhost .main{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center}
.exhost .disc{border-radius:50%;background:linear-gradient(160deg,var(--jade),#0f3b36);display:grid;place-items:center;overflow:hidden}
.exhost .disc img{width:100%;height:100%;object-fit:cover}
.exhost .disc svg{width:46%;height:46%}
.exhost .hero{display:flex;align-items:center;justify-content:space-between;gap:70px;width:100%}
.exhost .hero .txt{flex:1;min-width:0}
.exhost .pframe{width:430px;height:560px;flex:none;position:relative;border:1px solid var(--line);padding:16px;margin-inline-end:34px}
.exhost .pin{width:100%;height:100%;overflow:hidden;background:linear-gradient(160deg,var(--jade),#0f3b36);display:grid;place-items:center;box-shadow:inset 0 0 0 1px rgba(223,174,72,.4)}
.exhost .pin img{width:100%;height:100%;object-fit:cover}
.exhost .pin svg{width:130px;height:130px}
.exhost .pframe .spk{position:absolute;right:-18px;top:50%;width:34px;height:34px;color:var(--gold);background:var(--night)}
.exhost .pframe .spk svg{width:100%;height:100%}
.exhost .mdl{position:absolute;left:-48px;bottom:-36px;width:176px;height:176px;border-radius:50%;background:#0a1c1a;border:3px solid var(--gold);box-shadow:0 0 0 8px #0a1c1a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;text-align:center}
.exhost .mdl svg{width:38px;height:38px;color:var(--gold)}
.exhost .mdl .m1{font-family:'Readex Pro','Tajawal',sans-serif;font-size:21px;font-weight:600;color:var(--gold);line-height:1.2;padding:0 14px}
.exhost .mdl .m2{font-size:14px;color:var(--mute)}
.exhost .hero .tag{display:flex;align-items:center;gap:12px;font-size:28px;color:var(--gold-soft)}
.exhost .hero .tag svg{width:30px;height:30px;color:var(--gold)}
.exhost .hero .cat{display:inline-block;font-family:'Readex Pro','Tajawal',sans-serif;font-size:76px;font-weight:600;color:var(--gold);border-bottom:2px solid var(--gold);padding-bottom:10px;margin:8px 0 26px}
.exhost .hero .name{font-family:'Readex Pro','Tajawal',sans-serif;font-size:64px;font-weight:500;line-height:1.3;margin:0 0 20px}
.exhost .hero .name.long{font-size:50px}
.exhost .hero .sub{display:flex;align-items:center;gap:12px;font-size:32px;color:var(--mute);margin-bottom:16px}
.exhost .hero .sub svg{width:30px;height:30px}
.exhost .hero .note{font-size:30px;color:var(--ink);margin-bottom:12px;max-width:850px;line-height:1.5}
.exhost .hero .note b{color:var(--gold-soft);font-weight:700}
.exhost .sep{display:flex;align-items:center;gap:14px;color:var(--gold);max-width:620px;margin:0 0 14px}
.exhost .sep::before,.exhost .sep::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(223,174,72,.7),transparent)}
.exhost .sep::after{background:linear-gradient(270deg,rgba(223,174,72,.7),transparent)}
.exhost .sep svg{width:20px;height:20px;flex:none}
.exhost .hero .ah{display:flex;align-items:center;gap:10px;font-size:26px;color:var(--gold-soft);margin:14px 0}
.exhost .hero .ah svg{width:26px;height:26px;color:var(--gold)}
.exhost .facts{display:flex;flex-direction:column;gap:12px}
.exhost .dia{flex:none;width:58px;height:58px;display:grid;place-items:center;position:relative;color:var(--gold)}
.exhost .dia::before{content:"";position:absolute;inset:8px;border:1.5px solid rgba(223,174,72,.55);transform:rotate(45deg)}
.exhost .dia svg{width:27px;height:27px;position:relative}
.exhost .fact,.exhost .ach{display:flex;align-items:center;gap:20px;font-size:32px}
.exhost .fact b{font-family:'Readex Pro','Tajawal',sans-serif;font-size:56px;line-height:1;color:var(--gold);font-weight:600}
.exhost .hero .thx{position:absolute;left:0;right:0;bottom:8px;justify-content:center;font-size:32px;color:var(--gold-soft);display:flex;align-items:center;gap:12px}
.exhost .hero .thx svg{width:28px;height:28px;color:var(--gold)}
.exhost .title{font-family:'Readex Pro','Tajawal',sans-serif;font-size:72px;font-weight:700;margin:0 0 6px}
.exhost .lead{font-size:32px;color:var(--mute);margin:0 0 34px}
.exhost .cards{display:grid;gap:34px}
.exhost .card{background:linear-gradient(180deg,rgba(17,55,51,.95),rgba(11,37,35,.95));border:1px solid var(--line);border-radius:6px;padding:36px 30px 32px;text-align:center;position:relative}
.exhost .card::after{content:"";position:absolute;inset:10px;border:1px solid rgba(223,174,72,.14);pointer-events:none}
.exhost .card .disc{width:168px;height:168px;margin:0 auto 22px;box-shadow:inset 0 0 0 4px rgba(223,174,72,.4)}
.exhost .card .n{font-family:'Readex Pro','Tajawal',sans-serif;font-size:50px;font-weight:700;line-height:1.2}
.exhost .card .c{font-size:29px;color:var(--gold-soft);margin:16px 0 14px}
.exhost .card .r .rl{color:var(--gold-soft);font-weight:700}
.exhost .card .r{font-size:29px;color:var(--mute);line-height:1.5}
.exhost .card .mt{font-size:28px;color:var(--gold);margin-top:10px}
.exhost .cards.dense{grid-template-columns:repeat(3,1fr);gap:24px}
.exhost .cards.dense .card{padding:22px 22px 20px;display:grid;grid-template-columns:110px 1fr;gap:6px 20px;text-align:start;align-items:center}
.exhost .cards.dense .card .disc{width:110px;height:110px;margin:0;grid-row:1 / span 3}
.exhost .cards.dense .card .n{font-size:38px}
.exhost .cards.dense .card .c{font-size:24px;margin:8px 0 4px}
.exhost .cards.dense .card .r{font-size:23px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.exhost .cards.dense .card .mt{display:none}
.exhost .rows{display:flex;flex-direction:column;border-top:1px solid var(--line)}
.exhost .row{display:grid;grid-template-columns:1fr auto;align-items:center;gap:30px;padding:24px 8px;border-bottom:1px solid var(--line);font-size:40px}
.exhost .row .k{font-weight:700}
.exhost .row .k small{display:block;font-size:27px;font-weight:400;color:var(--mute);margin-top:4px}
.exhost .row .v{font-family:'Readex Pro','Tajawal',sans-serif;font-size:44px;font-weight:600;color:var(--gold);white-space:nowrap}
.exhost .row .v.ok{color:#7fd6a8}
.exhost .row .v.warn{color:#f0a36a}
.exhost .stats{display:grid;grid-template-columns:repeat(2,1fr);gap:36px 56px}
.exhost .stat{border-inline-start:6px solid var(--gold);padding:6px 30px}
.exhost .stat b{display:block;font-family:'Readex Pro','Tajawal',sans-serif;font-size:150px;line-height:1;font-weight:700}
.exhost .stat span{display:block;font-size:38px;color:var(--mute);margin-top:10px}
.exhost .blank{text-align:center;font-size:44px;color:var(--mute);line-height:1.8}
.exhost .demo-tag{position:absolute;top:150px;left:30px;z-index:5;font-size:20px;color:var(--mute);background:rgba(0,0,0,.35);padding:4px 12px;border-radius:6px}
.exhost .ticker{position:absolute;inset:auto 0 0 0;height:108px;display:flex;align-items:center;border-top:1px solid var(--line);background:rgba(4,16,15,.55);overflow:hidden}
.exhost .ticker .lab{flex:none;height:100%;display:grid;place-items:center;padding:0 52px;background:var(--gold);color:#251b04;font-family:'Readex Pro','Tajawal',sans-serif;font-size:36px;font-weight:700}
.exhost .ticker .track{flex:1;overflow:hidden;white-space:nowrap;direction:rtl}
.exhost .ticker .run{display:inline-block;font-size:36px;animation:run 70s linear infinite}
.exhost .ticker .run em{font-style:normal;color:var(--gold);padding:0 30px}
@keyframes run{from{transform:translateX(0)}to{transform:translateX(50%)}}
@media (prefers-reduced-motion:reduce){.exhost .slide,.exhost .slide.on{transition:none}
.exhost .slide.on .medal .ring{animation:none}
.exhost .ticker .run{animation:none}
.exhost .rail .item.cur .fill i{transition:none}

}
.exhost .ovl{position:absolute;inset:0;z-index:30;opacity:0;visibility:hidden;transition:opacity .8s ease,visibility 0s .8s}
.exhost .ovl.on{opacity:1;visibility:visible;transition:opacity .8s ease}
.exhost .ovl.black{background:#000}
.exhost .ovl.logo{display:grid;place-items:center;background:radial-gradient(900px 600px at 50% 45%, rgba(29,106,93,.35), transparent 70%), #061816}
.exhost .ovl.logo .lg{background:#fff;border-radius:24px;padding:56px 90px 44px;box-shadow:0 20px 80px rgba(0,0,0,.5)}
.exhost .offb{position:absolute;z-index:40;top:178px;left:24px;font-size:22px;color:#251b04;background:var(--gold);padding:4px 14px;border-radius:8px;font-weight:700;display:none}
.exhost .offb.on{display:block}

`;
let cssDone=false;
function injectCss(){ if(cssDone) return; cssDone=true; const s=document.createElement('style'); s.id='exr-css'; s.textContent=CSS; document.head.appendChild(s); }

function catOrder(ch,items){
  const names=CHAN[ch].cats.map(c=>c.n);
  items.forEach(i=>{ if(!names.includes(i.cat)) names.push(i.cat); });
  return names;
}
function catDef(ch,n){ return CHAN[ch].cats.find(c=>c.n===n) || {n:n,t:n,lead:''}; }
function slidesFor(ch,items,extra,imgs){
  const out=[];
  catOrder(ch,items).forEach(cn=>{
    const list=items.filter(i=>i.cat===cn);
    if(!list.length) return;
    const def=catDef(ch,cn);
    if(list.length===1){ out.push({cat:cn,type:'hero',it:list[0],badge:cn}); return; }
    if(list.length<=3){ out.push({cat:cn,type:'cards',items:list,title:def.t,lead:(list.find(x=>x.period)||{}).period||def.lead,cols:list.length}); return; }
    const pages=Math.ceil(list.length/6), size=Math.ceil(list.length/pages);
    for(let p=0;p<pages;p++){
      out.push({cat:cn,type:'cards',dense:true,items:list.slice(p*size,(p+1)*size),title:def.t+(pages>1?' ('+(p+1)+'/'+pages+')':''),lead:(list.find(x=>x.period)||{}).period||def.lead,cols:3});
    }
  });
  (imgs||[]).slice(0,5).forEach(src=>{ if(src) out.push({cat:'',type:'img',src:src}); });
  return out.concat(extra||[]);
}
function disc(it){ return it.photo ? '<img src="'+it.photo+'" alt="">' : STAR; }
function railHtml(cats, cur){
  return '<aside class="rail">'+cats.map(c=>'<div class="item'+(c===cur?' cur':'')+'">'+esc(c)+'<span class="fill"><i></i></span></div>').join('')+'</aside>';
}
function factRow(r,i){
  const ic=ico(r[2]||ICON_DEF[i%3]);
  if(r[0]) return '<div class="fact"><i class="dia">'+ic+'</i><b>'+esc(r[0])+'</b><span>'+esc(r[1])+'</span></div>';
  return '<div class="ach"><i class="dia">'+ic+'</i><span>'+esc(r[1])+'</span></div>';
}
function body(s){
  if(s.type==='img') return '<img class="fimg" src="'+s.src+'" alt="">';
  if(s.type==='hero'){
    const it=s.it, long=(it.name||'').length>16, k=catKind(s.badge), tag=it.period||catTag(s.badge);
    return '<div class="hero"><div class="txt">'
      +(tag?'<div class="tag">'+ico('medal')+esc(tag)+'</div>':'')
      +'<div class="cat">'+esc(s.badge)+'</div><div class="name'+(long?' long':'')+'">'+esc(it.name)+'</div>'
      +(it.sub?'<div class="sub">'+ico(k==='teacher'?'book':k==='student'?'cap':'users')+esc(it.sub)+'</div>':'')
      +(it.note?'<div class="note"><b>سبب التكريم :</b> '+esc(it.note)+'</div><div class="sep">'+ico('star')+'</div>':'')
      +(it.m&&it.m.length?'<div class="facts" style="margin-top:16px">'+it.m.map(factRow).join('')+'</div>':'')
      +'<div class="thx">'+ico('sparkle')+'شكرًا لأنك تصنع الفرق</div></div>'
      +'<div class="pframe"><div class="pin">'+(it.photo?'<img src="'+it.photo+'" alt="">':STAR)+'</div><span class="spk">'+ico('sparkle')+'</span>'
      +'<div class="mdl">'+ico('medal')+'<div class="m1">وسام '+esc(s.badge)+'</div><div class="m2">عطاء • إلهام • إنجاز</div></div></div></div>';
  }
  if(s.type==='cards'){
    return '<h2 class="title">'+esc(s.title)+'</h2><p class="lead">'+esc(s.lead)+'</p><div class="cards'+(s.dense?' dense':'')+'" style="grid-template-columns:repeat('+s.cols+',1fr)">'
      +s.items.map(it=>'<div class="card"><div class="disc">'+disc(it)+'</div><div class="n">'+esc(it.name)+'</div><div class="c">'+esc(it.sub)+'</div>'+(it.note?'<div class="r"><b class="rl">سبب التكريم :</b> '+esc(it.note)+'</div>':'')
        +(it.m&&it.m[0]?'<div class="mt">'+esc(mtxt(it.m[0]))+'</div>':'')+'</div>').join('')+'</div>';
  }
  if(s.type==='rows'){
    return '<h2 class="title">'+esc(s.title)+'</h2><p class="lead">'+esc(s.lead)+'</p><div class="rows">'
      +s.rows.map(r=>'<div class="row"><div class="k">'+esc(r[0])+'<small>'+esc(r[1])+'</small></div><div class="v '+esc(r[3])+'">'+esc(r[2])+'</div></div>').join('')+'</div>';
  }
  if(s.type==='stats'){
    return '<h2 class="title">'+esc(s.title)+'</h2><p class="lead">'+esc(s.lead)+'</p><div class="stats">'
      +s.stats.map(x=>'<div class="stat"><b>'+esc(x[0])+'</b><span>'+esc(x[1])+'</span></div>').join('')+'</div>';
  }
  return '<div class="blank">لا توجد بيانات معروضة بعد<br>أضف من لوحة التعبئة أعلاه</div>';
}


function create(host){
  injectCss();
  host.classList.add('exhost');
  host.innerHTML='<div class="stage">'
    +'<header class="head isban"><img src="brand.png" alt=""><div class="who"><div class="school"></div><div class="chan"></div></div>'
    +'<div class="ban"><div class="t1">نحتفي بالإنجاز ونلهم المستقبل</div><div class="t2">لوحة <b>الشرف</b></div><div class="t3">لكلّ تميّزٍ حكاية… وهنا نروي حكايات مبدعينا</div><div class="orn">'+ico('sparkle')+'</div></div>'
    +'<div class="sp"></div><div class="clock"><div class="time"></div><div class="date"></div></div></header>'
    +'<section class="deck"></section>'
    +'<footer class="ticker"><div class="lab"></div><div class="track"><div class="run"></div></div></footer>'
    +'<div class="ovl black"></div><div class="ovl logo"><div class="lg">'+moeLogoInline(640)+'</div></div>'
    +'<div class="offb">غير متصل — يعرض آخر محتوى محفوظ</div></div>';
  const q=s=>host.querySelector(s), stage=q('.stage');
  let B={channel:'public',items:[],news:[],schoolName:''}, SL=[], IDX=0, paused=false, timer=null, mode='live', ro=null, clockT=null;

  function build(){
    const ch=CHAN[B.channel]?B.channel:'public', c=CHAN[ch];
    q('.head').classList.toggle('isban', ch!=='admins');
    q('.school').textContent=B.schoolName||'';
    q('.chan').textContent=c.chan; q('.ticker .lab').textContent=c.tlab;
    const news=(B.news||[]).map(esc), tk=q('.ticker'), deck=q('.deck');
    if(news.length){ tk.classList.remove('hidden'); deck.classList.remove('noticker'); const once=news.join('<em>◆</em>')+'<em>◆</em>'; q('.run').innerHTML=once+once; }
    else{ tk.classList.add('hidden'); deck.classList.add('noticker'); }
    SL=slidesFor(ch,B.items||[],B.extra,B.imgs);
    if(!SL.length) SL=[{cat:'',type:'blank'}];
    const cats=[]; SL.forEach(s=>{ if(s.cat && !cats.includes(s.cat)) cats.push(s.cat); });
    deck.innerHTML=SL.map((s,i)=>'<div class="slide'+(s.type==='img'?' full':'')+'" data-i="'+i+'">'+(cats.length&&s.type!=='img'?railHtml(cats,s.cat):'')+'<div class="main">'+body(s)+'</div></div>').join('');
    host.style.setProperty('--dur', DUR+'s');
    show(Math.min(IDX,SL.length-1));
  }
  function show(i){
    const n=SL.length; IDX=((i%n)+n)%n;
    host.querySelectorAll('.slide').forEach(el=>el.classList.toggle('on', +el.dataset.i===IDX));
    restart();
  }
  function restart(){
    clearTimeout(timer);
    const cur=q('.slide.on .rail .item.cur .fill i');
    if(cur){ cur.style.transition='none'; cur.style.width='0'; void cur.offsetWidth; cur.style.transition=''; cur.style.width=''; }
    if(!paused && mode==='live' && SL.length>1) timer=setTimeout(()=>show(IDX+1), DUR*1000);
  }
  function fit(){
    const w=host.clientWidth, h=host.clientHeight; if(!w||!h) return;
    const k=Math.min(w/1920,h/1080);
    stage.style.transform='translate('+((w-1920*k)/2)+'px,'+((h-1080*k)/2)+'px) scale('+k+')';
  }
  function tick(){
    const d=new Date();
    try{
      q('.time').textContent=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Riyadh'}).format(d);
      const wd=new Intl.DateTimeFormat('ar-SA',{weekday:'long',timeZone:'Asia/Riyadh'}).format(d);
      const h=new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Riyadh'}).format(d);
      q('.date').textContent=wd+'، '+h.replace(/\s*هـ\s*$/,'')+' هـ';
    }catch(e){}
  }
  clockT=setInterval(tick,15000); tick();
  if(typeof ResizeObserver!=='undefined'){ ro=new ResizeObserver(fit); ro.observe(host); } else window.addEventListener('resize',fit);
  fit(); build();
  return {
    setBoard(b){ B=Object.assign({channel:'public',items:[],news:[],schoolName:''},b||{}); build(); },
    /* mode: live | black | logo */
    setMode(m){ mode=m; q('.ovl.black').classList.toggle('on',m==='black'); q('.ovl.logo').classList.toggle('on',m==='logo'); restart(); },
    setOffline(on){ q('.offb').classList.toggle('on',!!on); },
    jumpToCat(cat){ const i=SL.findIndex(s=>s.cat===cat); if(i>=0) show(i); },
    next(){ show(IDX+1); }, prev(){ show(IDX-1); },
    pause(p){ paused=!!p; restart(); }, togglePause(){ paused=!paused; restart(); },
    fit, slides(){ return SL; },
    destroy(){ clearTimeout(timer); clearInterval(clockT); if(ro) ro.disconnect(); host.innerHTML=''; }
  };
}
g.ExR={CHAN,FC,ICONS,ICON_KEYS,ICON_DEF,ORDER,ico,STAR,esc,catKind,fcfg,catTag,mtxt,slidesFor,create};
})(window);
