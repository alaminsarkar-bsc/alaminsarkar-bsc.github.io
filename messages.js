/* --- START OF FILE messages.js --- */

// ==========================
// কনফিগারেশন এবং সেটআপ
// ==========================
const SUPABASE_URL = 'https://pnsvptaanvtdaspqjwbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuc3ZwdGFhbnZ0ZGFzcHFqd2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMzcxNjMsImV4cCI6MjA3NTkxMzE2M30.qposYOL-W17DnFF11cJdZ7zrN1wh4Bop6YnclkUe_rU';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================
// গ্লোবাল ভ্যারিয়েবল
// ==========================
let currentUser = null;
let activeChatUserId = null;
let realtimeSubscription = null;
let presenceChannel = null;
let selectedImageFile = null;
let isUploading = false;

// ভয়েস রেকর্ডিং ভ্যারিয়েবল
let mediaRecorder = null;
let audioChunks = [];
let recordingInterval = null;
let isRecording = false;

// লং প্রেস এবং রিপ্লাই ভ্যারিয়েবল
let pressTimer;
let selectedMessageId = null;
let selectedMessageText = null; 
let replyToId = null;
let typingTimeout = null;

// ==========================
// ১. অ্যাপ লোডিং এবং অথেন্টিকেশন
// ==========================
document.addEventListener('DOMContentLoaded', async () => {
    // সেশন চেক করা
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    if (error || !session) {
        window.location.href = '/index.html'; // লগইন না থাকলে ফেরত
        return;
    }
    
    currentUser = session.user;
    
    // নিজের প্রোফাইল লোড করা
    loadMyProfile();
    
    // লাস্ট সিন আপডেট করা (প্রতি মিনিটে)
    updateMyLastSeen();
    setInterval(updateMyLastSeen, 60000); 

    // নতুন ফিচার: হরাইজন্টাল অ্যাক্টিভ ইউজার লোড করা
    loadActiveUsersHorizontal();

    // অন্য পেজ থেকে চ্যাট শুরু করতে চাইলে
    const startChatUser = localStorage.getItem('startChatWith');
    if (startChatUser) {
        localStorage.removeItem('startChatWith');
        openChat(startChatUser);
    } else {
        loadChatList();
    }
    
    // ইভেন্ট লিসেনার চালু করা
    setupEventListeners();
});

// নিজের ছবি লোড করা
async function loadMyProfile() {
    try {
        const { data } = await supabaseClient
            .from('users')
            .select('photo_url')
            .eq('id', currentUser.id)
            .single();
            
        const el = document.getElementById('myHeaderAvatar');
        if (el) {
            if (data?.photo_url) {
                el.innerHTML = `<img src="${data.photo_url}" alt="Me">`;
            } else {
                el.innerHTML = '<img src="./images/default-avatar.png" alt="Me">';
            }
        }
    } catch(e) {
        console.error("Profile load error", e);
    }
}

// নিজের অনলাইন স্ট্যাটাস আপডেট করা
async function updateMyLastSeen() {
    if (!currentUser) return;
    try {
        await supabaseClient
            .from('users')
            .update({ last_seen: new Date() })
            .eq('id', currentUser.id);
    } catch (e) {
        console.error("Last seen update error", e);
    }
}

// ==========================
// ২. [NEW] হরাইজন্টাল অ্যাক্টিভ ইউজার লিস্ট
// ==========================
async function loadActiveUsersHorizontal() {
    const container = document.getElementById('activeUsersBar');
    if (!container || !currentUser) return;

    // লোডার দেখানো (CSS এ display:none থাকলে JS দিয়ে অন করছি)
    const loader = container.querySelector('.loader-horizontal');
    if(loader) loader.style.display = 'block';

    try {
        // লাস্ট সিন অনুযায়ী ইউজারদের আনা (সর্বশেষ ১৫ জন)
        // নিজের আইডি বাদে বাকিদের আনা
        const { data: users, error } = await supabaseClient
            .from('users')
            .select('id, display_name, photo_url, last_seen')
            .neq('id', currentUser.id) 
            .order('last_seen', { ascending: false })
            .limit(15);

        if (error) throw error;

        container.innerHTML = ''; // ক্লিয়ার কন্টেইনার

        // নিজের নোট বা স্ট্যাটাস এড করার বাটন (অপশনাল)
        const myHtml = `
            <div class="story-avatar-item">
                <div class="story-img-wrapper" style="border:none; box-shadow:none;">
                    <div style="width:100%; height:100%; background:#f0f2f5; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:20px; color:#050505;">
                        <i class="fas fa-plus"></i>
                    </div>
                </div>
                <span class="story-name">Your Note</span>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', myHtml);

        if (users && users.length > 0) {
            users.forEach(user => {
                // ৫ মিনিটের মধ্যে অনলাইন থাকলে সবুজ বাতি
                const isOnline = user.last_seen && (new Date() - new Date(user.last_seen) < 5 * 60 * 1000);
                
                // শুধুমাত্র নামের প্রথম অংশ দেখানো
                const firstName = user.display_name ? user.display_name.split(' ')[0] : 'User';

                const html = `
                    <div class="story-avatar-item" onclick="openChat('${user.id}')">
                        <div class="story-img-wrapper">
                            <img src="${user.photo_url || './images/default-avatar.png'}" alt="${firstName}">
                            ${isOnline ? '<div class="story-online-dot"></div>' : ''}
                        </div>
                        <span class="story-name" style="${isOnline ? 'font-weight:600; color:#050505;' : ''}">${firstName}</span>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', html);
            });
        }

    } catch (error) {
        console.error("Error loading active users:", error);
    }
}

// ==========================
// ৩. চ্যাট লিস্ট লোড করা (ভার্টিকাল)
// ==========================
async function loadChatList() {
    const container = document.getElementById('chatListContainer');
    if(!container) return;
    
    // লোডার দেখানো
    container.innerHTML = `<div class="loader-container"><div class="loader"></div></div>`;

    try {
        // ডাটাবেস থেকে পার্টনারদের লিস্ট আনা
        const { data: partners, error } = await supabaseClient.rpc('get_chat_partners', { user_id: currentUser.id });

        if (error) throw error;

        container.innerHTML = ''; // লোডার সরানো

        if (!partners || partners.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:50px 20px; color:#999;">
                    <i class="fas fa-comment-dots" style="font-size: 30px; margin-bottom:10px;"></i>
                    <h3 style="margin:0;">No Messages</h3>
                    <p>Start a conversation with someone.</p>
                </div>`;
            return;
        }

        // চ্যাট লিস্ট রেন্ডার করা
        for (const chat of partners) {
            const { data: user } = await supabaseClient
                .from('users')
                .select('display_name, photo_url, last_seen')
                .eq('id', chat.partner_id)
                .single();
            
            const timeString = timeAgoShort(chat.last_message_time);
            const isUnread = chat.unread_count > 0;
            let msgPreview = chat.last_message_content || 'Sent an attachment';
            
            if (msgPreview === '👍') msgPreview = 'Like 👍';

            // অনলাইন চেক (৫ মিনিটের মধ্যে অ্যাক্টিভ থাকলে)
            const isOnline = user.last_seen && (new Date() - new Date(user.last_seen) < 5 * 60 * 1000);

            // HTML তৈরি
            const html = `
                <div class="chat-item-row" onclick="openChat('${chat.partner_id}')">
                    <div class="chat-avatar">
                        <img src="${user?.photo_url || './images/default-avatar.png'}" alt="User">
                        ${isOnline ? '<div class="online-status-dot"></div>' : ''}
                    </div>
                    <div class="chat-info">
                        <h4 class="chat-name" style="${isUnread ? 'font-weight:700;color:black;' : ''}">${user?.display_name || 'Unknown'}</h4>
                        <div class="chat-preview">
                            <span class="msg-text" style="${isUnread ? 'font-weight:700;color:black;' : ''}">
                                ${msgPreview.substring(0, 30)}${msgPreview.length > 30 ? '...' : ''}
                            </span>
                            <span class="msg-dot">· ${timeString}</span>
                        </div>
                    </div>
                    ${isUnread ? '<div class="unread-dot"></div>' : ''}
                </div>`;
            container.insertAdjacentHTML('beforeend', html);
        }

    } catch (err) {
        console.error("Chat list error:", err);
        container.innerHTML = `<p style="text-align:center; color:red;">Error loading chats.</p>`;
    }
}

// ==========================
// ৪. চ্যাট রুম ওপেন করা
// ==========================
async function openChat(partnerId) {
    activeChatUserId = partnerId;
    
    // ভিউ পরিবর্তন
    document.getElementById('inbox-view').style.display = 'none';
    document.getElementById('conversation-view').style.display = 'flex';
    
    // চ্যাট লোডার
    const msgContainer = document.getElementById('messageContainer');
    msgContainer.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%;"><div class="loader"></div></div>';
    
    // রিপ্লাই রিসেট
    replyToId = null;
    document.getElementById('replyPreviewBar').style.display = 'none';

    try {
        // ১. ব্লক চেক করা
        const { data: blocked } = await supabaseClient
            .from('user_blocks')
            .select('*')
            .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`)
            .or(`blocker_id.eq.${partnerId},blocked_id.eq.${partnerId}`);
        
        if (blocked && blocked.length > 0) {
            console.log("This user conversation is blocked.");
        }

        // ২. ইউজারের তথ্য আনা
        const { data: user } = await supabaseClient
            .from('users')
            .select('*')
            .eq('id', partnerId)
            .single();
            
        if (user) {
            document.getElementById('chatHeaderName').innerText = user.display_name;
            document.getElementById('chatHeaderImg').src = user.photo_url || './images/default-avatar.png';
            
            // অনলাইন স্ট্যাটাস দেখানো
            const isOnline = user.last_seen && (new Date() - new Date(user.last_seen) < 5 * 60 * 1000);
            document.getElementById('headerActiveDot').style.display = isOnline ? 'block' : 'none';
            document.getElementById('chatHeaderStatus').innerText = isOnline ? 'Active now' : `Last seen ${timeAgoShort(user.last_seen)}`;
        }

        // ৩. মেসেজ লোড এবং রিয়েলটাইম সেটআপ
        await loadMessages(partnerId);
        setupRealtimeChat(partnerId);
        setupPresence(partnerId); 

    } catch (err) { 
        console.error("Open chat error:", err); 
    }
}

// মেসেজ লোড ফাংশন
async function loadMessages(partnerId) {
    const container = document.getElementById('messageContainer');
    
    // ডিলিট করা মেসেজ বাদে বাকিগুলো আনা
    const { data: messages, error } = await supabaseClient
        .from('messages')
        .select(`
            *, 
            reply_message:reply_to_id(content, sender_id, image_url, audio_url)
        `)
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .or(`sender_id.eq.${partnerId},receiver_id.eq.${partnerId}`)
        .not('deleted_by', 'cs', `{"${currentUser.id}"}`) // ডিলিটেড ফিল্টার
        .order('created_at', { ascending: true });

    container.innerHTML = ''; // ক্লিয়ার লোডার

    if (messages && messages.length > 0) {
        messages.forEach(msg => appendMessageToUI(msg));
        scrollToBottom(false); 
    } else {
        const pImg = document.getElementById('chatHeaderImg').src;
        const pName = document.getElementById('chatHeaderName').innerText;
        
        container.innerHTML = `
            <div class="empty-chat-placeholder">
                <img src="${pImg}" style="width:80px;height:80px;border-radius:50%;margin-bottom:10px;object-fit:cover;">
                <h3>${pName}</h3>
                <p>Say Hi 👋 to start chatting.</p>
            </div>`;
    }
    
    markAsSeen(partnerId);
}

// ==========================
// ৫. মেসেজ পাঠানো (টেক্সট, ছবি, রিপ্লাই)
// ==========================
async function sendMessage() {
    if (isUploading) return;

    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    // খালি মেসেজ হ্যান্ডলিং
    if (!text && !selectedImageFile) {
        sendLikeEmoji(activeChatUserId); 
        return;
    }

    // লোডিং শুরু
    isUploading = true;
    const sendBtnIcon = document.querySelector('#sendMessageBtn i');
    const originalIcon = sendBtnIcon.className;
    sendBtnIcon.className = 'fas fa-spinner fa-spin';

    let imageUrl = null;

    // ইমেজ আপলোড
    if (selectedImageFile) {
        try {
            imageUrl = await uploadFile(selectedImageFile, 'chat_images');
            if (!imageUrl) {
                alert("ছবি আপলোড ব্যর্থ হয়েছে।");
                isUploading = false;
                sendBtnIcon.className = originalIcon;
                return;
            }
        } catch (error) {
            console.error("Image Upload Error:", error);
            isUploading = false;
            sendBtnIcon.className = originalIcon;
            return;
        }
    }

    // মেসেজ অবজেক্ট
    const newMessage = { 
        sender_id: currentUser.id, 
        receiver_id: activeChatUserId, 
        content: text || null, 
        image_url: imageUrl, 
        is_read: false,
        deleted_by: [], // ডিফল্ট খালি অ্যারে
        reply_to_id: replyToId // রিপ্লাই আইডি (যদি থাকে)
    };
    
    try {
        const { error } = await supabaseClient.from('messages').insert([newMessage]);
        if (error) throw error;
        
        // সফল হলে UI রিসেট
        input.value = '';
        closeImagePreview();
        cancelReply(); 
        
        const empty = document.querySelector('.empty-chat-placeholder');
        if(empty) empty.remove();
        
        document.getElementById('emojiPickerContainer').style.display = 'none';

    } catch (err) {
        console.error("Send failed:", err);
        alert("মেসেজ পাঠানো যায়নি।");
    } finally {
        isUploading = false; 
        sendBtnIcon.className = 'fas fa-thumbs-up'; 
        toggleSendButton();
    }
}

// লাইক পাঠানো
async function sendLikeEmoji(partnerId) {
    try {
        const empty = document.querySelector('.empty-chat-placeholder');
        if(empty) empty.remove();
        
        await supabaseClient.from('messages').insert([{ 
            sender_id: currentUser.id, 
            receiver_id: partnerId, 
            content: '👍', 
            is_read: false, 
            deleted_by: [] 
        }]);
    } catch (e) {}
}

// ফাইল আপলোড ফাংশন
async function uploadFile(file, bucketName) {
    try {
        let fileToUpload = file;
        
        // ইমেজ হলে কম্প্রেস করা
        if(file.type.startsWith('image/') && typeof imageCompression !== 'undefined') {
            try {
                const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: true };
                fileToUpload = await imageCompression(file, options);
            } catch (cErr) {
                console.warn("Compression skipped:", cErr);
            }
        }

        const ext = file.name ? file.name.split('.').pop() : 'jpg';
        const fileName = `${currentUser.id}/${Date.now()}.${ext}`;
        
        const { data, error } = await supabaseClient.storage
            .from(bucketName)
            .upload(fileName, fileToUpload);
            
        if (error) throw error;
        
        const { data: urlData } = supabaseClient.storage
            .from(bucketName)
            .getPublicUrl(fileName);
            
        return urlData.publicUrl;
    } catch (err) { 
        console.error("Upload failed details:", err); 
        return null; 
    }
}

// ==========================
// ৬. Realtime & Presence
// ==========================
function setupRealtimeChat(partnerId) {
    if (realtimeSubscription) supabaseClient.removeChannel(realtimeSubscription);
    
    realtimeSubscription = supabaseClient.channel('chat-room')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async (payload) => {
            
            const eventType = payload.eventType;
            const newMsg = payload.new;
            const oldMsg = payload.old;

            // নতুন মেসেজ আসলে
            if (eventType === 'INSERT') {
                if ((newMsg.sender_id === partnerId && newMsg.receiver_id === currentUser.id) || 
                    (newMsg.sender_id === currentUser.id && newMsg.receiver_id === partnerId)) {
                    
                    const empty = document.querySelector('.empty-chat-placeholder'); 
                    if(empty) empty.remove();
                    
                    // রিপ্লাই ডাটা আনার জন্য আবার ফেচ করা
                    const { data } = await supabaseClient
                        .from('messages')
                        .select(`*, reply_message:reply_to_id(content, sender_id, image_url, audio_url)`)
                        .eq('id', newMsg.id)
                        .single();
                        
                    if (data) {
                        appendMessageToUI(data);
                        scrollToBottom(true);
                    }
                    
                    if (newMsg.sender_id === partnerId) markAsSeen(partnerId);
                }
            } 
            // মেসেজ ডিলিট হলে (Delete for Everyone)
            else if (eventType === 'DELETE') {
                const el = document.getElementById(`msg-${oldMsg.id}`);
                if (el) el.remove();
            }
            // মেসেজ আপডেট হলে (Delete for Me)
            else if (eventType === 'UPDATE') {
                if (newMsg.deleted_by && newMsg.deleted_by.includes(currentUser.id)) {
                    const el = document.getElementById(`msg-${newMsg.id}`);
                    if (el) el.remove();
                }
            }

        }).subscribe();
}

// টাইপিং ইন্ডিকেটর সেটআপ
function setupPresence(partnerId) {
    if (presenceChannel) supabaseClient.removeChannel(presenceChannel);

    presenceChannel = supabaseClient.channel(`presence-${partnerId}`)
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
            if (payload.userId === partnerId) {
                showTypingIndicator();
            }
        })
        .subscribe();
}

function sendTypingEvent() {
    if (presenceChannel) {
        presenceChannel.send({ 
            type: 'broadcast', 
            event: 'typing', 
            payload: { userId: currentUser.id } 
        });
    }
}

function showTypingIndicator() {
    const bubble = document.getElementById('typingIndicatorBubble');
    const container = document.getElementById('messageContainer');
    
    container.appendChild(bubble);
    bubble.style.display = 'flex';
    scrollToBottom(true);

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        bubble.style.display = 'none';
    }, 3000);
}

// ==========================
// ৭. UI রেন্ডারিং (মেসেজ)
// ==========================
function appendMessageToUI(msg) {
    // যদি ডিলিট করা থাকে তবে দেখাবো না
    if (msg.deleted_by && msg.deleted_by.includes(currentUser.id)) return;

    const container = document.getElementById('messageContainer');
    const isMe = msg.sender_id === currentUser.id;
    
    // রিপ্লাই অংশ তৈরি
    let replyHTML = '';
    if (msg.reply_message) {
        const rName = msg.reply_message.sender_id === currentUser.id ? 'You' : document.getElementById('chatHeaderName').innerText;
        let rText = msg.reply_message.content;
        
        if (!rText) {
            if (msg.reply_message.image_url) rText = '📷 Photo';
            else if (msg.reply_message.audio_url) rText = '🎤 Audio';
            else rText = 'Attachment';
        }
        
        replyHTML = `
            <div class="reply-context">
                <span class="reply-sender-name">${rName}</span>
                <span class="reply-text-content">${rText}</span>
            </div>`;
    }

    let contentHTML = '';
    
    if (msg.image_url) {
        contentHTML += `<img src="${msg.image_url}" class="bubble-image" onclick="viewFullScreenImage('${msg.image_url}')">`;
    }
    
    if (msg.audio_url) {
        contentHTML += `
            <div class="audio-bubble" style="background: ${isMe ? '#0084ff' : '#e4e6eb'}; padding: 10px; border-radius: 15px;">
                <audio controls src="${msg.audio_url}" preload="metadata"></audio>
            </div>`;
    }
    
    if (msg.content) { 
        if (msg.content === '👍') {
            contentHTML += `<span style="font-size: 40px; margin: 5px;">👍</span>`; 
        } else {
            contentHTML += `<div class="bubble">${replyHTML}${msg.content}</div>`;
        }
    } else if(replyHTML) {
        // শুধু রিপ্লাই থাকলে
        contentHTML += `<div class="bubble">${replyHTML}</div>`;
    }

    const bubbleClass = (msg.content === '👍' || (!msg.content && !replyHTML && msg.image_url)) ? 'bg-transparent' : '';
    const partnerImgSrc = document.getElementById('chatHeaderImg').src;

    // লং প্রেস ইভেন্ট সহ মেসেজ রো
    const html = `
        <div class="message-row ${isMe ? 'sent' : 'received'}" id="msg-${msg.id}">
            ${!isMe ? `<img src="${partnerImgSrc}" class="msg-avatar">` : ''}
            <div class="message-content ${bubbleClass}" 
                 style="display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'}"
                 onmousedown="handleMessagePressStart(this, '${msg.id}', ${isMe}, '${msg.content || 'Media'}')" 
                 ontouchstart="handleMessagePressStart(this, '${msg.id}', ${isMe}, '${msg.content || 'Media'}')" 
                 onmouseup="handleMessagePressEnd()" 
                 ontouchend="handleMessagePressEnd()"
                 oncontextmenu="return false;"> <!-- রাইট ক্লিক বন্ধ -->
                ${contentHTML}
            </div>
        </div>`;
    
    // টাইপিং বাবল সবসময় নিচে রাখতে হবে
    const typingBubble = document.getElementById('typingIndicatorBubble');
    if(typingBubble && typingBubble.parentNode === container) {
        container.insertBefore(parseHTML(html), typingBubble);
    } else {
        container.insertAdjacentHTML('beforeend', html);
    }
}

function parseHTML(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content.cloneNode(true);
}

// ==========================
// ৮. লং প্রেস ও রিপ্লাই লজিক
// ==========================
function handleMessagePressStart(el, msgId, isMyMessage, msgText) {
    selectedMessageId = msgId;
    selectedMessageText = msgText;
    
    // ৮০০ মিলি সেকেন্ড চাপলে মেনু আসবে
    pressTimer = setTimeout(() => {
        showDeleteOptions(isMyMessage);
        // ভাইব্রেশন
        if (navigator.vibrate) navigator.vibrate(50);
    }, 600);
}

function handleMessagePressEnd() {
    clearTimeout(pressTimer);
}

function showDeleteOptions(isMyMessage) {
    const modal = document.getElementById('deleteOptionsModal');
    const deleteForEveryoneBtn = document.getElementById('deleteForEveryoneBtn');
    
    if (isMyMessage) {
        deleteForEveryoneBtn.style.display = 'block';
    } else {
        deleteForEveryoneBtn.style.display = 'none';
    }
    
    modal.style.display = 'flex';
}

function initiateReply() {
    if (!selectedMessageId) return;
    replyToId = selectedMessageId;
    
    const bar = document.getElementById('replyPreviewBar');
    bar.style.display = 'flex';
    bar.querySelector('.reply-to-name').innerText = 'Replying...';
    bar.querySelector('.reply-text-preview').innerText = selectedMessageText.substring(0, 30) + '...';
    
    closeDeleteModal();
    document.getElementById('messageInput').focus();
}

function cancelReply() {
    replyToId = null;
    document.getElementById('replyPreviewBar').style.display = 'none';
}

// ডিলিট লজিক
async function deleteMessageForMe() {
    if (!selectedMessageId) return;
    try {
        const { data } = await supabaseClient.from('messages').select('deleted_by').eq('id', selectedMessageId).single();
        let current = data?.deleted_by || [];
        
        if (!current.includes(currentUser.id)) {
            current.push(currentUser.id);
            await supabaseClient.from('messages').update({ deleted_by: current }).eq('id', selectedMessageId);
            
            const el = document.getElementById(`msg-${selectedMessageId}`);
            if(el) el.remove();
        }
        closeDeleteModal();
    } catch (e) {
        console.error(e);
        alert("Failed to delete.");
    }
}

async function deleteMessageForEveryone() {
    if (!selectedMessageId) return;
    if(!confirm("Are you sure you want to delete this for everyone?")) return;

    try {
        await supabaseClient.from('messages').delete().eq('id', selectedMessageId);
        closeDeleteModal();
    } catch (e) {
        console.error(e);
        alert("Failed to delete.");
    }
}

async function blockUser() {
    if (!activeChatUserId || !confirm("Block this user?")) return;
    try {
        await supabaseClient.from('user_blocks').insert({ blocker_id: currentUser.id, blocked_id: activeChatUserId });
        alert("User blocked.");
        location.reload();
    } catch (e) {
        alert("Error blocking user.");
    }
}

function closeDeleteModal() {
    document.getElementById('deleteOptionsModal').style.display = 'none';
    selectedMessageId = null;
}

// ==========================
// ৯. ভয়েস রেকর্ডিং
// ==========================
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.start();
        isRecording = true;
        
        document.getElementById('audioRecordingUI').style.display = 'flex';
        // ফুটার হাইড করা (শুধুমাত্র ফুটার অংশ, পুরোটা নয়)
        document.querySelector('.footer-input-row').style.display = 'none';
        
        let seconds = 0;
        document.getElementById('recordingTimer').innerText = "00:00";
        recordingInterval = setInterval(() => {
            seconds++;
            const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
            const secs = (seconds % 60).toString().padStart(2, '0');
            document.getElementById('recordingTimer').innerText = `${mins}:${secs}`;
        }, 1000);
        
    } catch (err) {
        console.error(err);
        alert("Microphone access needed.");
    }
}

function cancelRecording() {
    if (mediaRecorder) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        mediaRecorder = null;
    }
    clearInterval(recordingInterval);
    closeRecordingUI();
}

function closeRecordingUI() {
    document.getElementById('audioRecordingUI').style.display = 'none';
    document.querySelector('.footer-input-row').style.display = 'flex'; // ফুটার আবার দেখানো
    isRecording = false;
}

async function sendRecording() {
    if (!mediaRecorder) return;
    
    mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const audioUrl = await uploadFile(audioBlob, 'chat_audio');
        
        if (audioUrl) {
            const empty = document.querySelector('.empty-chat-placeholder');
            if(empty) empty.remove();

            await supabaseClient.from('messages').insert([{ 
                sender_id: currentUser.id, 
                receiver_id: activeChatUserId, 
                audio_url: audioUrl,
                content: null,
                is_read: false,
                deleted_by: []
            }]);
        } else {
            alert("Audio send failed.");
        }
    };
    
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    clearInterval(recordingInterval);
    closeRecordingUI();
}

// ==========================
// ১০. ইভেন্ট লিসেনার
// ==========================
function setupEventListeners() {
    // ব্যাক বাটন
    document.getElementById('backToInboxBtn').addEventListener('click', () => {
        document.getElementById('conversation-view').style.display = 'none';
        document.getElementById('inbox-view').style.display = 'block';
        activeChatUserId = null;
        loadChatList(); 
    });
    
    // মেসেজ ইনপুট
    const input = document.getElementById('messageInput');
    input.addEventListener('input', () => { 
        toggleSendButton(); 
        sendTypingEvent(); 
    });
    input.addEventListener('keyup', (e) => { 
        if (e.key === 'Enter') sendMessage(); 
    });
    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
    
    // ইমেজ আপলোড
    document.getElementById('galleryTriggerBtn').addEventListener('click', () => document.getElementById('chatImageInput').click());
    
    document.getElementById('chatImageInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedImageFile = file;
            document.getElementById('uploadPreviewImg').src = URL.createObjectURL(file);
            document.getElementById('imagePreviewPanel').style.display = 'flex';
            toggleSendButton();
        }
    });
    document.getElementById('closePreviewBtn').addEventListener('click', closeImagePreview);
    
    // অডিও রেকর্ডার
    document.getElementById('micTriggerBtn').addEventListener('click', startRecording);
    document.getElementById('cancelRecordingBtn').addEventListener('click', cancelRecording);
    document.getElementById('sendRecordingBtn').addEventListener('click', sendRecording);
    
    // ফুল স্ক্রিন ইমেজ ক্লোজ
    document.querySelector('.fs-close-btn').addEventListener('click', () => { 
        document.getElementById('fullScreenImageModal').style.display = 'none'; 
    });

    // ইমোজি পিকার
    const emojiBtn = document.getElementById('emojiTriggerBtn');
    const picker = document.getElementById('emojiPickerContainer');
    
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    });

    document.querySelector('emoji-picker').addEventListener('emoji-click', e => {
        input.value += e.detail.unicode;
        toggleSendButton();
        input.focus();
    });

    // বাইরে ক্লিক করলে মেনু বন্ধ
    document.addEventListener('click', (e) => {
        if (!picker.contains(e.target) && !emojiBtn.contains(e.target)) {
            picker.style.display = 'none';
        }
        
        const optsMenu = document.getElementById('chatOptionsDropdown');
        const optsBtn = document.getElementById('chatOptionsBtn');
        if(!optsMenu.contains(e.target) && !optsBtn.contains(e.target)) {
            optsMenu.style.display = 'none';
        }
    });

    // ডিলিট এবং রিপ্লাই মডাল লিসেনার
    document.getElementById('deleteForMeBtn').addEventListener('click', deleteMessageForMe);
    document.getElementById('deleteForEveryoneBtn').addEventListener('click', deleteMessageForEveryone);
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);
    document.getElementById('replyOptionBtn').addEventListener('click', initiateReply);
    document.getElementById('cancelReplyBtn').addEventListener('click', cancelReply);

    // হেডার অপশন
    document.getElementById('chatOptionsBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = document.getElementById('chatOptionsDropdown');
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    document.getElementById('blockUserBtn').addEventListener('click', blockUser);
}

// ==========================
// ১১. হেল্পার ফাংশনস
// ==========================
function closeImagePreview() {
    selectedImageFile = null;
    document.getElementById('chatImageInput').value = '';
    document.getElementById('imagePreviewPanel').style.display = 'none';
    toggleSendButton();
}

function toggleSendButton() {
    const val = document.getElementById('messageInput').value.trim();
    const icon = document.querySelector('#sendMessageBtn i');
    
    if (val !== '' || selectedImageFile) { 
        icon.className = 'fas fa-paper-plane'; 
        icon.style.color = '#0084ff'; 
    } 
    else { 
        icon.className = 'fas fa-thumbs-up'; 
        icon.style.color = '#0084ff'; 
    }
}

function timeAgoShort(dateString) { return dateString ? 'Just now' : ''; } // সিম্পলিফাইড

async function markAsSeen(partnerId) {
    try { 
        await supabaseClient
            .from('messages')
            .update({ is_read: true })
            .match({ sender_id: partnerId, receiver_id: currentUser.id, is_read: false }); 
    } catch (e) {}
}

function scrollToBottom(smooth = false) { 
    const main = document.getElementById('messageContainer'); 
    main.scrollTo({ top: main.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); 
}

window.viewFullScreenImage = function(src) {
    const modal = document.getElementById('fullScreenImageModal');
    document.getElementById('fsModalImg').src = src;
    document.getElementById('downloadImgBtn').href = src;
    modal.style.display = 'flex';
}