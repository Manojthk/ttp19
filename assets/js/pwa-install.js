(function () {
  'use strict';

  let deferredPrompt = null;

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('PWA Service Worker registered:', reg.scope);
      }).catch((err) => {
        console.warn('PWA Service Worker registration skipped/failed:', err);
      });
    });
  }

  // Listen for native install prompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.documentElement.classList.add('pwa-installable');
    console.log('PWA beforeinstallprompt captured');
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    document.documentElement.classList.add('pwa-installed');
    showInstallToast('The Times Patriot Web App has been successfully installed on your device!');
  });

  // Helper for Toast Notifications
  function showInstallToast(message) {
    let toast = document.getElementById('pwa-install-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'pwa-install-toast';
      toast.className = 'pwa-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 4000);
  }

  // Detect Platform
  function getPlatformInfo() {
    const ua = navigator.userAgent || '';
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    const isMac = /Macintosh|Mac OS X/.test(ua) && !isIOS;
    const isWindows = /Windows/.test(ua);
    const isChrome = /Chrome|CriOS/.test(ua) && !/Edg|OPR/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS/.test(ua);
    const isEdge = /Edg/.test(ua);

    return { isIOS, isAndroid, isMac, isWindows, isChrome, isSafari, isEdge };
  }

  // Create or Show Custom Installation Modal
  function showInstallModal() {
    let modal = document.getElementById('pwa-install-modal');
    const platform = getPlatformInfo();

    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'pwa-install-modal';
      modal.className = 'pwa-modal-backdrop';
      
      modal.innerHTML = `
        <div class="pwa-modal-card">
          <div class="pwa-modal-header">
            <div class="pwa-modal-brand">
              <div class="pwa-brand-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%"><defs><style>.bg-red { fill: #9e1a1b; }.ring { fill: none; stroke: #ffffff; stroke-width: 4; fill: #9e1a1b; }.dashed-box { fill: #000000; stroke: #ffffff; stroke-width: 6; stroke-dasharray: 14, 14; }.yellow-box { fill: #fadd5a; }.text-serif-white { font-family: "Playfair Display", Georgia, serif; font-weight: 900; fill: #ffffff; text-anchor: middle; }.text-serif-black { font-family: "Playfair Display", Georgia, serif; font-weight: 900; fill: #000000; text-anchor: middle; }</style></defs><rect class="bg-red" width="1000" height="1000" /><circle class="ring" cx="500" cy="500" r="485" /><rect class="dashed-box" x="170" y="145" width="660" height="710" /><text class="text-serif-white" x="500" y="325" font-size="160">The</text><rect class="yellow-box" x="240" y="400" width="520" height="390" /><text class="text-serif-black" x="500" y="535" font-size="145">Times</text><text class="text-serif-black" x="500" y="745" font-size="145">Patriot</text></svg>
              </div>
              <div>
                <h3>Install The Times Patriot</h3>
                <p>Web App Edition</p>
              </div>
            </div>
            <button class="pwa-modal-close" id="pwa-modal-close-btn" aria-label="Close dialog">&times;</button>
          </div>

          <div class="pwa-modal-body">
            <p class="pwa-desc">Enjoy full-screen reading, faster load times, and quick access directly from your device home screen or desktop.</p>
            
            <div class="pwa-instructions" id="pwa-instructions-content">
              <!-- Dynamically populated -->
            </div>
          </div>

          <div class="pwa-modal-footer">
            <button class="pwa-btn-secondary" id="pwa-copy-link-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy App Link</span>
            </button>
            <button class="pwa-btn-primary" id="pwa-modal-action-btn">
              <span>Got it</span>
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // Event listeners for modal elements
      document.getElementById('pwa-modal-close-btn').addEventListener('click', hideInstallModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) hideInstallModal();
      });

      document.getElementById('pwa-copy-link-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.origin).then(() => {
          showInstallToast('App link copied to clipboard!');
        }).catch(() => {
          showInstallToast('Link: ' + window.location.origin);
        });
      });

      document.getElementById('pwa-modal-action-btn').addEventListener('click', () => {
        if (deferredPrompt) {
          triggerNativeInstall();
        } else {
          hideInstallModal();
        }
      });
    }

    // Populate instructions based on browser / platform
    const instContainer = document.getElementById('pwa-instructions-content');
    const actionBtn = document.getElementById('pwa-modal-action-btn');

    if (deferredPrompt) {
      if (actionBtn) actionBtn.querySelector('span').textContent = 'Install Now';
      instContainer.innerHTML = `
        <div class="pwa-step">
          <div class="pwa-step-num">1</div>
          <div class="pwa-step-text">Click <strong>"Install Now"</strong> below to launch the automated web app setup prompt.</div>
        </div>
      `;
    } else if (platform.isIOS) {
      if (actionBtn) actionBtn.querySelector('span').textContent = 'Got it';
      instContainer.innerHTML = `
        <div class="pwa-step">
          <div class="pwa-step-num">1</div>
          <div class="pwa-step-text">Tap the <strong>Share</strong> button in Safari toolbar (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="display:inline; vertical-align:middle;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>).</div>
        </div>
        <div class="pwa-step">
          <div class="pwa-step-num">2</div>
          <div class="pwa-step-text">Scroll down the menu options and tap <strong>"Add to Home Screen"</strong>.</div>
        </div>
        <div class="pwa-step">
          <div class="pwa-step-num">3</div>
          <div class="pwa-step-text">Tap <strong>"Add"</strong> at top right to complete installation.</div>
        </div>
      `;
    } else if (platform.isAndroid) {
      if (actionBtn) actionBtn.querySelector('span').textContent = 'Got it';
      instContainer.innerHTML = `
        <div class="pwa-step">
          <div class="pwa-step-num">1</div>
          <div class="pwa-step-text">Tap the menu icon (<strong>⋮</strong>) in top right corner of Chrome.</div>
        </div>
        <div class="pwa-step">
          <div class="pwa-step-num">2</div>
          <div class="pwa-step-text">Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</div>
        </div>
      `;
    } else {
      if (actionBtn) actionBtn.querySelector('span').textContent = 'Got it';
      instContainer.innerHTML = `
        <div class="pwa-step">
          <div class="pwa-step-num">1</div>
          <div class="pwa-step-text">Look for the <strong>Install</strong> icon (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="display:inline; vertical-align:middle;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>) in your browser address bar.</div>
        </div>
        <div class="pwa-step">
          <div class="pwa-step-num">2</div>
          <div class="pwa-step-text">Click <strong>Install</strong> to add <em>The Times Patriot</em> to your apps menu or taskbar.</div>
        </div>
      `;
    }

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function hideInstallModal() {
    const modal = document.getElementById('pwa-install-modal');
    if (modal) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  // Trigger native install prompt or modal
  function triggerInstallFlow(e) {
    if (e) e.preventDefault();

    if (deferredPrompt) {
      triggerNativeInstall();
    } else {
      showInstallModal();
    }
  }

  function triggerNativeInstall() {
    if (!deferredPrompt) {
      showInstallModal();
      return;
    }

    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted install prompt');
        showInstallToast('Installing web application...');
      } else {
        console.log('User dismissed install prompt');
      }
      deferredPrompt = null;
      hideInstallModal();
    }).catch((err) => {
      console.warn('Install prompt error:', err);
      showInstallModal();
    });
  }

  // Attach event delegation for all install buttons
  document.addEventListener('click', (e) => {
    const installBtn = e.target.closest('#masthead-install-btn, #more-dropdown-install-btn, #drawer-install-btn, #footer-install-btn, [data-testid="pwa-install-btn-header"], [data-testid="pwa-install-btn-sidebar"], [data-testid="pwa-install-btn-footer"], [data-testid="more-dropdown-install-btn"], .pwa-install-btn');
    
    if (installBtn) {
      triggerInstallFlow(e);
    }
  });

  window.triggerPwaInstall = triggerInstallFlow;
})();
