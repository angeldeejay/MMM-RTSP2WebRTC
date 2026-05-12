class VideoStream extends VideoRTC {
    constructor() {
        super();
        this.DISCONNECT_TIMEOUT = 5000;
        this.RECONNECT_TIMEOUT = 10000;
        this.background = true;
        this.visibilityCheck = false;
    }

    _showOverlay() {
        if (this._overlay) this._overlay.style.opacity = '1';
    }

    _hideOverlay() {
        if (this._overlay) this._overlay.style.opacity = '0';
    }

    oninit() {
        Log.debug(this.constructor.name, 'stream.oninit', this);
        super.oninit();
        this.video.controls = false;

        this._overlay = document.createElement('div');
        this._overlay.classList.add('video-stream-overlay');
        this._overlay.style.opacity = '1';
        this.appendChild(this._overlay);

        // Hide overlay when MSE/HLS stream has data
        this.video.addEventListener('loadeddata', () => this._hideOverlay());
    }

    onconnect() {
        Log.debug(this.constructor.name, 'stream.onconnect', this);
        const result = super.onconnect();
        if (result) this._showOverlay();
        return result;
    }

    ondisconnect() {
        Log.debug(this.constructor.name, 'stream.ondisconnect', this);
        this._showOverlay();
        super.ondisconnect();
    }

    onopen() {
        Log.debug(this.constructor.name, 'stream.onopen', this);
        const result = super.onopen();

        this.onmessage['stream'] = msg => {
            Log.debug(this.constructor.name, 'stream.onmessage', msg, this);
            switch (msg.type) {
                case 'error':
                    Log.warn(msg.value, this);
                    break;
                case 'mse':
                case 'hls':
                case 'mp4':
                case 'mjpeg':
                    Log.debug(this.constructor.name, msg.type.toUpperCase(), this);
                    break;
            }
        };

        return result;
    }

    onclose() {
        Log.debug(this.constructor.name, 'stream.onclose', this);
        return super.onclose();
    }

    onpcvideo(video2) {
        Log.debug(this.constructor.name, 'stream.onpcvideo', this);
        super.onpcvideo(video2);
        if (this.pcState !== WebSocket.CLOSED) {
            this._hideOverlay();
        }
    }
}

customElements.define('video-stream', VideoStream);
