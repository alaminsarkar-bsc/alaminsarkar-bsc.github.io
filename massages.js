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

// ==========================
// ১. অ্যাপ লোডিং এবং অথেন্টিকেশন
// ==========================
document.addEventListener('DOMContentLoaded', async () => {
    // লোডিং এর সময় সাদা স্ক্রিন এড়াতে প্রাথমিকভাবে বডি হাইড করা যায়,
    // তবে ইউজারের সুবিধার জন্য আমরা লোডার দেখাব
    
    // সেশন চেক
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    if (error || !session) {
        window.location.href = '/index.html'; // লগইন না থাকলে হোমে ফেরত
        return;
    }
    
    currentUser = session.user;
    
    // হেডার প্রোফাইল লোড (উপরে বামে)
    loadMyProfile();
    
    // নেভিগেশন হ্যান্ডলিং (প্রোফাইল পেজ থেকে মেসেজ বাটনে ক্লিক করলে)
    const startChatUser = localStorage.getItem('startChatWith');
    if (startChatUser) {
        localStorage.removeItem('startChatWith');
        // সরাসরি চ্যাট উইন্ডো ওপেন করুন
        openChat(startChatUser);
    } else {
        // নাহলে ইনবক্স লোড করুন
        loadChatList();
    }
    
    // ইভেন্ট লিসেনার সেটআপ
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
    } catch(e) {
        console.warn("Profile pic load error", e);
    }
}

// ==========================
// ২. ইনবক্স লজিক (Chat List)
// ==========================
async function loadChatList() {
    const container = document.getElementById('chatListContainer');
    if(!container) return;

    // ১. স্কেলেটন লোডার (লোডিং এনিমেশন) দেখানো
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
                        <i class="fas fa-comment-dots" style="font-size: 30px; color: #ccc;"></i>
                    </div>
                    <h3 style="margin:0; color:#333;">No Messages</h3>
                    <p style="font-size:13px;">Start a conversation with someone.</p>
                </div>`;
            return;
        }

        // ৪. লিস্ট রেন্ডার
        for (const chat of partners) {
            // ইউজারের নাম ছবি ফেচ করা
            const { data: user } = await supabaseClient.from('users').select('display_name, photo_url').eq('id', chat.partner_id).single();
            
            const timeString = timeAgoShort(chat.last_message_time);
            const isUnread = chat.unread_count > 0;
            let msgPreview = chat.last_message_content;
            
            // প্রিভিউ টেক্সট ঠিক করা
            if (!msgPreview) msgPreview = 'Sent a photo 📷';
            else if (msgPreview === '👍') msgPreview = '👍';
            
            // স্টাইল সেট করা
            const nameStyle = isUnread ? 'font-weight: 800; color: black;' : 'font-weight: 600; color: #050505;';
            const previewStyle = isUnread ? 'font-weight: 700; color: black;' : 'color: #65676b;';
            
            // আনরিড হলে ব্যাকগ্রাউন্ড একটু আলাদা হবে না (মেসেঞ্জার স্টাইল), শুধু টেক্সট বোল্ড হবে
            // কিন্তু ইউজার বোঝার সুবিধার্থে আমরা ডট দেখাব

            const html = `
                <div class="chat-item-row" onclick="openChat('${chat.partner_id}')">
                    <div class="chat-avatar">
                        <img src="${user?.photo_url || './images/default-avatar.png'}" alt="User">
                        <!-- রিয়েলটাইম একটিভ স্ট্যাটাস না থাকলে আনরিড ব্যাজ এখানে দেখানো যেতে পারে -->
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
                <small>দয়া করে ইন্টারনেট চেক করুন অথবা এডমিনকে জানান।</small>
            </div>`;
    }
}

// ==========================
// ৩. চ্যাট রুম লজিক (Conversation)
// ==========================
async function openChat(partnerId) {
    activeChatUserId = partnerId;
    
    // ভিউ পরিবর্তন
    document.getElementById('inbox-view').style.display = 'none';
    document.getElementById('conversation-view').style.display = 'flex';
    
    // লোডার দেখানো
    const msgContainer = document.getElementById('messageContainer');
    msgContainer.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%;"><div class="loader"></div></div>';
    
    try {
        // পার্টনার ইনফো আনা
        const { data: user } = await supabaseClient.from('users').select('*').eq('id', partnerId).single();
        if (user) {
            document.getElementById('chatHeaderName').innerText = user.display_name;
            document.getElementById('chatHeaderImg').src = user.photo_url || './images/default-avatar.png';
            document.getElementById('headerActiveDot').style.display = 'block'; // ফেক অনলাইন স্ট্যাটাস
        }

        // মেসেজ লোড এবং রিয়েলটাইম সেটআপ
        await loadMessages(partnerId);
        setupRealtimeChat(partnerId);

    } catch (err) {
        console.error("Open chat error:", err);
    }
}

async function loadMessages(partnerId) {
    const container = document.getElementById('messageContainer');
    
    // আমার এবং পার্টনারের মধ্যে সব মেসেজ আনা
    const { data: messages, error } = await supabaseClient
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${currentUser.id})`)
        .order('created_at', { ascending: true });

    container.innerHTML = ''; // লোডার সরানো

    if (messages && messages.length > 0) {
        // এম্পটি প্লেসহোল্ডার হাইড
        document.querySelector('.empty-chat-placeholder').style.display = 'none';
        
        messages.forEach(msg => appendMessageToUI(msg));
        
        scrollToBottom(false); // লোড হওয়ার সময় স্মুথ স্ক্রল অফ
    } else {
        // নতুন চ্যাট হলে প্লেসহোল্ডার শো
        document.querySelector('.empty-chat-placeholder').style.display = 'block';
        document.getElementById('emptyStateName').innerText = document.getElementById('chatHeaderName').innerText;
        document.getElementById('emptyStateImg').src = document.getElementById('chatHeaderImg').src;
    }
    
    // সিন (Seen) করা
    markAsSeen(partnerId);
}

// ==========================
// ৪. মেসেজ পাঠানো (Send Logic)
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
    
    let imageUrl = null;
    if (selectedImageFile) {
        isUploading = true;
        imageUrl = await uploadChatImage(selectedImageFile);
        closeImagePreview();
        isUploading = false;
        
        if (!imageUrl) return; // আপলোড ফেইল করলে রিটার্ন
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
        // রিয়েলটাইমে মেসেজ আসবে, তাই এখানে অ্যাপেন্ড না করলেও চলে
    } catch (err) {
        console.error("Send failed:", err);
        alert("মেসেজ পাঠানো যায়নি।");
    }
}

async function sendLikeEmoji(partnerId) {
    try {
        await supabaseClient.from('messages').insert([{ 
            sender_id: currentUser.id, 
            receiver_id: partnerId, 
            content: '👍', 
            is_read: false 
        }]);
    } catch (e) {}
}

async function uploadChatImage(file) {
    try {
        // ইমেজ কমপ্রেশন
        const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: true };
        const compressedFile = typeof imageCompression !== 'undefined' ? await imageCompression(file, options) : file;
        
        const fileName = `${currentUser.id}/${Date.now()}.jpg`;
        const { data, error } = await supabaseClient.storage.from('chat_images').upload(fileName, compressedFile);
        
        if (error) throw error;
        
        const { data: urlData } = supabaseClient.storage.from('chat_images').getPublicUrl(fileName);
        return urlData.publicUrl;
    } catch (err) { 
        console.error("Upload failed:", err); 
        alert("ছবি আপলোড ব্যর্থ হয়েছে।");
        return null; 
    }
}

// ==========================
// ৫. রিয়েলটাইম (Realtime)
// ==========================
function setupRealtimeChat(partnerId) {
    if (realtimeSubscription) supabaseClient.removeChannel(realtimeSubscription);
    
    realtimeSubscription = supabaseClient.channel('chat-room')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const msg = payload.new;
            
            // যদি এই চ্যাটের মেসেজ হয়
            if ((msg.sender_id === partnerId && msg.receiver_id === currentUser.id) || 
                (msg.sender_id === currentUser.id && msg.receiver_id === partnerId)) {
                
                document.querySelector('.empty-chat-placeholder').style.display = 'none';
                appendMessageToUI(msg);
                scrollToBottom(true);
                
                if (msg.sender_id === partnerId) markAsSeen(partnerId);
            }
        }).subscribe();
}

// ==========================
// ৬. UI হেল্পার ফাংশন
// ==========================
function appendMessageToUI(msg) {
    const container = document.getElementById('messageContainer');
    const isMe = msg.sender_id === currentUser.id;
    let contentHTML = '';
    
    if (msg.image_url) {
        contentHTML += `<img src="${msg.image_url}" class="bubble-image" onclick="viewFullScreenImage('${msg.image_url}')">`;
    }
    
    if (msg.content) {
        if (msg.content === '👍') {
            contentHTML += `<span style="font-size: 40px; margin: 5px;">👍</span>`;
        } else {
            contentHTML += `<div class="bubble">${msg.content}</div>`;
        }
    }

    // ব্যাকগ্রাউন্ড ট্রান্সপারেন্ট যদি শুধু লাইক বা ইমেজ হয়
    const bubbleClass = (msg.content === '👍' || (!msg.content && msg.image_url)) ? 'bg-transparent' : '';
    
    // পার্টনারের ছবি (শুধু রিসিভ মেসেজে)
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
    
    // যদি ইনপুটে লেখা থাকে অথবা ছবি সিলেক্ট করা থাকে তাহলে সেন্ড আইকন
    if (input.value.trim() !== '' || selectedImageFile) { 
        icon.className = 'fas fa-paper-plane'; 
        icon.style.color = '#0084ff'; 
    } 
    // না থাকলে লাইক আইকন
    else { 
        icon.className = 'fas fa-thumbs-up'; 
        icon.style.color = '#0084ff'; 
    }
}

function timeAgoShort(dateString) {
    if (!dateString) return '';
    const diff = Math.floor((new Date() - new Date(dateString)) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h`;
    return `${Math.floor(diff/86400)}d`;
}

async function markAsSeen(partnerId) {
    try { 
        await supabaseClient
            .from('messages')
            .update({ is_read: true })
            .eq('sender_id', partnerId)
            .eq('receiver_id', currentUser.id)
            .eq('is_read', false); 
    } catch (e) {}
}

// ==========================
// ৭. ইভেন্ট লিসেনার
// ==========================
function setupEventListeners() {
    // ব্যাক বাটন
    document.getElementById('backToInboxBtn').addEventListener('click', () => {
        document.getElementById('conversation-view').style.display = 'none';
        document.getElementById('inbox-view').style.display = 'block';
        activeChatUserId = null;
        if (realtimeSubscription) supabaseClient.removeChannel(realtimeSubscription);
        loadChatList(); // লিস্ট রিফ্রেশ
    });
    
    // ইনপুট
    const input = document.getElementById('messageInput');
    input.addEventListener('input', toggleSendButton);
    input.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });
    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
    
    // মিডিয়া আপলোড বাটন
    const triggerFile = () => document.getElementById('chatImageInput').click();
    document.getElementById('galleryTriggerBtn').addEventListener('click', triggerFile);
    document.getElementById('addFileBtn').addEventListener('click', triggerFile);
    document.getElementById('cameraBtn').addEventListener('click', triggerFile);
    
    // ফাইল চেঞ্জ হ্যান্ডলার
    document.getElementById('chatImageInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedImageFile = file;
            // প্রিভিউ দেখানো (CSS ক্লাস ঠিক করা হয়েছে)
            const panel = document.getElementById('imagePreviewArea') || document.getElementById('imagePreviewPanel');
            if(panel) { 
                panel.style.display = 'flex'; 
                const img = panel.querySelector('img');
                if(img) img.src = URL.createObjectURL(file); 
                toggleSendButton(); 
            }
        }
    });
    
    // প্রিভিউ ক্লোজ
    const closePreviewAction = () => closeImagePreview();
    const cancelBtn = document.getElementById('cancelImageBtn');
    const closePreviewBtn = document.getElementById('closePreviewBtn');
    if(cancelBtn) cancelBtn.addEventListener('click', closePreviewAction);
    if(closePreviewBtn) closePreviewBtn.addEventListener('click', closePreviewAction);
    
    // ফুল স্ক্রিন ক্লোজ
    document.querySelector('.fs-close-btn').addEventListener('click', () => { 
        document.getElementById('fullScreenImageModal').style.display = 'none'; 
    });
}

function closeImagePreview() {
    selectedImageFile = null;
    document.getElementById('chatImageInput').value = '';
    const panel = document.getElementById('imagePreviewArea') || document.getElementById('imagePreviewPanel');
    if(panel) panel.style.display = 'none';
    toggleSendButton();
}

window.viewFullScreenImage = function(src) {
    const modal = document.getElementById('fullScreenImageModal');
    document.getElementById('fsModalImg').src = src;
    const dlBtn = document.getElementById('downloadImgBtn');
    if(dlBtn) dlBtn.href = src;
    modal.style.display = 'flex';
}