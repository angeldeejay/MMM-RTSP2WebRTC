# MMM-RTSP2WebRTC

This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/).

This module serve [go2rtc](https://github.com/AlexxIT/go2rtc) instance and proxy multiple RTSP feeds to be inserted in MagicMirror through WebRTC.

## Example

![](.github/example.png)

## Using the module

To use this module, add the following configuration block to the modules array in the `config/config.js` file:

```js
var config = {
  modules: [
    {
      module: "MMM-RTSP2WebRTC",
      config: {
        updateInterval: 30000, // Default time to show next camera (in milliseconds)
        retryDelay: 5000, // Time to wait to refresh DOM when server and feeds are alive (in milliseconds)
        controls: false, // If video player should show its controls
        height: 350, // video player height
        width: 700, // video player width
        animationSpeed: 400, // Animation speed to update DOM
        sources: [] // sources list (rtsp urls to proxy. e.g rtsp://x.x.x.x:8554/live)
      }
    }
  ]
};
```

## Configuration options

| Option           | Default     | Description                                                                              |
|------------------|-------------|------------------------------------------------------------------------------------------|
| `updateInterval` | `30000`     | _Optional_ Default time to show next camera (in milliseconds)                            |
| `retryDelay`     | `5000`      | _Optional_ Time to wait to refresh DOM when server and feeds are alive (in milliseconds) |
| `controls`       | `false`     | _Optional_ If video player should show its controls                                      |
| `height`         | `350`       | _Optional_ video player height                                                           |
| `width`          | `700`       | _Optional_ video player width                                                            |
| `animationSpeed` | `400`       | _Optional_ Animation speed to update DOM                                                 |
| `baseUrl`        | `127.0.0.1` | _Optional_ Websockets base URL                                                           |
| `sources`        | `[]`        | _Required_ sources list (rtsp urls to proxy. e.g rtsp://x.x.x.x:8554/live)               |
