/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var LockScreen = {
  /*
  * Boolean return the status of the lock screen.
  * Must not multate directly - use unlock()/lockIfEnabled()
  * Listen to 'lock' and 'unlock' event to properly handle status changes
  */
  locked: true,

  /*
  * Boolean return whether if the lock screen is enabled or not.
  * Must not multate directly - use setEnabled(val)
  * Only Settings Listener should change this value to sync with data
  * in Settings API.
  */
  enabled: true,

  /*
  * Boolean returns wether we want a sound effect when unlocking.
  */
  unlockSoundEnabled: true,

  /*
  * Boolean return whether if the lock screen is enabled or not.
  * Must not multate directly - use setPassCodeEnabled(val)
  * Only Settings Listener should change this value to sync with data
  * in Settings API.
  * Will be ignored if 'enabled' is set to false.
  */
  passCodeEnabled: false,

  /*
  * Four digit Passcode
  * XXX: should come for Settings
  */
  passCode: '0000',

  /*
  * The time to request for passcode input since device is off.
  */
  passCodeRequestTimeout: 0,

  /*
  * Store the first time the screen went off since unlocking.
  */
  _screenOffTime: 0,

  /*
  * Check the timeout of passcode lock
  */
  _passCodeTimeoutCheck: false,

  /*
  * Current passcode entered by the user
  */
  passCodeEntered: '',

  /*
  * Timeout after incorrect attempt
  */
  kPassCodeErrorTimeout: 500,

  /*
  * Airplane mode
  */
  airplaneMode: false,

  /* init */
  init: function ls_init() {
    this.getAllElements();

    /* Gesture */
    this.area.addEventListener('mousedown', this);
    this.areaHandle.addEventListener('mousedown', this);
    this.areaCamera.addEventListener('mousedown', this);
    this.areaUnlock.addEventListener('mousedown', this);

    /* Unlock & camera panel clean up */
    this.overlay.addEventListener('transitionend', this);
  },

  /*
  * Set enabled state.
  * If enabled state is somehow updated when the lock screen is enabled
  * This function will unlock it.
  */
  setEnabled: function ls_setEnabled(val) {
  },

  setPassCodeEnabled: function ls_setPassCodeEnabled(val) {
  },

  setUnlockSoundEnabled: function ls_setUnlockSoundEnabled(val) {
  },

  handleEvent: function ls_handleEvent(evt) {
    switch (evt.type) {
      case 'screenchange':
        // XXX: If the screen is not turned off by ScreenManager
        // we would need to lock the screen again
        // when it's being turned back on
        if (!evt.detail.screenEnabled) {
          // Don't update the time after we're already locked otherwise turning
          // the screen off again will bypass the passcode before the timeout.
          if (!this.locked) {
            this._screenOffTime = new Date().getTime();
          }
        } else {
          var _screenOffInterval = new Date().getTime() - this._screenOffTime;
          if (_screenOffInterval > this.passCodeRequestTimeout * 1000) {
            this._passCodeTimeoutCheck = true;
          } else {
            this._passCodeTimeoutCheck = false;
          }
        }

        this.lockIfEnabled(true);
        break;
      case 'voicechange':
      case 'cardstatechange':
        this.updateConnState();

      case 'click':
        if (!evt.target.dataset.key)
          break;

        // Cancel the default action of <a>
        evt.preventDefault();
        this.handlePassCodeInput(evt.target.dataset.key);
        break;

      case 'mousedown':
        var leftTarget = this.areaCamera;
        var rightTarget = this.areaUnlock;
        var handle = this.areaHandle;
        var overlay = this.overlay;
        var target = evt.target;

        this._touch = {
          target: null,
          touched: false,
          leftTarget: leftTarget,
          rightTarget: rightTarget,
          overlayWidth: this.overlay.offsetWidth,
          handleWidth: this.areaHandle.offsetWidth,
          maxHandleOffset: rightTarget.offsetLeft - handle.offsetLeft -
            (handle.offsetWidth - rightTarget.offsetWidth) / 2
        };
        window.addEventListener('mouseup', this);
        window.addEventListener('mousemove', this);

        switch (target) {
          case this.area:
          case this.areaHandle:
            this._touch.touched = true;
            this._touch.initX = evt.pageX;
            this._touch.initY = evt.pageY;

            overlay.classList.add('touched');
            break;

          case this.accessibilityUnlock:
            overlay.classList.add('touched');
            this.areaUnlock.classList.add('triggered');
            this.areaHandle.classList.add('triggered');
            this._touch.target = this.areaUnlock;
            this.handleGesture();
            break;

          case this.accessibilityCamera:
            overlay.classList.add('touched');
            this.areaUnlock.classList.add('triggered');
            this.areaHandle.classList.add('triggered');
            this._touch.target = this.areaCamera;
            this.handleGesture();
            break;
        }
        break;

      case 'mousemove':
        this.handleMove(evt.pageX, evt.pageY);
        break;

      case 'mouseup':
        var handle = this.areaHandle;
        window.removeEventListener('mousemove', this);
        window.removeEventListener('mouseup', this);

        this.handleMove(evt.pageX, evt.pageY);
        this.handleGesture();
        delete this._touch;
        this.overlay.classList.remove('touched');

        break;

      case 'transitionend':
        if (evt.target !== this.overlay)
          return;

        if (this.overlay.dataset.panel !== 'camera' &&
            this.camera.firstElementChild) {
          this.camera.removeChild(this.camera.firstElementChild);
        }

        if (!this.locked)
          this.switchPanel();
        break;

      case 'home':
        if (this.locked) {
          this.switchPanel();
          evt.stopImmediatePropagation();
        }
        break;

      case 'holdhome':
        if (!this.locked)
          return;

        evt.stopImmediatePropagation();
        evt.stopPropagation();
        break;
    }
  },

  handleMove: function ls_handleMove(pageX, pageY) {
    var touch = this._touch;

    if (!touch.touched) {
      // Do nothing if the user have not move the finger to the handle yet
      if (document.elementFromPoint(pageX, pageY) !== this.areaHandle)
        return;

      touch.touched = true;
      touch.initX = pageX;
      touch.initY = pageY;

      var overlay = this.overlay;
      overlay.classList.add('touched');
    }

    var dy = pageY - touch.initY;

    //FIXME
    var handleMax = 480 / 4;
    var y = Math.max(- handleMax, dy);
    this.areaHandle.style.transform =
      'translateY(' + y + 'px)';

    var opacity = - y / handleMax
    var c = 150 - opacity * 100
    this.areaCamera.style.opacity = opacity;
    this.areaUnlock.style.opacity = opacity;
    this.areaCamera.style.transform =
      'translateY(' + y / 2 + 'px';
    this.areaUnlock.style.transform =
      'translateY(' + y / 2 + 'px';

    this.curvepath.setAttribute('d', 'M0,100 C100,' + c  + ' 220,' + c  + ' 320,100');
  },

  handleGesture: function ls_handleGesture() {
    var touch = this._touch;
    var target = touch.target;

    if (!target) {
      this.unloadPanel();
      return;
    }


    var self = this;
    switch (target) {
      case this.areaCamera:
        this.setRailWidth(0, railLength);

        var panelOrFullApp = function panelOrFullApp() {
          if (self.passCodeEnabled) {
            // Go to secure camera panel
            self.switchPanel('camera');
            return;
          }

          self.unlock();

          var a = new MozActivity({
            name: 'record',
            data: {
              type: 'photos'
            }
          });
          a.onerror = function ls_activityError() {
            console.log('MozActivity: camera launch error.');
          }
        };


        if (this.areaHandle.style.transform == transformDistance) {
          panelOrFullApp();
          break;
        }
        this.areaHandle.style.transform = transformDistance;

        this.areaHandle.addEventListener('transitionend', function goCamera() {
          self.areaHandle.removeEventListener('transitionend', goCamera);
          panelOrFullApp();
        });
        break;

      case this.areaUnlock:
        this.setRailWidth(railLength, 0);

        var passcodeOrUnlock = function passcodeOrUnlock() {
          if (!self.passCodeEnabled || !self._passCodeTimeoutCheck) {
            self.unlock();
          } else {
            self.switchPanel('passcode');
          }
        };

        if (this.areaHandle.style.transform == transformDistance) {
          passcodeOrUnlock();
          break;
        }
        this.areaHandle.style.transform = transformDistance;

        this.areaHandle.addEventListener('transitionend', function goUnlock() {
          self.areaHandle.removeEventListener('transitionend', goUnlock);
          passcodeOrUnlock();
        });
        break;
    }
  },

  handlePassCodeInput: function ls_handlePassCodeInput(key) {
  },

  lockIfEnabled: function ls_lockIfEnabled(instant) {
  },

  unlock: function ls_unlock(instant) {
  },

  lock: function ls_lock(instant) {
  },

  loadPanel: function ls_loadPanel(panel, callback) {
    switch (panel) {
      case 'passcode':
      case 'main':
        if (callback)
          callback();
        break;

      case 'emergency-call':
        // create the <iframe> and load the emergency call
        var frame = document.createElement('iframe');

        frame.src = './emergency-call/index.html';
        frame.onload = function emergencyCallLoaded() {
          if (callback)
            callback();
        };
        this.panelEmergencyCall.appendChild(frame);

        break;

      case 'camera':
        // create the <iframe> and load the camera
        var frame = document.createElement('iframe');

        frame.src = './camera/index.html';
        var mainScreen = this.mainScreen;
        frame.onload = function cameraLoaded() {
          mainScreen.classList.add('lockscreen-camera');
        };
        this.overlay.classList.remove('no-transition');
        this.camera.appendChild(frame);

        if (callback)
          callback();
        break;
    }
  },

  unloadPanel: function ls_unloadPanel(panel, toPanel, callback) {
    switch (panel) {
      case 'passcode':
        // Reset passcode panel only if the status is not error
        if (this.overlay.dataset.passcodeStatus == 'error')
          break;

        delete this.overlay.dataset.passcodeStatus;
        this.passCodeEntered = '';
        this.updatePassCodeUI();
        break;

      case 'camera':
        this.mainScreen.classList.remove('lockscreen-camera');
        break;

      case 'emergency-call':
        var ecPanel = this.panelEmergencyCall;
        ecPanel.addEventListener('transitionend', function unloadPanel() {
          ecPanel.removeEventListener('transitionend', unloadPanel);
          ecPanel.removeChild(ecPanel.firstElementChild);
        });
        break;

      case 'main':
      default:
        var self = this;
        var unload = function unload() {
          var animate = document.querySelector('#animate-start');
          animate.beginElement();
          self.curvepath.addEventListener('endEvent', function eventend() {
            self.curvepath.removeEventListener('endEvent', eventend);
            self.curvepath.setAttribute('d', 'M0,100 C100,150 220,150 320,100');
          });

          self.areaHandle.style.transform =
            self.areaUnlock.style.transform =
            self.areaCamera.style.transform =
            self.areaUnlock.style.opacity =
            self.areaCamera.style.opacity = '';
          self.overlay.classList.remove('triggered');
          self.areaHandle.classList.remove('triggered');
          self.areaCamera.classList.remove('triggered');
          self.areaUnlock.classList.remove('triggered');
        };

        if (toPanel !== 'camera') {
          unload();
          break;
        }

        this.overlay.addEventListener('transitionend',
          function ls_unloadDefaultPanel(evt) {
            if (evt.target !== this)
              return;

            self.overlay.removeEventListener('transitionend',
                                             ls_unloadDefaultPanel);
            unload();
          }
        );

        break;
    }

    if (callback)
      callback();
  },

  switchPanel: function ls_switchPanel(panel) {
    var overlay = this.overlay;
    var self = this;
    panel = panel || 'main';

    this.loadPanel(panel, function panelLoaded() {
      self.unloadPanel(overlay.dataset.panel, panel,
        function panelUnloaded() {
          if (overlay.dataset.panel !== panel)
            self.dispatchEvent('lockpanelchange');

          overlay.dataset.panel = panel;
        });
    });
  },

  updateTime: function ls_updateTime() {
  },

  updateConnState: function ls_updateConnState() {
  },

  updatePassCodeUI: function lockscreen_updatePassCodeUI() {
  },

  checkPassCode: function lockscreen_checkPassCode() {
  },

  updateBackground: function ls_updateBackground(value) {
  },

  getAllElements: function ls_getAllElements() {
    // ID of elements to create references
    var elements = ['connstate', 'mute', 'clock', 'date',
        'area', 'area-unlock', 'area-camera',
        'area-handle', 'passcode-code', 'curvepath',
        'passcode-pad', 'camera', 'accessibility-camera',
        'accessibility-unlock', 'panel-emergency-call'];

    var toCamelCase = function toCamelCase(str) {
      return str.replace(/\-(.)/g, function replacer(str, p1) {
        return p1.toUpperCase();
      });
    }

    elements.forEach((function createElementRef(name) {
      this[toCamelCase(name)] = document.getElementById('lockscreen-' + name);
    }).bind(this));

    this.overlay = document.getElementById('lockscreen');
    this.mainScreen = document.getElementById('screen');
  },

  dispatchEvent: function ls_dispatchEvent(name) {
  },

  writeSetting: function ls_writeSetting(value) {
  }
};

LockScreen.init();
