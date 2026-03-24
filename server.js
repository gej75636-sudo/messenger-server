const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });

let users = {};
let privateMessages = {};

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
        avatar: users[id].avatar || null,
        avatarInitials: users[id].avatarInitials || users[id].username.charAt(0).toUpperCase(),
        avatarColor: users[id].avatarColor || '#6c5ce7',
        online: users[id].online
    }));
    
    const data = JSON.stringify({ type: 'users_list', users: userList });
    
    Object.values(users).forEach(user => {
        if (user.ws && user.ws.readyState === WebSocket.OPEN) {
            user.ws.send(data);
        }
    });
}

server.on('connection', (ws) => {
    let currentUserId = null;
    let currentUsername = null;
    let currentAvatar = null;
    let currentAvatarInitials = null;
    let currentAvatarColor = null;
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            console.log('Получено:', msg.type);
            
            // РЕГИСТРАЦИЯ
            if (msg.type === 'register') {
                currentUsername = msg.username;
                currentAvatar = msg.avatar || null;
                currentAvatarInitials = msg.avatarInitials || msg.username.charAt(0).toUpperCase();
                currentAvatarColor = msg.avatarColor || '#6c5ce7';
                currentUserId = generateUserId();
                
                users[currentUserId] = {
                    id: currentUserId,
                    username: currentUsername,
                    avatar: currentAvatar,
                    avatarInitials: currentAvatarInitials,
                    avatarColor: currentAvatarColor,
                    ws: ws,
                    online: true
                };
                
                console.log(`✅ ${currentUsername} (${currentUserId}) подключился`);
                
                ws.send(JSON.stringify({
                    type: 'registered',
                    userId: currentUserId,
                    username: currentUsername,
                    avatar: currentAvatar,
                    avatarInitials: currentAvatarInitials,
                    avatarColor: currentAvatarColor
                }));
                
                broadcastUsersList();
            }
            
            // ОБНОВЛЕНИЕ ПРОФИЛЯ
            else if (msg.type === 'update_profile') {
                if (users[currentUserId]) {
                    if (msg.username) {
                        users[currentUserId].username = msg.username;
                        currentUsername = msg.username;
                    }
                    if (msg.avatar !== undefined) {
                        users[currentUserId].avatar = msg.avatar;
                        currentAvatar = msg.avatar;
                    }
                    if (msg.avatarInitials) {
                        users[currentUserId].avatarInitials = msg.avatarInitials;
                        currentAvatarInitials = msg.avatarInitials;
                    }
                    if (msg.avatarColor) {
                        users[currentUserId].avatarColor = msg.avatarColor;
                        currentAvatarColor = msg.avatarColor;
                    }
                    console.log(`📝 ${currentUsername} обновил профиль`);
                    broadcastUsersList();
                }
            }
            
            // ЗАПРОС СПИСКА ПОЛЬЗОВАТЕЛЕЙ
            else if (msg.type === 'get_users') {
                const userList = Object.keys(users).map(id => ({
                    id: id,
                    username: users[id].username,
                    avatar: users[id].avatar || null,
                    avatarInitials: users[id].avatarInitials || users[id].username.charAt(0).toUpperCase(),
                    avatarColor: users[id].avatarColor || '#6c5ce7',
                    online: users[id].online
                }));
                ws.send(JSON.stringify({ type: 'users_list', users: userList }));
            }
            
            // ЗАПРОС ИСТОРИИ ЧАТА
            else if (msg.type === 'get_chat_history') {
                const chatId = msg.chatId;
                const partner = users[msg.partnerId];
                ws.send(JSON.stringify({
                    type: 'chat_history',
                    chatId: chatId,
                    messages: privateMessages[chatId] || [],
                    partner: {
                        id: msg.partnerId,
                        name: partner?.username || 'Пользователь',
                        avatar: partner?.avatar || null,
                        avatarInitials: partner?.avatarInitials || (partner?.username?.charAt(0).toUpperCase() || '?'),
                        avatarColor: partner?.avatarColor || '#6c5ce7'
                    }
                }));
            }
            
            // ОТПРАВКА СООБЩЕНИЯ (создаёт чат если его нет)
            else if (msg.type === 'private_message') {
                const targetUserId = msg.targetUserId;
                const chatId = getChatId(currentUserId, targetUserId);
                
                // Создаём чат если его нет
                if (!privateMessages[chatId]) {
                    privateMessages[chatId] = [];
                }
                
                const newMsg = {
                    id: Date.now(),
                    text: msg.text,
                    senderId: currentUserId,
                    senderName: currentUsername,
                    senderAvatar: currentAvatar,
                    senderAvatarInitials: currentAvatarInitials,
                    senderAvatarColor: currentAvatarColor,
                    timestamp: new Date().toLocaleTimeString(),
                    chatId: chatId
                };
                
                privateMessages[chatId].push(newMsg);
                if (privateMessages[chatId].length > 200) privateMessages[chatId].shift();
                
                // Отправляем отправителю
                ws.send(JSON.stringify({
                    type: 'new_private_message',
                    message: newMsg,
                    chatId: chatId
                }));
                
                // Отправляем получателю
                sendToUser(targetUserId, JSON.stringify({
                    type: 'new_private_message',
                    message: newMsg,
                    chatId: chatId
                }));
                
                console.log(`💬 ${currentUsername} -> ${users[targetUserId]?.username}: ${msg.text}`);
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
console.log('💬 Личные чаты создаются при первом сообщении');