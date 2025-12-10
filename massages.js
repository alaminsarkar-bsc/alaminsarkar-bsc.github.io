const SUPABASE_URL = 'https://pnsvptaanvtdaspqjwbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuc3ZwdGFhbnZ0ZGFzcHFqd2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMzcxNjMsImV4cCI6MjA3NTkxMzE2M30.qposYOL-W17DnFF11cJdZ7zrN1wh4Bop6YnclkUe_rU';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let activeChatUserId = null;
let realtimeSubscription = null;
let selectedImageFile = null;
let isUploading = false;

// ==========================
// INITIALIZATION & AUTH
// ==========================
document.addEventListener('DOMContentLoaded', async () => {
    // লোডিং এর সময় সাদা স্ক্রিন এড়াতে প্রাথমিকভাবে বডি হাইড করা যায়,
    // তবে ইউজারের সুবিধার জন্য আমরা লোডার দেখাব
    
    // ১. সেশন চেক
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    if (error || !session) {
        window.location.href = '/index.html'; // লগইন না থাকলে হোমে ফেরত
        return;
    }
    
    currentUser = session.user;
    
    // ২. হেডার প্রোফাইল লোড
    loadMyProfile();
    
    // ৩. নেভিগেশন হ্যান্ডলিং (প্রোফাইল থেকে মেসেজ দিলে)
    const startChatUser = localStorage.getItem('startChatWith');
    if (startChatUser) {
        localStorage.removeItem('startChatWith');
        openChat(startChatUser);
    } else {
        loadChatList();
    }
    
    // ৪. লিসেনার সেটআপ
    setupEventListeners();
});

async function loadMyProfile() {
    try {
        const { data } = await supabaseClient.from('users').select('photo_url').eq('id', currentUser.id).single();
        const avatarContainer = document.getElementById('myHeaderAvatar');
        if (avatarContainer) {
            if (data?.photo_url) {
                avatarContainer.innerHTML = `<img src="${data.photo_url}" alt="Me">`;
            } else {
                avatarContainer.innerHTML = '<img src="./images/default-avatar.png" alt="Me">';
            }
        }
    } catch(e) {}
}

// ==========================
// INBOX LOGIC (CHAT LIST)
// ==========================
async function loadChatList() {
    const container = document.getElementById('chatListContainer');
    if(!container) return;

    // ১. স্কেলেটন লোডার (লোডিং এনিমেশন)
    container.innerHTML = Array(6).fill(0).map(() => `
        <div class="skeleton-chat-item">
            <div class="skeleton-avatar-circle skeleton-animate"></div>
            <div class="skeleton-text-group">
                <div class="skeleton-name-line skeleton-animate"></div>
                <div class="skeleton-msg-line skeleton-animate"></div>
            </div>
        </div>
    `).join('');

    try {
        // ২. RPC ফাংশন কল (ডাটাবেস থেকে পার্টনার লিস্ট আনা)
        const { data: partners, error } = await supabaseClient.rpc('get_chat_partners', { user_id: currentUser.id });

        if (error) throw error;

        container.innerHTML = ''; // ক্লিয়ার স্কেলেটন

        // ৩. যদি কোনো চ্যাট না থাকে
        if (!partners || partners.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:50px 20px; color:#999; display:flex; flex-direction:column; align-items:center;">
                    <div style="background:#f0f2f5; padding:20px; border-radius:50%; margin-bottom:15px;">
                        <i class="fas fa-comment-medical" style="font-size: 30px; color: #ccc;"></i>
                    </div>
                    <h3 style="margin:0; color:#333;">কোনো মেসেজ নেই</h3>
                    <p style="font-size:13px;">কারো প্রোফাইলে গিয়ে "মেসেজ" বাটনে ক্লিক করুন।</p>
                </div>`;
            return;
        }

        // ৪. লিস্ট রেন্ডার
        for (const chat of partners) {
            const { data: user } = await supabaseClient.from('users').select('display_name, photo_url').eq('id', chat.partner_id).single();
            
            const timeString = timeAgoShort(chat.last_message_time);
            const isUnread = chat.unread_count > 0;
            let msgPreview = chat.last_message_content;
            
            if (!msgPreview) msgPreview = 'Sent a photo 📷';
            else if (msgPreview === '👍') msgPreview = '👍';
            
            const nameStyle = isUnread ? 'font-weight: 800; color: black;' : 'font-weight: 600; color: #050505;';
            const previewStyle = isUnread ? 'font-weight: 700; color: black;' : 'color: #65676b;';
            const bgStyle = isUnread ? 'background-color: #f0f9ff;' : '';

            const html = `
                <div class="chat-item-row" onclick="openChat('${chat.partner_id}')" style="${bgStyle}">
                    <div class="chat-avatar">
                        <img src="${user?.photo_url || './images/default-avatar.png'}" alt="User">
                        ${isUnread ? '<div class="online-badge" style="border:2px solid white;"></div>' : ''}
                    </div>
                    <div class="chat-info">
                        <h4 class="chat-name" style="${nameStyle}">${user?.display_name || 'Unknown User'}</h4>
                        <div class="chat-preview">
                            <span class="msg-text" style="${previewStyle}">
                                ${msgPreview.substring(0, 25)}${msgPreview.length > 25 ? '...' : ''}
                            </span>
                            <span class="msg-dot">· ${timeString}</span>
                        </div>
                    </div>
                    ${isUnread ? '<div class="unread-dot"></div>' : ''}
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        }

    } catch (err) {
        console.error("Chat load error:", err);
        container.innerHTML = `
            <div style="text-align:center; padding: 20px; color: red;">
                <p>মেসেজ লোড করা যাচ্ছে না।</p>
                <small>সম্ভবত ডাটাবেস ফাংশন রান করা হয়নি।</small>
            </div>`;
    }
}

// ==========================
// CHAT ROOM LOGIC
// ==========================
async function openChat(partnerId) {
    activeChatUserId = partnerId;
    document.getElementById('inbox-view').style.display = 'none';
    document.getElementById('conversation-view').style.display = 'flex';
    
    // লোডার দেখানো
    const msgContainer = document.getElementById('messageContainer');
    msgContainer.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%;"><div class="loader"></div></div>';
    
    try {
        // পার্টনার ইনফো
        const { data: user } = await supabaseClient.from('users').select('*').eq('id', partnerId).single();
        if (user) {
            document.getElementById('chatHeaderName').innerText = user.display_name;
            document.getElementById('chatHeaderImg').src = user.photo_url || './images/default-avatar.png';
            document.getElementById('headerActiveDot').style.display = 'block'; 
        }

        await loadMessages(partnerId);
        setupRealtimeChat(partnerId);

    } catch (err) {
        console.error("Open chat error:", err);
    }
}

async function loadMessages(partnerId) {
    const container = document.getElementById('messageContainer');
    const { data: messages, error } = await supabaseClient
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${currentUser.id})`)
        .order('created_at', { ascending: true });

    container.innerHTML = '';

    if (messages && messages.length > 0) {
        document.querySelector('.empty-chat-placeholder').style.display = 'none';
        messages.forEach(msg => appendMessageToUI(msg));
        scrollToBottom(false);
    } else {
        document.querySelector('.empty-chat-placeholder').style.display = 'block';
        document.getElementById('emptyStateName').innerText = document.getElementById('chatHeaderName').innerText;
        document.getElementById('emptyStateImg').src = document.getElementById('chatHeaderImg').src;
    }
    markAsSeen(partnerId);
}

// ==========================
// SENDING & UPLOADING
// ==========================
async function sendMessage() {
    if (isUploading) return;

    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    const partnerId = activeChatUserId;

    if (!text && !selectedImageFile) {
        sendLikeEmoji(partnerId); return;
    }

    input.value = '';
    toggleSendButton();
    
    let imageUrl = null;
    if (selectedImageFile) {
        isUploading = true;
        imageUrl = await uploadChatImage(selectedImageFile);
        closeImagePreview();
        isUploading = false;
        if (!imageUrl) return; // আপলোড ফেইল করলে মেসেজ যাবে না
    }

    const newMessage = { sender_id: currentUser.id, receiver_id: partnerId, content: text, image_url: imageUrl, is_read: false };
    
    try {
        await supabaseClient.from('messages').insert([newMessage]);
    } catch (err) {
        console.error("Send failed:", err);
        alert("মেসেজ পাঠানো যায়নি।");
    }
}

async function sendLikeEmoji(partnerId) {
    await supabaseClient.from('messages').insert([{ sender_id: currentUser.id, receiver_id: partnerId, content: '👍', is_read: false }]);
}

async function uploadChatImage(file) {
    try {
        const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: true };
        const compressedFile = typeof imageCompression !== 'undefined' ? await imageCompression(file, options) : file;
        
        const fileName = `${currentUser.id}/${Date.now()}.jpg`;
        const { data, error } = await supabaseClient.storage.from('chat_images').upload(fileName, compressedFile);
        if (error) throw error;
        
        const { data: urlData } = supabaseClient.storage.from('chat_images').getPublicUrl(fileName);
        return urlData.publicUrl;
    } catch (err) { 
        console.error("Upload failed:", err); 
        return null; 
    }
}

function setupRealtimeChat(partnerId) {
    if (realtimeSubscription) supabaseClient.removeChannel(realtimeSubscription);
    realtimeSubscription = supabaseClient.channel('chat-room')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const msg = payload.new;
            if ((msg.sender_id === partnerId && msg.receiver_id === currentUser.id) || (msg.sender_id === currentUser.id && msg.receiver_id === partnerId)) {
                document.querySelector('.empty-chat-placeholder').style.display = 'none';
                appendMessageToUI(msg);
                scrollToBottom(true);
                if (msg.sender_id === partnerId) markAsSeen(partnerId);
            }
        }).subscribe();
}

// ==========================
// UI & EVENT HELPERS
// ==========================
function appendMessageToUI(msg) {
    const container = document.getElementById('messageContainer');
    const isMe = msg.sender_id === currentUser.id;
    let contentHTML = '';
    
    if (msg.image_url) contentHTML += `<img src="${msg.image_url}" class="bubble-image" onclick="viewFullScreenImage('${msg.image_url}')">`;
    if (msg.content) {
        if (msg.content === '👍') contentHTML += `<span style="font-size: 40px; margin: 5px;">👍</span>`;
        else contentHTML += `<div class="bubble">${msg.content}</div>`;
    }

    const bubbleClass = (msg.content === '👍' || (!msg.content && msg.image_url)) ? 'bg-transparent' : '';
    const html = `
        <div class="message-row ${isMe ? 'sent' : 'received'}">
            ${!isMe ? `<img src="${document.getElementById('chatHeaderImg').src}" class="msg-avatar">` : ''}
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
    if (input.value.trim() !== '' || selectedImageFile) { icon.className = 'fas fa-paper-plane'; icon.style.color = '#0084ff'; } 
    else { icon.className = 'fas fa-thumbs-up'; icon.style.color = '#0084ff'; }
}

function setupEventListeners() {
    document.getElementById('backToInboxBtn').addEventListener('click', () => {
        document.getElementById('conversation-view').style.display = 'none';
        document.getElementById('inbox-view').style.display = 'block';
        activeChatUserId = null;
        if (realtimeSubscription) supabaseClient.removeChannel(realtimeSubscription);
        loadChatList(); // রিফ্রেশ লিস্ট
    });
    
    const input = document.getElementById('messageInput');
    input.addEventListener('input', toggleSendButton);
    input.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });
    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
    
    // গ্যালারি ও ফাইল ট্রিগার
    const triggerFile = () => document.getElementById('chatImageInput').click();
    document.getElementById('galleryTriggerBtn').addEventListener('click', triggerFile);
    document.getElementById('addFileBtn').addEventListener('click', triggerFile);
    document.getElementById('cameraBtn').addEventListener('click', triggerFile);
    
    document.getElementById('chatImageInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedImageFile = file;
            document.getElementById('imagePreviewArea').style.display = 'flex';
            document.getElementById('previewImg').src = URL.createObjectURL(file);
            toggleSendButton();
        }
    });
    
    document.getElementById('cancelImageBtn')?.addEventListener('click', closeImagePreview);
    document.getElementById('closePreviewBtn')?.addEventListener('click', closeImagePreview); // ব্যাকআপ আইডি
    document.querySelector('.fs-close-btn').addEventListener('click', () => { document.getElementById('fullScreenImageModal').style.display = 'none'; });
}

function closeImagePreview() {
    selectedImageFile = null;
    document.getElementById('chatImageInput').value = '';
    document.getElementById('imagePreviewArea').style.display = 'none';
    toggleSendButton();
}

window.viewFullScreenImage = function(src) {
    const modal = document.getElementById('fullScreenImageModal');
    document.getElementById('fsModalImg').src = src;
    document.getElementById('downloadImgBtn').href = src;
    modal.style.display = 'flex';
}

async function markAsSeen(partnerId) {
    try { await supabaseClient.from('messages').update({ is_read: true }).eq('sender_id', partnerId).eq('receiver_id', currentUser.id).eq('is_read', false); } catch (e) {}
}

function timeAgoShort(dateString) {
    if (!dateString) return '';
    const diff = Math.floor((new Date() - new Date(dateString)) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h`;
    return `${Math.floor(diff/86400)}d`;
}