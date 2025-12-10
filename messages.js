/* --- START OF FILE messages.js --- */

const SUPABASE_URL = 'https://pnsvptaanvtdaspqjwbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuc3ZwdGFhbnZ0ZGFzcHFqd2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMzcxNjMsImV4cCI6MjA3NTkxMzE2M30.qposYOL-W17DnFF11cJdZ7zrN1wh4Bop6YnclkUe_rU';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================
// গ্লোবাল ভ্যারিয়েবল
// ==========================
let currentUser = null;
let activeChatUserId = null;
let realtimeSubscription = null;
let selectedImageFile = null;
let isUploading = false;

// ভয়েস রেকর্ডিং ভ্যারিয়েবল
let mediaRecorder = null;
let audioChunks = [];
let recordingInterval = null;
let isRecording = false;

// লং প্রেস ভ্যারিয়েবল
let pressTimer;
let selectedMessageId = null;
let isLongPress = false;

// ==========================
// ১. অ্যাপ লোডিং এবং অথেন্টিকেশন
// ==========================
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    if (error || !session) {
        window.location.href = '/index.html';
        return;
    }
    
    currentUser = session.user;
    loadMyProfile();
    
    const startChatUser = localStorage.getItem('startChatWith');
    if (startChatUser) {
        localStorage.removeItem('startChatWith');
        openChat(startChatUser);
    } else {
        loadChatList();
    }
    
    setupEventListeners();
});

async function loadMyProfile() {
    try {
        const { data } = await supabaseClient.from('users').select('photo_url').eq('id', currentUser.id).single();
        const avatarContainer = document.getElementById('myHeaderAvatar');
        if (avatarContainer && data?.photo_url) {
            avatarContainer.innerHTML = `<img src="${data.photo_url}" alt="Me">`;
        } else if (avatarContainer) {
            avatarContainer.innerHTML = '<img src="./images/default-avatar.png" alt="Me">';
        }
    } catch(e) {}
}

// ==========================
// ২. ইনবক্স লজিক (Chat List)
// ==========================
async function loadChatList() {
    const container = document.getElementById('chatListContainer');
    if(!container) return;
    
    container.innerHTML = `<div class="loader-container"><div class="loader"></div></div>`;

    try {
        const { data: partners, error } = await supabaseClient.rpc('get_chat_partners', { user_id: currentUser.id });

        if (error) throw error;

        container.innerHTML = ''; 

        if (!partners || partners.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:50px 20px; color:#999;">
                    <i class="fas fa-comment-dots" style="font-size: 30px; margin-bottom:10px;"></i>
                    <h3 style="margin:0;">No Messages</h3>
                    <p>Start a conversation with someone.</p>
                </div>`;
            return;
        }

        for (const chat of partners) {
            const { data: user } = await supabaseClient.from('users').select('display_name, photo_url').eq('id', chat.partner_id).single();
            
            const timeString = timeAgoShort(chat.last_message_time);
            const isUnread = chat.unread_count > 0;
            let msgPreview = chat.last_message_content || 'Sent an attachment';
            
            if (msgPreview === '👍') msgPreview = 'Like 👍';
            
            const nameStyle = isUnread ? 'font-weight: 800; color: black;' : '';
            const msgStyle = isUnread ? 'font-weight: 700; color: black;' : '';

            const html = `
                <div class="chat-item-row" onclick="openChat('${chat.partner_id}')">
                    <div class="chat-avatar">
                        <img src="${user?.photo_url || './images/default-avatar.png'}" alt="User">
                    </div>
                    <div class="chat-info">
                        <h4 class="chat-name" style="${nameStyle}">${user?.display_name || 'Unknown User'}</h4>
                        <div class="chat-preview">
                            <span class="msg-text" style="${msgStyle}">
                                ${msgPreview.substring(0, 25)}${msgPreview.length > 25 ? '...' : ''}
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
        container.innerHTML = `<p style="text-align:center; color:red;">মেসেজ লোড করা যাচ্ছে না।</p>`;
    }
}

// ==========================
// ৩. চ্যাট রুম লজিক
// ==========================
async function openChat(partnerId) {
    activeChatUserId = partnerId;
    
    document.getElementById('inbox-view').style.display = 'none';
    document.getElementById('conversation-view').style.display = 'flex';
    
    const msgContainer = document.getElementById('messageContainer');
    msgContainer.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%;"><div class="loader"></div></div>';
    
    try {
        const { data: user } = await supabaseClient.from('users').select('*').eq('id', partnerId).single();
        if (user) {
            document.getElementById('chatHeaderName').innerText = user.display_name;
            document.getElementById('chatHeaderImg').src = user.photo_url || './images/default-avatar.png';
            document.getElementById('headerActiveDot').style.display = 'block';
        }

        await loadMessages(partnerId);
        setupRealtimeChat(partnerId);

    } catch (err) { console.error("Open chat error:", err); }
}

async function loadMessages(partnerId) {
    const container = document.getElementById('messageContainer');
    
    const { data: messages, error } = await supabaseClient
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .or(`sender_id.eq.${partnerId},receiver_id.eq.${partnerId}`)
        .not('deleted_by', 'cs', `{"${currentUser.id}"}`) 
        .order('created_at', { ascending: true });

    container.innerHTML = ''; 

    if (messages && messages.length > 0) {
        messages.forEach(msg => appendMessageToUI(msg));
        scrollToBottom(false); 
    } else {
        const partnerName = document.getElementById('chatHeaderName').innerText;
        const partnerImg = document.getElementById('chatHeaderImg').src;
        
        container.innerHTML = `
            <div class="empty-chat-placeholder" style="display: block; text-align: center; margin-top: 50px; opacity: 0.6;">
                <img src="${partnerImg}" style="width: 80px; height: 80px; border-radius: 50%; margin-bottom: 10px; object-fit: cover;">
                <h3>${partnerName}</h3>
                <p>You're friends on iPray</p>
                <p style="font-size: 12px;">Send a message to start chatting.</p>
            </div>`;
    }
    
    markAsSeen(partnerId);
}

// ==========================
// ৪. মেসেজ পাঠানো
// ==========================
async function sendMessage() {
    if (isUploading) return;

    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    const partnerId = activeChatUserId;

    if (!text && !selectedImageFile) {
        sendLikeEmoji(partnerId); 
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
                alert("ছবি আপলোড ব্যর্থ হয়েছে।");
                resetSendButton(originalIcon);
                return;
            }
        } catch (error) {
            console.error("Image Upload Error:", error);
            resetSendButton(originalIcon);
            return;
        }
    }

    const newMessage = { 
        sender_id: currentUser.id, 
        receiver_id: partnerId, 
        content: text || null, 
        image_url: imageUrl, 
        is_read: false,
        deleted_by: [] 
    };
    
    try {
        const { error } = await supabaseClient.from('messages').insert([newMessage]);
        if (error) throw error;
        
        input.value = '';
        closeImagePreview();
        const empty = document.querySelector('.empty-chat-placeholder');
        if(empty) empty.remove();
        
        document.getElementById('emojiPickerContainer').style.display = 'none';

    } catch (err) {
        console.error("Send failed:", err);
        alert("মেসেজ পাঠানো যায়নি।");
    } finally {
        resetSendButton('fas fa-thumbs-up');
    }
}

function resetSendButton(className) {
    isUploading = false;
    const icon = document.querySelector('#sendMessageBtn i');
    icon.className = className;
    toggleSendButton();
}

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

// ==========================
// ৫. ভয়েস রেকর্ডিং
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
        document.querySelector('.chat-footer-area').style.display = 'none'; 
        
        let seconds = 0;
        document.getElementById('recordingTimer').innerText = "00:00";
        recordingInterval = setInterval(() => {
            seconds++;
            const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
            const secs = (seconds % 60).toString().padStart(2, '0');
            document.getElementById('recordingTimer').innerText = `${mins}:${secs}`;
        }, 1000);
        
    } catch (err) {
        alert("মাইক্রোফোন এক্সেস প্রয়োজন।");
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
    document.querySelector('.chat-footer-area').style.display = 'flex'; 
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
// ৬. রিয়েলটাইম (Realtime)
// ==========================
function setupRealtimeChat(partnerId) {
    if (realtimeSubscription) supabaseClient.removeChannel(realtimeSubscription);
    
    realtimeSubscription = supabaseClient.channel('chat-room')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, payload => {
            
            const eventType = payload.eventType;
            const newMsg = payload.new;
            const oldMsg = payload.old;

            if (eventType === 'INSERT') {
                if ((newMsg.sender_id === partnerId && newMsg.receiver_id === currentUser.id) || 
                    (newMsg.sender_id === currentUser.id && newMsg.receiver_id === partnerId)) {
                    
                    const emptyPlaceholder = document.querySelector('.empty-chat-placeholder');
                    if(emptyPlaceholder) emptyPlaceholder.remove();
                    
                    appendMessageToUI(newMsg);
                    scrollToBottom(true);
                    
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

// ==========================
// ৭. UI হেল্পার ও রেন্ডারিং
// ==========================
function appendMessageToUI(msg) {
    if (msg.deleted_by && msg.deleted_by.includes(currentUser.id)) return;

    const container = document.getElementById('messageContainer');
    const isMe = msg.sender_id === currentUser.id;
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
            contentHTML += `<div class="bubble">${msg.content}</div>`;
        }
    }

    const bubbleClass = (msg.content === '👍' || (!msg.content && msg.image_url)) ? 'bg-transparent' : '';
    const partnerImgSrc = document.getElementById('chatHeaderImg').src;

    // [FIXED] লং প্রেস ইভেন্ট সঠিকভাবে যুক্ত করা হয়েছে
    // touchstart, touchend এবং oncontextmenu যোগ করা হয়েছে যাতে ডিফল্ট মেনু না আসে
    const html = `
        <div class="message-row ${isMe ? 'sent' : 'received'}" id="msg-${msg.id}">
            ${!isMe ? `<img src="${partnerImgSrc}" class="msg-avatar">` : ''}
            <div class="message-content ${bubbleClass}" 
                 style="display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'}"
                 onmousedown="handleMessagePressStart(this, '${msg.id}', ${isMe})" 
                 ontouchstart="handleMessagePressStart(this, '${msg.id}', ${isMe})" 
                 onmouseup="handleMessagePressEnd()" 
                 ontouchend="handleMessagePressEnd()"
                 ontouchmove="handleMessagePressEnd()"
                 oncontextmenu="return false;"> 
                ${contentHTML}
            </div>
        </div>`;
    
    container.insertAdjacentHTML('beforeend', html);
}

// [FIXED] লং প্রেস লজিক
function handleMessagePressStart(el, msgId, isMyMessage) {
    isLongPress = false;
    selectedMessageId = msgId;
    
    // ৮০০ মিলিসেকেন্ড চাপলে মেনু আসবে
    pressTimer = setTimeout(() => {
        isLongPress = true;
        showDeleteOptions(isMyMessage);
        
        // ভাইব্রেশন (যদি মোবাইল সাপোর্ট করে)
        if (navigator.vibrate) navigator.vibrate(50);
        
    }, 800); 
}

function handleMessagePressEnd() {
    // যদি আঙুল তুলে নেওয়া হয় বা স্ক্রল করা হয়, টাইমার বন্ধ হবে
    clearTimeout(pressTimer);
    if (!isLongPress) {
        selectedMessageId = null;
    }
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

async function deleteMessageForMe() {
    if (!selectedMessageId || !currentUser) return;
    
    try {
        const { data } = await supabaseClient.from('messages').select('deleted_by').eq('id', selectedMessageId).single();
        let currentDeletedBy = data?.deleted_by || [];
        
        if (!currentDeletedBy.includes(currentUser.id)) {
            currentDeletedBy.push(currentUser.id);
            await supabaseClient.from('messages').update({ deleted_by: currentDeletedBy }).eq('id', selectedMessageId);
            
            const el = document.getElementById(`msg-${selectedMessageId}`);
            if(el) el.remove();
        }
        closeDeleteModal();
    } catch (e) {
        alert("Failed to delete.");
    }
}

async function deleteMessageForEveryone() {
    if (!selectedMessageId) return;
    if(!confirm("Are you sure? This will delete the message for everyone.")) return;

    try {
        await supabaseClient.from('messages').delete().eq('id', selectedMessageId);
        closeDeleteModal();
    } catch (e) {
        alert("Failed to delete.");
    }
}

function closeDeleteModal() {
    document.getElementById('deleteOptionsModal').style.display = 'none';
    selectedMessageId = null;
    isLongPress = false;
}

function scrollToBottom(smooth = false) { 
    const main = document.getElementById('messageContainer'); 
    main.scrollTo({ top: main.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); 
}

function toggleSendButton() {
    const input = document.getElementById('messageInput');
    const icon = document.querySelector('#sendMessageBtn i');
    
    if (input.value.trim() !== '' || selectedImageFile) { 
        icon.className = 'fas fa-paper-plane'; 
        icon.style.color = '#0084ff'; 
    } 
    else { 
        icon.className = 'fas fa-thumbs-up'; 
        icon.style.color = '#0084ff'; 
    }
}

function timeAgoShort(dateString) { return dateString ? 'Just now' : ''; }

async function markAsSeen(partnerId) {
    try { 
        await supabaseClient.from('messages').update({ is_read: true }).match({ sender_id: partnerId, receiver_id: currentUser.id, is_read: false }); 
    } catch (e) {}
}

// ==========================
// ৮. ইভেন্ট লিসেনার
// ==========================
function setupEventListeners() {
    document.getElementById('backToInboxBtn').addEventListener('click', () => {
        document.getElementById('conversation-view').style.display = 'none';
        document.getElementById('inbox-view').style.display = 'block';
        activeChatUserId = null;
        loadChatList(); 
    });
    
    const input = document.getElementById('messageInput');
    input.addEventListener('input', toggleSendButton);
    input.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });
    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
    
    const triggerFile = () => document.getElementById('chatImageInput').click();
    document.getElementById('galleryTriggerBtn').addEventListener('click', triggerFile);
    
    document.getElementById('chatImageInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedImageFile = file;
            const panel = document.getElementById('imagePreviewPanel');
            const previewImg = document.getElementById('uploadPreviewImg');
            if(panel && previewImg) { 
                previewImg.src = URL.createObjectURL(file);
                panel.style.display = 'flex'; 
                toggleSendButton(); 
            }
        }
    });
    
    document.getElementById('closePreviewBtn').addEventListener('click', closeImagePreview);
    
    document.getElementById('micTriggerBtn').addEventListener('click', startRecording);
    document.getElementById('cancelRecordingBtn').addEventListener('click', cancelRecording);
    document.getElementById('sendRecordingBtn').addEventListener('click', sendRecording);
    
    document.querySelector('.fs-close-btn').addEventListener('click', () => { 
        document.getElementById('fullScreenImageModal').style.display = 'none'; 
    });

    const emojiBtn = document.getElementById('emojiTriggerBtn');
    const pickerContainer = document.getElementById('emojiPickerContainer');
    
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pickerContainer.style.display = pickerContainer.style.display === 'none' ? 'block' : 'none';
    });

    document.querySelector('emoji-picker').addEventListener('emoji-click', event => {
        input.value += event.detail.unicode;
        toggleSendButton();
        input.focus();
    });

    document.addEventListener('click', (e) => {
        if (!pickerContainer.contains(e.target) && !emojiBtn.contains(e.target)) {
            pickerContainer.style.display = 'none';
        }
    });

    // ডিলিট মডাল লিসেনার
    document.getElementById('deleteForMeBtn').addEventListener('click', deleteMessageForMe);
    document.getElementById('deleteForEveryoneBtn').addEventListener('click', deleteMessageForEveryone);
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);
}

function closeImagePreview() {
    selectedImageFile = null;
    document.getElementById('chatImageInput').value = '';
    document.getElementById('imagePreviewPanel').style.display = 'none';
    toggleSendButton();
}

window.viewFullScreenImage = function(src) {
    const modal = document.getElementById('fullScreenImageModal');
    document.getElementById('fsModalImg').src = src;
    document.getElementById('downloadImgBtn').href = src;
    modal.style.display = 'flex';
}