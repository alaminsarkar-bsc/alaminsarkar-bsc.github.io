// ==========================================
// 1. CONFIGURATION & STATE MANAGEMENT
// ==========================================
const SUPABASE_URL = 'https://pnsvptaanvtdaspqjwbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuc3ZwdGFhbnZ0ZGFzcHFqd2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMzcxNjMsImV4cCI6MjA3NTkxMzE2M30.qposYOL-W17DnFF11cJdZ7zrN1wh4Bop6YnclkUe_rU';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global State
let currentUser = null;
let activeChatUserId = null;
let realtimeSubscription = null;
let selectedImageFile = null;
let isUploading = false;

// ==========================================
// 2. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // ১. সেশন চেক করা
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error || !session) {
            console.warn("User not logged in, redirecting...");
            window.location.href = '/index.html';
            return;
        }
        
        currentUser = session.user;
        
        // ২. ইউজারের নিজের প্রোফাইল ছবি লোড (হেডারে)
        await loadMyProfile();
        
        // ৩. ইভেন্ট লিসেনার সেটআপ
        setupEventListeners();

        // ৪. নেভিগেশন হ্যান্ডলিং (অন্য পেজ থেকে চ্যাট শুরু করলে)
        const startChatUser = localStorage.getItem('startChatWith');
        if (startChatUser) {
            console.log("Starting new chat with:", startChatUser);
            localStorage.removeItem('startChatWith');
            await openChat(startChatUser);
        } else {
            // ডিফল্ট ইনবক্স লোড
            await loadChatList();
        }

    } catch (err) {
        console.error("Initialization Error:", err);
        showToast("অ্যাপ লোড করতে সমস্যা হয়েছে। রিফ্রেশ করুন।");
    }
});

// নিজের প্রোফাইল লোড ফাংশন
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
    } catch (e) {
        console.warn("Profile load failed:", e);
    }
}

// ==========================================
// 3. INBOX LIST LOGIC (Chat List)
// ==========================================
async function loadChatList() {
    const container = document.getElementById('chatListContainer');
    if (!container) return;

    // ১. স্কেলেটন লোডার দেখানো (ফাঁকা না রেখে এনিমেশন দেখাবে)
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
        // ২. ডাটাবেজ থেকে চ্যাট পার্টনারদের লিস্ট আনা (RPC ফাংশন দিয়ে)
        const { data: partners, error } = await supabaseClient.rpc('get_chat_partners', { user_id: currentUser.id });

        if (error) throw error;

        container.innerHTML = ''; // স্কেলেটন সরানো

        // ৩. যদি কোনো চ্যাট না থাকে (খালি ইনবক্স)
        if (!partners || partners.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:50px 20px; color:#999; display:flex; flex-direction:column; align-items:center;">
                    <div style="background:#f0f2f5; padding:20px; border-radius:50%; margin-bottom:15px;">
                        <i class="fas fa-comment-medical" style="font-size: 30px; color: #ccc;"></i>
                    </div>
                    <h3 style="margin:0; color:#333;">কোনো মেসেজ নেই</h3>
                    <p style="font-size:13px;">বন্ধুদের সাথে চ্যাট শুরু করুন।</p>
                </div>`;
            return;
        }

        // ৪. চ্যাট লিস্ট রেন্ডার করা
        for (const chat of partners) {
            // ইউজারের নাম ও ছবি ফেচ করা
            const { data: user } = await supabaseClient.from('users').select('display_name, photo_url').eq('id', chat.partner_id).single();
            
            const timeString = timeAgoShort(chat.last_message_time);
            const isUnread = chat.unread_count > 0;
            let msgPreview = chat.last_message_content;
            
            // স্পেশাল কন্টেন্ট হ্যান্ডলিং
            if (!msgPreview) msgPreview = 'Sent a photo 📷';
            else if (msgPreview === '👍') msgPreview = '👍';
            
            // আনরিড মেসেজ স্টাইল
            const nameStyle = isUnread ? 'font-weight: 800; color: #000;' : 'font-weight: 600; color: #050505;';
            const previewStyle = isUnread ? 'font-weight: 700; color: #000;' : 'color: #65676b;';
            const bgClass = isUnread ? 'style="background-color: #f0f9ff;"' : ''; // আনরিড হলে হালকা নীল ব্যাকগ্রাউন্ড

            const html = `
                <div class="chat-item-row" onclick="openChat('${chat.partner_id}')" ${bgClass}>
                    <div class="chat-avatar">
                        <img src="${user?.photo_url || './images/default-avatar.png'}" alt="User">
                        ${isUnread ? '<div class="online-badge" style="border:2px solid white;"></div>' : ''} 
                    </div>
                    <div class="chat-info">
                        <h4 class="chat-name" style="${nameStyle}">${user?.display_name || 'Unknown User'}</h4>
                        <div class="chat-preview">
                            <span class="msg-text" style="${previewStyle}">
                                ${msgPreview.length > 25 ? msgPreview.substring(0, 25) + '...' : msgPreview}
                            </span>
                            <span class="msg-dot">· ${timeString}</span>
                        </div>
                    </div>
                    ${isUnread ? `<div class="unread-dot"></div>` : ''}
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        }

    } catch (err) {
        console.error("Chat list fetch error:", err);
        container.innerHTML = `
            <div style="text-align:center; padding: 20px; color: red;">
                <p>মেসেজ লোড করা যায়নি।</p>
                <button onclick="loadChatList()" class="footer-btn" style="color:blue; font-size:14px;">রিফ্রেশ করুন</button>
            </div>`;
    }
}

// ==========================================
// 4. CHAT ROOM LOGIC (Conversation)
// ==========================================
async function openChat(partnerId) {
    activeChatUserId = partnerId;
    
    // ভিউ সোয়াইপ (Inbox হাইড, Chat Room শো)
    document.getElementById('inbox-view').style.display = 'none';
    document.getElementById('conversation-view').style.display = 'flex';
    
    // চ্যাট এরিয়া ক্লিয়ার ও লোডার সেট করা
    const msgContainer = document.getElementById('messageContainer');
    msgContainer.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%;"><div class="loader" style="border-color:#0084ff; border-bottom-color:transparent;"></div></div>';
    
    try {
        // ১. পার্টনার ইনফো আনা
        const { data: user, error } = await supabaseClient.from('users').select('*').eq('id', partnerId).single();
        
        if (error) throw error;

        // হেডার আপডেট
        if (user) {
            document.getElementById('chatHeaderName').innerText = user.display_name || "User";
            document.getElementById('chatHeaderImg').src = user.photo_url || './images/default-avatar.png';
            document.getElementById('chatHeaderStatus').innerText = 'Active on iPray';
        }

        // ২. আগের মেসেজ লোড করা
        await loadMessages(partnerId);

        // ৩. রিয়েলটাইম কানেকশন চালু করা
        setupRealtimeChat(partnerId);

    } catch (err) {
        console.error("Open chat error:", err);
        showToast("চ্যাট ওপেন করতে সমস্যা হয়েছে।");
        // ব্যাকে পাঠানো
        document.getElementById('backToInboxBtn').click();
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

    if (error) {
        console.error("Message load error:", error);
        return;
    }

    if (!messages || messages.length === 0) {
        // যদি নতুন চ্যাট হয় (Empty State)
        document.querySelector('.empty-chat-placeholder').style.display = 'block';
        document.getElementById('emptyStateName').innerText = document.getElementById('chatHeaderName').innerText;
        document.getElementById('emptyStateImg').src = document.getElementById('chatHeaderImg').src;
    } else {
        document.querySelector('.empty-chat-placeholder').style.display = 'none';
        
        // মেসেজ রেন্ডার করা
        messages.forEach(msg => {
            appendMessageToUI(msg);
        });
        
        scrollToBottom(false); // Smooth ছাড়া স্ক্রল (দ্রুত লোডের জন্য)
    }

    // মেসেজ সিন (Seen) করা
    markAsSeen(partnerId);
}

// ==========================================
// 5. SENDING MESSAGE LOGIC
// ==========================================
async function sendMessage() {
    if (isUploading) return; // আপলোড চলাকালীন ডাবল ক্লিক রোধ

    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    const partnerId = activeChatUserId;

    // ভ্যালিডেশন: টেক্সট বা ছবি কিছু না থাকলে লাইক পাঠাবে
    if (!text && !selectedImageFile) {
        sendLikeEmoji(partnerId);
        return;
    }

    // UI রিসেট (Optimistic Updates)
    input.value = '';
    toggleSendButton(); // আইকন রিসেট
    
    let imageUrl = null;

    try {
        // ১. ছবি থাকলে আপলোড করা
        if (selectedImageFile) {
            isUploading = true;
            // প্রিভিউ এরিয়ায় লোডিং দেখানো যেতে পারে
            imageUrl = await uploadChatImage(selectedImageFile);
            closeImagePreview(); // প্রিভিউ বন্ধ
            isUploading = false;
            
            if (!imageUrl) throw new Error("Image upload failed");
        }

        // ২. ডাটাবেসে মেসেজ ইনসার্ট
        const newMessage = {
            sender_id: currentUser.id,
            receiver_id: partnerId,
            content: text, // টেক্সট অথবা নাল
            image_url: imageUrl,
            is_read: false
        };

        const { error } = await supabaseClient.from('messages').insert([newMessage]);
        
        if (error) throw error;

        // সাউন্ড ইফেক্ট (Optional)
        // playSentSound();

    } catch (err) {
        console.error("Send Error:", err);
        showToast("মেসেজ পাঠানো যায়নি! ইন্টারনেট চেক করুন।");
        isUploading = false;
    }
}

// থাম্বস আপ (👍) পাঠানো
async function sendLikeEmoji(partnerId) {
    try {
        await supabaseClient.from('messages').insert([{
            sender_id: currentUser.id,
            receiver_id: partnerId,
            content: '👍',
            is_read: false
        }]);
    } catch (err) { console.error(err); }
}

// ==========================================
// 6. IMAGE HANDLING & COMPRESSION
// ==========================================
async function uploadChatImage(file) {
    try {
        // ইমেজ কমপ্রেশন (Browser Image Compression Library)
        const options = {
            maxSizeMB: 0.5, // 500KB
            maxWidthOrHeight: 1200,
            useWebWorker: true
        };
        
        const compressedFile = await imageCompression(file, options);
        const fileName = `${currentUser.id}/${Date.now()}_img.jpg`;
        
        // Supabase Storage এ আপলোড
        const { data, error } = await supabaseClient.storage
            .from('chat_images')
            .upload(fileName, compressedFile);
            
        if (error) throw error;
        
        // পাবলিক ইউআরএল আনা
        const { data: urlData } = supabaseClient.storage
            .from('chat_images')
            .getPublicUrl(fileName);
            
        return urlData.publicUrl;

    } catch (err) {
        console.error("Image Upload Error:", err);
        showToast("ছবি আপলোড ব্যর্থ হয়েছে।");
        return null;
    }
}

// ==========================================
// 7. REAL-TIME UPDATES (Supabase Subscription)
// ==========================================
function setupRealtimeChat(partnerId) {
    // আগের সাবস্ক্রিপশন থাকলে বাতিল করা
    if (realtimeSubscription) {
        supabaseClient.removeChannel(realtimeSubscription);
    }

    realtimeSubscription = supabaseClient.channel('chat-room')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'messages' }, 
            payload => {
                const msg = payload.new;
                
                // চেক করা: মেসেজটি কি এই চ্যাটের?
                if ((msg.sender_id === partnerId && msg.receiver_id === currentUser.id) ||
                    (msg.sender_id === currentUser.id && msg.receiver_id === partnerId)) {
                    
                    document.querySelector('.empty-chat-placeholder').style.display = 'none';
                    appendMessageToUI(msg);
                    scrollToBottom(true); // Smooth scroll
                    
                    // যদি মেসেজটি পার্টনার পাঠায়, তবে সাথে সাথে সিন করে দেওয়া
                    if (msg.sender_id === partnerId) {
                        markAsSeen(partnerId);
                        // playReceiveSound();
                    }
                }
            }
        )
        .subscribe();
}

// ==========================================
// 8. UI RENDER HELPERS
// ==========================================
function appendMessageToUI(msg) {
    const container = document.getElementById('messageContainer');
    const isMe = msg.sender_id === currentUser.id;
    
    // ইমেজ কনটেন্ট
    let imageHTML = '';
    if (msg.image_url) {
        imageHTML = `<img src="${msg.image_url}" class="bubble-image" onclick="viewFullScreenImage('${msg.image_url}')" loading="lazy">`;
    }

    // টেক্সট কনটেন্ট
    let textHTML = '';
    if (msg.content) {
        if (msg.content === '👍') {
            textHTML = `<span style="font-size: 40px; margin: 5px;">👍</span>`;
        } else {
            // লিংক ডিটেকশন থাকলে ভালো হয়, আপাতত প্লেইন টেক্সট
            textHTML = `<div class="bubble">${msg.content}</div>`;
        }
    }

    // স্টাইলিং ক্লাস
    const rowClass = isMe ? 'sent' : 'received';
    const bubbleClass = (msg.content === '👍' || (!msg.content && msg.image_url)) ? 'bg-transparent' : '';
    
    // ইউজারের ছোট ছবি (শুধু রিসিভ মেসেজের জন্য)
    const avatarHTML = !isMe ? `<img src="${document.getElementById('chatHeaderImg').src}" class="msg-avatar">` : '';

    const html = `
        <div class="message-row ${rowClass}">
            ${avatarHTML}
            <div class="message-content ${bubbleClass}" style="display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'}">
                ${imageHTML}
                ${textHTML}
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', html);
}

function scrollToBottom(smooth = false) {
    const main = document.getElementById('messageContainer');
    main.scrollTo({
        top: main.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
    });
}

function toggleSendButton() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('sendMessageBtn');
    const icon = btn.querySelector('i');
    
    // যদি ইনপুটে লেখা থাকে অথবা ছবি সিলেক্ট করা থাকে
    if (input.value.trim() !== '' || selectedImageFile) {
        icon.className = 'fas fa-paper-plane'; // সেন্ড আইকন
        icon.style.color = '#0084ff';
    } else {
        icon.className = 'fas fa-thumbs-up'; // লাইক আইকন
        icon.style.color = '#0084ff';
    }
}

// সিন স্ট্যাটাস আপডেট
async function markAsSeen(partnerId) {
    try {
        await supabaseClient
            .from('messages')
            .update({ is_read: true })
            .eq('sender_id', partnerId)
            .eq('receiver_id', currentUser.id)
            .eq('is_read', false);
    } catch (e) {
        console.error("Seen status update failed", e);
    }
}

// ==========================================
// 9. EVENT LISTENERS
// ==========================================
function setupEventListeners() {
    // ১. ব্যাক বাটন (চ্যাট -> ইনবক্স)
    document.getElementById('backToInboxBtn').addEventListener('click', () => {
        document.getElementById('conversation-view').style.display = 'none';
        document.getElementById('inbox-view').style.display = 'block';
        activeChatUserId = null;
        if (realtimeSubscription) supabaseClient.removeChannel(realtimeSubscription);
        loadChatList(); // লিস্ট রিফ্রেশ করে নতুন মেসেজ দেখাবে
    });

    // ২. ইনপুট হ্যান্ডলিং
    const input = document.getElementById('messageInput');
    input.addEventListener('input', toggleSendButton);
    input.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // ৩. সেন্ড বাটন
    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);

    // ৪. ইমেজ সিলেকশন ট্রিগার
    document.getElementById('galleryTriggerBtn').addEventListener('click', () => document.getElementById('chatImageInput').click());
    document.getElementById('addFileBtn').addEventListener('click', () => document.getElementById('chatImageInput').click()); // প্লাস বাটনও গ্যালারি খুলবে
    document.getElementById('cameraBtn').addEventListener('click', () => document.getElementById('chatImageInput').click());

    // ৫. ইমেজ সিলেক্ট হলে প্রিভিউ
    document.getElementById('chatImageInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            // ৫ এমবির বেশি হলে আটকাবে
            if(file.size > 5 * 1024 * 1024) {
                showToast("ছবির সাইজ ৫ এমবির বেশি হতে পারবে না।");
                return;
            }
            selectedImageFile = file;
            const panel = document.getElementById('imagePreviewArea'); // HTML id চেক করে নিবেন (imagePreviewArea বা imagePreviewPanel)
            const img = document.getElementById('previewImg');
            
            // ফিক্স: messages.html এ id="imagePreviewArea" ব্যবহার করা হয়েছে
            if(panel) {
                panel.style.display = 'block';
                img.src = URL.createObjectURL(file);
                toggleSendButton(); // সেন্ড আইকন শো করবে
            }
        }
    });

    // ৬. প্রিভিউ ক্লোজ বাটন
    const cancelBtn = document.getElementById('cancelImageBtn');
    if(cancelBtn) cancelBtn.addEventListener('click', closeImagePreview);

    // ৭. ফুল স্ক্রিন ইমেজ ক্লোজ
    document.querySelector('.fs-close-btn').addEventListener('click', () => {
        document.getElementById('fullScreenImageModal').style.display = 'none';
    });
}

function closeImagePreview() {
    selectedImageFile = null;
    document.getElementById('chatImageInput').value = '';
    const panel = document.getElementById('imagePreviewArea');
    if(panel) panel.style.display = 'none';
    toggleSendButton();
}

window.viewFullScreenImage = function(src) {
    const modal = document.getElementById('fullScreenImageModal');
    document.getElementById('fsModalImg').src = src;
    
    // ডাউনলোড বাটন হ্যান্ডলিং
    const dlBtn = document.getElementById('downloadImgBtn');
    if(dlBtn) {
        dlBtn.href = src;
    }
    
    modal.style.display = 'flex';
}

// টোস্ট মেসেজ (Simple Alert Replacement)
function showToast(message) {
    // কাস্টম টোস্ট না থাকলে সাধারণ অ্যালার্ট
    alert(message);
}

// টাইম ফরম্যাটার (Facebook Style)
function timeAgoShort(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // seconds
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h`;
    if (diff < 604800) return `${Math.floor(diff/86400)}d`;
    return `${Math.floor(diff/604800)}w`;
}