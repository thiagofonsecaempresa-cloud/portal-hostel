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
})();
