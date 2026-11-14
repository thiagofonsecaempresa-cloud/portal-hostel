(function () {
  'use strict';

  // ---- Módulos disponíveis. "roles" só controla o que aparece no menu;
  // ---- quem realmente protege os dados é o banco (RLS, ver supabase/schema.sql).
  var ICONS = {
    cama: '<svg viewBox="0 0 24 24"><path d="M3 19V6"/><path d="M3 14h18v5"/><path d="M21 14v-2.5A2.5 2.5 0 0 0 18.5 9H11v5"/><circle cx="7" cy="11" r="1.8"/></svg>',
    lavanderia: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2.5"/><circle cx="12" cy="13.5" r="4"/><path d="M8 6.5h.01M11 6.5h.01"/></svg>',
    calendario: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    custos: '<svg viewBox="0 0 24 24"><path d="M4 20V11M10 20V4M16 20v-6M22 20H2"/></svg>',
    backup: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 19h16"/></svg>',
    usuarios: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.5-3.5 3-5 6-5s5.5 1.5 6 5"/><path d="M16.5 5.2a3 3 0 0 1 0 5.6M18 15.3c1.8.6 2.9 2.1 3.2 4.7"/></svg>'
  };
  var MODULES = [
    { id: 'rotatividade', title: 'Rotatividade do Hostel', icon: 'cama', name: 'Rotatividade (camareira)', desc: 'Limpeza por cama e por dia.', path: 'modules/rotatividade/index.html', roles: ['admin', 'camareira'] },
    { id: 'lsr', title: 'Lavanderia do Hostel', icon: 'lavanderia', name: 'Lavanderia', desc: 'Produção, inventário, qualidade e rotatividade do enxoval (SR e MK).', path: 'modules/lsr/index.html', roles: ['admin', 'lavanderia'] },
    { id: 'hostel', title: 'Reservas — Hostel MK', icon: 'calendario', name: 'Reservas — Hostel MK', desc: 'Reservas, calendário e mapa de ocupação.', path: 'modules/hostel/index.html', roles: ['admin'] },
    { id: 'gestao', title: 'Gestão do Hostel', icon: 'custos', name: 'Gestão de custos', desc: 'Custos fixos e variáveis e custo por quarto.', path: 'modules/gestao/index.html', roles: ['admin'] }
  ];
  var ROLE_LABEL = { admin: 'Acesso geral (admin)', lavanderia: 'Só lavanderia', camareira: 'Só camareira', pendente: 'Pendente (sem acesso)' };

  var $ = function (id) { return document.getElementById(id); };
  var cfg = window.PORTAL_CONFIG || {};
  var sb = null;
  var me = null;       // { id, email, nome, role }
  var current = null;  // módulo aberto

  function show(view) {
    ['viewLogin', 'viewHome', 'viewModule', 'viewAdmin'].forEach(function (v) { $(v).classList.toggle('hidden', v !== view); });
    if (view === 'viewLogin') { $('loginForm').classList.remove('hidden'); $('signupForm').classList.add('hidden'); }
  }
  function setMsg(el, text, ok) { el.textContent = text || ''; el.classList.toggle('ok', !!ok); }

  // =====================================================================
  // Armazenamento na nuvem (usado pelos módulos via shim.js)
  // =====================================================================
  var store = (function () {
    var cache = new Map();
    var mod = null;
    var pending = new Map(); // key -> {op:'set', v} | {op:'del'}
    var timer = null, retry = null, flushing = null;

    function status(kind, text) {
      var el = $('saveStatus'); el.className = 'status ' + kind; el.textContent = text;
    }

    function schedule() {
      status('saving', 'Salvando…');
      clearTimeout(timer);
      timer = setTimeout(flush, 500);
    }

    async function flush() {
      if (flushing) { await flushing; }
      if (!mod || pending.size === 0) return;
      var m = mod;
      var batch = Array.from(pending.entries());
      var now = new Date().toISOString();
      var sets = [], dels = [];
      batch.forEach(function (e) {
        if (e[1].op === 'set') sets.push({ module: m, key: e[0], value: e[1].v, updated_at: now });
        else dels.push(e[0]);
      });
      flushing = (async function () {
        try {
          if (sets.length) {
            var r1 = await sb.from('kv_store').upsert(sets, { onConflict: 'module,key' });
            if (r1.error) throw r1.error;
          }
          if (dels.length) {
            var r2 = await sb.from('kv_store').delete().eq('module', m).in('key', dels);
            if (r2.error) throw r2.error;
          }
          // só limpa o que não mudou durante o envio
          batch.forEach(function (e) { if (pending.get(e[0]) === e[1]) pending.delete(e[0]); });
          clearTimeout(retry); retry = null;
          if (pending.size === 0) status('saved', 'Salvo ✓');
          else schedule();
        } catch (err) {
          status('error', 'Erro ao salvar — tentando…');
          console.error('Erro ao salvar', err);
          clearTimeout(retry);
          retry = setTimeout(flush, 10000);
        }
      })();
      try { await flushing; } finally { flushing = null; }
    }

    return {
      async load(moduleId) {
        var rows = [], from = 0, size = 1000;
        for (;;) {
          var r = await sb.from('kv_store').select('key,value').eq('module', moduleId).order('key').range(from, from + size - 1);
          if (r.error) throw r.error;
          rows = rows.concat(r.data);
          if (r.data.length < size) break;
          from += size;
        }
        cache = new Map(rows.map(function (x) { return [x.key, x.value]; }));
        pending = new Map(); mod = moduleId;
        status('saved', 'Nuvem ✓');
      },
      async close() {
        clearTimeout(timer);
        await flush();
        var ok = pending.size === 0;
        if (ok) { cache = new Map(); mod = null; }
        return ok;
      },
      hasPending: function () { return pending.size > 0; },
      get: function (k) { return cache.has(k) ? cache.get(k) : null; },
      set: function (k, v) { cache.set(k, v); pending.set(k, { op: 'set', v: v }); schedule(); },
      remove: function (k) { if (cache.has(k) || pending.has(k)) { cache.delete(k); pending.set(k, { op: 'del' }); schedule(); } },
      clear: function () { Array.from(cache.keys()).forEach(function (k) { pending.set(k, { op: 'del' }); }); cache.clear(); schedule(); },
      keys: function () { return Array.from(cache.keys()); },
      flush: flush
    };
  })();
  window.PORTAL_STORE = store;

  window.addEventListener('beforeunload', function (e) {
    if (store.hasPending()) { e.preventDefault(); e.returnValue = ''; }
  });
  window.addEventListener('pagehide', function () { if (store.hasPending()) store.flush(); });

  // =====================================================================
  // Login e sessão
  // =====================================================================
  function configured() {
    return cfg.SUPABASE_URL && /^https:\/\//.test(cfg.SUPABASE_URL) && cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_ANON_KEY.indexOf('COLE_AQUI') < 0;
  }

  async function loadProfile(user) {
    var r = await sb.from('profiles').select('id,email,nome,role').eq('id', user.id).maybeSingle();
    if (r.error) throw r.error;
    me = r.data || { id: user.id, email: user.email, nome: user.email, role: 'pendente' };
  }

  async function enter(user) {
    try {
      await loadProfile(user);
      showHome();
    } catch (err) {
      console.error(err);
      await sb.auth.signOut();
      show('viewLogin');
      setMsg($('loginMsg'), 'Não foi possível carregar seu perfil. Tente novamente.');
    }
  }

  function showHome() {
    current = null;
    var first = String(me.nome || me.email || '').trim().split(/\s+/)[0];
    $('helloName').textContent = 'Olá, ' + first;
    $('whoami').textContent = ROLE_LABEL[me.role];
    var cards = $('cards'); cards.innerHTML = '';
    var list = MODULES.filter(function (m) { return m.roles.indexOf(me.role) >= 0; });
    list.forEach(function (m) { cards.appendChild(tile(m.icon, m.name, m.desc, function () { openModule(m); })); });
    if (me.role === 'admin') {
      cards.appendChild(tile('usuarios', 'Usuários e acessos', 'Liberar cadastros e definir quem acessa o quê.', openAdmin));
      var last = ''; try { last = localStorage.getItem('portal_ultimo_backup') || ''; } catch (e) {}
      cards.appendChild(tile('backup', 'Backup geral', last ? 'Baixa tudo de todos os módulos. Último backup: ' + last + '.' : 'Baixa tudo de todos os módulos num só arquivo. Faça de vez em quando.', downloadBackup));
    }
    setMsg($('homeMsg'), me.role === 'pendente' ? 'Seu acesso ainda não foi liberado. Peça ao administrador.' : '');
    show('viewHome');
    if (me.role === 'admin') {
      sb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'pendente').then(function (r) {
        if (!r.error && r.count > 0 && !$('homeMsg').textContent) setMsg($('homeMsg'), r.count + (r.count === 1 ? ' pessoa aguarda' : ' pessoas aguardam') + ' liberação em “Usuários e acessos”.', true);
      });
    }
  }

  function tile(icon, title, desc, onClick) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'tile';
    var i = document.createElement('div'); i.className = 'ico'; i.innerHTML = ICONS[icon] || '';
    var h = document.createElement('h2'); h.textContent = title;
    var p = document.createElement('p'); p.textContent = desc;
    var g = document.createElement('span'); g.className = 'go'; g.textContent = 'Abrir →';
    b.appendChild(i); b.appendChild(h); b.appendChild(p); b.appendChild(g);
    b.addEventListener('click', onClick);
    return b;
  }

  async function openModule(m) {
    setMsg($('homeMsg'), 'Carregando…', true);
    try {
      await store.load(m.id);
    } catch (err) {
      console.error(err);
      setMsg($('homeMsg'), 'Não foi possível carregar os dados. Verifique a conexão e tente de novo.');
      return;
    }
    current = m;
    window.PORTAL_FLAGS = { canImport: me.role === 'admin' && cfg.ALLOW_IMPORT === true };
    $('modTitle').textContent = m.title || m.name;
    $('frame').src = m.path;
    show('viewModule');
    setMsg($('homeMsg'), '');
  }

  async function closeModule() {
    var ok = await store.close();
    if (!ok && !confirm('Há alterações que ainda não foram salvas na nuvem. Sair mesmo assim? Elas serão perdidas.')) return;
    $('frame').src = 'about:blank';
    showHome();
  }

  // =====================================================================
  // Backup geral (admin): todos os módulos num só arquivo JSON
  // =====================================================================
  async function downloadBackup() {
    setMsg($('homeMsg'), 'Gerando backup…', true);
    try {
      var rows = [], from = 0, size = 1000;
      for (;;) {
        var r = await sb.from('kv_store').select('module,key,value').order('module').order('key').range(from, from + size - 1);
        if (r.error) throw r.error;
        rows = rows.concat(r.data);
        if (r.data.length < size) break;
        from += size;
      }
      var mods = {};
      rows.forEach(function (x) { (mods[x.module] = mods[x.module] || {})[x.key] = x.value; });
      var now = new Date();
      var out = { sistema: 'Portal São Hostel', tipo: 'backup-geral', versao: 1, exportado_em: now.toISOString(), registros: rows.length, modulos: mods };
      var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      var a = document.createElement('a'), pad = function (n) { return String(n).padStart(2, '0'); };
      var stamp = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
      a.href = URL.createObjectURL(blob); a.download = 'backup-sao-hostel-' + stamp + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      var br = pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear();
      try { localStorage.setItem('portal_ultimo_backup', br); } catch (e) {}
      showHome();
      setMsg($('homeMsg'), 'Backup baixado (' + rows.length + ' registros de ' + Object.keys(mods).length + ' módulos). Guarde o arquivo em local seguro.', true);
    } catch (err) {
      console.error(err);
      setMsg($('homeMsg'), 'Não foi possível gerar o backup. Tente de novo.');
    }
  }

  // =====================================================================
  // Administração de usuários
  // =====================================================================
  async function openAdmin() {
    show('viewAdmin');
    setMsg($('adminMsg'), 'Carregando…', true);
    var r = await sb.from('profiles').select('id,email,nome,role,created_at').order('created_at');
    var tb = $('userRows'); tb.innerHTML = '';
    if (r.error) { setMsg($('adminMsg'), 'Erro ao carregar usuários.'); return; }
    setMsg($('adminMsg'), '');
    r.data.sort(function (a, b) { return (b.role === 'pendente') - (a.role === 'pendente'); });
    r.data.forEach(function (u) {
      var tr = document.createElement('tr');
      var tdN = document.createElement('td'); tdN.textContent = u.nome || '';
      var tdE = document.createElement('td'); tdE.textContent = u.email || '';
      var tdR = document.createElement('td'); var sel = document.createElement('select');
      Object.keys(ROLE_LABEL).forEach(function (k) {
        var o = document.createElement('option'); o.value = k; o.textContent = ROLE_LABEL[k]; if (k === u.role) o.selected = true; sel.appendChild(o);
      });
      tdR.appendChild(sel);
      var tdB = document.createElement('td'); var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn small'; btn.textContent = 'Salvar';
      btn.addEventListener('click', async function () {
        if (u.id === me.id && sel.value !== 'admin' && !confirm('Você vai tirar o seu próprio acesso de administrador. Continuar?')) return;
        btn.disabled = true;
        var up = await sb.from('profiles').update({ role: sel.value }).eq('id', u.id);
        btn.disabled = false;
        if (up.error) { setMsg($('adminMsg'), 'Erro ao salvar: ' + up.error.message); return; }
        setMsg($('adminMsg'), 'Acesso de ' + (u.nome || u.email) + ' atualizado.', true);
        if (u.id === me.id) { me.role = sel.value; }
      });
      tdB.appendChild(btn);
      [tdN, tdE, tdR, tdB].forEach(function (td) { tr.appendChild(td); });
      tb.appendChild(tr);
    });
  }

  // =====================================================================
  // Início
  // =====================================================================
  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('loginBtn'); btn.disabled = true; setMsg($('loginMsg'), '');
    var r = await sb.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPass').value });
    btn.disabled = false;
    if (r.error) { setMsg($('loginMsg'), 'E-mail ou senha incorretos.'); return; }
    $('loginPass').value = '';
    enter(r.data.user);
  });

  function showForm(which) {
    $('loginForm').classList.toggle('hidden', which !== 'login');
    $('signupForm').classList.toggle('hidden', which !== 'signup');
    setMsg($('loginMsg'), ''); setMsg($('signupMsg'), '');
  }
  $('goSignup').addEventListener('click', function (e) { e.preventDefault(); showForm('signup'); });
  $('goLogin').addEventListener('click', function (e) { e.preventDefault(); showForm('login'); });

  $('signupForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var nome = $('signupNome').value.trim(), email = $('signupEmail').value.trim();
    var p1 = $('signupPass').value, p2 = $('signupPass2').value, msg = $('signupMsg');
    if (p1.length < 8) { setMsg(msg, 'A senha precisa ter pelo menos 8 caracteres.'); return; }
    if (p1 !== p2) { setMsg(msg, 'As senhas não são iguais.'); return; }
    var btn = $('signupBtn'); btn.disabled = true; setMsg(msg, '');
    var r = await sb.auth.signUp({ email: email, password: p1, options: { data: { nome: nome } } });
    btn.disabled = false;
    if (r.error) {
      var t = String(r.error.message || '');
      if (/already|registered/i.test(t)) setMsg(msg, 'Este e-mail já tem cadastro. Use “Entrar”.');
      else if (/not allowed|disabled/i.test(t)) setMsg(msg, 'O cadastro está fechado. Peça ao administrador.');
      else if (/rate|too many|seconds/i.test(t)) setMsg(msg, 'Muitas tentativas. Aguarde um pouco e tente de novo.');
      else if (/password/i.test(t)) setMsg(msg, 'Senha fraca ou inválida. Use uma senha maior, com letras e números.');
      else setMsg(msg, 'Não foi possível criar a conta. Tente novamente.');
      return;
    }
    $('signupPass').value = ''; $('signupPass2').value = '';
    if (r.data && r.data.session) { enter(r.data.user); return; }
    showForm('login');
    setMsg($('loginMsg'), 'Conta criada. Confirme pelo e-mail que enviamos e depois entre.', true);
  });

  $('btnLogout').addEventListener('click', async function () {
    await sb.auth.signOut(); me = null; show('viewLogin');
  });
  $('btnBack').addEventListener('click', closeModule);
  $('btnBackAdmin').addEventListener('click', showHome);
  $('btnPass').addEventListener('click', async function () {
    var p = prompt('Nova senha (mínimo 8 caracteres):');
    if (p === null) return;
    if (p.length < 8) { setMsg($('homeMsg'), 'A senha precisa ter pelo menos 8 caracteres.'); return; }
    var r = await sb.auth.updateUser({ password: p });
    setMsg($('homeMsg'), r.error ? 'Não foi possível trocar a senha: ' + r.error.message : 'Senha alterada.', !r.error);
  });

  (async function init() {
    if (!configured()) {
      show('viewLogin');
      $('loginForm').querySelector('button').disabled = true;
      setMsg($('loginMsg'), 'Portal ainda não configurado: preencha o config.js com os dados do Supabase.');
      return;
    }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    if (cfg.ALLOW_SIGNUP === false) { document.querySelectorAll('.switch').forEach(function (el) { el.classList.add('hidden'); }); }
    sb.auth.onAuthStateChange(function (ev) {
      if (ev === 'SIGNED_OUT') { me = null; show('viewLogin'); }
    });
    var s = await sb.auth.getSession();
    if (s.data && s.data.session) enter(s.data.session.user); else show('viewLogin');
  })();
})();
