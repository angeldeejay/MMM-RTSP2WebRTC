/* eslint-disable no-empty */
/* eslint-disable no-underscore-dangle */
/* Magic Mirror
 * Node Helper: "MMM-RTSP2WebRTC"
 *
 * By Andrés Vanegas <ukab72106@gmail.com>
 * MIT Licensed.
 */

const { ChildProcess, spawnSync, execFile } = require("node:child_process");
const fs = require("fs");
const Log = require("logger");
const NodeHelper = require("node_helper");
const path = require("path");
const yaml = require("js-yaml");
const go2rtc = require("go2rtc-static");
const ffmpeg = require("@ffmpeg-installer/ffmpeg").path;
const configPath = path.join(__dirname, "go2rtc.yaml");
const pidPath = path.join(__dirname, "go2rtc.pid");
const apiPort = process.env.API_PORT || 2984;
const rtspPort = process.env.RTSP_PORT || 9554;
const srtpPort = process.env.SRTP_PORT || 9443;
const webrtcPort = process.env.WEBRTC_PORT || 10555;

const GO2RTC_CFG = {
  api: {
    listen: `:${apiPort}`,
    origin: "*"
  },
  ffmpeg: {
    bin: ffmpeg,
    rtsp: [
      "-rtsp_transport udp",
      "-fflags nobuffer",
      "-flags low_delay",
      "-timeout 5000000",
      "-fflags +genpts+discardcorrupt",
      "-analyzeduration 0",
      "-probesize 32",
      "-i {input}"
    ].join(" ")
  },
  log: {
    format: "text"
  },
  srtp: {
    listen: `:${srtpPort}`
  },
  rtsp: {
    listen: `:${rtspPort}`,
    default_query: "video"
  },
  webrtc: {
    listen: `:${webrtcPort}`,
    candidates: [`stun:${webrtcPort}`]
  },
  streams: {}
};

module.exports = NodeHelper.create({
  name: path.basename(__dirname),
  apiConnector: null,
  busy: false,
  logPrefix: null,
  go2rtcAlive: false,
  streamProcess: null,
  sources: [],

  bootstrap() {
    this.sendNotification("SET_MESSAGE", "LOADING_VIDEO");
    this.saveStreamConfig();

    setInterval(() => this.sendNotification("READY", this.go2rtcAlive), 1000);
    Log.info(`${this.logPrefix}Started`);
  },

  start() {
    this.logPrefix = `${this.name} :: `;
    this.config = null;
    this.go2rtcAlive = false;
    this.bootstrap();
  },

  logLine(prefix, line, type) {
    Log[type].call(Log, `${this.logPrefix}[${prefix}] ${line}`);
  },

  stopStream() {
    try {
      spawnSync("killall", ["-s", "SIGINT", "-9", go2rtc]);
    } catch (_) {}
    this.streamProcess = null;
  },

  streamProcessAlive() {
    return (
      this.streamProcess !== null &&
      this.streamProcess instanceof ChildProcess &&
      this.go2rtcAlive === true
    );
  },

  startStream() {
    this.stopStream();
    this.streamProcess = execFile(go2rtc, [], {
      cwd: __dirname
    })
      .on("spawn", () => {
        this.logLine(
          "go2rtc",
          `Started at PID ${this.streamProcess.pid}`,
          "info"
        );
        fs.writeFileSync(pidPath, `${this.streamProcess.pid}`);
        this.go2rtcAlive = true;

        this.streamProcess.stdout.setEncoding("utf8");
        this.streamProcess.stdout.on("data", (data) =>
          Log.log(`${this.logPrefix}[go2rtc] ${data}`)
        );

        this.streamProcess.stderr.setEncoding("utf8");
        this.streamProcess.stderr.on("data", (data) =>
          Log.warn(`${this.logPrefix}[go2rtc] ${data}`)
        );
      })
      .on("exit", (code, signal) => {
        this.logLine(
          "go2rtc",
          `exited with ${
            typeof code !== "undefined" && code !== null ? "code" : "signal"
          } ${typeof code !== "undefined" && code !== null ? code : signal}`,
          "info"
        );
        this.go2rtcAlive = false;
        if ((code && code !== 0) || (signal && signale !== "SIGINT"))
          setTimeout(() => this.startStream(), 1000);
      });
  },

  getStreamsConfig() {
    return {
      ...(this.sources.length === 0
        ? {}
        : {
            streams: this.sources.reduce(
              (acc, s) => ({
                ...acc,
                [s.key]: [s.source]
              }),
              {}
            )
          })
    };
  },

  saveStreamConfig() {
    this.busy = true;
    try {
      fs.writeFileSync(
        configPath,
        yaml.dump(
          { ...GO2RTC_CFG, ...this.getStreamsConfig() },
          { noCompatMode: true }
        )
      );
    } catch (err) {}
    this.startStream();
    this.busy = false;
  },

  processConfig(config) {
    if (this.busy) return;

    this.busy = true;
    this.config = config;
    const receivedConfigSources = this.config.sources.filter(
      (v, i, self) => self.indexOf(v) === i
    );
    const payloadSources = receivedConfigSources.map((v) => v.key);
    const currentSources = this.sources.map((v) => v.key);
    const newSources = payloadSources.filter(
      (x) => !currentSources.includes(x)
    );
    if (newSources.length > 0) {
      if (newSources.length > 0)
        receivedConfigSources
          .filter((x) => newSources.includes(x.key))
          .forEach((x) => this.sources.push(x));
      this.saveStreamConfig();
      Log.info(
        `${this.logPrefix}Sources updated`,
        this.sources.map((x) => x.source)
      );
    } else {
      this.busy = false;
    }
  },

  sendActiveSources() {
    const currentSources = this.sources.map(({ key, rawSource: source }) => ({
      key,
      source,
      endpoint: `http://${
        process.env.LOCAL_IP ?? this.config.exposedIp ?? "127.0.0.1"
      }:${process.env.API_PORT ?? apiPort}/api/ws?src=${key}`
    }));

    this.sendNotification("UPDATE_SOURCES", currentSources);
  },

  sendNotification(notification, payload) {
    this.sendSocketNotification(`${this.name}-${notification}`, payload);
    if (notification === "READY" && this.go2rtcAlive) {
      this.sendActiveSources();
    }
  },

  socketNotificationReceived(type, payload) {
    const notification = type.replace(`${this.name}-`, "");
    switch (notification) {
      case "SET_CONFIG":
        if (this.busy) {
          this.sendNotification("WAIT_CONFIG", true);
        } else {
          this.processConfig(payload);
        }
        this.sendActiveSources();
        break;
      default:
    }
  }
});
