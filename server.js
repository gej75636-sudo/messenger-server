const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });

let messages = [];
let clients = [];

console.log('✅ Сервер запущен на порту ' + PORT);

server.on('connection', (ws) => {
    console.log('✅ Новый клиент');
    clients.push(ws);
    
    ws.send(JSON.stringify({ type: 'history', messages }));
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            console.log(`📨 ${msg.sender}: ${msg.text}`);
            
            const newMsg = {
                id: Date.now(),
                text: msg.text,
                sender: msg.sender,
                timestamp: new Date().toLocaleTimeString()
            };
            messages.push(newMsg);
            if (messages.length > 200) messages.shift();
            
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'new_message', message: newMsg }));
                }
            });
        } catch(e) {}
    });
    
    ws.on('close', () => {
        clients = clients.filter(c => c !== ws);
    });
});