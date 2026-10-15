(() => {
  const CM = (window.ChefMate = window.ChefMate || {});
  CM.enabled = false;

  CM.executeCommand = async command => {
    if (!command || !command.intent) {
      return { success: false, action: "UNKNOWN", message: "Command was empty or unrecognized." };
    }

    if (command.intent === 'DISABLE_CHEFMATE') {
      CM.setEnabled(false);
      return { success: true, action: command.intent, message: 'ChefMate turned off.' };
    }

    if (command.intent === 'ENABLE_CHEFMATE') {
      CM.setEnabled(true);
      return { success: true, action: command.intent, message: 'ChefMate activated.' };
    }

    return CM.commandExecutor.execute(command);
  };

  CM.setEnabled = enabled => {
    if (enabled === CM.enabled) return;
    CM.enabled = enabled;
    CM.ui?.refresh(enabled);
    if (enabled) {
      CM.voice?.start();
    } else {
      CM.voice?.stop();
    }
  };

  let lastUrl = location.href;
  let lastVideoId = CM.youtubeController?.getVideoId() || "";

  const ensure = () => {
    CM.ui?.mount();
    CM.ui?.insert();
  };

  const handleNavigation = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;

    const currentVideoId = CM.youtubeController?.getVideoId() || "";
    if (currentVideoId && currentVideoId !== lastVideoId) {
      console.debug('[CHEFMATE FLOW] New video detected:', currentVideoId, '(was:', lastVideoId, ')');
      lastVideoId = currentVideoId;

      // Cancel pending speech and reset cooking assistant state
      CM.voice?.stopSpeaking();
      CM.assistant?.reset(currentVideoId);
      CM.ui?.resetRecipe();
    }

    ensure();
    CM.ui?.updateDebug();
  };

  new MutationObserver(ensure).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener('yt-navigate-finish', handleNavigation);
  setInterval(handleNavigation, 500);

  ensure();
})();
