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
    super(),
      (this.DISCONNECT_TIMEOUT = 5e3),
      (this.RECONNECT_TIMEOUT = 1e3),
      (this.CODECS = [
        "avc1.640029",
        "avc1.64002A",
        "avc1.640033",
        "hvc1.1.6.L153.B0",
        "mp4a.40.2",
        "mp4a.40.5",
        "opus"
      ]),
      (this.mode = "webrtc,mse,mp4,mjpeg"),
      (this.background = !1),
      (this.visibilityThreshold = 0),
      (this.visibilityCheck = !0),
      (this.pcConfig = {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        sdpSemantics: "unified-plan"
      }),
      (this.wsState = WebSocket.CLOSED),
      (this.pcState = WebSocket.CLOSED),
      (this.video = null),
      (this.ws = null),
      (this.wsURL = ""),
      (this.pc = null),
      (this.connectTS = 0),
      (this.mseCodecs = ""),
      (this.disconnectTID = 0),
      (this.reconnectTID = 0),
      (this.ondata = null),
      (this.onmessage = null);
  }
  set src(e) {
    "string" != typeof e && (e = e.toString()),
      e.startsWith("http")
        ? (e = "ws" + e.substring(4))
        : e.startsWith("/") && (e = "ws" + location.origin.substring(4) + e),
      (this.wsURL = e),
      this.onconnect();
  }
  play() {
    this.video.play().catch((e) => {
      "NotAllowedError" !== e.name ||
        this.video.muted ||
        ((this.video.muted = !0), this.video.play().catch(() => console.debug));
    });
  }
  send(e) {
    this.ws && this.ws.send(JSON.stringify(e));
  }
  codecs(e) {
    return this.CODECS.filter(
      "mse" === e
        ? (e) => MediaSource.isTypeSupported(`video/mp4; codecs="${e}"`)
        : (e) => this.video.canPlayType(`video/mp4; codecs="${e}"`)
    ).join();
  }
  connectedCallback() {
    if (
      (this.disconnectTID &&
        (clearTimeout(this.disconnectTID), (this.disconnectTID = 0)),
      this.video)
    ) {
      let e = this.video.seekable;
      e.length > 0 && (this.video.currentTime = e.end(e.length - 1)),
        this.play();
    } else this.oninit();
    this.onconnect();
  }
  disconnectedCallback() {
    !this.background &&
      !this.disconnectTID &&
      (this.wsState !== WebSocket.CLOSED ||
        this.pcState !== WebSocket.CLOSED) &&
      (this.disconnectTID = setTimeout(() => {
        this.reconnectTID &&
          (clearTimeout(this.reconnectTID), (this.reconnectTID = 0)),
          (this.disconnectTID = 0),
          this.ondisconnect();
      }, this.DISCONNECT_TIMEOUT));
  }
  oninit() {
    if (
      ((this.video = document.createElement("video")),
      (this.video.controls = !1),
      (this.video.playsInline = !0),
      (this.video.preload = "auto"),
      (this.video.crossorigin = !0),
      (this.video.playsinline = !0),
      (this.video.autoplay = !0),
      (this.video.style.display = "block"),
      (this.video.style.width = "100%"),
      (this.video.style.height = "100%"),
      this.appendChild(this.video),
      !this.background &&
        ("hidden" in document &&
          this.visibilityCheck &&
          document.addEventListener("visibilitychange", () => {
            document.hidden
              ? this.disconnectedCallback()
              : this.isConnected && this.connectedCallback();
          }),
        "IntersectionObserver" in window && this.visibilityThreshold))
    ) {
      let e = new IntersectionObserver(
        (e) => {
          e.forEach((e) => {
            e.isIntersecting
              ? this.isConnected && this.connectedCallback()
              : this.disconnectedCallback();
          });
        },
        { threshold: this.visibilityThreshold }
      );
      e.observe(this);
    }
  }
  onconnect() {
    if (!this.isConnected || !this.wsURL || this.ws || this.pc) return !1;
    (this.wsState = WebSocket.CONNECTING), (this.connectTS = Date.now());
    try {
      (this.ws = new WebSocket(this.wsURL)),
        (this.ws.binaryType = "arraybuffer"),
        this.ws.addEventListener("open", (e) => this.onopen(e)),
        this.ws.addEventListener("close", (e) => this.onclose(e));
    } catch (e) {
      return this.ondisconnect(), !1;
    }
    return !0;
  }
  ondisconnect() {
    (this.wsState = WebSocket.CLOSED),
      this.ws && (this.ws.close(), (this.ws = null)),
      (this.pcState = WebSocket.CLOSED),
      this.pc && (this.pc.close(), (this.pc = null));
  }
  onopen() {
    (this.wsState = WebSocket.OPEN),
      this.ws.addEventListener("message", (e) => {
        if ("string" == typeof e.data) {
          let t = JSON.parse(e.data);
          for (let s in this.onmessage) this.onmessage[s](t);
        } else this.ondata(e.data);
      }),
      (this.ondata = null),
      (this.onmessage = {});
    let e = [];
    return (
      this.mode.indexOf("mse") >= 0 && "MediaSource" in window
        ? (e.push("mse"), this.onmse())
        : this.mode.indexOf("mp4") >= 0 && (e.push("mp4"), this.onmp4()),
      this.mode.indexOf("webrtc") >= 0 &&
        "RTCPeerConnection" in window &&
        (e.push("webrtc"), this.onwebrtc()),
      this.mode.indexOf("mjpeg") >= 0 &&
        (e.length
          ? (this.onmessage.mjpeg = (t) => {
              "error" === t.type &&
                0 === t.value.indexOf(e[0]) &&
                this.onmjpeg();
            })
          : (e.push("mjpeg"), this.onmjpeg())),
      e
    );
  }
  onclose() {
    if (this.wsState === WebSocket.CLOSED) return !1;
    (this.wsState = WebSocket.CONNECTING), (this.ws = null);
    let e = Math.max(this.RECONNECT_TIMEOUT - (Date.now() - this.connectTS), 0);
    return (
      (this.reconnectTID = setTimeout(() => {
        (this.reconnectTID = 0), this.onconnect();
      }, e)),
      !0
    );
  }
  onmse() {
    let e = new MediaSource();
    e.addEventListener(
      "sourceopen",
      () => {
        URL.revokeObjectURL(this.video.src),
          this.send({ type: "mse", value: this.codecs("mse") });
      },
      { once: !0 }
    ),
      (this.video.src = URL.createObjectURL(e)),
      (this.video.srcObject = null),
      this.play(),
      (this.mseCodecs = ""),
      (this.onmessage.mse = (t) => {
        if ("mse" !== t.type) return;
        this.mseCodecs = t.value;
        let s = e.addSourceBuffer(t.value);
        (s.mode = "segments"),
          s.addEventListener("updateend", () => {
            if (!s.updating)
              try {
                if (n > 0) {
                  let t = i.slice(0, n);
                  (n = 0), s.appendBuffer(t);
                } else if (s.buffered && s.buffered.length) {
                  let c = s.buffered.end(s.buffered.length - 1) - 15,
                    o = s.buffered.start(0);
                  c > o && (s.remove(o, c), e.setLiveSeekableRange(c, c + 15));
                }
              } catch (d) {}
          });
        let i = new Uint8Array(2097152),
          n = 0;
        this.ondata = (e) => {
          if (s.updating || n > 0) {
            let t = new Uint8Array(e);
            i.set(t, n), (n += t.byteLength);
          } else
            try {
              s.appendBuffer(e);
            } catch (c) {}
        };
      });
  }
  onwebrtc() {
    let e = new RTCPeerConnection(this.pcConfig),
      t = document.createElement("video");
    t.addEventListener("loadeddata", (e) => this.onpcvideo(e), { once: !0 }),
      e.addEventListener("icecandidate", (e) => {
        let t = e.candidate ? e.candidate.toJSON().candidate : "";
        this.send({ type: "webrtc/candidate", value: t });
      }),
      e.addEventListener("track", (e) => {
        null === t.srcObject &&
          0 !== e.streams.length &&
          "{" !== e.streams[0].id[0] &&
          (t.srcObject = e.streams[0]);
      }),
      e.addEventListener("connectionstatechange", () => {
        ("failed" === e.connectionState ||
          "disconnected" === e.connectionState) &&
          (e.close(),
          (this.pcState = WebSocket.CLOSED),
          (this.pc = null),
          this.onconnect());
      }),
      (this.onmessage.webrtc = (t) => {
        switch (t.type) {
          case "webrtc/candidate":
            e.addIceCandidate({ candidate: t.value, sdpMid: "0" }).catch(
              () => console.debug
            );
            break;
          case "webrtc/answer":
            e.setRemoteDescription({ type: "answer", sdp: t.value }).catch(
              () => console.debug
            );
            break;
          case "error":
            if (0 > t.value.indexOf("webrtc/offer")) return;
            e.close();
        }
      }),
      e.addTransceiver("video", { direction: "recvonly" }),
      e.addTransceiver("audio", { direction: "recvonly" }),
      e.createOffer().then((t) => {
        e.setLocalDescription(t).then(() => {
          this.send({ type: "webrtc/offer", value: t.sdp });
        });
      }),
      (this.pcState = WebSocket.CONNECTING),
      (this.pc = e);
  }
  onpcvideo(e) {
    if (!this.pc) return;
    let t = e.target,
      s = this.pc.connectionState;
    if ("connected" === s || "connecting" === s || !s) {
      let i = 0,
        n = 0,
        c = t.srcObject;
      c.getVideoTracks().length > 0 && (i += 544),
        c.getAudioTracks().length > 0 && (i += 258),
        this.mseCodecs.indexOf("hvc1.") >= 0 && (n += 560),
        this.mseCodecs.indexOf("avc1.") >= 0 && (n += 528),
        this.mseCodecs.indexOf("mp4a.") >= 0 && (n += 257),
        i >= n
          ? ((this.video.srcObject = c),
            this.play(),
            (this.pcState = WebSocket.OPEN),
            (this.wsState = WebSocket.CLOSED),
            this.ws.close(),
            (this.ws = null))
          : ((this.pcState = WebSocket.CLOSED),
            this.pc.close(),
            (this.pc = null));
    }
    t.srcObject = null;
  }
  onmjpeg() {
    (this.ondata = (e) => {
      (this.video.controls = !1),
        (this.video.poster = "data:image/jpeg;base64," + VideoRTC.btoa(e));
    }),
      this.send({ type: "mjpeg" });
  }
  onmp4() {
    let e = document.createElement("canvas"),
      t,
      s = document.createElement("video");
    (s.autoplay = !0),
      (s.playsInline = !0),
      (s.muted = !0),
      s.addEventListener("loadeddata", (i) => {
        t ||
          ((e.width = s.videoWidth),
          (e.height = s.videoHeight),
          (t = e.getContext("2d"))),
          t.drawImage(s, 0, 0, e.width, e.height),
          (this.video.controls = !1),
          (this.video.poster = e.toDataURL("image/jpeg"));
      }),
      (this.ondata = (e) => {
        s.src = "data:video/mp4;base64," + VideoRTC.btoa(e);
      }),
      this.send({ type: "mp4", value: this.codecs("mp4") });
  }
  static btoa(e) {
    let t = new Uint8Array(e),
      s = t.byteLength,
      i = "";
    for (let n = 0; n < s; n++) i += String.fromCharCode(t[n]);
    return window.btoa(i);
  }
}
customElements.define("video-stream", VideoRTC);
