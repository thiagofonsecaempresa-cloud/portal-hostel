/* Troca o localStorage dos apps pelo armazenamento na nuvem do portal.
   Este arquivo é carregado primeiro dentro de cada módulo (iframe). */
(function () {
  var store = null;
  try { store = window.parent !== window ? window.parent.PORTAL_STORE : null; } catch (e) {}

  if (!store) {
    // Aberto fora do portal: volta para o login.
    window.location.replace('../../index.html');
    throw new Error('Abra este módulo pelo portal.');
  }

  var fake = {
    getItem: function (k) { return store.get(String(k)); },
    setItem: function (k, v) { store.set(String(k), String(v)); },
    removeItem: function (k) { store.remove(String(k)); },
    clear: function () { store.clear(); },
    key: function (i) { var ks = store.keys(); return i >= 0 && i < ks.length ? ks[i] : null; }
  };
  Object.defineProperty(fake, 'length', { get: function () { return store.keys().length; } });
  Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return fake; } });

  // Importar backup e "apagar tudo" só aparecem para o admin, enquanto ALLOW_IMPORT estiver ligado
  // no config.js. (Esconder o botão evita acidentes; os dados continuam seguros pelo banco.)
  var flags = {};
  try { flags = window.parent.PORTAL_FLAGS || {}; } catch (e) {}
  if (!flags.canImport) {
    var mod = (location.pathname.match(/\/modules\/([^\/]+)\//) || [])[1];
    var RULES = {
      rotatividade: [{ sel: '#importBtn' }],
      lsr:          [{ sel: 'button[onclick*="importFile"]' }, { sel: 'button[onclick*="resetData"]' }],
      hostel:       [{ sel: '#importFile', up: '.report-box' }, { sel: '#clearData', up: '.report-box' }],
      gestao:       [{ sel: '#importBtn' }, { sel: '#resetBtn' }]
    }[mod] || [];
    var hide = function () {
      RULES.forEach(function (r) {
        document.querySelectorAll(r.sel).forEach(function (el) {
          var t = r.up ? el.closest(r.up) : el;
          if (t) t.style.setProperty('display', 'none', 'important');
        });
      });
    };
    document.addEventListener('DOMContentLoaded', hide);
    window.addEventListener('load', hide);
  }
  // Barra única: o portal já mostra logo + nome da página, então o cabeçalho próprio
  // dos módulos some na tela (a impressão continua igual).
  (function () {
    var m = (location.pathname.match(/\/modules\/([^\/]+)\//) || [])[1];
    if (['rotatividade', 'lsr', 'gestao'].indexOf(m) < 0) return;
    var s = document.createElement('style');
    s.textContent = '@media screen{body>header{display:none!important}}';
    (document.head || document.documentElement).appendChild(s);
  })();
})();
