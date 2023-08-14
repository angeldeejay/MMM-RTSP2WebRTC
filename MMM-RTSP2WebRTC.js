/* eslint-disable no-empty */
/* eslint-disable no-undef */
/* global Module */
/* Magic Mirror
 * Module: MMM-RTSP2WebRTC
 *
 * By Andrés Vanegas <ukab72106@gmail.com>
 * MIT Licensed.
 */
Module.register("MMM-RTSP2WebRTC", {
  /**
   * @member {Object} defaults - Defines the default config values.
   * @property {boolean} controls If video player should show its controls. Defaults to false.
   * @property {int} height video player height. Defaults to 350.
   * @property {int} width video player width. Defaults to 700.
   * @property {int} animationSpeed Animation speed to update DOM. Defaults to 400.
   * @property {str[]} sources sources list (rtsp urls to proxy. e.g rtsp://x.x.x.x:8554/live).
   */
  defaults: {
    controls: false,
    height: 350,
    width: 700,
    animationSpeed: 0,
    liveTolerance: 3,
    host: "localhost",
    port: 5000,
    sources: []
  },
  name: "MMM-RTSP2WebRTC",
  logPrefix: "MMM-RTSP2WebRTC :: ",

  // Placeholders
  wrapper: null,
  sources: {},
  configValid: false,
  sourcesOrder: {},

  // Overrides start method
  start() {
    this.config = {
      ...this.defaults,
      ...this.config
    };

    this.sourcesOrder = {};
    this.sources = {};
    this.configValid =
      Object.prototype.hasOwnProperty.call(this.config, "sources") &&
      Array.isArray(this.config.sources) &&
      Object.prototype.hasOwnProperty.call(this.config, "host") &&
      typeof this.config.host === "string" &&
      this.config.host.trim().length > 0 &&
      Object.prototype.hasOwnProperty.call(this.config, "port") &&
      typeof this.config.port === "number" &&
      this.config.port > 0;

    if (!this.configValid) {
      this.warning(`Invalid config:`, this.config);
      throw new Error(`Invalid config`);
    }

    this.getWrapper();

    // Set unique values
    this.config.sources = this.config.sources
      .map((s, i) => {
        return {
          name:
            typeof s === "string"
              ? `${this.translate("VIDEO")} ${i + 1}`
              : s.name ?? `${this.translate("VIDEO")} ${i + 1}`,
          key: typeof s === "string" ? s : s.key ?? null
        };
      })
      .filter((s) => {
        const valid =
          Object.prototype.hasOwnProperty.call(s, "key") &&
          s.key !== null &&
          `${s.key}`.trim().length !== 0;
        if (!valid)
          this.warning(`Discarding invalid key: ${JSON.stringify(s, null, 2)}`);
        return valid;
      })
      .filter((s, i, self) => self.indexOf(s) === i)
      .map((s, i) => {
        return { id: i, ...s };
      });

    this.sources = this.config.sources.reduce((acc, { id, name, key }) => {
      const endpoint = `ws://${this.config.host}:${this.config.port}/live/webrtc/api/ws?src=${key}`;
      acc[key] = {
        id,
        key,
        name,
        endpoint,
        intervalId: null,
        player: null,
        videoEl: this.getVideoElement(key),
        messageEl: this.getMessageElement(key)
      };
      return acc;
    }, {});
    this.sourcesOrder = Object.fromEntries(
      Object.entries(this.sources)
        .sort((a, b) => a[1].id - b[1].id)
        .map(([k, s]) => [k, s.id])
    );

    this.generateUi();
    for (const key of Object.keys(this.sources)) {
      this.showPlayer(key);
    }
    this.log("Started");
  },

  // Logging wrapper
  log(msg, ...args) {
    Log.log(`${this.logPrefix}${msg}`, ...args);
  },
  info(msg, ...args) {
    Log.info(`${this.logPrefix}${msg}`, ...args);
  },
  debug(msg, ...args) {
    Log.debug(`${this.logPrefix}${msg}`, ...args);
  },
  error(msg, ...args) {
    Log.error(`${this.logPrefix}${msg}`, ...args);
  },
  warning(msg, ...args) {
    Log.warn(`${this.logPrefix}${msg}`, ...args);
  },

  destroyAllPlayers() {
    Object.keys(this.sources).forEach((key) => this.destroyPlayer(key));
  },

  getMessageElement(key) {
    const messageWrapper = document.createElement("div");
    messageWrapper.classList.add(
      "message-container",
      `message-container-${this.name}`,
      `message-container-${key}`
    );
    messageWrapper.style.width = `${this.config.width}px`;
    messageWrapper.style.height = `${this.config.height}px`;
    return messageWrapper;
  },

  getVideoElement(key) {
    const videoWrapper = document.createElement("video-stream");
    videoWrapper.classList.add(
      "player",
      `player-${this.name}`,
      `player-${key}`
    );
    videoWrapper.mode = "webrtc";
    videoWrapper.style.width = `${this.config.width}px`;
    videoWrapper.style.height = `${this.config.height}px`;

    return videoWrapper;
  },

  destroySource(key) {
    this.hideMessage(key);
    this.destroyPlayer(key);
    if (this.wrapper.contains(this.sources[key].messageEl)) {
      this.wrapper.removeChild(this.sources[key].messageEl);
    }
    delete this.sources[s];
  },

  hideMessage(key) {
    this.wrapper
      .querySelectorAll(`.message-container-${key}`)
      .forEach((messageEl) => this.wrapper.removeChild(messageEl));
    if (Object.keys(this.sources).includes(key)) {
      this.sources[key].messageEl.innerHTML = "";
      this.sources[key].messageEl = this.getMessageElement(key);
    }
  },

  showMessage(el, message, key = null) {
    const i18nMessage = this.translate(message);
    el.innerHTML = "";
    const icon = document.createElement("span");
    icon.classList.add("icon", "fas", "fa-fw");
    if (message === "LOADING_VIDEO") {
      icon.classList.add("fa-video");
    }
    if (message === "NO SOURCES") {
      icon.classList.add("fa-video-slash");
    }

    el.appendChild(icon);
    const messageSpan = document.createElement("span");
    messageSpan.classList.add("message");
    messageSpan.innerHTML = i18nMessage;
    el.appendChild(messageSpan);
    if (key !== null) {
      const nameSpan = document.createElement("span");
      nameSpan.classList.add("name");
      nameSpan.innerHTML = this.sources[key].name;
      el.appendChild(nameSpan);

      const shownVideo = this.wrapper.querySelector(`.player-${key}`);
      // Keep the placement of the message equals to config
      if (shownVideo !== null) {
        this.wrapper.insertBefore(el, shownVideo.nextSibling);
      } else {
        let inserted = false;
        for (const i in this.wrapper.children) {
          if (i === this.sources[key].id) {
            this.wrapper.insertBefore(el, this.wrapper.children[i]);
            inserted = true;
            break;
          }
        }
        if (!inserted) this.wrapper.appendChild(el);
      }
    } else {
      this.wrapper.appendChild(el);
    }
  },

  showMessages(message) {
    this.destroyAllPlayers();
    this.wrapper.innerHTML = "";
    // Show messages
    switch (message) {
      case "NO_SOURCES":
        const i18nMessage = this.translate(message);
        const messageWrapper = this.getMessageElement("none");
        const messageSpan = document.createElement("span");
        messageSpan.classList.add("message");
        messageSpan.innerHTML = i18nMessage;
        messageWrapper.appendChild(messageSpan);
        this.wrapper.appendChild(messageWrapper);
        break;
      case "LOADING_VIDEO":
        Object.keys(this.sources).forEach((key) =>
          this.showMessage(this.sources[key].messageEl, message, key)
        );
        break;
      default:
    }
  },

  destroyPlayer(key) {
    if (this.sources[key].player !== null) {
      this.sources[key].player.errorDisplay.close();
      if (this.sources[key].intervalId !== null) {
        this.sources[key].player.clearInterval(this.sources[key].intervalId);
        this.sources[key].intervalId = null;
      }
      this.sources[key].player.dispose();
      this.sources[key].player = null;
    }
    this.wrapper
      .querySelectorAll(`.player-${key}`)
      .forEach((videoEl) => this.wrapper.removeChild(videoEl));
    this.sources[key].videoEl = this.getVideoElement(key);
  },

  resetPlayer(key) {
    this.showMessage(this.sources[key].messageEl, "LOADING_VIDEO", key);
    this.destroyPlayer(key);
  },

  showPlayer(key) {
    if (
      this.sources[key].videoEl !== null &&
      this.sources[key].videoEl.offsetParent !== null
    )
      return;
    this.info(
      `Creating player: ${this.sources[key].name} → ${this.sources[key].endpoint}`
    );
    const shownMessage = this.wrapper.querySelector(
      `.message-container-${key}`
    );
    this.sources[key].videoEl.src = this.sources[key].endpoint;
    // Keep the placement of the player equals to config
    if (shownMessage !== null) {
      this.wrapper.insertBefore(
        this.sources[key].videoEl,
        shownMessage.nextSibling
      );
    } else {
      let inserted = false;
      for (const i in this.wrapper.children) {
        if (i === this.sources[key].id) {
          this.wrapper.insertBefore(
            this.sources[key].videoEl,
            this.wrapper.children[i]
          );
          inserted = true;
          break;
        }
      }
      if (!inserted) this.wrapper.appendChild(this.sources[key].videoEl);
    }
    this.hideMessage(key);
  },

  getWrapper() {
    if (this.wrapper === null) {
      this.wrapper = document.createElement("div");
      this.wrapper.classList.add("wrapper");
    }
  },

  refresh: function () {
    window.location.reload(true);
  },

  generateUi: function () {
    const sourcesCount = Object.keys(this.sources).length;
    if (sourcesCount === 0) {
      this.showMessages(sourcesCount === 0 ? "NO_SOURCES" : "LOADING_VIDEO");
      return;
    }

    setTimeout(() => this.generateUi(), 1000);
  },

  // Override function to retrieve DOM elements
  getDom() {
    return this.wrapper;
  },

  // Load scripts
  getScripts() {
    return [this.file("js/video-rtc.js")];
  },

  // Load stylesheets
  getStyles() {
    return [
      this.file("node_modules/@fortawesome/fontawesome-free/css/all.min.css"),
      this.file(`${this.name}.css`)
    ];
  },

  // Load translations files
  getTranslations() {
    return {
      en: "translations/en.json",
      es: "translations/es.json"
    };
  }
});
