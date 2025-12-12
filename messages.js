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
let typingTimeout = null;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let recordingInterval = null;
let selectedImageFile = null;
let isUploading = false;
let replyToId = null;
let selectedMessageId = null;
let selectedMessageText = null;
let pressTimer;

// ==========================
// ১. ইনিশিয়ালাইজেশন
// ==========================
document.addEventListener('DOMContentLoaded', async () => {
    // সেশন চেক
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session) { 
        window.location.href = '/index.html'; 
        return; 
    }
    
    currentUser = session.user;
    
    // ডাটা লোড
    loadMyProfile();
    updateMyLastSeen();
    setInterval(updateMyLastSeen, 60000); // প্রতি মিনিটে লাস্ট সিন আপডেট

    // UI লোড
    loadActiveUsersHorizontal();
    loadChatList();
    
    // রিয়েলটাইম স্ট্যাটাস লিসেনার (গ্রিন ডটের জন্য)
    setupUserStatusListener();

    // ইভেন্ট লিসেনার সেটআপ
    setupEventListeners();
    
    // --- সার্চ বাটন লজিক ---
    document.getElementById('openSearchBtn').addEventListener('click', () => {
        document.getElementById('floatingSearchBar').style.display = 'flex';
        document.getElementById('chatSearchInput').focus();
    });

    document.getElementById('closeSearchBtn').addEventListener('click', () => {
        document.getElementById('floatingSearchBar').style.display = 'none';
        document.getElementById('chatSearchInput').value = '';
        filterChatList(''); // ফিল্টার রিসেট
    });

    document.getElementById('chatSearchInput').addEventListener('input', (e) => {
        filterChatList(e.target.value.toLowerCase());
    });
});

// ==========================
// ২. প্রোফাইল ও স্ট্যাটাস
// ==========================
async function loadMyProfile() {
    try {
        const { data } = await supabaseClient.from('users').select('photo_url').eq('id', currentUser.id).single();
        const el = document.getElementById('myHeaderAvatar');
        if (el) {
            el.innerHTML = data?.photo_url ? `<img src="${data.photo_url}">` : '<img src="./images/default-avatar.png">';
        }
    } catch (e) { console.error(e); }
}

async function updateMyLastSeen() {
    if (!currentUser) return;
    try {
        await supabaseClient.from('users').update({ last_seen: new Date() }).eq('id', currentUser.id);
    } catch (e) {}
}

// সময় ঠিক করা (Fix for "Just now")
function timeAgoShort(dateString) {
    if (!dateString) return '';
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    
    const weeks = Math.floor(days / 7);
    return `${weeks}w`;
}

// রিয়েলটাইম অনলাইন স্ট্যাটাস লিসেনার (Green Dot Fix)
function setupUserStatusListener() {
    supabaseClient.channel('public-users-status')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
        const user = payload.new;
        // ৫ মিনিটের মধ্যে অ্যাক্টিভ থাকলে অনলাইন ধরব
        const isOnline = user.last_seen && (new Date() - new Date(user.last_seen) < 5 * 60 * 1000);
        
        // ১. চ্যাট লিস্টে ডট আপডেট
        const listDot = document.querySelector(`.chat-item-row[data-user-id="${user.id}"] .online-status-dot`);
        if (listDot) listDot.style.display = isOnline ? 'block' : 'none';

        // ২. উপরের স্টোরি লিস্টে ডট আপডেট
        const storyDot = document.querySelector(`.story-avatar-item[data-user-id="${user.id}"] .story-online-dot`);
        if (storyDot) storyDot.style.display = isOnline ? 'block' : 'none';

        // ৩. চ্যাট রুমে থাকলে হেডার আপডেট
        if (activeChatUserId === user.id) {
            const headerDot = document.getElementById('headerActiveDot');
            const statusText = document.getElementById('chatHeaderStatus');
            
            if (headerDot) headerDot.style.display = isOnline ? 'block' : 'none';
            if (statusText) statusText.innerText = isOnline ? 'Active now' : `Active ${timeAgoShort(user.last_seen)} ago`;
        }
    })
    .subscribe();
}

// চ্যাট ফিল্টার লজিক (Search Function)
function filterChatList(term) {
    const rows = document.querySelectorAll('.chat-item-row');
    rows.forEach(row => {
        const name = row.querySelector('.chat-name').innerText.toLowerCase();
        if (name.includes(term)) {
            row.style.display = 'flex';
        } else {
            row.style.display = 'none';
        }
    });
}

// ==========================
// ৩. হরাইজন্টাল অ্যাক্টিভ ইউজার লিস্ট
// ==========================
async function loadActiveUsersHorizontal() {
    const container = document.getElementById('activeUsersBar');
    if(!container) return;

    try {
        const { data: users, error } = await supabaseClient
            .from('users')
            .select('id, display_name, photo_url, last_seen')
            .neq('id', currentUser.id)
            .order('last_seen', { ascending: false }) // যারা রিসেন্টলি অ্যাক্টিভ তারা আগে থাকবে
            .limit(15);

        if (error) throw error;

        // ডিফল্ট "Your Note" বাটন
        container.innerHTML = `
            <div class="story-avatar-item">
                <div class="story-img-wrapper" style="border:none; box-shadow:none;">
                    <div class="add-note-icon">
                        <i class="fas fa-plus"></i>
                    </div>
                </div>
                <span class="story-name">Note</span>
            </div>
        `;

        if (users && users.length > 0) {
            users.forEach(u => {
                const isOnline = u.last_seen && (new Date() - new Date(u.last_seen) < 5 * 60 * 1000);
                const name = u.display_name ? u.display_name.split(' ')[0] : 'User';
                
                container.innerHTML += `
                    <div class="story-avatar-item" onclick="openChat('${u.id}')" data-user-id="${u.id}">
                        <div class="story-img-wrapper">
                            <img src="${u.photo_url || './images/default-avatar.png'}" alt="${name}">
                            <div class="story-online-dot" style="display:${isOnline ? 'block' : 'none'}"></div>
                        </div>
                        <span class="story-name" style="${isOnline ? 'font-weight:700;color:black;' : ''}">${name}</span>
                    </div>`;
            });
        }
    } catch (e) {
        console.error("Error loading active users:", e);
    }
}

// ==========================
// ৪. ভার্টিকাল চ্যাট লিস্ট
// ==========================
async function loadChatList() {
    const container = document.getElementById('chatListContainer');
    container.innerHTML = `<div class="loader-container" style="padding-top:50px;"><div class="loader"></div></div>`;
    
    try {
        const { data: partners, error } = await supabaseClient.rpc('get_chat_partners', { user_id: currentUser.id });
        
        container.innerHTML = '';
        if (error || !partners || partners.length === 0) {
            container.innerHTML = `<div style="text-align:center;padding:50px;color:#999;"><h3>No messages yet</h3><p>Start chatting with someone!</p></div>`;
            return;
        }

        // প্রত্যেক পার্টনারের ডিটেইলস লোড করা
        for (const chat of partners) {
            const { data: user } = await supabaseClient.from('users').select('*').eq('id', chat.partner_id).single();
            if (!user) continue;

            const isOnline = user.last_seen && (new Date() - new Date(user.last_seen) < 5 * 60 * 1000);
            const timeStr = timeAgoShort(chat.last_message_time);
            const isUnread = chat.unread_count > 0;
            
            let preview = chat.last_message_content || 'Sent an attachment';
            if (chat.last_message_content === '👍') preview = 'Like 👍';

            // HTML তৈরি
            const html = `
                <div class="chat-item-row" onclick="openChat('${chat.partner_id}')" data-user-id="${chat.partner_id}">
                    <div class="chat-avatar">
                        <img src="${user.photo_url || './images/default-avatar.png'}" alt="${user.display_name}">
                        <div class="online-status-dot" style="display:${isOnline ? 'block' : 'none'}"></div>
                    </div>
                    <div class="chat-info">
                        <h4 class="chat-name" style="${isUnread ? 'font-weight:700;color:black;' : ''}">${user.display_name}</h4>
                        <div class="chat-preview">
                            <span class="msg-text" style="${isUnread ? 'font-weight:700;color:black;' : ''}">${preview}</span>
                            <span class="msg-dot">· ${timeStr}</span>
                        </div>
                    </div>
                    ${isUnread ? '<div class="unread-dot"></div>' : ''}
                </div>`;
            container.insertAdjacentHTML('beforeend', html);
        }
    } catch (err) {
        console.error("Chat list error:", err);
        container.innerHTML = `<p style="text-align:center;color:red;">Error loading chats.</p>`;
    }
}

// ==========================
// ৫. চ্যাট রুম এবং মেসেজিং
// ==========================
async function openChat(partnerId) {
    activeChatUserId = partnerId;
    
    // ভিউ পরিবর্তন
    document.getElementById('inbox-view').style.display = 'none';
    document.getElementById('conversation-view').style.display = 'flex';
    
    // লোডার
    const msgContainer = document.getElementById('messageContainer');
    msgContainer.innerHTML = '<div style="display:flex;justify-content:center;height:100%;align-items:center;"><div class="loader"></div></div>';

    // হেডার ইনফো আপডেট
    try {
        const { data: user } = await supabaseClient.from('users').select('*').eq('id', partnerId).single();
        if (user) {
            document.getElementById('chatHeaderName').innerText = user.display_name;
            document.getElementById('chatHeaderImg').src = user.photo_url || './images/default-avatar.png';
            
            const isOnline = user.last_seen && (new Date() - new Date(user.last_seen) < 5 * 60 * 1000);
            document.getElementById('headerActiveDot').style.display = isOnline ? 'block' : 'none';
            document.getElementById('chatHeaderStatus').innerText = isOnline ? 'Active now' : `Active ${timeAgoShort(user.last_seen)} ago`;
        }
    } catch(e) {}

    // মেসেজ লোড এবং সেটআপ
    loadMessages(partnerId);
    setupRealtimeChat(partnerId);
    setupPresence(partnerId);
}

async function loadMessages(partnerId) {
    const container = document.getElementById('messageContainer');
    
    const { data: messages } = await supabaseClient
        .from('messages')
        .select(`*, reply_message:reply_to_id(content, image_url, audio_url)`)
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .or(`sender_id.eq.${partnerId},receiver_id.eq.${partnerId}`)
        .order('created_at', { ascending: true });

    container.innerHTML = '';
    
    if (messages && messages.length > 0) {
        messages.forEach(msg => appendMessageToUI(msg));
    } else {
        const pName = document.getElementById('chatHeaderName').innerText;
        const pImg = document.getElementById('chatHeaderImg').src;
        container.innerHTML = `
            <div class="empty-chat-placeholder" style="text-align:center;margin-top:50px;opacity:0.6;">
                <img src="${pImg}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">
                <h3 style="margin-top:10px;">${pName}</h3>
                <p>Say Hi 👋 to start chatting.</p>
            </div>`;
    }
    
    scrollToBottom(false);
    
    // মেসেজ সিন করা
    await supabaseClient.from('messages').update({ is_read: true }).match({ sender_id: partnerId, receiver_id: currentUser.id, is_read: false });
}

// মেসেজ রেন্ডারিং
function appendMessageToUI(msg) {
    // ডিলিট করা মেসেজ ফিল্টার
    if (msg.deleted_by && msg.deleted_by.includes(currentUser.id)) return;

    const isMe = msg.sender_id === currentUser.id;
    const container = document.getElementById('messageContainer');
    
    // রিপ্লাই অংশ
    let replyHTML = '';
    if (msg.reply_message) {
        let rText = msg.reply_message.content || 'Attachment';
        if (!msg.reply_message.content && msg.reply_message.image_url) rText = '📷 Photo';
        if (!msg.reply_message.content && msg.reply_message.audio_url) rText = '🎤 Audio';
        
        replyHTML = `<div class="reply-context"><span class="reply-sender-name">${isMe ? 'You replied' : 'Replied to you'}</span><span class="reply-text-content">${rText}</span></div>`;
    }

    let contentHTML = '';
    
    // ছবি
    if (msg.image_url) {
        contentHTML += `<img src="${msg.image_url}" class="bubble-image" onclick="viewFullScreenImage('${msg.image_url}')">`;
    }
    
    // অডিও
    if (msg.audio_url) {
        contentHTML += `<div class="audio-bubble" style="background:${isMe?'#0084ff':'#e4e6eb'};padding:10px;border-radius:15px;"><audio controls src="${msg.audio_url}"></audio></div>`;
    }
    
    // টেক্সট
    if (msg.content) {
        if(msg.content === '👍') {
            contentHTML += `<span style="font-size:40px;">👍</span>`;
        } else {
            contentHTML += `<div class="bubble">${replyHTML}${msg.content}</div>`;
        }
    } else if (replyHTML && !msg.image_url && !msg.audio_url) {
        contentHTML += `<div class="bubble">${replyHTML}</div>`;
    }

    // বাবলের ব্যাকগ্রাউন্ড মুছে ফেলার লজিক (শুধু ইমোজি বা ছবির জন্য)
    const bubbleClass = (msg.content === '👍' || (!msg.content && !replyHTML && msg.image_url)) ? 'bg-transparent' : '';
    const partnerImgSrc = document.getElementById('chatHeaderImg').src;

    const html = `
        <div class="message-row ${isMe ? 'sent' : 'received'}" id="msg-${msg.id}">
            ${!isMe ? `<img src="${partnerImgSrc}" class="msg-avatar">` : ''}
            <div class="message-content ${bubbleClass}" 
                 onmousedown="handleMessagePressStart(this, '${msg.id}', ${isMe}, '${msg.content}')"
                 ontouchstart="handleMessagePressStart(this, '${msg.id}', ${isMe}, '${msg.content}')"
                 ontouchend="clearTimeout(pressTimer)"
                 oncontextmenu="return false;">
                ${contentHTML}
            </div>
        </div>`;
    
    // টাইপিং বাবল নিচে রাখার জন্য
    const typingBubble = document.getElementById('typingIndicatorBubble');
    if (typingBubble && typingBubble.parentNode === container) {
        container.insertBefore(parseHTML(html), typingBubble);
    } else {
        container.insertAdjacentHTML('beforeend', html);
    }
}

function parseHTML(html) { const t = document.createElement('template'); t.innerHTML = html; return t.content.cloneNode(true); }
function scrollToBottom(smooth) { const c = document.getElementById('messageContainer'); c.scrollTo({ top: c.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }

// ==========================
// ৬. ইনপুট ও ইভেন্ট লিসেনার
// ==========================
function setupEventListeners() {
    // ব্যাক বাটন
    document.getElementById('backToInboxBtn').addEventListener('click', () => {
        document.getElementById('conversation-view').style.display = 'none';
        document.getElementById('inbox-view').style.display = 'block';
        activeChatUserId = null;
        if(realtimeSubscription) supabaseClient.removeChannel(realtimeSubscription);
        loadChatList(); // লিস্ট রিফ্রেশ
    });

    // ইনপুট হ্যান্ডলিং
    const input = document.getElementById('messageInput');
    input.addEventListener('input', () => {
        const btn = document.querySelector('#sendMessageBtn i');
        btn.className = input.value.trim() ? 'fas fa-paper-plane' : 'fas fa-thumbs-up';
        
        // টাইপিং স্ট্যাটাস পাঠানো
        if (presenceChannel) {
            presenceChannel.send({ type: 'broadcast', event: 'typing', payload: { userId: currentUser.id } });
        }
    });

    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
    input.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });

    // লং প্রেস হ্যান্ডলার (Delete/Reply)
    window.handleMessagePressStart = (el, id, isMe, text) => {
        selectedMessageId = id; selectedMessageText = text;
        pressTimer = setTimeout(() => {
            document.getElementById('deleteOptionsModal').style.display = 'flex';
            document.getElementById('deleteForEveryoneBtn').style.display = isMe ? 'block' : 'none';
            if(navigator.vibrate) navigator.vibrate(50);
        }, 600);
    };

    document.getElementById('cancelDeleteBtn').addEventListener('click', () => document.getElementById('deleteOptionsModal').style.display = 'none');
    
    // রিপ্লাই
    document.getElementById('replyOptionBtn').addEventListener('click', () => {
        replyToId = selectedMessageId;
        document.getElementById('replyPreviewBar').style.display = 'flex';
        document.querySelector('.reply-text-preview').innerText = selectedMessageText || 'Attachment';
        document.getElementById('deleteOptionsModal').style.display = 'none';
        document.getElementById('messageInput').focus();
    });
    
    document.getElementById('cancelReplyBtn').addEventListener('click', () => {
        replyToId = null;
        document.getElementById('replyPreviewBar').style.display = 'none';
    });

    // ডিলিট অ্যাকশন
    document.getElementById('deleteForMeBtn').addEventListener('click', deleteMessageForMe);
    document.getElementById('deleteForEveryoneBtn').addEventListener('click', deleteMessageForEveryone);

    // ইমেজ আপলোড ট্রিগার
    document.getElementById('galleryTriggerBtn').addEventListener('click', () => document.getElementById('chatImageInput').click());
    document.getElementById('chatImageInput').addEventListener('change', handleImageSelect);
    document.getElementById('closePreviewBtn').addEventListener('click', closeImagePreview);

    // অডিও রেকর্ডার
    document.getElementById('micTriggerBtn').addEventListener('click', startRecording);
    document.getElementById('cancelRecordingBtn').addEventListener('click', cancelRecording);
    document.getElementById('sendRecordingBtn').addEventListener('click', sendRecording);
}

// ==========================
// ৭. মেসেজ সেন্ডিং লজিক
// ==========================
async function sendMessage() {
    if (isUploading) return;
    const input = document.getElementById('messageInput');
    const text = input.value.trim();

    // থাম্বস আপ
    if (!text && !selectedImageFile) {
        await supabaseClient.from('messages').insert([{ sender_id: currentUser.id, receiver_id: activeChatUserId, content: '👍' }]);
        return;
    }

    isUploading = true;
    let imgUrl = null;

    // ইমেজ আপলোড
    if (selectedImageFile) {
        imgUrl = await uploadFile(selectedImageFile, 'chat_images');
        if(!imgUrl) { isUploading = false; return alert("Image upload failed"); }
    }

    const newMsg = {
        sender_id: currentUser.id,
        receiver_id: activeChatUserId,
        content: text || null,
        image_url: imgUrl,
        reply_to_id: replyToId
    };

    await supabaseClient.from('messages').insert([newMsg]);

    // রিসেট
    input.value = '';
    document.querySelector('#sendMessageBtn i').className = 'fas fa-thumbs-up';
    closeImagePreview();
    replyToId = null;
    document.getElementById('replyPreviewBar').style.display = 'none';
    isUploading = false;
    
    const empty = document.querySelector('.empty-chat-placeholder');
    if(empty) empty.remove();
}

// ইমেজ সিলেকশন
function handleImageSelect(e) {
    const file = e.target.files[0];
    if (file) {
        selectedImageFile = file;
        document.getElementById('uploadPreviewImg').src = URL.createObjectURL(file);
        document.getElementById('imagePreviewPanel').style.display = 'flex';
        document.querySelector('#sendMessageBtn i').className = 'fas fa-paper-plane';
    }
}

function closeImagePreview() {
    selectedImageFile = null;
    document.getElementById('chatImageInput').value = '';
    document.getElementById('imagePreviewPanel').style.display = 'none';
}

// আপলোড ফাংশন
async function uploadFile(file, bucket) {
    try {
        let uploadFile = file;
        if(file.type.startsWith('image/') && typeof imageCompression !== 'undefined') {
            uploadFile = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1200 });
        }
        const fileName = `${currentUser.id}/${Date.now()}.${file.name.split('.').pop()}`;
        const { data, error } = await supabaseClient.storage.from(bucket).upload(fileName, uploadFile);
        if (error) throw error;
        const { data: url } = supabaseClient.storage.from(bucket).getPublicUrl(fileName);
        return url.publicUrl;
    } catch (e) {
        console.error(e);
        return null;
    }
}

// ==========================
// ৮. অডিও রেকর্ডিং
// ==========================
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.start();
        isRecording = true;
        
        document.getElementById('audioRecordingUI').style.display = 'flex';
        document.querySelector('.footer-input-row').style.display = 'none';
        
        let sec = 0;
        document.getElementById('recordingTimer').innerText = "00:00";
        recordingInterval = setInterval(() => {
            sec++;
            document.getElementById('recordingTimer').innerText = `00:${sec < 10 ? '0'+sec : sec}`;
        }, 1000);
    } catch (e) { alert("Mic permission needed"); }
}

function cancelRecording() {
    if(mediaRecorder) mediaRecorder.stop();
    clearInterval(recordingInterval);
    closeRecordingUI();
}

function closeRecordingUI() {
    document.getElementById('audioRecordingUI').style.display = 'none';
    document.querySelector('.footer-input-row').style.display = 'flex';
    isRecording = false;
}

async function sendRecording() {
    if(!mediaRecorder) return;
    mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const url = await uploadFile(blob, 'chat_audio');
        if(url) {
            await supabaseClient.from('messages').insert([{
                sender_id: currentUser.id, receiver_id: activeChatUserId, audio_url: url
            }]);
        }
    };
    mediaRecorder.stop();
    clearInterval(recordingInterval);
    closeRecordingUI();
}

// ==========================
// ৯. রিয়েলটাইম এবং ডিলিট
// ==========================
function setupRealtimeChat(partnerId) {
    if (realtimeSubscription) supabaseClient.removeChannel(realtimeSubscription);
    
    realtimeSubscription = supabaseClient.channel('chat-room')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async (payload) => {
            const { eventType, new: newMsg, old: oldMsg } = payload;
            
            if (eventType === 'INSERT') {
                if ((newMsg.sender_id === partnerId && newMsg.receiver_id === currentUser.id) || 
                    (newMsg.sender_id === currentUser.id && newMsg.receiver_id === partnerId)) {
                    
                    const { data } = await supabaseClient.from('messages').select(`*, reply_message:reply_to_id(content)`).eq('id', newMsg.id).single();
                    appendMessageToUI(data || newMsg);
                    scrollToBottom(true);
                    
                    if(newMsg.sender_id === partnerId) {
                        await supabaseClient.from('messages').update({ is_read: true }).eq('id', newMsg.id);
                    }
                }
            } else if (eventType === 'DELETE') {
                const el = document.getElementById(`msg-${oldMsg.id}`);
                if(el) el.remove();
            } else if (eventType === 'UPDATE') {
                if (newMsg.deleted_by && newMsg.deleted_by.includes(currentUser.id)) {
                    const el = document.getElementById(`msg-${newMsg.id}`);
                    if(el) el.remove();
                }
            }
        })
        .subscribe();
}

function setupPresence(partnerId) {
    if (presenceChannel) supabaseClient.removeChannel(presenceChannel);
    const roomId = [currentUser.id, partnerId].sort().join('-');
    
    presenceChannel = supabaseClient.channel(`room-${roomId}`)
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
            if (payload.userId !== currentUser.id) {
                const b = document.getElementById('typingIndicatorBubble');
                document.getElementById('messageContainer').appendChild(b);
                b.style.display = 'flex';
                scrollToBottom(true);
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => b.style.display = 'none', 3000);
            }
        })
        .subscribe();
}

async function deleteMessageForMe() {
    if(!selectedMessageId) return;
    const { data } = await supabaseClient.from('messages').select('deleted_by').eq('id', selectedMessageId).single();
    let current = data?.deleted_by || [];
    if(!current.includes(currentUser.id)) {
        current.push(currentUser.id);
        await supabaseClient.from('messages').update({ deleted_by: current }).eq('id', selectedMessageId);
        document.getElementById(`msg-${selectedMessageId}`)?.remove();
    }
    document.getElementById('deleteOptionsModal').style.display = 'none';
}

async function deleteMessageForEveryone() {
    if(!selectedMessageId || !confirm("Delete for everyone?")) return;
    await supabaseClient.from('messages').delete().eq('id', selectedMessageId);
    document.getElementById('deleteOptionsModal').style.display = 'none';
}

window.viewFullScreenImage = function(src) {
    document.getElementById('fsModalImg').src = src;
    document.getElementById('downloadImgBtn').href = src;
    document.getElementById('fullScreenImageModal').style.display = 'flex';
};
document.querySelector('.fs-close-btn').addEventListener('click', () => {
    document.getElementById('fullScreenImageModal').style.display = 'none';
});