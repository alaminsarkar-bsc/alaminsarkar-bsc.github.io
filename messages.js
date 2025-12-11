/* --- START OF FILE messages.js --- */

// ================================================================
// ১. কনফিগারেশন এবং ক্রেডেনশিয়াল সেটআপ
// ================================================================
const SUPABASE_URL = 'https://pnsvptaanvtdaspqjwbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuc3ZwdGFhbnZ0ZGFzcHFqd2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMzcxNjMsImV4cCI6MjA3NTkxMzE2M30.qposYOL-W17DnFF11cJdZ7zrN1wh4Bop6YnclkUe_rU';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ZEGO CLOUD কনফিগারেশন
const ZEGO_APP_ID = 361002182;
const ZEGO_SERVER_SECRET = '723224a492e399607fc92fe644d60144';

// ================================================================
// ২. গ্লোবাল ভ্যারিয়েবল ডিক্লারেশন
// ================================================================
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

// লং প্রেস, ডিলিট এবং রিপ্লাই ভ্যারিয়েবল
let pressTimer;                      
let selectedMessageId = null;        
let selectedMessageText = null;      
let replyToId = null;                
let typingTimeout = null;            

// Zego Cloud ইন্সট্যান্স
let zp; 

// ================================================================
// ৩. অ্যাপ ইনিশিয়ালাইজেশন (লোডিং)
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // সেশন চেক করা হচ্ছে
    const { data: sessionData, error } = await supabaseClient.auth.getSession();
    
    if (error || !sessionData.session) {
        window.location.href = '/index.html';
        return;
    }
    
    currentUser = sessionData.session.user;
    
    // ZegoCloud কলিং সিস্টেম চালু করা
    initZegoCloud();

    // হেডার প্রোফাইল লোড করা
    loadMyProfile();
    
    // নিজের অনলাইন স্ট্যাটাস আপডেট করা
    updateMyLastSeen();
    setInterval(updateMyLastSeen, 60000); 

    // অন্য পেজ থেকে চ্যাট শুরু করতে চাইলে
    const startChatUser = localStorage.getItem('startChatWith');
    
    if (startChatUser) {
        localStorage.removeItem('startChatWith');
        openChat(startChatUser);
    } else {
        loadChatList();
    }
    
    setupEventListeners();
});

// ================================================================
// ৪. ZegoCloud কলিং সেটআপ ফাংশন
// ================================================================
async function initZegoCloud() {
    const userID = currentUser.id;
    const userName = currentUser.user_metadata.display_name || currentUser.email.split('@')[0];

    // কিট টোকেন জেনারেট করা
    const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
        ZEGO_APP_ID, 
        ZEGO_SERVER_SECRET, 
        null, 
        userID, 
        userName
    );

    // Zego Instance তৈরি করা
    zp = ZegoUIKitPrebuilt.create(kitToken);

    // প্লাগিন যুক্ত করা (কল রিং হওয়ার জন্য জরুরি)
    if (typeof ZegoUIKitSignalingPlugin !== 'undefined') {
        zp.addPlugins({ ZegoUIKitSignalingPlugin });
    }

    // ইনকামিং কলের কনফিগারেশন
    zp.setCallInvitationConfig({
        ringtoneConfig: {
            incomingCallFileName: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
            outgoingCallFileName: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
        }
    });
}

// কল শুরু করার ফাংশন
function startZegoCall(type) {
    if (!activeChatUserId) {
        alert("Please select a user to call.");
        return;
    }

    const partnerName = document.getElementById('chatHeaderName').innerText || 'User';

    zp.sendCallInvitation({
        callees: [{ userID: activeChatUserId, userName: partnerName }],
        callType: type === 'video' ? ZegoUIKitPrebuilt.InvitationType.VideoCall : ZegoUIKitPrebuilt.InvitationType.VoiceCall,
        timeout: 60, 
    }).then((res) => {
        if (res.errorInvitees.length) {
            alert("User is offline or unavailable right now.");
        }
    }).catch((err) => {
        console.error("Call Error:", err);
        alert("Failed to start call. Ensure you are on HTTPS or Localhost.");
    });
}

// ================================================================
// ৫. প্রোফাইল এবং স্ট্যাটাস ম্যানেজমেন্ট
// ================================================================
async function loadMyProfile() {
    try {
        const { data } = await supabaseClient.from('users').select('photo_url').eq('id', currentUser.id).single();
        const el = document.getElementById('myHeaderAvatar');
        if (el) {
            if (data?.photo_url) {
                el.innerHTML = `<img src="${data.photo_url}" alt="Me">`;
            } else {
                el.innerHTML = '<img src="./images/default-avatar.png" alt="Me">';
            }
        }
    } catch(e) {}
}

async function updateMyLastSeen() {
    try {
        await supabaseClient.from('users').update({ last_seen: new Date() }).eq('id', currentUser.id);
    } catch(e){}
}

// ================================================================
// ৬. চ্যাট লিস্ট লোড এবং রেন্ডার (Inbox)
// ================================================================
async function loadChatList() {
    const container = document.getElementById('chatListContainer');
    if(!container) return;
    
    container.innerHTML = `<div class="loader-container"><div class="loader"></div></div>`;

    try {
        const { data: partners, error } = await supabaseClient.rpc('get_chat_partners', { user_id: currentUser.id });

        if (error) throw error;

        container.innerHTML = ''; 

        if (!partners || partners.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:50px 20px; color:#999;"><i class="fas fa-comment-dots" style="font-size: 30px; margin-bottom:10px;"></i><h3 style="margin:0;">No Messages</h3><p>Start a conversation.</p></div>`;
            return;
        }

        for (const chat of partners) {
            const { data: user } = await supabaseClient.from('users').select('display_name, photo_url, last_seen').eq('id', chat.partner_id).single();
            
            const timeString = timeAgoShort(chat.last_message_time);
            const isUnread = chat.unread_count > 0;
            let msgPreview = chat.last_message_content || 'Sent an attachment';
            
            if (msgPreview === '👍') msgPreview = 'Like 👍';

            const isOnline = user.last_seen && (new Date() - new Date(user.last_seen) < 5 * 60 * 1000);
            const nameStyle = isUnread ? 'font-weight: 800; color: black;' : '';
            const msgStyle = isUnread ? 'font-weight: 700; color: black;' : '';

            const html = `
                <div class="chat-item-row" onclick="openChat('${chat.partner_id}')">
                    <div class="chat-avatar">
                        <img src="${user?.photo_url || './images/default-avatar.png'}" alt="User">
                        ${isOnline ? '<div class="online-status-dot"></div>' : ''}
                    </div>
                    <div class="chat-info">
                        <h4 class="chat-name" style="${nameStyle}">${user?.display_name || 'Unknown User'}</h4>
                        <div class="chat-preview">
                            <span class="msg-text" style="${msgStyle}">${msgPreview.substring(0, 25)}</span>
                            <span class="msg-dot">· ${timeString}</span>
                        </div>
                    </div>
                    ${isUnread ? '<div class="unread-dot"></div>' : ''}
                </div>`;
            container.insertAdjacentHTML('beforeend', html);
        }

    } catch (err) {
        container.innerHTML = `<p style="text-align:center; color:red;">Error loading chats.</p>`;
    }
}

// ================================================================
// ৭. চ্যাট রুম ওপেন এবং কনফিগারেশন
// ================================================================
async function openChat(partnerId) {
    activeChatUserId = partnerId;
    
    document.getElementById('inbox-view').style.display = 'none';
    document.getElementById('conversation-view').style.display = 'flex';
    document.getElementById('messageContainer').innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%;"><div class="loader"></div></div>';
    
    replyToId = null;
    document.getElementById('replyPreviewBar').style.display = 'none';

    try {
        // ব্লক চেক করা
        const { data: blocked } = await supabaseClient.from('user_blocks').select('*').or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`).or(`blocker_id.eq.${partnerId},blocked_id.eq.${partnerId}`);
        
        if (blocked && blocked.length > 0) {
            console.log("Conversation involves a blocked user.");
        }

        const { data: user } = await supabaseClient.from('users').select('*').eq('id', partnerId).single();
        if (user) {
            document.getElementById('chatHeaderName').innerText = user.display_name;
            document.getElementById('chatHeaderImg').src = user.photo_url || './images/default-avatar.png';
            
            const isOnline = user.last_seen && (new Date() - new Date(user.last_seen) < 5 * 60 * 1000);
            document.getElementById('headerActiveDot').style.display = isOnline ? 'block' : 'none';
            document.getElementById('chatHeaderStatus').innerText = isOnline ? 'Active now' : `Last seen ${timeAgoShort(user.last_seen)}`;
        }

        await loadMessages(partnerId);
        setupRealtimeChat(partnerId);
        setupPresence(partnerId); 

    } catch (err) { console.error(err); }
}

async function loadMessages(partnerId) {
    const container = document.getElementById('messageContainer');
    
    // আমার ডিলিট করা মেসেজ বাদে বাকিগুলো আনা
    const { data: messages, error } = await supabaseClient
        .from('messages')
        .select(`*, reply_message:reply_to_id(content, sender_id, image_url, audio_url)`)
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .or(`sender_id.eq.${partnerId},receiver_id.eq.${partnerId}`)
        .not('deleted_by', 'cs', `{"${currentUser.id}"}`) 
        .order('created_at', { ascending: true });

    container.innerHTML = ''; 

    if (messages && messages.length > 0) {
        messages.forEach(msg => appendMessageToUI(msg));
        scrollToBottom(false); 
    } else {
        const pImg = document.getElementById('chatHeaderImg').src;
        const pName = document.getElementById('chatHeaderName').innerText;
        container.innerHTML = `<div class="empty-chat-placeholder"><img src="${pImg}" style="width:80px;height:80px;border-radius:50%;margin-bottom:10px;object-fit:cover;"><h3>${pName}</h3><p>Say Hi 👋</p></div>`;
    }
    markAsSeen(partnerId);
}

// ================================================================
// ৮. মেসেজ পাঠানো (টেক্সট, ছবি, রিপ্লাই)
// ================================================================
async function sendMessage() {
    if (isUploading) return;

    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text && !selectedImageFile) {
        sendLikeEmoji(activeChatUserId); 
        return;
    }

    isUploading = true;
    const sendBtnIcon = document.querySelector('#sendMessageBtn i');
    const originalIcon = sendBtnIcon.className;
    sendBtnIcon.className = 'fas fa-spinner fa-spin';

    let imageUrl = null;

    if (selectedImageFile) {
        try {
            imageUrl = await uploadFile(selectedImageFile, 'chat_images');
            if (!imageUrl) {
                alert("Image upload failed.");
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

    const newMessage = { 
        sender_id: currentUser.id, 
        receiver_id: activeChatUserId, 
        content: text || null, 
        image_url: imageUrl, 
        is_read: false,
        deleted_by: [],
        reply_to_id: replyToId
    };
    
    try {
        await supabaseClient.from('messages').insert([newMessage]);
        input.value = '';
        closeImagePreview();
        cancelReply(); 
        
        const empty = document.querySelector('.empty-chat-placeholder');
        if(empty) empty.remove();
        
        document.getElementById('emojiPickerContainer').style.display = 'none';

    } catch (err) {
        console.error("Send failed:", err);
        alert("Failed to send message.");
    } finally {
        isUploading = false; 
        sendBtnIcon.className = 'fas fa-thumbs-up'; 
        toggleSendButton();
    }
}

async function sendLikeEmoji(partnerId) {
    try {
        const empty = document.querySelector('.empty-chat-placeholder');
        if(empty) empty.remove();
        await supabaseClient.from('messages').insert([{ sender_id: currentUser.id, receiver_id: partnerId, content: '👍', is_read: false, deleted_by: [] }]);
    } catch (e) {}
}

async function uploadFile(file, bucketName) {
    try {
        let fileToUpload = file;
        if(file.type.startsWith('image/') && typeof imageCompression !== 'undefined') {
            try {
                const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: true };
                fileToUpload = await imageCompression(file, options);
            } catch (cErr) {}
        }

        const ext = file.name ? file.name.split('.').pop() : 'jpg';
        const fileName = `${currentUser.id}/${Date.now()}.${ext}`;
        
        const { data, error } = await supabaseClient.storage.from(bucketName).upload(fileName, fileToUpload);
        if (error) throw error;
        const { data: urlData } = supabaseClient.storage.from(bucketName).getPublicUrl(fileName);
        return urlData.publicUrl;
    } catch (err) { return null; }
}

// ================================================================
// ৯. Realtime, Typing Indicator & Presence
// ================================================================
function setupRealtimeChat(partnerId) {
    if (realtimeSubscription) supabaseClient.removeChannel(realtimeSubscription);
    
    realtimeSubscription = supabaseClient.channel('chat-room')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async (payload) => {
            
            const eventType = payload.eventType;
            const newMsg = payload.new;
            const oldMsg = payload.old;

            if (eventType === 'INSERT') {
                if ((newMsg.sender_id === partnerId && newMsg.receiver_id === currentUser.id) || 
                    (newMsg.sender_id === currentUser.id && newMsg.receiver_id === partnerId)) {
                    
                    const empty = document.querySelector('.empty-chat-placeholder'); if(empty) empty.remove();
                    
                    const { data } = await supabaseClient.from('messages').select(`*, reply_message:reply_to_id(content, sender_id, image_url, audio_url)`).eq('id', newMsg.id).single();
                    if (data) { appendMessageToUI(data); scrollToBottom(true); }
                    if (newMsg.sender_id === partnerId) markAsSeen(partnerId);
                }
            } 
            else if (eventType === 'DELETE') {
                const el = document.getElementById(`msg-${oldMsg.id}`);
                if (el) el.remove();
            }
            else if (eventType === 'UPDATE') {
                if (newMsg.deleted_by && newMsg.deleted_by.includes(currentUser.id)) {
                    const el = document.getElementById(`msg-${newMsg.id}`);
                    if (el) el.remove();
                }
            }
        }).subscribe();
}

function setupPresence(partnerId) {
    if (presenceChannel) supabaseClient.removeChannel(presenceChannel);

    presenceChannel = supabaseClient.channel(`presence-${partnerId}`)
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
            if (payload.userId === partnerId) showTypingIndicator();
        })
        .subscribe();
}

function sendTypingEvent() {
    if (presenceChannel) {
        presenceChannel.send({ type: 'broadcast', event: 'typing', payload: { userId: currentUser.id } });
    }
}

function showTypingIndicator() {
    const bubble = document.getElementById('typingIndicatorBubble');
    const container = document.getElementById('messageContainer');
    container.appendChild(bubble);
    bubble.style.display = 'flex';
    scrollToBottom(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => { bubble.style.display = 'none'; }, 3000);
}

// ================================================================
// ১০. UI রেন্ডারিং ফাংশন
// ================================================================
function appendMessageToUI(msg) {
    if (msg.deleted_by && msg.deleted_by.includes(currentUser.id)) return;

    const container = document.getElementById('messageContainer');
    const isMe = msg.sender_id === currentUser.id;
    
    let replyHTML = '';
    if (msg.reply_message) {
        const rName = msg.reply_message.sender_id === currentUser.id ? 'You' : document.getElementById('chatHeaderName').innerText;
        let rText = msg.reply_message.content;
        if (!rText) {
            if (msg.reply_message.image_url) rText = '📷 Photo';
            else if (msg.reply_message.audio_url) rText = '🎤 Audio';
            else rText = 'Attachment';
        }
        replyHTML = `<div class="reply-context"><span class="reply-sender-name">${rName}</span><span class="reply-text-content">${rText}</span></div>`;
    }

    let contentHTML = '';
    
    if (msg.image_url) {
        contentHTML += `<img src="${msg.image_url}" class="bubble-image" onclick="viewFullScreenImage('${msg.image_url}')">`;
    }
    
    if (msg.audio_url) {
        contentHTML += `<div class="audio-bubble" style="background: ${isMe ? '#0084ff' : '#e4e6eb'}; padding: 10px; border-radius: 15px;"><audio controls src="${msg.audio_url}" preload="metadata"></audio></div>`;
    }
    
    if (msg.content) { 
        if (msg.content === '👍') contentHTML += `<span style="font-size: 40px; margin: 5px;">👍</span>`; 
        else contentHTML += `<div class="bubble">${replyHTML}${msg.content}</div>`;
    } else if(replyHTML) {
        contentHTML += `<div class="bubble">${replyHTML}</div>`;
    }

    const bubbleClass = (msg.content === '👍' || (!msg.content && !replyHTML && msg.image_url)) ? 'bg-transparent' : '';
    const partnerImgSrc = document.getElementById('chatHeaderImg').src;

    const html = `
        <div class="message-row ${isMe ? 'sent' : 'received'}" id="msg-${msg.id}">
            ${!isMe ? `<img src="${partnerImgSrc}" class="msg-avatar">` : ''}
            <div class="message-content ${bubbleClass}" 
                 style="display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'}"
                 onmousedown="handleMessagePressStart(this, '${msg.id}', ${isMe}, '${msg.content || 'Media'}')" 
                 ontouchstart="handleMessagePressStart(this, '${msg.id}', ${isMe}, '${msg.content || 'Media'}')" 
                 onmouseup="handleMessagePressEnd()" 
                 ontouchend="handleMessagePressEnd()"
                 oncontextmenu="return false;"> 
                ${contentHTML}
            </div>
        </div>`;
    
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

// ================================================================
// ১১. লং প্রেস এবং রিপ্লাই লজিক
// ================================================================
function handleMessagePressStart(el, msgId, isMyMessage, msgText) {
    selectedMessageId = msgId;
    selectedMessageText = msgText;
    
    pressTimer = setTimeout(() => {
        showDeleteOptions(isMyMessage);
        if (navigator.vibrate) navigator.vibrate(50);
    }, 600);
}

function handleMessagePressEnd() { clearTimeout(pressTimer); }

function showDeleteOptions(isMyMessage) {
    const modal = document.getElementById('deleteOptionsModal');
    const deleteForEveryoneBtn = document.getElementById('deleteForEveryoneBtn');
    
    if (isMyMessage) deleteForEveryoneBtn.style.display = 'block';
    else deleteForEveryoneBtn.style.display = 'none';
    
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
    } catch (e) { alert("Failed to delete."); }
}

async function deleteMessageForEveryone() {
    if (!selectedMessageId) return;
    if(!confirm("Delete for everyone?")) return;
    try {
        await supabaseClient.from('messages').delete().eq('id', selectedMessageId);
        closeDeleteModal();
    } catch (e) { alert("Failed to delete."); }
}

async function blockUser() {
    if (!activeChatUserId || !confirm("Block user?")) return;
    try {
        await supabaseClient.from('user_blocks').insert({ blocker_id: currentUser.id, blocked_id: activeChatUserId });
        alert("Blocked.");
        location.reload();
    } catch (e) { alert("Error."); }
}

function closeDeleteModal() {
    document.getElementById('deleteOptionsModal').style.display = 'none';
    selectedMessageId = null;
}

// ================================================================
// ১২. ভয়েস রেকর্ডিং ফাংশনালিটি
// ================================================================
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };
        mediaRecorder.start();
        isRecording = true;
        
        document.getElementById('audioRecordingUI').style.display = 'flex';
        document.querySelector('.footer-input-row').style.display = 'none'; 
        
        let seconds = 0;
        document.getElementById('recordingTimer').innerText = "00:00";
        recordingInterval = setInterval(() => {
            seconds++;
            const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
            const secs = (seconds % 60).toString().padStart(2, '0');
            document.getElementById('recordingTimer').innerText = `${mins}:${secs}`;
        }, 1000);
        
    } catch (err) { alert("Microphone access needed."); }
}

function cancelRecording() {
    if (mediaRecorder) { mediaRecorder.stream.getTracks().forEach(track => track.stop()); mediaRecorder = null; }
    clearInterval(recordingInterval);
    closeRecordingUI();
}

function closeRecordingUI() {
    document.getElementById('audioRecordingUI').style.display = 'none';
    document.querySelector('.footer-input-row').style.display = 'flex'; 
    isRecording = false;
}

async function sendRecording() {
    if (!mediaRecorder) return;
    
    mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const audioUrl = await uploadFile(audioBlob, 'chat_audio');
        
        if (audioUrl) {
            const empty = document.querySelector('.empty-chat-placeholder'); if(empty) empty.remove();
            await supabaseClient.from('messages').insert([{ 
                sender_id: currentUser.id, 
                receiver_id: activeChatUserId, 
                audio_url: audioUrl, 
                content: null, 
                is_read: false, 
                deleted_by: [] 
            }]);
        } else { alert("Audio failed."); }
    };
    
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    clearInterval(recordingInterval);
    closeRecordingUI();
}

// ================================================================
// ১৩. ইভেন্ট লিসেনার সেটআপ
// ================================================================
function setupEventListeners() {
    document.getElementById('backToInboxBtn').addEventListener('click', () => {
        document.getElementById('conversation-view').style.display = 'none';
        document.getElementById('inbox-view').style.display = 'block';
        activeChatUserId = null;
        loadChatList(); 
    });
    
    const input = document.getElementById('messageInput');
    input.addEventListener('input', () => { toggleSendButton(); sendTypingEvent(); });
    input.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });
    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
    
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
    
    // অডিও ও কল
    document.getElementById('micTriggerBtn').addEventListener('click', startRecording);
    document.getElementById('cancelRecordingBtn').addEventListener('click', cancelRecording);
    document.getElementById('sendRecordingBtn').addEventListener('click', sendRecording);
    document.getElementById('videoCallBtn').addEventListener('click', () => startZegoCall('video'));
    document.getElementById('audioCallBtn').addEventListener('click', () => startZegoCall('audio'));

    // ফুল স্ক্রিন ইমেজ
    document.querySelector('.fs-close-btn').addEventListener('click', () => { document.getElementById('fullScreenImageModal').style.display = 'none'; });

    // ইমোজি
    const emojiBtn = document.getElementById('emojiTriggerBtn');
    const picker = document.getElementById('emojiPickerContainer');
    emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); picker.style.display = picker.style.display === 'none' ? 'block' : 'none'; });
    document.querySelector('emoji-picker').addEventListener('emoji-click', e => { input.value += e.detail.unicode; toggleSendButton(); input.focus(); });
    document.addEventListener('click', (e) => { 
        if (!picker.contains(e.target) && !emojiBtn.contains(e.target)) picker.style.display = 'none'; 
        const opts = document.getElementById('chatOptionsDropdown');
        if(!opts.contains(e.target) && !document.getElementById('chatOptionsBtn').contains(e.target)) opts.style.display = 'none';
    });

    // ডিলিট ও রিপ্লাই মডাল
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

// ================================================================
// ১৪. হেল্পার ফাংশনস
// ================================================================
function closeImagePreview() {
    selectedImageFile = null;
    document.getElementById('chatImageInput').value = '';
    document.getElementById('imagePreviewPanel').style.display = 'none';
    toggleSendButton();
}

function toggleSendButton() {
    const val = document.getElementById('messageInput').value.trim();
    const icon = document.querySelector('#sendMessageBtn i');
    if (val !== '' || selectedImageFile) { icon.className = 'fas fa-paper-plane'; icon.style.color = '#0084ff'; } 
    else { icon.className = 'fas fa-thumbs-up'; icon.style.color = '#0084ff'; }
}

function timeAgoShort(dateString) { return dateString ? 'Just now' : ''; } 

async function markAsSeen(partnerId) {
    try { await supabaseClient.from('messages').update({ is_read: true }).match({ sender_id: partnerId, receiver_id: currentUser.id, is_read: false }); } catch(e){}
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