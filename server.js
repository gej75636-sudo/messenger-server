const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });

// Хранилище
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
        avatar: users[id].avatar || null,
        avatarInitials: users[id].avatarInitials || users[id].username.charAt(0).toUpperCase(),
        avatarColor: users[id].avatarColor || '#6c5ce7',
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
    let currentAvatar = null;
    let currentAvatarInitials = null;
    let currentAvatarColor = null;
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            console.log('Получено:', msg.type);
            
            // 1. РЕГИСТРАЦИЯ
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
                userChats[currentUserId] = [];
                
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
            
            // 1.5 ОБНОВЛЕНИЕ АВАТАРКИ
            else if (msg.type === 'update_avatar') {
                if (users[currentUserId]) {
                    users[currentUserId].avatar = msg.avatar;
                    users[currentUserId].avatarInitials = msg.avatarInitials;
                    users[currentUserId].avatarColor = msg.avatarColor;
                    broadcastUsersList();
                    console.log(`🖼️ ${currentUsername} обновил аватарку`);
                }
            }
            
            // 2. ЗАПРОС СПИСКА ПОЛЬЗОВАТЕЛЕЙ
            else if (msg.type === 'get_users') {
                const userList = Object.keys(users).map(id => ({
                    id: id,
                    username: users[id].username,
                    avatar: users[id].avatar || null,
                    avatarInitials: users[id].avatarInitials || users[id].username.charAt(0).toUpperCase(),
                    avatarColor: users[id].avatarColor || '#6c5ce7',
                    online: users[id].online
                }));
                ws.send(JSON.stringify({
                    type: 'users_list',
                    users: userList
                }));
            }
            
            // 3. НАЧАТЬ ЛИЧНЫЙ ЧАТ
            else if (msg.type === 'start_chat') {
                const targetUserId = msg.targetUserId;
                const chatId = getChatId(currentUserId, targetUserId);
                
                if (!privateMessages[chatId]) {
                    privateMessages[chatId] = [];
                }
                
                if (!userChats[currentUserId].includes(chatId)) {
                    userChats[currentUserId].push(chatId);
                }
                if (userChats[targetUserId] && !userChats[targetUserId].includes(chatId)) {
                    userChats[targetUserId].push(chatId);
                }
                
                const partner = users[targetUserId];
                ws.send(JSON.stringify({
                    type: 'chat_history',
                    chatId: chatId,
                    messages: privateMessages[chatId] || [],
                    partner: {
                        id: targetUserId,
                        name: partner?.username || 'Пользователь',
                        avatar: partner?.avatar || null,
                        avatarInitials: partner?.avatarInitials || (partner?.username?.charAt(0).toUpperCase() || '?'),
                        avatarColor: partner?.avatarColor || '#6c5ce7'
                    }
                }));
                
                console.log(`📁 Чат ${chatId} открыт для ${currentUsername} с ${partner?.username}`);
            }
            
            // 4. ЗАПРОС ИСТОРИИ ЧАТА
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
                        name: partner?.username || 'Пользователь',
                        avatar: partner?.avatar || null,
                        avatarInitials: partner?.avatarInitials || (partner?.username?.charAt(0).toUpperCase() || '?'),
                        avatarColor: partner?.avatarColor || '#6c5ce7'
                    }
                }));
            }
            
            // 5. ОТПРАВКА ЛИЧНОГО СООБЩЕНИЯ
            else if (msg.type === 'private_message') {
                const chatId = msg.chatId;
                const targetUserId = msg.targetUserId;
                
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
                
                if (!privateMessages[chatId]) {
                    privateMessages[chatId] = [];
                }
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
console.log('💬 Личные чаты активны с поддержкой аватарок');