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

// Отправка обновления профиля всем, у кого есть чат с этим пользователем
function broadcastProfileUpdate(userId) {
    const user = users[userId];
    if (!user) return;
    
    const updateData = JSON.stringify({
        type: 'profile_updated',
        userId: userId,
        username: user.username,
        avatar: user.avatar,
        avatarInitials: user.avatarInitials,
        avatarColor: user.avatarColor
    });
    
    // Отправляем всем, у кого есть чат с этим пользователем
    Object.values(users).forEach(otherUser => {
        if (otherUser.id !== userId) {
            const chatId = getChatId(userId, otherUser.id);
            if (privateMessages[chatId] && privateMessages[chatId].length > 0) {
                sendToUser(otherUser.id, JSON.parse(updateData));
            }
        }
    });
}

server.on('connection', (ws) => {
    let currentUserId = null;
    let currentUsername = null;
    let currentAvatar = null;
    let currentAvatarInitials = null;
    let currentAvatarColor = null;
    
    console.log('🔌 Новое подключение');
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            console.log('Получено:', msg.type);
            
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
            else if (msg.type === 'update_profile') {
                if (users[currentUserId]) {
                    let updated = false;
                    if (msg.username && msg.username !== currentUsername) {
                        users[currentUserId].username = msg.username;
                        currentUsername = msg.username;
                        updated = true;
                    }
                    if (msg.avatar !== undefined && msg.avatar !== currentAvatar) {
                        users[currentUserId].avatar = msg.avatar;
                        currentAvatar = msg.avatar;
                        updated = true;
                    }
                    if (msg.avatarInitials && msg.avatarInitials !== currentAvatarInitials) {
                        users[currentUserId].avatarInitials = msg.avatarInitials;
                        currentAvatarInitials = msg.avatarInitials;
                        updated = true;
                    }
                    if (msg.avatarColor && msg.avatarColor !== currentAvatarColor) {
                        users[currentUserId].avatarColor = msg.avatarColor;
                        currentAvatarColor = msg.avatarColor;
                        updated = true;
                    }
                    
                    if (updated) {
                        console.log(`📝 ${currentUsername} обновил профиль`);
                        broadcastUsersList();
                        broadcastProfileUpdate(currentUserId);
                        
                        // Подтверждаем обновление
                        ws.send(JSON.stringify({
                            type: 'profile_updated_confirm',
                            username: currentUsername,
                            avatar: currentAvatar,
                            avatarInitials: currentAvatarInitials,
                            avatarColor: currentAvatarColor
                        }));
                    }
                }
            }
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
            else if (msg.type === 'private_message') {
                const targetUserId = msg.targetUserId;
                const chatId = getChatId(currentUserId, targetUserId);
                
                if (!privateMessages[chatId]) privateMessages[chatId] = [];
                
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
                
                console.log(`💬 ${currentUsername} -> ${users[targetUserId]?.username}: ${msg.text}`);
                
                ws.send(JSON.stringify({
                    type: 'new_private_message',
                    message: newMsg,
                    chatId: chatId
                }));
                
                const targetUser = users[targetUserId];
                if (targetUser && targetUser.ws && targetUser.ws.readyState === WebSocket.OPEN) {
                    targetUser.ws.send(JSON.stringify({
                        type: 'new_private_message',
                        message: newMsg,
                        chatId: chatId
                    }));
                    console.log(`📤 Сообщение отправлено получателю ${targetUser.username}`);
                } else {
                    console.log(`⚠️ Получатель ${targetUserId} не онлайн, сообщение сохранено в истории`);
                }
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
console.log('🌐 Адрес: wss://messenger-server-production-a67c.up.railway.app');
console.log('💬 Личные чаты активны, профили обновляются в реальном времени');