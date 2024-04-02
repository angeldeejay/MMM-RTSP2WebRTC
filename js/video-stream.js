class VideoStream extends VideoRTC {
  constructor() {
    super();

    this.DISCONNECT_TIMEOUT = 5000;
    this.RECONNECT_TIMEOUT = 10000;

    this.background = true;
    this.visibilityCheck = false;
  }

  set overlay(value) {
    let overlay = this.querySelector(".overlay");
    if (!overlay) overlay = this.createOverlay();
    if (value === true) {
      overlay.style.opacity = 1;
    } else {
      overlay.style.opacity = 0;
    }
  }

  createOverlay() {
    if (!this.querySelector(".overlay"))
      this.innerHTML = '<div class="overlay"></div>';
    return this.querySelector(".overlay");
  }

  /**
   * Custom GUI
   */
  oninit() {
    Log.debug(this.constructor.name, "stream.oninit", this);
    this.overlay = true;
    super.oninit();
    this.video.controls = false;
  }

  onconnect() {
    Log.debug(this.constructor.name, "stream.onconnect", this);
    const result = super.onconnect();
    if (result) {
      Log.debug(this.constructor.name, "loading", this);
      this.overlay = true;
    }
    return result;
  }

  ondisconnect() {
    Log.debug(this.constructor.name, "stream.ondisconnect", this);
    this.overlay = true;
    super.ondisconnect();
  }

  onopen() {
    Log.debug(this.constructor.name, "stream.onopen", this);
    this.overlay = true;
    const result = super.onopen();

    this.onmessage["stream"] = (msg) => {
      Log.debug(this.constructor.name, "stream.onmessge", msg, this);
      switch (msg.type) {
        case "error":
          Log.warn(msg.value, this);
          break;
        case "mse":
        case "hls":
        case "mp4":
        case "mjpeg":
          Log.debug(this.constructor.name, msg.type.toUpperCase(), this);
          break;
      }
    };

    return result;
  }

  onclose() {
    Log.debug(this.constructor.name, "stream.onclose", this);
    return super.onclose();
  }

  onpcvideo(ev) {
    Log.debug(this.constructor.name, "stream.onpcvideo", this);
    super.onpcvideo(ev);

    if (this.pcState !== WebSocket.CLOSED) {
      Log.debug(this.constructor.name, "RTC", this);
      this.overlay = false;
    }
  }
}

customElements.define("video-stream", VideoStream);
