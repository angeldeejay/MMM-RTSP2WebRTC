/**
 * Video player for go2rtc streaming application.
 *
 * All modern web technologies are supported in almost any browser except Apple Safari.
 *
 * Support:
 * - RTCPeerConnection for Safari iOS 11.0+
 * - IntersectionObserver for Safari iOS 12.2+
 *
 * Doesn't support:
 * - MediaSource for Safari iOS all
 * - Customized built-in elements (extends HTMLVideoElement) because all Safari
 * - Public class fields because old Safari (before 14.0)
 * - Autoplay for Safari
 */
class VideoRTC extends HTMLElement {
  constructor() {
    super();

    this.DISCONNECT_TIMEOUT = 5000;
    this.RECONNECT_TIMEOUT = 5000;

    this.CODECS = [
      "avc1.640029", // H.264 high 4.1 (Chromecast 1st and 2nd Gen)
      "avc1.64002A", // H.264 high 4.2 (Chromecast 3rd Gen)
      "avc1.640033", // H.264 high 5.1 (Chromecast with Google TV)
      "hvc1.1.6.L153.B0", // H.265 main 5.1 (Chromecast Ultra)
      "mp4a.40.2", // AAC LC
      "mp4a.40.5", // AAC HE
      "opus" // OPUS Chrome
    ];

    /**
     * [config] Supported modes (webrtc, mse, mp4, mjpeg).
     * @type {string}
     */
    this.mode = "webrtc,mse,mp4,mjpeg";

    /**
     * [config] Run stream only when player in the viewport. Stop when user scroll out player.
     * Value is percentage of visibility from `0` (not visible) to `1` (full visible).
     * Default `0` - disable;
     * @type {number}
     */
    this.visibilityThreshold = 0;

    /**
     * [config] Run stream only when browser page on the screen. Stop when user change browser
     * tab or minimise browser windows.
     * @type {boolean}
     */
    this.visibilityCheck = true;

    /**
     * [config] WebRTC configuration
     * @type {RTCConfiguration}
     */
    this.pcConfig = {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      sdpSemantics: "unified-plan" // important for Chromecast 1
    };

    /**
     * [info] WebSocket connection state. Values: CONNECTING, OPEN, CLOSED
     * @type {number}
     */
    this.wsState = WebSocket.CLOSED;

    /**
     * [info] WebRTC connection state.
     * @type {number}
     */
    this.pcState = WebSocket.CLOSED;

    /**
     * @type {HTMLVideoElement}
     */
    this.video = null;

    /**
     * @type {HTMLDivElement}
     */
    this.overlay = null;

    /**
     * @type {WebSocket}
     */
    this.ws = null;

    /**
     * @type {string|URL}
     */
    this.wsURL = "";

    /**
     * @type {RTCPeerConnection}
     */
    this.pc = null;

    /**
     * @type {number}
     */
    this.connectTS = 0;

    /**
     * [internal] Disconnect TimeoutID.
     * @type {number}
     */
    this.disconnectTID = 0;

    /**
     * [internal] Reconnect TimeoutID.
     * @type {number}
     */
    this.reconnectTID = 0;

    /**
     * [internal] Handler for receiving Binary from WebSocket.
     * @type {Function}
     */
    this.ondata = null;

    /**
     * [internal] Handlers list for receiving JSON from WebSocket
     * @type {Object.<string,Function>}}
     */
    this.onmessage = null;
  }

  /**
   * Set video source (WebSocket URL). Support relative path.
   * @param {string|URL} value
   */
  set src(value) {
    if (typeof value !== "string") value = value.toString();
    if (value.startsWith("http")) {
      value = "ws" + value.substring(4);
    } else if (value.startsWith("/")) {
      value = "ws" + location.origin.substring(4) + value;
    }

    this.wsURL = value;

    this.onconnect();
  }

  /**
   * Play video. Support automute when autoplay blocked.
   * https://developer.chrome.com/blog/autoplay/
   */
  play() {
    this.video.play().catch((er) => {
      if (er.name === "NotAllowedError" && !this.video.muted) {
        this.video.muted = true;
        this.video.play().catch(() => void 0);
      }
    });
  }

  /**
   * Send message to server via WebSocket
   * @param {Object} value
   */
  send(value) {
    if (this.ws) this.ws.send(JSON.stringify(value));
  }

  codecs(type) {
    const test =
      type === "mse"
        ? (codec) => MediaSource.isTypeSupported(`video/mp4; codecs="${codec}"`)
        : (codec) => this.video.canPlayType(`video/mp4; codecs="${codec}"`);
    return this.CODECS.filter(test).join();
  }

  /**
   * `CustomElement`. Invoked each time the custom element is appended into a
   * document-connected element.
   */
  connectedCallback() {
    if (this.disconnectTID) {
      clearTimeout(this.disconnectTID);
      this.disconnectTID = 0;
    }

    // because video autopause on disconnected from DOM
    if (this.video && this.overlay) {
      const seek = this.video.seekable;
      if (seek.length > 0) {
        this.video.currentTime = seek.end(seek.length - 1);
      }
      this.play();
    } else {
      if (this.overlay) this.overlay.style.display = "block";
      this.oninit();
    }

    this.onconnect();
  }

  /**
   * `CustomElement`. Invoked each time the custom element is disconnected from the
   * document's DOM.
   */
  disconnectedCallback() {
    if (this.overlay) this.overlay.style.display = "block";
    if (this.disconnectTID) return;
    if (this.wsState === WebSocket.CLOSED && this.pcState === WebSocket.CLOSED)
      return;


    this.disconnectTID = setTimeout(() => {
      if (this.reconnectTID) {
        clearTimeout(this.reconnectTID);
        this.reconnectTID = 0;
      }
      
      this.disconnectTID = 0;
      
      this.ondisconnect();
    }, this.DISCONNECT_TIMEOUT);
  }

  /**
   * Creates child DOM elements. Called automatically once on `connectedCallback`.
   */
  oninit() {
    if (!this.video){
      this.video = document.createElement("video");
      this.video.classList.add("video-stream-player");
      this.video.controls = false;
      this.video.playsInline = true;
      this.video.preload = "auto";
      this.video.crossorigin = true;
      this.video.playsinline = true;
      this.video.autoplay = true;
      this.appendChild(this.video);
    }

    if (!this.overlay) {
      this.overlay = document.createElement("div");
      this.overlay.classList.add("video-stream-overlay");
      this.overlay.style.height = this.offsetHeight + "px";
      this.overlay.style.width = this.offsetWidth + "px";
      this.appendChild(this.overlay);
    }

    if ("hidden" in document && this.visibilityCheck) {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          this.disconnectedCallback();
        } else if (this.isConnected) {
          this.connectedCallback();
        }
      });
    }

    if ("IntersectionObserver" in window && this.visibilityThreshold) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              this.disconnectedCallback();
            } else if (this.isConnected) {
              this.connectedCallback();
            }
          });
        },
        { threshold: this.visibilityThreshold }
      );
      observer.observe(this);
    }
  }

  /**
   * Connect to WebSocket. Called automatically on `connectedCallback`.
   * @return {boolean} true if the connection has started.
   */
  onconnect() {
    if (!this.isConnected || !this.wsURL || this.ws || this.pc) return false;
    this.overlay.style.display = "block";

    // CLOSED or CONNECTING => CONNECTING
    this.wsState = WebSocket.CONNECTING;

    this.connectTS = Date.now();

    try {
      this.ws = new WebSocket(this.wsURL);
      this.ws.binaryType = "arraybuffer";
      this.ws.addEventListener("open", (ev) => this.onopen(ev));
      this.ws.addEventListener("close", (ev) => this.onclose(ev));
      return true;
    } catch (e) {
      this.overlay.style.display = "block";
    }

    this.disconnectedCallback();
    return false;
  }

  ondisconnect() {
    this.wsState = WebSocket.CLOSED;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.pcState = WebSocket.CLOSED;
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    this.overlay.style.display = "block";
  }

  onopen() {
    // CONNECTING => OPEN
    this.wsState = WebSocket.OPEN;

    this.ws.addEventListener("message", (ev) => {
      if (typeof ev.data === "string") {
        const msg = JSON.parse(ev.data);
        for (const mode in this.onmessage) {
          this.onmessage[mode](msg);
        }
      } else {
        this.ondata(ev.data);
      }
    });

    this.ondata = null;
    this.onmessage = {};
    this.onwebrtc();
  }

  /**
   * @return {boolean} true if reconnection has started.
   */
  onclose() {
    if (this.wsState === WebSocket.CLOSED) return false;

    // CONNECTING, OPEN => CONNECTING
    this.wsState = WebSocket.CONNECTING;
    this.ws = null;

    // reconnect no more than once every X seconds
    const delay = Math.max(
      this.RECONNECT_TIMEOUT - (Date.now() - this.connectTS),
      0
    );

    this.reconnectTID = setTimeout(() => {
      this.reconnectTID = 0;
      this.onconnect();
    }, delay);

    return true;
  }

  onwebrtc() {
    const pc = new RTCPeerConnection(this.pcConfig);

    /** @type {HTMLVideoElement} */
    const video2 = document.createElement("video");
    video2.addEventListener("loadeddata", (ev) => {
      this.overlay.style.display = "none";
      this.onpcvideo(ev);
    }, {
      once: true
    });

    pc.addEventListener("icecandidate", (ev) => {
      const candidate = ev.candidate ? ev.candidate.toJSON().candidate : "";
      this.send({ type: "webrtc/candidate", value: candidate });
    });

    pc.addEventListener("track", (ev) => {
      // when stream already init
      if (video2.srcObject !== null) return;

      // when audio track not exist in Chrome
      if (ev.streams.length === 0) return;

      // when audio track not exist in Firefox
      if (ev.streams[0].id[0] === "{") return;

      video2.srcObject = ev.streams[0];
    });

    pc.addEventListener("connectionstatechange", () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        pc.close(); // stop next events

        this.pcState = WebSocket.CLOSED;
        this.pc = null;
        this.overlay.style.display = "block";

        this.onconnect();
      }
    });

    this.onmessage["webrtc"] = (msg) => {
      switch (msg.type) {
        case "webrtc/candidate":
          pc.addIceCandidate({
            candidate: msg.value,
            sdpMid: "0"
          }).catch(() => console.debug);
          break;
        case "webrtc/answer":
          pc.setRemoteDescription({
            type: "answer",
            sdp: msg.value
          }).catch(() => console.debug);
          break;
        case "error":
          this.overlay.style.display = "block";
          if (msg.value.indexOf("webrtc/offer") < 0) return;
          pc.close();
      }
    };

    // Safari doesn't support "offerToReceiveVideo"
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    pc.createOffer().then((offer) => {
      pc.setLocalDescription(offer).then(() => {
        this.send({ type: "webrtc/offer", value: offer.sdp });
      });
    });

    this.pcState = WebSocket.CONNECTING;
    this.pc = pc;
  }

  /**
   * @param ev {Event}
   */
  onpcvideo(ev) {
    if (!this.pc) return;

    /** @type {HTMLVideoElement} */
    const video2 = ev.target;
    const state = this.pc.connectionState;

    // Firefox doesn't support pc.connectionState
    if (state === "connected" || state === "connecting" || !state) {
      // Video+Audio > Video, H265 > H264, Video > Audio, WebRTC > MSE
      this.video.srcObject = video2.srcObject;
      this.play();

      this.pcState = WebSocket.OPEN;

      this.wsState = WebSocket.CLOSED;
      this.ws.close();
      this.ws = null;
    }
    
    video2.srcObject = null;
  }

  static btoa(buffer) {
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    let binary = "";
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}

customElements.define("video-stream", VideoRTC);
