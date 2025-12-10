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
    
    // ডাইরেক্ট চ্যাট হ্যান্ডলিং (প্রোফাইল পেজ থেকে আসলে)
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
    
    // লোডার দেখানো
    container.innerHTML = `<div class="loader-container"><div class="loader"></div></div>`;

    try {
        const { data: partners, error } = await supabaseClient.rpc('get_chat_partners', { user_id: currentUser.id });

        if (error) throw error;

        container.innerHTML = ''; // ক্লিয়ার লোডার

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
            
            const html = `
                <div class="chat-item-row" onclick="openChat('${chat.partner_id}')">
                    <div class="chat-avatar">
                        <img src="${user?.photo_url || './images/default-avatar.png'}" alt="User">
                    </div>
                    <div class="chat-info">
                        <h4 class="chat-name" style="${isUnread ? 'font-weight:800;color:black;' : ''}">${user?.display_name || 'Unknown User'}</h4>
                        <div class="chat-preview">
                            <span class="msg-text" style="${isUnread ? 'font-weight:700;color:black;' : ''}">
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
    
    // লোডার
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
// ৪. মেসেজ পাঠানো (Text / Image / Voice)
// ==========================
async function sendMessage() {
    if (isUploading) return;

    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    const partnerId = activeChatUserId;

    // যদি টেক্সট বা ছবি কিছুই না থাকে, তবে লাইক পাঠাবে
    if (!text && !selectedImageFile) {
        sendLikeEmoji(partnerId); return;
    }

    // UI রিসেট
    input.value = '';
    toggleSendButton();
    const emptyPlaceholder = document.querySelector('.empty-chat-placeholder');
    if(emptyPlaceholder) emptyPlaceholder.remove();

    let imageUrl = null;
    
    // ইমেজ আপলোড
    if (selectedImageFile) {
        isUploading = true;
        // বাকেটের নাম 'chat_images' হতে হবে
        imageUrl = await uploadFile(selectedImageFile, 'chat_images');
        closeImagePreview();
        isUploading = false;
        
        if (!imageUrl) return; 
    }

    const newMessage = { 
        sender_id: currentUser.id, 
        receiver_id: partnerId, 
        content: text, 
        image_url: imageUrl, 
        is_read: false 
    };
    
    try {
        await supabaseClient.from('messages').insert([newMessage]);
    } catch (err) {
        console.error("Send failed:", err);
        alert("মেসেজ পাঠানো যায়নি।");
    }
}

async function sendLikeEmoji(partnerId) {
    try {
        const empty = document.querySelector('.empty-chat-placeholder');
        if(empty) empty.remove();
        
        await supabaseClient.from('messages').insert([{ 
            sender_id: currentUser.id, 
            receiver_id: partnerId, 
            content: '👍', 
            is_read: false 
        }]);
    } catch (e) {}
}

// ইউনিভার্সাল আপলোড ফাংশন
async function uploadFile(file, bucketName) {
    try {
        // ইমেজ হলে কম্প্রেস করা
        let fileToUpload = file;
        if(file.type.startsWith('image/')) {
            const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: true };
            if(typeof imageCompression !== 'undefined') {
                fileToUpload = await imageCompression(file, options);
            }
        }

        const ext = file.name ? file.name.split('.').pop() : 'webm';
        const fileName = `${currentUser.id}/${Date.now()}.${ext}`;
        
        const { data, error } = await supabaseClient.storage.from(bucketName).upload(fileName, fileToUpload);
        
        if (error) throw error;
        
        const { data: urlData } = supabaseClient.storage.from(bucketName).getPublicUrl(fileName);
        return urlData.publicUrl;
    } catch (err) { 
        console.error("Upload failed:", err); 
        alert("আপলোড ব্যর্থ হয়েছে। বাকেট পারমিশন চেক করুন।");
        return null; 
    }
}

// ==========================
// ৫. ভয়েস রেকর্ডিং লজিক (New)
// ==========================
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
            // স্টপ হওয়ার পর sendRecording এ হ্যান্ডেল করা হবে
        };
        
        mediaRecorder.start();
        isRecording = true;
        
        // UI আপডেট
        document.getElementById('audioRecordingUI').style.display = 'flex';
        document.querySelector('.chat-footer-area').style.display = 'none'; // ফুটার হাইড
        
        // টাইমার চালু
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
        alert("মাইক্রোফোন এক্সেস প্রয়োজন।");
    }
}

function cancelRecording() {
    if (mediaRecorder) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop()); // স্ট্রীম বন্ধ
        mediaRecorder = null;
    }
    clearInterval(recordingInterval);
    closeRecordingUI();
}

function closeRecordingUI() {
    document.getElementById('audioRecordingUI').style.display = 'none';
    document.querySelector('.chat-footer-area').style.display = 'flex'; // ফুটার শো
    isRecording = false;
}

async function sendRecording() {
    if (!mediaRecorder) return;
    
    // ম্যানুয়ালি স্টপ ইভেন্ট হ্যান্ডেল করা
    mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        
        // বাকেটের নাম 'chat_audio' হতে হবে
        const audioUrl = await uploadFile(audioBlob, 'chat_audio');
        
        if (audioUrl) {
            const empty = document.querySelector('.empty-chat-placeholder');
            if(empty) empty.remove();

            await supabaseClient.from('messages').insert([{ 
                sender_id: currentUser.id, 
                receiver_id: activeChatUserId, 
                audio_url: audioUrl,
                content: null,
                is_read: false 
            }]);
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
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const msg = payload.new;
            
            if ((msg.sender_id === partnerId && msg.receiver_id === currentUser.id) || 
                (msg.sender_id === currentUser.id && msg.receiver_id === partnerId)) {
                
                const emptyPlaceholder = document.querySelector('.empty-chat-placeholder');
                if(emptyPlaceholder) emptyPlaceholder.remove();
                
                appendMessageToUI(msg);
                scrollToBottom(true);
                
                if (msg.sender_id === partnerId) markAsSeen(partnerId);
            }
        }).subscribe();
}

// ==========================
// ৭. UI হেল্পার ও রেন্ডারিং
// ==========================
function appendMessageToUI(msg) {
    const container = document.getElementById('messageContainer');
    const isMe = msg.sender_id === currentUser.id;
    let contentHTML = '';
    
    // ইমেজ রেন্ডারিং
    if (msg.image_url) {
        contentHTML += `<img src="${msg.image_url}" class="bubble-image" onclick="viewFullScreenImage('${msg.image_url}')">`;
    }
    
    // অডিও রেন্ডারিং
    if (msg.audio_url) {
        contentHTML += `
            <div class="audio-bubble" style="background: ${isMe ? '#0084ff' : '#e4e6eb'}; padding: 10px; border-radius: 15px;">
                <audio controls src="${msg.audio_url}" preload="metadata"></audio>
            </div>`;
    }
    
    // টেক্সট রেন্ডারিং
    if (msg.content) {
        if (msg.content === '👍') {
            contentHTML += `<span style="font-size: 40px; margin: 5px;">👍</span>`;
        } else {
            contentHTML += `<div class="bubble">${msg.content}</div>`;
        }
    }

    const bubbleClass = (msg.content === '👍' || (!msg.content && msg.image_url)) ? 'bg-transparent' : '';
    const partnerImgSrc = document.getElementById('chatHeaderImg').src;

    const html = `
        <div class="message-row ${isMe ? 'sent' : 'received'}">
            ${!isMe ? `<img src="${partnerImgSrc}" class="msg-avatar">` : ''}
            <div class="message-content ${bubbleClass}" style="display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'}">
                ${contentHTML}
            </div>
        </div>`;
    
    container.insertAdjacentHTML('beforeend', html);
}

function scrollToBottom(smooth = false) { 
    const main = document.getElementById('messageContainer'); 
    main.scrollTo({ top: main.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); 
}

function toggleSendButton() {
    const input = document.getElementById('messageInput');
    const icon = document.querySelector('#sendMessageBtn i');
    
    // ইনপুটে লেখা থাকলে বা ছবি থাকলে সেন্ড বাটন দেখাবে
    if (input.value.trim() !== '' || selectedImageFile) { 
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
        await supabaseClient.from('messages').update({ is_read: true }).match({ sender_id: partnerId, receiver_id: currentUser.id, is_read: false }); 
    } catch (e) {}
}

// ==========================
// ৮. ইভেন্ট লিসেনার
// ==========================
function setupEventListeners() {
    // ব্যাক বাটন
    document.getElementById('backToInboxBtn').addEventListener('click', () => {
        document.getElementById('conversation-view').style.display = 'none';
        document.getElementById('inbox-view').style.display = 'block';
        activeChatUserId = null;
        loadChatList(); 
    });
    
    // টেক্সট ইনপুট
    const input = document.getElementById('messageInput');
    input.addEventListener('input', toggleSendButton);
    input.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });
    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
    
    // ইমেজ আপলোড
    const triggerFile = () => document.getElementById('chatImageInput').click();
    document.getElementById('galleryTriggerBtn').addEventListener('click', triggerFile);
    
    // [FIXED] ইমেজ প্রিভিউ লজিক
    document.getElementById('chatImageInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedImageFile = file;
            // প্রিভিউ প্যানেল দেখানো
            const panel = document.getElementById('imagePreviewPanel');
            const previewImg = document.getElementById('uploadPreviewImg');
            
            if(panel && previewImg) { 
                previewImg.src = URL.createObjectURL(file);
                panel.style.display = 'flex'; 
                toggleSendButton(); // বাটন পরিবর্তন
            }
        }
    });
    
    // প্রিভিউ ক্লোজ
    document.getElementById('closePreviewBtn').addEventListener('click', () => {
        selectedImageFile = null;
        document.getElementById('chatImageInput').value = '';
        document.getElementById('imagePreviewPanel').style.display = 'none';
        toggleSendButton();
    });
    
    // অডিও রেকর্ডিং বাটন
    document.getElementById('micTriggerBtn').addEventListener('click', startRecording);
    document.getElementById('cancelRecordingBtn').addEventListener('click', cancelRecording);
    document.getElementById('sendRecordingBtn').addEventListener('click', sendRecording);
    
    // ফুল স্ক্রিন ক্লোজ
    document.querySelector('.fs-close-btn').addEventListener('click', () => { 
        document.getElementById('fullScreenImageModal').style.display = 'none'; 
    });
}

window.viewFullScreenImage = function(src) {
    const modal = document.getElementById('fullScreenImageModal');
    document.getElementById('fsModalImg').src = src;
    document.getElementById('downloadImgBtn').href = src;
    modal.style.display = 'flex';
}