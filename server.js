const WebSocket = require('ws');
const ws = new WebSocket.Server({ port: 8080 });

const connections = new Set();

ws.on('connection', (wsConnection) => {
    connections.add(wsConnection);
    wsConnection.on('close', () => {
        connections.delete(wsConnection);
    });
    wsConnection.on('message', (message) => {
        connections.forEach(connection => {
            if (connection !== wsConnection) {
                connection.send(message.toString());
            }
        });
    });
});