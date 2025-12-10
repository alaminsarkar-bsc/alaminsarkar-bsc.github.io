// Supabase কনফিগারেশন (আপনার প্রজেক্টের কি ব্যবহার করা হয়েছে)
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

// ==========================
// ১. ইনিশিয়ালাইজেশন
// ==========================
document.addEventListener('DOMContentLoaded', async () => {
    // লগইন চেক
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = '/index.html'; // লগইন না থাকলে হোমে ফেরত
        return;
    }
    
    currentUser = session.user;
    
    // নিজের অ্যাভাটার লোড করা (হেডারে)
    loadMyProfile();
    
    // ইনবক্স লোড করা
    loadChatList();
    
    // ইভেন্ট লিসেনার সেটআপ
    setupEventListeners();
});

// নিজের প্রোফাইল লোড
async function loadMyProfile() {
    const { data } = await supabaseClient.from('users').select('photo_url').eq('id', currentUser.id).single();
    const avatarContainer = document.getElementById('myHeaderAvatar');
    if (data?.photo_url) {
        avatarContainer.innerHTML = `<img src="${data.photo_url}" alt="Me">`;
    } else {
        avatarContainer.innerHTML = '<img src="./images/default-avatar.png" alt="Me">';
    }
}

// ==========================
// ২. ইনবক্স লজিক (Chat List) - UPDATED WITH SKELETON
// ==========================
async function loadChatList() {
    const container = document.getElementById('chatListContainer');
    
    // ১. লোডিং এর সময় স্কেলেটন দেখান (Spinner এর বদলে)
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
        // ডাটাবেজ ফাংশন কল
        const { data: partners, error } = await supabaseClient.rpc('get_chat_partners', { user_id: currentUser.id });

        if (error) throw error;

        // ডাটা আসলে কন্টেইনার খালি করে ফেলুন
        container.innerHTML = '';

        if (!partners || partners.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:50px 20px; color:#999;">
                <i class="fas fa-comments" style="font-size: 40px; margin-bottom: 10px; color: #ccc;"></i>
                <br>কোনো চ্যাট নেই।<br>নতুন চ্যাট শুরু করুন।
            </div>`;
            return;
        }

        // পার্টনারদের ডিটেইলস ফেচ করা
        for (const chat of partners) {
            const { data: user } = await supabaseClient.from('users').select('display_name, photo_url').eq('id', chat.partner_id).single();
            
            const timeString = timeAgoShort(chat.last_message_time);
            const isUnread = chat.unread_count > 0;
            let msgPreview = chat.last_message_content;
            
            // মেসেজ প্রিভিউ হ্যান্ডলিং
            if (!msgPreview) msgPreview = 'Sent a photo';
            else if (msgPreview === '👍') msgPreview = '👍';
            
            // স্টাইল সেট করা (বোল্ড যদি আনরিড থাকে)
            const previewStyle = isUnread ? 'font-weight: 700; color: black;' : 'color: #65676b;';
            const nameStyle = isUnread ? 'font-weight: 800; color: black;' : 'font-weight: 600; color: #050505;';

            const html = `
                <div class="chat-item-row" onclick="openChat('${chat.partner_id}')">
                    <div class="chat-avatar">
                        <img src="${user?.photo_url || './images/default-avatar.png'}" alt="User">
                    </div>
                    <div class="chat-info">
                        <h4 class="chat-name" style="${nameStyle}">${user?.display_name || 'Unknown'}</h4>
                        <div class="chat-preview">
                            <span class="msg-text" style="${previewStyle}">
                                ${msgPreview.substring(0, 30)}${msgPreview.length > 30 ? '...' : ''}
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
        console.error("Chat list error:", err);
        container.innerHTML = '<p style="text-align:center; color:red; padding: 20px;">লোড করতে সমস্যা হয়েছে।</p>';
    }
}

// ==========================
// ৩. চ্যাট রুম লজিক (Conversation)
// ==========================
async function openChat(partnerId) {
    activeChatUserId = partnerId;
    
    // ভিউ পরিবর্তন (Inbox -> Chat Room)
    document.getElementById('inbox-view').style.display = 'none';
    document.getElementById('conversation-view').style.display = 'flex';
    
    // লোডিং স্টেট সেট করা
    document.getElementById('messageContainer').innerHTML = '<div class="loader-container" style="padding-top:50px;"><div class="loader" style="border-color:#0084ff; border-bottom-color:transparent;"></div></div>';
    
    // ১. পার্টনার ইনফো লোড
    const { data: user } = await supabaseClient.from('users').select('*').eq('id', partnerId).single();
    if (user) {
        document.getElementById('chatHeaderName').innerText = user.display_name;
        document.getElementById('chatHeaderImg').src = user.photo_url || './images/default-avatar.png';
        document.getElementById('headerActiveDot').style.display = 'block'; // ফেক অনলাইন স্ট্যাটাস (বাস্তবে রিয়েলটাইম প্রেজেন্স লাগলে করা যাবে)
    }

    // ২. আগের মেসেজ লোড
    loadMessages(partnerId);

    // ৩. রিয়েলটাইম সাবস্ক্রিপশন
    setupRealtimeChat(partnerId);
}

async function loadMessages(partnerId) {
    const container = document.getElementById('messageContainer');
    
    const { data: messages, error } = await supabaseClient
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${currentUser.id})`)
        .order('created_at', { ascending: true });

    container.innerHTML = ''; // ক্লিয়ার লোডার

    if (error) {
        console.error(error);
        return;
    }

    if (messages.length === 0) {
        document.querySelector('.empty-chat-placeholder').style.display = 'block';
        document.getElementById('emptyStateName').innerText = document.getElementById('chatHeaderName').innerText;
        document.getElementById('emptyStateImg').src = document.getElementById('chatHeaderImg').src;
    } else {
        document.querySelector('.empty-chat-placeholder').style.display = 'none';
        messages.forEach(msg => {
            appendMessageToUI(msg);
        });
        scrollToBottom();
    }

    // Seen স্ট্যাটাস আপডেট
    markAsSeen(partnerId);
}

// ==========================
// ৪. মেসেজ পাঠানো (Sending)
// ==========================
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    const partnerId = activeChatUserId;

    if (!text && !selectedImageFile) {
        // যদি টেক্সট না থাকে, তবে "লাইক" (👍) পাঠাবে
        sendLikeEmoji(partnerId);
        return;
    }

    // অপটিমিস্টিক UI (সাথে সাথে দেখাবে)
    input.value = '';
    toggleSendButton(); // আইকন রিসেট
    
    // ইমেজ আপলোড (যদি থাকে)
    let imageUrl = null;
    if (selectedImageFile) {
        // লোডিং বাবল দেখানো যেতে পারে (Optional)
        imageUrl = await uploadChatImage(selectedImageFile);
        closeImagePreview(); // প্রিভিউ বন্ধ
    }

    const newMessage = {
        sender_id: currentUser.id,
        receiver_id: partnerId,
        content: text,
        image_url: imageUrl,
        is_read: false
    };

    try {
        const { error } = await supabaseClient.from('messages').insert([newMessage]);
        if (error) throw error;
        // রিয়েলটাইমে মেসেজ আসবে, তাই এখানে ম্যানুয়ালি অ্যাপেন্ড না করলেও চলে।
        // তবে ফাস্ট রেসপন্সের জন্য আমরা রিয়েলটাইম লিসেনারে ভরসা করব।
    } catch (err) {
        console.error("Send Error:", err);
        alert("মেসেজ পাঠানো যায়নি!");
    }
}

async function sendLikeEmoji(partnerId) {
    const newMessage = {
        sender_id: currentUser.id,
        receiver_id: partnerId,
        content: '👍', // থাম্বস আপ ইমোজি
        is_read: false
    };
    await supabaseClient.from('messages').insert([newMessage]);
}

// ==========================
// ৫. ইমেজ হ্যান্ডলিং
// ==========================
async function uploadChatImage(file) {
    try {
        // ইমেজ কমপ্রেশন
        const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: true };
        const compressedFile = await imageCompression(file, options);
        
        const fileName = `${currentUser.id}/${Date.now()}.jpg`;
        
        const { data, error } = await supabaseClient.storage
            .from('chat_images')
            .upload(fileName, compressedFile);
            
        if (error) throw error;
        
        const { data: urlData } = supabaseClient.storage.from('chat_images').getPublicUrl(fileName);
        return urlData.publicUrl;
    } catch (err) {
        console.error("Image Upload Error:", err);
        return null;
    }
}

// ==========================
// ৬. রিয়েলটাইম আপডেট
// ==========================
function setupRealtimeChat(partnerId) {
    if (realtimeSubscription) supabaseClient.removeChannel(realtimeSubscription);

    realtimeSubscription = supabaseClient.channel('chat-room')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const msg = payload.new;
            // যদি মেসেজটি এই চ্যাটের হয়
            if ((msg.sender_id === partnerId && msg.receiver_id === currentUser.id) ||
                (msg.sender_id === currentUser.id && msg.receiver_id === partnerId)) {
                
                document.querySelector('.empty-chat-placeholder').style.display = 'none';
                appendMessageToUI(msg);
                scrollToBottom();
                
                // যদি মেসেজটি পার্টনারের হয়, তবে সিন করে দিন
                if (msg.sender_id === partnerId) markAsSeen(partnerId);
            }
        })
        .subscribe();
}

// ==========================
// ৭. UI হেল্পারস
// ==========================
function appendMessageToUI(msg) {
    const container = document.getElementById('messageContainer');
    const isMe = msg.sender_id === currentUser.id;
    
    // ইমেজ থাকলে
    let imageHTML = '';
    if (msg.image_url) {
        imageHTML = `<img src="${msg.image_url}" class="bubble-image" onclick="viewFullScreenImage('${msg.image_url}')">`;
    }

    // টেক্সট থাকলে (লাইক ইমোজি হলে বড় দেখাবে)
    let textHTML = '';
    if (msg.content) {
        if (msg.content === '👍') {
            textHTML = `<span style="font-size: 40px;">👍</span>`;
        } else {
            textHTML = `<div class="bubble">${msg.content}</div>`;
        }
    }

    // যদি শুধু ইমেজ থাকে, বাবলের ব্যাকগ্রাউন্ড থাকবে না
    const bubbleClass = (msg.content === '👍' || (!msg.content && msg.image_url)) ? 'bg-transparent' : '';

    const html = `
        <div class="message-row ${isMe ? 'sent' : 'received'}">
            ${!isMe ? `<img src="${document.getElementById('chatHeaderImg').src}" class="msg-avatar">` : ''}
            <div class="message-content ${bubbleClass}" style="display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'}">
                ${imageHTML}
                ${textHTML}
                <!-- টাইমস্ট্যাম্প (Optional: হোভার করলে দেখাতে পারেন) -->
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', html);
}

function scrollToBottom() {
    const main = document.getElementById('messageContainer');
    main.scrollTop = main.scrollHeight;
}

function toggleSendButton() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('sendMessageBtn');
    const icon = btn.querySelector('i');
    
    if (input.value.trim() !== '' || selectedImageFile) {
        icon.className = 'fas fa-paper-plane'; // সেন্ড আইকন
        icon.style.color = '#0084ff';
    } else {
        icon.className = 'fas fa-thumbs-up'; // লাইক আইকন
        icon.style.color = '#0084ff';
    }
}

// ==========================
// ৮. ইভেন্ট লিসেনার সেটআপ
// ==========================
function setupEventListeners() {
    // ব্যাক বাটন (Chat -> Inbox)
    document.getElementById('backToInboxBtn').addEventListener('click', () => {
        document.getElementById('conversation-view').style.display = 'none';
        document.getElementById('inbox-view').style.display = 'block';
        activeChatUserId = null;
        if (realtimeSubscription) supabaseClient.removeChannel(realtimeSubscription);
        loadChatList(); // লিস্ট রিফ্রেশ
    });

    // ইনপুট হ্যান্ডলার (লাইক বাটন টগল)
    const input = document.getElementById('messageInput');
    input.addEventListener('input', toggleSendButton);
    input.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // সেন্ড বাটন
    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);

    // ইমেজ সিলেকশন
    document.getElementById('galleryTriggerBtn').addEventListener('click', () => document.getElementById('chatImageInput').click());
    document.getElementById('addFileBtn').addEventListener('click', () => document.getElementById('chatImageInput').click());
    
    document.getElementById('chatImageInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedImageFile = file;
            const preview = document.getElementById('imagePreviewArea'); // HTML এ id "imagePreviewPanel" বা "imagePreviewArea" হতে পারে, চেক করুন।
            // ফিক্স: messages.html এ id="imagePreviewPanel" ব্যবহার করা হয়েছে।
            const panel = document.getElementById('imagePreviewPanel');
            const img = document.getElementById('uploadPreviewImg');
            
            img.src = URL.createObjectURL(file);
            panel.style.display = 'block';
            toggleSendButton();
        }
    });

    // প্রিভিউ ক্লোজ
    document.getElementById('closePreviewBtn').addEventListener('click', closeImagePreview);

    // ফুল স্ক্রিন ইমেজ ক্লোজ
    document.querySelector('.fs-close-btn').addEventListener('click', () => {
        document.getElementById('fullScreenImageModal').style.display = 'none';
    });
}

function closeImagePreview() {
    selectedImageFile = null;
    document.getElementById('chatImageInput').value = '';
    document.getElementById('imagePreviewPanel').style.display = 'none';
    toggleSendButton();
}

window.viewFullScreenImage = function(src) {
    const modal = document.getElementById('fullScreenImageModal');
    const img = document.getElementById('fsModalImg');
    const dlBtn = document.getElementById('downloadImgBtn');
    
    img.src = src;
    dlBtn.href = src;
    modal.style.display = 'flex';
}

async function markAsSeen(partnerId) {
    await supabaseClient
        .from('messages')
        .update({ is_read: true })
        .eq('sender_id', partnerId)
        .eq('receiver_id', currentUser.id)
        .eq('is_read', false);
}

// টাইম ফরম্যাটার (ছোট)
function timeAgoShort(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // seconds
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h`;
    return `${Math.floor(diff/86400)}d`;
}