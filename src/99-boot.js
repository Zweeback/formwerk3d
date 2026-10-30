/* ============================================================
   Start
   ============================================================ */
(function boot() {
  V.init($('#vp'));
  P2.init($('#pane2d'), $('#pane-canvas'));
  F.edit.hook(); F.rig.init();
  UI.build(); UI.keys();
  try { new MutationObserver(() => UI.themeChanged()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { }
  try { const mq = window.matchMedia('(prefers-color-scheme: dark)'); const f = () => UI.themeChanged(); mq.addEventListener ? mq.addEventListener('change', f) : mq.addListener(f); } catch (e) { }
  window.addEventListener('beforeunload', () => { try { UI.autosave(); } catch (e) { } });
  S.mode = 'object'; UI.afterMode();
  F.demo(); F.history.clear(); V.frame();
  window.Formwerk3D = F;
  F.say('Bereit. Oben den Modus wählen, links Objekte hinzufügen. Unter „Hilfe“ steht die Kurzanleitung.', '', true);
})();
