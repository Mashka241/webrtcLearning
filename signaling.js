class BroadcastChannelSignaling {
    bc = new BroadcastChannel('test_channel');
    postMessage(message) {
        this.bc.postMessage(message);
    }

    addEventListener(eventType, eventCallback) {
        this.bc.addEventListener(eventType, eventCallback);
    }

    removeEventListener(eventType, eventCallback) {
        this.bc.removeEventListener(eventType, eventCallback);
    }
}

class WebSocketSignaling {
    socket = new WebSocket('ws://localhost:8080');
    listeners = new WeakMap();

    postMessage(message) {
        this.socket.send(JSON.stringify(message));
    }

    addEventListener(eventType, eventCallback) {
        const newEventCallback = (event) => {
            if (eventType === 'message') {
                console.log('event.data', event.data);
                const parsedMessage = JSON.parse(event.data);
                eventCallback({
                    ...event,
                    data: parsedMessage
                });
            } else {
                eventCallback(event);
            }
        };
        this.socket.addEventListener(eventType, newEventCallback);
        this.listeners.set(eventCallback, newEventCallback);
    }

    removeEventListener(eventType, eventCallback) {
        this.listeners.delete(eventCallback);
        this.socket.removeEventListener(eventType, eventCallback);
    }
}