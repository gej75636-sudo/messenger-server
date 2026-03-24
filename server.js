const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });

let users = {};
let privateMessages = {};
let userChats = {};

let nextId = 1;

function generateUserId() {
    return (nextId++).toString();
}

function getChatId(user1, user2) {
    return [user1, user2].sort().join('_');
}

function sendToUser(userId, data) {
    const user = users[userId];
    if (user && user.ws && user.ws.readyState === WebSocket.OPEN) {
        user.ws.send(JSON.stringify(data));
    }
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

server.on('connection', (ws) => {
    let currentUserId = null;
    let currentUsername = null;
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            console.log('Получено:', msg.type);
            
            if (msg.type === 'register') {
                currentUsername = msg.username;
                currentUserId = generateUserId();
                
                users[currentUserId] = {
                    id: currentUserId,
                    username: currentUsername,
                    ws: ws,
                    online: true
                };
                userChats[currentUserId] = [];
                
                console.log(`✅ ${currentUsername} (${currentUserId}) подключился`);
                
                ws.send(JSON.stringify({
                    type: 'registered',
                    userId: currentUserId,
                    username: currentUsername
                }));
                
                broadcastUsersList();
            }
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
            else if (msg.type === 'start_chat') {
                const targetUserId = msg.targetUserId;
                const chatId = getChatId(currentUserId, targetUserId);
                
                if (!privateMessages[chatId]) privateMessages[chatId] = [];
                if (!userChats[currentUserId].includes(chatId)) userChats[currentUserId].push(chatId);
                if (userChats[targetUserId] && !userChats[targetUserId].includes(chatId)) userChats[targetUserId].push(chatId);
                
                ws.send(JSON.stringify({
                    type: 'chat_history',
                    chatId: chatId,
                    messages: privateMessages[chatId],
                    partner: {
                        id: targetUserId,
                        name: users[targetUserId]?.username || 'Пользователь'
                    }
                }));
                
                if (users[targetUserId] && users[targetUserId].online) {
                    sendToUser(targetUserId, JSON.stringify({
                        type: 'new_chat',
                        chatId: chatId,
                        partner: {
                            id: currentUserId,
                            name: currentUsername
                        }
                    }));
                }
            }
            else if (msg.type === 'get_chat_history') {
                const chatId = msg.chatId;
                const [id1, id2] = chatId.split('_');
                const partnerId = id1 === currentUserId ? id2 : id1;
                const partner = users[partnerId];
                
                ws.send(JSON.stringify({
                    type: 'chat_history',
                    chatId: chatId,
                    messages: privateMessages[chatId] || [],
                    partner: {
                        id: partnerId,
                        name: partner?.username || 'Пользователь'
                    }
                }));
            }
            else if (msg.type === 'get_chats') {
                const chats = (userChats[currentUserId] || []).map(chatId => {
                    const [id1, id2] = chatId.split('_');
                    const partnerId = id1 === currentUserId ? id2 : id1;
                    const partner = users[partnerId];
                    const lastMsg = privateMessages[chatId]?.slice(-1)[0];
                    return {
                        chatId: chatId,
                        partnerId: partnerId,
                        partnerName: partner?.username || 'Пользователь',
                        lastMessage: lastMsg?.text || 'Нет сообщений',
                        lastTime: lastMsg?.timestamp || '',
                        unread: 0
                    };
                });
                
                ws.send(JSON.stringify({
                    type: 'chats_list',
                    chats: chats
                }));
            }
            else if (msg.type === 'private_message') {
                const chatId = msg.chatId;
                const targetUserId = msg.targetUserId;
                
                const newMsg = {
                    id: Date.now(),
                    text: msg.text,
                    senderId: currentUserId,
                    senderName: currentUsername,
                    timestamp: new Date().toLocaleTimeString(),
                    chatId: chatId
                };
                
                if (!privateMessages[chatId]) privateMessages[chatId] = [];
                privateMessages[chatId].push(newMsg);
                if (privateMessages[chatId].length > 200) privateMessages[chatId].shift();
                
                ws.send(JSON.stringify({
                    type: 'new_private_message',
                    message: newMsg,
                    chatId: chatId
                }));
                
                sendToUser(targetUserId, JSON.stringify({
                    type: 'new_private_message',
                    message: newMsg,
                    chatId: chatId
                }));
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
console.log('💬 Личные чаты активны');