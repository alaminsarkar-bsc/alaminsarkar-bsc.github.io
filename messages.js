/* --- START OF FILE messages.js --- */

// ================================================================
// ১. কনফিগারেশন এবং ক্রেডেনশিয়াল সেটআপ
// ================================================================
const SUPABASE_URL = 'https://pnsvptaanvtdaspqjwbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuc3ZwdGFhbnZ0ZGFzcHFqd2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMzcxNjMsImV4cCI6MjA3NTkxMzE2M30.qposYOL-W17DnFF11cJdZ7zrN1wh4Bop6YnclkUe_rU';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ZEGO CLOUD কনফিগারেশন - FIXED
const ZEGO_APP_ID = 361002182;
const ZEGO_SERVER_SECRET = '723224a492e399607fc92fe644d60144';

// ================================================================
// ২. গ্লোবাল ভ্যারিয়েবল ডিক্লারেশন
// ================================================================
let currentUser = null;              // বর্তমান ইউজার
let activeChatUserId = null;         // যার সাথে চ্যাট চলছে
let realtimeSubscription = null;     // মেসেজ লিসেনার
let presenceChannel = null;          // টাইপিং লিসেনার
let selectedImageFile = null;        // সিলেক্ট করা ছবি
let isUploading = false;             // আপলোড স্ট্যাটাস

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
let zp = null; 

// ================================================================
// ৩. অ্যাপ ইনিশিয়ালাইজেশন (লোডিং)
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM Loaded - Initializing app...");
    
    // সেশন চেক করা হচ্ছে
    const { data: sessionData, error } = await supabaseClient.auth.getSession();
    
    if (error || !sessionData.session) {
        window.location.href = '/index.html';
        return;
    }
    
    currentUser = sessionData.session.user;
    console.log("Current user:", currentUser.id);
    
    // ZegoCloud কলিং সিস্টেম চালু করা (অবশ্যই প্রথমে করতে হবে)
    try {
        await initZegoCloud();
        console.log("ZegoCloud initialized successfully");
    } catch (err) {
        console.error("Failed to initialize ZegoCloud:", err);
        // কল সিস্টেম ফেইল করলেও চ্যাট যেন চলে
    }

    // হেডার প্রোফাইল লোড করা
    loadMyProfile();
    
    // নিজের অনলাইন স্ট্যাটাস আপডেট করা (সাথে সাথে এবং প্রতি মিনিটে)
    updateMyLastSeen();
    setInterval(updateMyLastSeen, 60000); 

    // অন্য পেজ থেকে চ্যাট শুরু করতে চাইলে সেই ইউজার আইডি চেক করা
    const startChatUser = localStorage.getItem('startChatWith');
    
    if (startChatUser) {
        localStorage.removeItem('startChatWith');
        openChat(startChatUser);
    } else {
        // ডিফল্টভাবে চ্যাট লিস্ট লোড করা
        loadChatList();
    }
    
    // সকল বাটন এবং ইভেন্ট লিসেনার সেটআপ করা
    setupEventListeners();
});

// ================================================================
// ৪. ZegoCloud কলিং সেটআপ ফাংশন - (FIXED & EXTENDED)
// ================================================================
// ইউজার আইডি ক্লিন করার হেল্পার ফাংশন (Zego স্পেশাল ক্যারেক্টার সাপোর্ট করে না)
function sanitizeUserID(uid) {
    return uid.replace(/[^a-zA-Z0-9]/g, ''); 
}

async function initZegoCloud() {
    return new Promise(async (resolve, reject) => {
        try {
            if (!currentUser) {
                reject("No current user found");
                return;
            }

            // আইডি থেকে শুধু আলফানিউমেরিক ক্যারেক্টার রাখা হচ্ছে যাতে এরর না হয়
            const userID = sanitizeUserID(currentUser.id.toString());
            const userName = currentUser.user_metadata?.display_name || 
                            currentUser.email?.split('@')[0] || 
                            `User_${userID.substring(0, 5)}`;

            // ZegoUIKitPrebuilt চেক
            if (typeof ZegoUIKitPrebuilt === 'undefined') {
                reject("ZegoUIKitPrebuilt script not loaded.");
                return;
            }

            // IMPORTANT: কল রিসিভ করার জন্য RoomID অবশ্যই নিজের UserID হতে হবে
            const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
                ZEGO_APP_ID, 
                ZEGO_SERVER_SECRET, 
                userID, // RoomID হিসেবে UserID
                userID, // UserID
                userName
            );

            // Zego Instance তৈরি করা
            zp = ZegoUIKitPrebuilt.create(kitToken);
            
            // ZIM প্লাগিন যোগ করা (কল ইনভাইটেশনের জন্য বাধ্যতামূলক)
            if (typeof ZIM !== 'undefined') {
                zp.addPlugins({ ZIM }); 
                console.log("ZIM plugin added successfully");
            } else {
                console.warn("ZIM plugin not found. Invitation call feature will not work.");
            }

            // ইনকামিং কল কনফিগারেশন
            zp.setCallInvitationConfig({
                enableCustomCallInvitationWaitingPage: true,
                enableIncomingCallRingtone: true,
                ringtoneConfig: {
                    incomingCallFileName: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
                    outgoingCallFileName: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
                },
                // কল রিসিভ বা রিজেক্ট করার ডায়ালগ
                showCallConfirmationDialog: true 
            });

            console.log("✅ ZegoCloud initialized successfully");
            resolve(zp);

        } catch (err) {
            console.error("❌ ZegoCloud Init Error:", err);
            reject(err);
        }
    });
}

// কল শুরু করার ফাংশন - (100% FIXED for Unknown Error)
async function startZegoCall(type) {
    console.log("Attempting to start call, type:", type);
    
    if (!activeChatUserId) {
        alert("Please select a user to call.");
        return;
    }

    if (!zp) {
        console.error("Zego instance not initialized!");
        try {
            await initZegoCloud();
        } catch (err) {
            alert("Call system failed to initialize. Please refresh the page.");
            return;
        }
    }

    const partnerName = document.getElementById('chatHeaderName').innerText || 'User';
    
    // টার্গেট ইউজারের আইডি স্যানিটাইজ করা (স্পেস বা ড্যাশ রিমুভ)
    const targetUserID = sanitizeUserID(activeChatUserId.toString());
    
    // নিজের সাথে নিজে কল করা যাবে না
    if(targetUserID === sanitizeUserID(currentUser.id.toString())) {
        alert("You cannot call yourself.");
        return;
    }

    try {
        // কল ইনভাইটেশন পাঠানো
        const result = await zp.sendCallInvitation({
            callees: [{ 
                userID: targetUserID, 
                userName: partnerName 
            }],
            callType: type === 'video' ? 
                ZegoUIKitPrebuilt.InvitationTypeVideoCall : 
                ZegoUIKitPrebuilt.InvitationTypeVoiceCall,
            timeout: 60, // ৬০ সেকেন্ড রিং হবে
        });
        
        console.log("Call invitation response:", result);
        
        // এরর হ্যান্ডলিং
        if (result.errorInvitees && result.errorInvitees.length > 0) {
            alert("User is currently offline or unavailable (or not logged into chat).");
        } 

    } catch (err) {
        console.error("Call Error Details:", err);
        alert("Failed to start call. Error: " + (err.message || "Unknown error"));
    }
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
    } catch(e) {
        console.warn("Failed to load profile picture:", e);
    }
}

async function updateMyLastSeen() {
    try {
        await supabaseClient.from('users').update({ last_seen: new Date() }).eq('id', currentUser.id);
    } catch(e){
        console.warn("Failed to update last seen:", e);
    }
}

// ================================================================
// ৬. চ্যাট লিস্ট লোড এবং রেন্ডার (Inbox)
// ================================================================
async function loadChatList() {
    const container = document.getElementById('chatListContainer');
    if(!container) return;
    
    // লোডার দেখানো
    container.innerHTML = `<div class="loader-container"><div class="loader"></div></div>`;

    try {
        // ডাটাবেস থেকে চ্যাট পার্টনারদের লিস্ট আনা (RPC ফাংশন কল)
        const { data: partners, error } = await supabaseClient.rpc('get_chat_partners', { user_id: currentUser.id });

        if (error) throw error;

        container.innerHTML = ''; // লোডার পরিষ্কার করা

        // যদি কোনো চ্যাট না থাকে
        if (!partners || partners.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:50px 20px; color:#999;">
                    <i class="fas fa-comment-dots" style="font-size: 30px; margin-bottom:10px;"></i>
                    <h3 style="margin:0;">No Messages</h3>
                    <p>Start a conversation with someone.</p>
                </div>`;
            return;
        }

        // চ্যাট লিস্ট লুপ চালিয়ে রেন্ডার করা
        for (const chat of partners) {
            const { data: user } = await supabaseClient
                .from('users')
                .select('display_name, photo_url, last_seen')
                .eq('id', chat.partner_id)
                .single();
            
            const timeString = timeAgoShort(chat.last_message_time);
            const isUnread = chat.unread_count > 0;
            
            let msgPreview = chat.last_message_content;
            if (!msgPreview) {
                // মিডিয়া টাইপ চেক
                if (chat.last_message_type === 'image') msgPreview = 'Sent a photo';
                else if (chat.last_message_type === 'audio') msgPreview = 'Sent an audio';
                else msgPreview = 'Attachment';
            }
            if (msgPreview === '👍') msgPreview = 'Like 👍';

            const isOnline = user && user.last_seen && (new Date() - new Date(user.last_seen) < 5 * 60 * 1000);
            
            // স্টাইলিং
            const nameWeight = isUnread ? '800' : '600';
            const msgColor = isUnread ? 'black' : 'var(--text-secondary)';
            const msgWeight = isUnread ? '700' : '400';

            const userPhoto = user?.photo_url || './images/default-avatar.png';
            const userName = user?.display_name || 'Unknown User';

            const html = `
                <div class="chat-item-row" onclick="openChat('${chat.partner_id}')">
                    <div class="chat-avatar">
                        <img src="${userPhoto}" alt="User" onerror="this.src='./images/default-avatar.png'">
                        ${isOnline ? '<div class="online-status-dot"></div>' : ''}
                    </div>
                    <div class="chat-info">
                        <h4 class="chat-name" style="font-weight: ${nameWeight};">${userName}</h4>
                        <div class="chat-preview">
                            <span class="msg-text" style="color: ${msgColor}; font-weight: ${msgWeight};">
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
        container.innerHTML = `<p style="text-align:center; color:red;">Error loading chats.</p>`;
    }
}

// ================================================================
// ৭. চ্যাট রুম ওপেন এবং কনফিগারেশন
// ================================================================
async function openChat(partnerId) {
    activeChatUserId = partnerId;
    
    // ভিউ পরিবর্তন করা
    document.getElementById('inbox-view').style.display = 'none';
    document.getElementById('conversation-view').style.display = 'flex';
    
    // মেসেজ কন্টেইনারে লোডার
    const msgContainer = document.getElementById('messageContainer');
    msgContainer.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%;"><div class="loader"></div></div>';
    
    // রিসেট
    replyToId = null;
    document.getElementById('replyPreviewBar').style.display = 'none';

    try {
        // ইউজারের তথ্য আনা
        const { data: user } = await supabaseClient.from('users').select('*').eq('id', partnerId).single();
        if (user) {
            document.getElementById('chatHeaderName').innerText = user.display_name || 'User';
            const userPhoto = user.photo_url || './images/default-avatar.png';
            document.getElementById('chatHeaderImg').src = userPhoto;
            document.getElementById('typingAvatar').src = userPhoto;
            
            // অনলাইন স্ট্যাটাস
            const isOnline = user.last_seen && (new Date() - new Date(user.last_seen) < 5 * 60 * 1000);
            document.getElementById('headerActiveDot').style.display = isOnline ? 'block' : 'none';
            document.getElementById('chatHeaderStatus').innerText = isOnline ? 'Active now' : `Last seen ${timeAgoShort(user.last_seen)}`;
        }

        // মেসেজ লোড
        await loadMessages(partnerId);
        setupRealtimeChat(partnerId);
        setupPresence(partnerId); 

    } catch (err) { 
        console.error("Open chat error:", err); 
    }
}

async function loadMessages(partnerId) {
    const container = document.getElementById('messageContainer');
    
    const { data: messages, error } = await supabaseClient
        .from('messages')
        .select(`
            *, 
            reply_message:reply_to_id(content, sender_id, image_url, audio_url)
        `)
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .or(`sender_id.eq.${partnerId},receiver_id.eq.${partnerId}`)
        .not('deleted_by', 'cs', `{"${currentUser.id}"}`) 
        .order('created_at', { ascending: true });

    container.innerHTML = ''; // লোডার পরিষ্কার

    if (messages && messages.length > 0) {
        messages.forEach(msg => appendMessageToUI(msg));
        scrollToBottom(false); 
    } else {
        const pImg = document.getElementById('chatHeaderImg').src;
        const pName = document.getElementById('chatHeaderName').innerText;
        
        container.innerHTML = `
            <div class="empty-chat-placeholder">
                <img src="${pImg}" style="width:80px;height:80px;border-radius:50%;margin-bottom:10px;object-fit:cover;" onerror="this.src='./images/default-avatar.png'">
                <h3>${pName}</h3>
                <p>Say Hi 👋 to start chatting.</p>
            </div>`;
    }
    
    // মেসেজ সিন মার্ক করা
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
        } catch (error) {
            alert("Image upload failed");
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
        
        await supabaseClient.from('messages').insert([{ 
            sender_id: currentUser.id, 
            receiver_id: partnerId, 
            content: '👍', 
            is_read: false, 
            deleted_by: [] 
        }]);
    } catch (e) { console.error(e); }
}

async function uploadFile(file, bucketName) {
    try {
        let fileToUpload = file;
        // ইমেজ কমপ্রেশন
        if(file.type && file.type.startsWith('image/') && typeof imageCompression !== 'undefined') {
            try {
                const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: true };
                fileToUpload = await imageCompression(file, options);
            } catch (cErr) { console.warn("Compression skipped:", cErr); }
        }

        const ext = file.name ? file.name.split('.').pop() : 'bin';
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
        throw err;
    }
}

// ================================================================
// ৯. UI রেন্ডারিং ফাংশন (AUDIO PLAYER FIX HERE)
// ================================================================
function appendMessageToUI(msg) {
    // ডিলিটেড মেসেজ চেক
    if (msg.deleted_by && msg.deleted_by.includes(currentUser.id)) return;

    const container = document.getElementById('messageContainer');
    const isMe = msg.sender_id === currentUser.id;
    
    // রিপ্লাই অংশ
    let replyHTML = '';
    if (msg.reply_message) {
        const rName = msg.reply_message.sender_id === currentUser.id ? 'You' : 'Partner';
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
    
    // ১. ইমেজ রেন্ডার
    if (msg.image_url) {
        contentHTML += `<img src="${msg.image_url}" class="bubble-image" onclick="viewFullScreenImage('${msg.image_url}')" onerror="this.style.display='none'">`;
    }
    
    // ২. অডিও রেন্ডার (FIXED STRUCTURE - NO WRAPPER)
    // অডিও থাকলে আমরা সরাসরি অডিও বাবল তৈরি করব, টেক্সট বাবলের ভেতরে নয়
    if (msg.audio_url) {
        contentHTML += `
            <div class="audio-bubble" style="background: ${isMe ? '#0084ff' : '#e4e6eb'};">
                <audio controls preload="metadata" controlsList="nodownload">
                    <source src="${msg.audio_url}" type="audio/webm">
                    <source src="${msg.audio_url}" type="audio/mp4">
                    <source src="${msg.audio_url}" type="audio/mpeg">
                    <source src="${msg.audio_url}" type="audio/ogg">
                    Your browser does not support the audio element.
                </audio>
            </div>`;
    }
    
    // ৩. টেক্সট রেন্ডার
    // যদি অডিও থাকে, তাহলে আর টেক্সট বাবল যোগ করার দরকার নেই (যদি না আলাদা টেক্সট থাকে)
    // তবে আপনার ডিজাইনে অডিও এবং টেক্সট আলাদা মেসেজ হিসেবে যায়।
    if (msg.content) { 
        if (msg.content === '👍') {
            contentHTML += `<span style="font-size: 40px; margin: 5px;">👍</span>`; 
        } else {
            // যদি ইমেজ থাকে এবং টেক্সটও থাকে
            if (msg.image_url) {
                contentHTML += `<div class="bubble" style="margin-top:2px;">${escapeHtml(msg.content)}</div>`;
            } else if (!msg.audio_url) { 
                // যদি অডিও না থাকে, তাহলেই টেক্সট বাবল হবে
                contentHTML += `<div class="bubble">${replyHTML}${escapeHtml(msg.content)}</div>`;
            }
        }
    } else if(replyHTML && !msg.image_url && !msg.audio_url) {
        // শুধু রিপ্লাই থাকলে
        contentHTML += `<div class="bubble">${replyHTML}</div>`;
    }

    // বাবল ক্লাস লজিক (অডিও বা থাম্বস আপ এর জন্য ট্রান্সপারেন্ট)
    const bubbleClass = (msg.content === '👍' || (!msg.content && !replyHTML && msg.image_url) || msg.audio_url) ? 'bg-transparent' : '';
    
    const partnerImgSrc = document.getElementById('chatHeaderImg').src;

    // মেসেজ রো তৈরি
    const html = `
        <div class="message-row ${isMe ? 'sent' : 'received'}" id="msg-${msg.id}">
            ${!isMe ? `<img src="${partnerImgSrc}" class="msg-avatar" onerror="this.src='./images/default-avatar.png'">` : ''}
            
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

// ================================================================
// ১০. Realtime, Typing Indicator & Presence
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
                    
                    const empty = document.querySelector('.empty-chat-placeholder'); 
                    if(empty) empty.remove();
                    
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
    bubble.style.display = 'flex';
    scrollToBottom(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        bubble.style.display = 'none';
    }, 3000);
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
    } catch (e) { console.error("Delete for me error:", e); }
}

async function deleteMessageForEveryone() {
    if (!selectedMessageId) return;
    if(!confirm("Delete for everyone?")) return;
    try {
        await supabaseClient.from('messages').delete().eq('id', selectedMessageId);
        closeDeleteModal();
    } catch (e) { console.error("Delete everyone error:", e); }
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
        
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };
        
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
        
    } catch (err) {
        console.error("Microphone Error:", err);
        alert("Microphone permission needed.");
    }
}

function cancelRecording() {
    if (mediaRecorder) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        mediaRecorder = null;
    }
    clearInterval(recordingInterval);
    document.getElementById('audioRecordingUI').style.display = 'none';
    document.querySelector('.footer-input-row').style.display = 'flex'; 
    isRecording = false;
}

async function sendRecording() {
    if (!mediaRecorder) return;
    
    mediaRecorder.onstop = async () => {
        // webm ফরম্যাট অধিকাংশ ব্রাউজারে সাপোর্টেড
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        
        try {
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
            }
        } catch (e) {
            console.error("Audio upload failed", e);
            alert("Failed to send audio.");
        }
    };
    
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    clearInterval(recordingInterval);
    document.getElementById('audioRecordingUI').style.display = 'none';
    document.querySelector('.footer-input-row').style.display = 'flex';
}

// ================================================================
// ১৩. ইভেন্ট লিসেনার সেটআপ
// ================================================================
function setupEventListeners() {
    document.getElementById('backToInboxBtn').addEventListener('click', () => {
        location.reload(); // সিম্পল রিফ্রেশ সবচেয়ে নিরাপদ
    });
    
    const input = document.getElementById('messageInput');
    if (input) {
        input.addEventListener('input', () => { 
            toggleSendButton(); 
            sendTypingEvent(); 
        });
        input.addEventListener('keyup', (e) => { 
            if (e.key === 'Enter') sendMessage(); 
        });
    }
    
    document.getElementById('sendMessageBtn')?.addEventListener('click', sendMessage);
    
    document.getElementById('galleryTriggerBtn')?.addEventListener('click', () => document.getElementById('chatImageInput').click());
    
    document.getElementById('chatImageInput')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedImageFile = file;
            document.getElementById('uploadPreviewImg').src = URL.createObjectURL(file);
            document.getElementById('imagePreviewPanel').style.display = 'flex';
            toggleSendButton();
        }
    });
    
    document.getElementById('closePreviewBtn')?.addEventListener('click', closeImagePreview);
    
    // অডিও রেকর্ডার
    document.getElementById('micTriggerBtn')?.addEventListener('click', startRecording);
    document.getElementById('cancelRecordingBtn')?.addEventListener('click', cancelRecording);
    document.getElementById('sendRecordingBtn')?.addEventListener('click', sendRecording);
    
    // ভিডিও ও অডিও কল বাটন (জেগো কলিং)
    document.getElementById('videoCallBtn')?.addEventListener('click', () => startZegoCall('video'));
    document.getElementById('audioCallBtn')?.addEventListener('click', () => startZegoCall('audio'));

    // ফুল স্ক্রিন ইমেজ ক্লোজ
    document.querySelector('.fs-close-btn')?.addEventListener('click', () => { 
        document.getElementById('fullScreenImageModal').style.display = 'none'; 
    });

    // ইমোজি পিকার
    const emojiBtn = document.getElementById('emojiTriggerBtn');
    const picker = document.getElementById('emojiPickerContainer');
    
    if (emojiBtn) {
        emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
        });
    }

    const emojiPickerElement = document.querySelector('emoji-picker');
    if (emojiPickerElement) {
        emojiPickerElement.addEventListener('emoji-click', event => {
            if (input) {
                input.value += event.detail.unicode;
                toggleSendButton();
                input.focus();
            }
        });
    }

    // বাইরে ক্লিক হ্যান্ডলার
    document.addEventListener('click', (e) => {
        if (picker && !picker.contains(e.target) && emojiBtn && !emojiBtn.contains(e.target)) {
            picker.style.display = 'none';
        }
        const optsMenu = document.getElementById('chatOptionsDropdown');
        const optsBtn = document.getElementById('chatOptionsBtn');
        if(optsMenu && optsBtn && !optsMenu.contains(e.target) && !optsBtn.contains(e.target)) {
            optsMenu.style.display = 'none';
        }
    });

    document.getElementById('deleteForMeBtn')?.addEventListener('click', deleteMessageForMe);
    document.getElementById('deleteForEveryoneBtn')?.addEventListener('click', deleteMessageForEveryone);
    document.getElementById('cancelDeleteBtn')?.addEventListener('click', closeDeleteModal);
    document.getElementById('replyOptionBtn')?.addEventListener('click', initiateReply);
    document.getElementById('cancelReplyBtn')?.addEventListener('click', cancelReply);
    
    document.getElementById('chatOptionsBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = document.getElementById('chatOptionsDropdown');
        if (menu) {
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        }
    });
}

// ================================================================
// ১৪. হেল্পার ফাংশনস
// ================================================================
function closeImagePreview() {
    selectedImageFile = null;
    const input = document.getElementById('chatImageInput');
    if (input) input.value = '';
    document.getElementById('imagePreviewPanel').style.display = 'none';
    toggleSendButton();
}

function toggleSendButton() {
    const input = document.getElementById('messageInput');
    const val = input.value.trim();
    const icon = document.querySelector('#sendMessageBtn i');
    if (!icon) return;
    if (val !== '' || selectedImageFile) { 
        icon.className = 'fas fa-paper-plane'; 
        icon.style.color = '#0084ff'; 
    } 
    else { 
        icon.className = 'fas fa-thumbs-up'; 
        icon.style.color = '#0084ff'; 
    }
}

function timeAgoShort(dateString) { 
    if (!dateString) return 'Just now';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Just now';
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d`;
    return date.toLocaleDateString();
}

async function markAsSeen(partnerId) {
    try { 
        await supabaseClient
            .from('messages')
            .update({ is_read: true })
            .match({ sender_id: partnerId, receiver_id: currentUser.id, is_read: false }); 
    } catch (e) { console.warn(e); }
}

function scrollToBottom(smooth = false) { 
    const main = document.getElementById('messageContainer'); 
    if (main) {
        setTimeout(() => {
            main.scrollTo({ top: main.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); 
        }, 100);
    }
}

function parseHTML(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content.cloneNode(true);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.viewFullScreenImage = function(src) {
    const modal = document.getElementById('fullScreenImageModal');
    const img = document.getElementById('fsModalImg');
    const downloadBtn = document.getElementById('downloadImgBtn');
    if (img) img.src = src;
    if (downloadBtn) downloadBtn.href = src;
    modal.style.display = 'flex';
}

window.openChat = openChat;
window.handleMessagePressStart = handleMessagePressStart;
window.handleMessagePressEnd = handleMessagePressEnd;