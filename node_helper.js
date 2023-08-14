/* eslint-disable no-empty */
/* eslint-disable no-underscore-dangle */
/* Magic Mirror
 * Node Helper: "MMM-RTSP2WebRTC"
 *
 * By Andrés Vanegas <ukab72106@gmail.com>
 * MIT Licensed.
 */

const Log = require("logger");
const NodeHelper = require("node_helper");
const path = require("path");

module.exports = NodeHelper.create({
  name: path.basename(__dirname),
  logPrefix: null,

  start() {
    this.logPrefix = `${this.name} :: `;
    Log.info(`${this.logPrefix}Started`);
  }
});
