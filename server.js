const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });

let users = {};
let messages = []; // общий чат для всех

let nextId = 1;

function generateUserId() {
    return (nextId++).toString();
}

function broadcastUsersList() {
    const userList = Object.keys(users).map(id => ({
        id: id,
        username: users[id].username,
        online: users[id].online
    }));
    
    const data = JSON.stringify({
        type: 'users_list',
        users: userList
    });
    
    Object.values(users).forEach(user => {
        if (user.ws && user.ws.readyState === WebSocket.OPEN) {
            user.ws.send(data);
        }
    });
}

function broadcastMessage(msg) {
    const data = JSON.stringify({
        type: 'new_message',
        message: msg
    });
    
    Object.values(users).forEach(user => {
        if (user.ws && user.ws.readyState === WebSocket.OPEN) {
            user.ws.send(data);
        }
    });
}

server.on('connection', (ws) => {
    let currentUserId = null;
    let currentUsername = null;
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            console.log('Получено:', msg.type);
            
            // 1. РЕГИСТРАЦИЯ
            if (msg.type === 'register') {
                currentUsername = msg.username;
                currentUserId = generateUserId();
                
                users[currentUserId] = {
                    id: currentUserId,
                    username: currentUsername,
                    ws: ws,
                    online: true
                };
                
                console.log(`✅ ${currentUsername} (${currentUserId}) подключился`);
                
                ws.send(JSON.stringify({
                    type: 'registered',
                    userId: currentUserId,
                    username: currentUsername
                }));
                
                // Отправляем историю сообщений
                ws.send(JSON.stringify({
                    type: 'history',
                    messages: messages
                }));
                
                broadcastUsersList();
            }
            
            // 2. ЗАПРОС СПИСКА ПОЛЬЗОВАТЕЛЕЙ
            else if (msg.type === 'get_users') {
                const userList = Object.keys(users).map(id => ({
                    id: id,
                    username: users[id].username,
                    online: users[id].online
                }));
                ws.send(JSON.stringify({
                    type: 'users_list',
                    users: userList
                }));
            }
            
            // 3. ОТПРАВКА СООБЩЕНИЯ
            else if (msg.type === 'message') {
                const newMsg = {
                    id: Date.now(),
                    text: msg.text,
                    senderId: currentUserId,
                    senderName: currentUsername,
                    timestamp: new Date().toLocaleTimeString()
                };
                messages.push(newMsg);
                if (messages.length > 200) messages.shift();
                
                broadcastMessage(newMsg);
            }
            
        } catch (err) {
            console.error('Ошибка:', err);
        }
    });
    
    ws.on('close', () => {
        if (currentUserId) {
            console.log(`❌ ${currentUsername} (${currentUserId}) отключился`);
            if (users[currentUserId]) {
                users[currentUserId].online = false;
            }
            broadcastUsersList();
        }
    });
});

console.log('✅ Сервер запущен на порту ' + PORT);
console.log('💬 Общий чат для всех пользователей');