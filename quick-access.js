/* quick-access.js — إصدار: 2026-10-28.2 · الاختبار
   تبويب «الوصول السريع» الأول في صفحات الوكلاء ومنصة النشاط: تبويبان داخليان («المؤشرات» و«الوصول السريع»)،
   وبطاقات تفتح الأقسام وتبويباتها الفرعية. لكل صفحة نمط شكل: head | rows | ring | bar.
   cards: [{t:العنوان, n:الإجمالي, p:عدد بانتظار أو null, l:نص المعنى, go:()=>…, tabs:[[نص, ()=>…],…]}] */
(function(){
  if (window.QA) return;
  var AR = '٠١٢٣٤٥٦٧٨٩', COL = ['#2d6a4f', '#b5651d', '#a3362a', '#6a4c93', '#1d4e89', '#0f766e', '#9a3412', '#475569'];
  var A = function(n){ return String(n).replace(/\d/g, function(d){ return AR[d]; }); };
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var CSS = '' +
    '.qa-sub{display:flex;gap:6px;margin-bottom:10px}.qa-sub button{flex:1;font:inherit;font-size:13px;padding:8px;border-radius:10px;border:1px solid var(--line,#dde3ea);background:var(--surface,#fff);color:inherit;cursor:pointer}.qa-sub button.on{border-color:var(--brand,#2d5b4c);color:var(--brand,#2d5b4c);font-weight:800}' +
    '.qa-g{display:grid;grid-template-columns:1fr 1fr;gap:8px}@media(min-width:760px){.qa-g{grid-template-columns:repeat(3,1fr)}}' +
    '.qa-c{cursor:pointer;min-width:0}.qa-t{font-weight:800}.qa-tb button{font:inherit;color:inherit;cursor:pointer}' +
    /* head */
    '.qa-head .qa-c{background:var(--surface,#fff);border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.1);display:flex;flex-direction:column}.qa-head .h{background:var(--k);color:#fff;padding:7px 9px;display:flex;justify-content:space-between;align-items:center;gap:6px}.qa-head .h b{font-size:22px;line-height:1}.qa-head .h span{font-size:10px;text-align:left}.qa-head .qa-t{font-size:12.5px;padding:7px 9px 4px}.qa-head .qa-tb{display:grid;gap:3px;padding:0 9px 8px}.qa-head .qa-tb button{font-size:10px;background:var(--bg,#eef3f0);border:0;border-radius:6px;padding:4px 6px;text-align:center}.qa-head .e{height:6px}' +
    /* rows */
    '.qa-rows{display:block}.qa-rows .qa-c{display:flex;background:var(--surface,#fff);border-radius:14px;margin-bottom:8px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.1)}.qa-rows .n{width:72px;background:var(--k);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none;padding:6px 2px;text-align:center}.qa-rows .n b{font-size:24px;line-height:1}.qa-rows .n small{font-size:9px;margin-top:2px}.qa-rows .m{flex:1;padding:9px 11px;display:flex;align-items:center;justify-content:space-between;min-width:0}.qa-rows .m:after{content:"‹";font-size:22px;color:var(--muted,#6b7785)}.qa-rows .qa-t{font-size:13.5px}.qa-rows .sb{font-size:10.5px;color:var(--muted,#6b7785);margin-top:3px;display:flex;gap:6px;flex-wrap:wrap}.qa-rows .sb button{background:none;border:0;padding:0;font-size:10.5px;color:var(--brand,#2d5b4c);text-decoration:underline}' +
    /* ring */
    '.qa-ring .qa-c{background:var(--surface,#fff);border-radius:18px;padding:12px 8px 10px;text-align:center;border:1px solid var(--line,#dde3ea)}.qa-ring .ring{width:68px;height:68px;border-radius:50%;margin:0 auto 7px;display:grid;place-items:center;background:conic-gradient(var(--k) calc(var(--p)*1%),var(--line,#dde3ea) 0)}.qa-ring .ring span{width:54px;height:54px;border-radius:50%;background:var(--surface,#fff);display:grid;place-items:center;font-size:20px;font-weight:800;color:var(--k)}.qa-ring .qa-t{font-size:12.5px}.qa-ring small{display:block;font-size:10.5px;color:var(--muted,#6b7785);margin-top:2px}' +
    /* bar */
    '.qa-bar .qa-c{background:var(--surface,#fff);border-radius:12px;padding:9px;border:1px solid var(--line,#dde3ea)}.qa-bar .qa-t{font-size:12.5px}.qa-bar .row{display:flex;justify-content:space-between;align-items:baseline;margin:5px 0 4px}.qa-bar b{font-size:22px;color:var(--k)}.qa-bar small{font-size:10px;color:var(--muted,#6b7785)}.qa-bar .bar{height:5px;border-radius:4px;background:var(--line,#dde3ea);overflow:hidden}.qa-bar .bar i{display:block;height:100%;background:var(--k)}.qa-bar .qa-tb{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.qa-bar .qa-tb button{font-size:9.5px;border:1px solid var(--line,#dde3ea);border-radius:8px;padding:2px 6px;background:none}';
  function css(){ if (document.getElementById('qa-css')) return; var s = document.createElement('style'); s.id = 'qa-css'; s.textContent = CSS; document.head.appendChild(s); }

  function tabsHtml(c, ci){ return (c.tabs || []).map(function(t, ti){ return '<button type="button" data-a="qa-t" data-v="' + ci + '|' + ti + '" data-qt="' + ci + '|' + ti + '">' + esc(t[0]) + '</button>'; }).join(''); }
  function html(style, cards){
    var out = cards.map(function(c, ci){
      var k = c.k || COL[ci % COL.length], pend = c.p == null ? '' : c.p, tot = c.n == null ? 0 : c.n;
      var pct = Math.min(100, Math.round((Number(c.p) || 0) * 100 / Math.max(1, Number(tot) || 0)));
      var lab = (c.p != null ? A(c.p) + ' ' : '') + esc(c.l || ''), has = (c.tabs || []).length;
      var open = '<div class="qa-c" data-a="qa-c" data-v="' + ci + '" data-qc="' + ci + '" style="--k:' + k + ';--p:' + pct + '">';
      if (style === 'rows') return open + '<div class="n"><b>' + A(tot) + '</b><small>' + lab + '</small></div><div class="m"><div><div class="qa-t">' + esc(c.t) + '</div>' + (has ? '<div class="sb qa-tb">' + tabsHtml(c, ci) + '</div>' : '') + '</div></div></div>';
      if (style === 'ring') return open + '<div class="ring"><span>' + A(tot) + '</span></div><div class="qa-t">' + esc(c.t) + '</div><small>' + lab + '</small></div>';
      if (style === 'bar') return open + '<div class="qa-t">' + esc(c.t) + '</div><div class="row"><b>' + A(tot) + '</b><small>' + lab + '</small></div><div class="bar"><i style="width:' + pct + '%"></i></div>' + (has ? '<div class="qa-tb">' + tabsHtml(c, ci) + '</div>' : '') + '</div>';
      return open + '<div class="h"><b>' + A(tot) + '</b><span>' + lab + '</span></div><div class="qa-t">' + esc(c.t) + '</div>' + (has ? '<div class="qa-tb">' + tabsHtml(c, ci) + '</div>' : '<div class="e"></div>') + '</div>';
    }).join('');
    return '<div class="qa-g qa-' + style + '"' + (style === 'rows' ? ' style="display:block"' : '') + '>' + out + '</div>';
  }
  /* يركّب الحاوية ويربط النقر. host: عنصر؛ opts: {style, cards:()=>[], stats: عنصر المؤشرات الحالي (يُنقل)} */
  function mount(host, opts){
    css();
    host.innerHTML = '<div class="qa-sub"><button type="button" class="on" data-qs="i">المؤشرات</button><button type="button" data-qs="q">الوصول السريع</button></div><div class="qa-i"></div><div class="qa-q" hidden></div>';
    var I = host.querySelector('.qa-i'), Q = host.querySelector('.qa-q'), cur = [];
    if (opts.stats) I.appendChild(opts.stats);
    function refresh(){ if (host.hidden || (host.closest && host.closest('[hidden]'))) return; try { cur = opts.cards(); Q.innerHTML = html(opts.style, cur); } catch (e) { console.warn('QA', e); } }
    host.addEventListener('click', function(e){
      var s = e.target.closest('[data-qs]');
      if (s) { host.querySelectorAll('.qa-sub button').forEach(function(b){ b.classList.toggle('on', b === s); }); I.hidden = s.dataset.qs !== 'i'; Q.hidden = s.dataset.qs !== 'q'; if (s.dataset.qs === 'q') refresh(); return; }
      var t = e.target.closest('[data-qt]');
      if (t) { var p = t.dataset.qt.split('|'); e.stopPropagation(); cur[p[0]].tabs[p[1]][1](); return; }
      var c = e.target.closest('[data-qc]');
      if (c && cur[c.dataset.qc] && cur[c.dataset.qc].go) cur[c.dataset.qc].go();
    });
    setInterval(function(){ if (!Q.hidden) refresh(); }, 1200);
    return { refresh: refresh };
  }
  /* تثبيت للصفحات ذات الشريط #tabs و.pane: يضيف الزر والقسم أولًا ويجعله الافتتاحي */
  function install(o){
    var nav = document.querySelector(o.nav || '#tabs'); if (!nav || document.getElementById('p-q')) return null;
    var btn = document.createElement('button'); btn.type = 'button'; btn.dataset.t = 'q'; btn.textContent = 'الوصول السريع';
    nav.insertBefore(btn, nav.firstChild);
    var hh = (location.hash || '').replace('#', ''), keep = !!(hh && nav.querySelector('[data-t="' + hh + '"]'));
    if (!keep) nav.querySelectorAll('button').forEach(function(b){ b.classList.toggle('active', b === btn); });
    var panes = document.querySelectorAll('.pane'), pane = document.createElement('div'); pane.className = 'pane'; pane.id = 'p-q';
    var sec = document.createElement('section'); sec.className = 'card'; pane.appendChild(sec);
    panes[0].parentNode.insertBefore(pane, panes[0]);
    if (!keep) panes.forEach(function(p){ p.hidden = true; }); else pane.hidden = true;
    var m = mount(sec, { style: o.style, cards: o.cards, stats: document.querySelector(o.stats) });
    nav.addEventListener('click', function(e){ var b = e.target.closest('button'); if (b && b.dataset.t === 'q') setTimeout(m.refresh, 0); });
    var go = function(t, sub){ var b = nav.querySelector('[data-t="' + t + '"]'); if (b) b.click(); if (sub) setTimeout(function(){ var x = document.querySelector(sub); if (x) x.click(); }, 60); };
    return { refresh: m.refresh, go: go };
  }

  /* ربط فقط: الصفحة تحمل بنية «الوصول السريع» في قالبها نفسه (الزر الأول، والقسم، والمؤشرات داخله)، وهذه الدالة تربط البطاقات */
  function bind(o){
    css();
    var nav = document.querySelector(o.nav || '#tabs'), pane = document.getElementById('p-q'); if (!nav || !pane) return null;
    var host = pane.querySelector('.card') || pane, Q = host.querySelector('.qa-q'), I = host.querySelector('.qa-i'), cur = [];
    function refresh(){ if (pane.hidden || Q.hidden) return; try { cur = o.cards(); Q.innerHTML = html(o.style, cur); } catch (e) { console.warn('QA', e); } }
    host.addEventListener('click', function(e){
      var s = e.target.closest('[data-qs]');
      if (s) { host.querySelectorAll('.qa-sub button').forEach(function(b){ b.classList.toggle('on', b === s); }); I.hidden = s.dataset.qs !== 'i'; Q.hidden = s.dataset.qs !== 'q'; if (s.dataset.qs === 'q') refresh(); return; }
      var t = e.target.closest('[data-qt]');
      if (t) { var p = t.dataset.qt.split('|'); e.stopPropagation(); cur[p[0]].tabs[p[1]][1](); return; }
      var c = e.target.closest('[data-qc]');
      if (c && cur[c.dataset.qc] && cur[c.dataset.qc].go) cur[c.dataset.qc].go();
    });
    nav.addEventListener('click', function(e){ var b = e.target.closest('button'); if (b && b.dataset.t === 'q') setTimeout(refresh, 0); });
    setInterval(refresh, 1200);
    var go = function(t, sub){ var b = nav.querySelector('[data-t="' + t + '"]'); if (b) b.click(); if (sub) setTimeout(function(){ var x = document.querySelector(sub); if (x) x.click(); }, 60); };
    return { refresh: refresh, go: go };
  }
  /* قالب البنية (يُنسخ إلى قالب كل صفحة) */
  var SHELL = '<div class="pane" id="p-q"><section class="card"><div class="qa-sub"><button type="button" class="on" data-qs="i">المؤشرات</button><button type="button" data-qs="q">الوصول السريع</button></div><div class="qa-i">@@STATS@@</div><div class="qa-q" hidden></div></section></div>';
  /* بعد الانتقال من بطاقة: يُظهر التبويب الرئيسي والفرعي النشطين داخل شريطيهما (على الجوال قد يكونان خارج الرؤية) */
  function reveal(){
    [30, 150, 400, 900].forEach(function(ms){ setTimeout(function(){
      document.querySelectorAll('nav.tabs,.tabs,[role=tablist],.seg,.subs,.ac-tabs').forEach(function(c){
        var a = c.querySelector('.active,.on,[aria-selected="true"]'); if (!a || c.scrollWidth <= c.clientWidth + 2) return;
        var r = a.getBoundingClientRect(), q = c.getBoundingClientRect();
        if (r.left < q.left || r.right > q.right) c.scrollLeft += (r.left + r.right) / 2 - (q.left + q.right) / 2;
      });
    }, ms); });
  }
  document.addEventListener('click', function(e){ if (e.target.closest && e.target.closest('[data-qc],[data-qt]')) reveal(); }, true);
  window.QA = { reveal: reveal, mount: mount, install: install, bind: bind, shell: SHELL, A: A, html: html, css: css };
})();
