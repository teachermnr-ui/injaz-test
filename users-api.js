// إصدار: 2026-10-12.1 · الاختبار
/* واجهة موحَّدة لدوال الخادم التي حلّت محل قراءات users وstudentAccounts المباشرة (الأمان — 2026-10-12).
   تعمل مع Firebase compat، وتحمّل خدمة الدوال تلقائيًا إن لم تكن محمَّلة بالصفحة. */
(function(){
  function loadFns(){
    return new Promise(function(res, rej){
      if(window.firebase && firebase.functions) return res();
      var s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/12.14.0/firebase-functions-compat.js';
      s.onload = function(){ res(); };
      s.onerror = function(){ rej(new Error('تعذّر تحميل خدمة الدوال. تحقق من الاتصال بالإنترنت.')); };
      document.head.appendChild(s);
    });
  }
  async function call(name, data){
    await loadFns();
    var r = await firebase.functions().httpsCallable(name)(data || {});
    return r.data;
  }
  /* يُرجع كائنًا بشكل QuerySnapshot مبسَّط (docs / size / empty / forEach) ليحل محل usersCol().get() بأقل تغيير */
  function snapOf(users){
    var docs = (users || []).map(function(u){ return { id:u.id, exists:true, ref:null, data:function(){ return u.data; } }; });
    return { docs:docs, size:docs.length, empty:!docs.length, forEach:function(fn){ docs.forEach(fn); } };
  }
  window.UsersAPI = {
    call: call,
    listSnap: async function(schoolId, opts){
      var r = await call('listSchoolUsers', Object.assign({ schoolId: schoolId || null }, opts || {}));
      return snapOf(r.users);
    }
  };
})();
