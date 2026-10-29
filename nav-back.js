/* nav-back.js — إصدار: 2026-10-28.1 · الاختبار
   زر الرجوع في المتصفح/الجوال يعيد إلى الشاشة السابقة داخل الصفحة (التبويب الرئيسي أو الفرعي أو النافذة المفتوحة)
   بدل الخروج منها إلى الصفحة الرئيسية. يعمل بدون تعديل كود الصفحات: يراقب أزرار التبويبات والنوافذ ويسجّل كل انتقال في سجل المتصفح.
   ما لم تكن هناك معالجة جارية: إن كانت في النافذة حقول عُدِّلت ولم تُحفظ يُسأل المستخدم قبل الإغلاق. */
(function(){
  if (window.__navBack) return; window.__navBack = 1;
  var ACT = /(^|\s)(active|on|sel|selected|act|current|is-active)(\s|$)/;
  var OVSEL = '.ov,.overlay,.modal-ov,.modal-bg,.modal-back,.modal,.mask,.backdrop,[role=dialog],dialog';
  var restoring = false, dirty = new WeakSet(), openOv = [], lastSnap = '[]';

  function vis(el){ var cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0; }
  function isAct(el){ return ACT.test(el.className && el.className.baseVal === undefined ? el.className : '') || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-current') === 'true' || el.getAttribute('aria-pressed') === 'true'; }
  function key(el){
    var p = []; while (el && el !== document.body) { if (el.id) { p.unshift('#' + el.id); break; } var i = 0, s = el; while ((s = s.previousElementSibling)) i++; p.unshift(el.nodeName + i); el = el.parentElement; }
    return p.join('>');
  }
  /* مجموعة تبويبات: حاوية فيها زران أو أكثر من الأزرار/الروابط المتجاورة، وواحد منها فقط نشط، وظاهرة، وليست داخل نافذة */
  function groups(){
    var out = [], seen = new Set(), cand = document.querySelectorAll('button,[role=tab],a[href^="#"],.tab,.chip');
    for (var i = 0; i < cand.length; i++) {
      var c = cand[i].parentElement; if (!c || seen.has(c)) continue; seen.add(c);
      if (c.closest(OVSEL)) continue;
      var ch = [], n = c.children, a = -1, na = 0;
      for (var j = 0; j < n.length; j++) { if (/^(BUTTON|A|LABEL)$/.test(n[j].nodeName) || n[j].getAttribute('role') === 'tab') { ch.push(n[j]); if (isAct(n[j])) { a = ch.length - 1; na++; } } }
      if (ch.length >= 2 && na === 1 && vis(c)) out.push({ k: key(c), i: a, el: c, ch: ch });
    }
    return out;
  }
  function snap(){ return groups().map(function(g){ return [g.k, g.i]; }); }
  var timers = [];
  function state(extra){ var s = { nb: 1, snap: snap(), ov: openOv.length }; return s; }

  function push(){
    var s = state();
    try { history.pushState(s, '', location.href); lastSnap = JSON.stringify(s.snap); } catch (e) {}
  }
  function afterClick(){
    if (restoring) return;
    [30, 250].forEach(function(ms){ setTimeout(function(){
      if (restoring) return;
      var cur = JSON.stringify(snap());
      if (cur !== lastSnap && openOv.length === (history.state && history.state.ov || 0)) { push(); }
    }, ms); });
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('button,[role=tab],a,.tab,.chip'); if (!b || restoring) return;
    afterClick();
  }, true);

  /* ---------- النوافذ ---------- */
  document.addEventListener('input', function(e){ var o = e.target.closest && e.target.closest(OVSEL); if (o) dirty.add(o); }, true);
  function scanOv(){
    if (restoring) return;
    var all = Array.prototype.slice.call(document.querySelectorAll(OVSEL)).filter(function(el){
      if (!vis(el)) return false; var cs = getComputedStyle(el); if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
      var r = el.getBoundingClientRect(); return r.width >= innerWidth * 0.6 && r.height >= innerHeight * 0.3;
    });
    /* نبقي الأعمق فقط حين تتداخل (ov داخل modal) */
    all = all.filter(function(el){ return !all.some(function(o){ return o !== el && el.contains(o); }); });
    var was = openOv.length; openOv = all;
    if (all.length > was) { for (var k = was; k < all.length; k++) { try { history.pushState({ nb: 1, snap: snap(), ov: k + 1 }, '', location.href); } catch (e) {} } }
    else if (all.length < was && history.state && history.state.ov > all.length) { restoring = true; history.go(all.length - history.state.ov); setTimeout(function(){ restoring = false; }, 350); }
  }
  var sched = 0;
  new MutationObserver(function(){ if (sched) return; sched = requestAnimationFrame(function(){ sched = 0; scanOv(); }); })
    .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });

  function doClose(o){
    var btn = Array.prototype.slice.call(o.querySelectorAll('button,a,[data-close],[data-x]')).filter(function(b){ return /^(إلغاء|إغلاق|اغلاق|رجوع|×|✕|x|close|cancel)$/i.test((b.textContent || '').trim()) || b.hasAttribute('data-close') || b.id === 'x'; })[0];
    if (btn) btn.click(); else o.remove();
  }
  function closeTop(){
    var o = openOv[openOv.length - 1]; if (!o) return false;
    if (dirty.has(o) && window.mnConfirm) {
      /* تعديلات لم تُحفظ: نُبقي النافذة ونسأل بنافذة الموقع الداخلية */
      try { history.pushState({ nb: 1, snap: snap(), ov: openOv.length }, '', location.href); } catch (e) {}
      window.mnConfirm('توجد تعديلات لم تُحفظ. هل تريد إغلاق النافذة وتجاهلها؟').then(function(yes){ if (yes) { dirty.delete(o); restoring = true; history.back(); setTimeout(function(){ restoring = false; doClose(o); }, 150); } });
      return true;
    }
    doClose(o); return true;
  }

  /* ---------- الرجوع ---------- */
  function apply(sn, i){
    if (i >= sn.length) { restoring = false; lastSnap = JSON.stringify(snap()); return; }
    var g = groups().filter(function(x){ return x.k === sn[i][0]; })[0];
    if (g && g.i !== sn[i][1] && g.ch[sn[i][1]]) g.ch[sn[i][1]].click();
    setTimeout(function(){ apply(sn, i + 1); }, 40);
  }
  window.addEventListener('popstate', function(e){
    if (restoring) return;
    var st = e.state; if (!st || !st.nb) return;
    var depth = st.ov || 0;
    if (openOv.length > depth) { restoring = true; var ok = closeTop(); setTimeout(function(){ restoring = false; scanOv(); }, 120); if (ok || true) return; }
    restoring = true; apply(st.snap || [], 0);
  });

  function init(){
    try { history.replaceState({ nb: 1, snap: snap(), ov: 0 }, '', location.href); lastSnap = JSON.stringify(snap()); } catch (e) {}
    setTimeout(function(){ try { if (!openOv.length) { history.replaceState({ nb: 1, snap: snap(), ov: 0 }, '', location.href); lastSnap = JSON.stringify(snap()); } } catch (e) {} }, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(init, 200); }); else setTimeout(init, 200);
})();
