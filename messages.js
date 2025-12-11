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
// ৩. মিডিয়া পারমিশন চেক ফাংশন
// ================================================================
async function checkMediaPermissions() {
    try {
        if (navigator.permissions && navigator.permissions.query) {
            const micPermission = await navigator.permissions.query({ name: 'microphone' });
            const cameraPermission = await navigator.permissions.query({ name: 'camera' });
            
            if (micPermission.state === 'denied' || cameraPermission.state === 'denied') {
                console.warn("Media permissions denied. Call may not work properly.");
                return false;
            }
            return true;
        }
        return true;
    } catch (err) {
        console.warn("Could not check media permissions:", err);
        return false;
    }
}

// ================================================================
// ৪. অ্যাপ ইনিশিয়ালাইজেশন (লোডিং)
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
    
    // মিডিয়া পারমিশন চেক
    const hasPermissions = await checkMediaPermissions();
    if (!hasPermissions) {
        console.warn("Media permissions not granted. Calling features may not work.");
    }
    
    // ZegoCloud কলিং সিস্টেম চালু করা
    // [FIX] এখানে একটু অপেক্ষা করা হচ্ছে যাতে স্ক্রিপ্ট লোড হতে পারে
    setTimeout(async () => {
        try {
            await initZegoCloud();
            console.log("ZegoCloud initialized successfully");
        } catch (err) {
            console.error("Failed to initialize ZegoCloud:", err);
            // আমরা ইউজারকে অ্যালার্ট দিচ্ছি না, শুধু কনসোলে লগ করছি যাতে UX নষ্ট না হয়
        }
    }, 1500); // ১.৫ সেকেন্ড ডিলে

    // হেডার প্রোফাইল লোড করা
    loadMyProfile();
    
    // নিজের অনলাইন স্ট্যাটাস আপডেট করা
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
// ৫. ZegoCloud কলিং সেটআপ ফাংশন - FIXED VERSION
// ================================================================
async function initZegoCloud() {
    return new Promise(async (resolve, reject) => {
        try {
            if (!currentUser) {
                reject("No current user found");
                return;
            }

            // [FIX] চেক করা হচ্ছে লাইব্রেরি লোড হয়েছে কিনা
            if (typeof ZegoUIKitPrebuilt === 'undefined') {
                console.warn("ZegoUIKitPrebuilt not found. Waiting...");
                reject("Zego library not loaded yet.");
                return;
            }

            const userID = currentUser.id.toString();
            const userName = currentUser.user_metadata?.display_name || 
                            currentUser.email?.split('@')[0] || 
                            `User_${userID.substring(0, 5)}`;

            console.log("Initializing ZegoCloud for user:", userName);
            
            // টোকেন জেনারেট করা
            const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
                ZEGO_APP_ID, 
                ZEGO_SERVER_SECRET, 
                "random_room_id_" + userID, // ইউনিক রুম আইডি প্রয়োজন নেই ইনিশিয়ালাইজেশনের জন্য
                userID, 
                userName
            );

            // Zego Instance তৈরি করা
            zp = ZegoUIKitPrebuilt.create(kitToken);
            
            // ZIM প্লাগিন সেটআপ (কল ইনভাইটেশনের জন্য জরুরি)
            if (typeof ZIM !== 'undefined') {
                // ZIM.create একাধিকবার কল করলে এরর দিতে পারে, তাই চেক করা হয়
                try {
                     const zim = ZIM.create({ appID: ZEGO_APP_ID });
                     zp.addPlugins({ ZIM: zim });
                     console.log("ZIM plugin added successfully");
                } catch(zErr) {
                    console.warn("ZIM Create Warning:", zErr);
                }
            } else {
                console.warn("ZIM plugin not found. Calling features may not work properly.");
            }

            // ইনকামিং কল রিসিভ করা
            zp.setCallInvitationConfig({
                enableCustomCallInvitationWaitingPage: true,
                enableIncomingCallRingtone: true,
                ringtoneConfig: {
                    incomingCallFileName: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
                    outgoingCallFileName: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
                }
            });

            console.log("✅ ZegoCloud initialized successfully");
            resolve(zp);

        } catch (err) {
            console.error("❌ ZegoCloud Init Error:", err);
            reject(err);
        }
    });
}

// কল শুরু করার ফাংশন - FIXED
async function startZegoCall(type) {
    console.log("Starting call, type:", type);
    
    if (!activeChatUserId) {
        alert("Please select a user to call.");
        return;
    }

    // [FIX] যদি zp না থাকে, আবার ইনিশিয়ালাইজ করার চেষ্টা করা
    if (!zp) {
        console.log("Zego instance missing, trying to init...");
        try {
            await initZegoCloud();
        } catch (err) {
            alert("Call system failed to start. Please refresh the page.");
            return;
        }
    }
    
    // আবার চেক করা
    if (!zp) {
        alert("Call system unavailable.");
        return;
    }

    const partnerName = document.getElementById('chatHeaderName').innerText || 'User';
    
    console.log("Calling user:", activeChatUserId, "Name:", partnerName);

    try {
        // কল ইনভাইটেশন পাঠানো
        const result = await zp.sendCallInvitation({
            callees: [{ 
                userID: activeChatUserId.toString(), 
                userName: partnerName 
            }],
            callType: type === 'video' ? 
                ZegoUIKitPrebuilt.InvitationTypeVideoCall : 
                ZegoUIKitPrebuilt.InvitationTypeVoiceCall,
            timeout: 60, 
        });
        
        console.log("Call invitation response:", result);
        
        if (result.errorInvitees && result.errorInvitees.length > 0) {
            alert("User is offline or unavailable.");
        } 
    } catch (err) {
        console.error("Call Error Details:", err);
        alert("Failed to start call. Check console for details.");
    }
}

// ================================================================
// ৬. প্রোফাইল এবং স্ট্যাটাস ম্যানেজমেন্ট
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
// ৭. চ্যাট লিস্ট লোড এবং রেন্ডার (Inbox)
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
            // ইউজারের নাম, ছবি এবং লাস্ট সিন আনা
            const { data: user } = await supabaseClient
                .from('users')
                .select('display_name, photo_url, last_seen')
                .eq('id', chat.partner_id)
                .single();
            
            const timeString = timeAgoShort(chat.last_message_time);
            const isUnread = chat.unread_count > 0;
            let msgPreview = chat.last_message_content;
            
            // মিডিয়া মেসেজের প্রিভিউ টেক্সট
            if (!msgPreview) {
                msgPreview = 'Sent an attachment';
            }
            if (msgPreview === '👍') msgPreview = 'Like 👍';

            // অনলাইন চেক (৫ মিনিটের মধ্যে অ্যাক্টিভিটি থাকলে অনলাইন)
            const isOnline = user && user.last_seen && (new Date() - new Date(user.last_seen) < 5 * 60 * 1000);

            // স্টাইল সেট করা (আনরিড হলে বোল্ড)
            const nameStyle = isUnread ? 'font-weight: 800; color: black;' : '';
            const msgStyle = isUnread ? 'font-weight: 700; color: black;' : '';

            const userPhoto = user?.photo_url || './images/default-avatar.png';
            const userName = user?.display_name || 'Unknown User';

            const html = `
                <div class="chat-item-row" onclick="openChat('${chat.partner_id}')">
                    <div class="chat-avatar">
                        <img src="${userPhoto}" alt="User" onerror="this.src='./images/default-avatar.png'">
                        ${isOnline ? '<div class="online-status-dot"></div>' : ''}
                    </div>
                    <div class="chat-info">
                        <h4 class="chat-name" style="${nameStyle}">${userName}</h4>
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
        container.innerHTML = `<p style="text-align:center; color:red;">Error loading chats. Please refresh.</p>`;
    }
}

// ================================================================
// ৮. চ্যাট রুম ওপেন এবং কনফিগারেশন
// ================================================================
async function openChat(partnerId) {
    activeChatUserId = partnerId;
    
    // ভিউ পরিবর্তন করা (ইনবক্স হাইড, চ্যাট রুম শো)
    document.getElementById('inbox-view').style.display = 'none';
    document.getElementById('conversation-view').style.display = 'flex';
    
    // মেসেজ কন্টেইনারে লোডার দেখানো
    const msgContainer = document.getElementById('messageContainer');
    msgContainer.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%;"><div class="loader"></div></div>';
    
    // আগের রিপ্লাই আইডি রিসেট করা
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
            console.log("This conversation involves a blocked user.");
        }

        // ২. ইউজারের তথ্য আনা
        const { data: user } = await supabaseClient.from('users').select('*').eq('id', partnerId).single();
        if (user) {
            document.getElementById('chatHeaderName').innerText = user.display_name || 'User';
            const userPhoto = user.photo_url || './images/default-avatar.png';
            document.getElementById('chatHeaderImg').src = userPhoto;
            document.getElementById('typingAvatar').src = userPhoto;
            
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
        msgContainer.innerHTML = `<p style="text-align:center; color:red;">Error loading chat. Please try again.</p>`;
    }
}

// মেসেজ লোড করার ফাংশন
async function loadMessages(partnerId) {
    const container = document.getElementById('messageContainer');
    
    // ডাটাবেস থেকে মেসেজ আনা
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

    container.innerHTML = ''; // লোডার সরানো

    if (messages && messages.length > 0) {
        messages.forEach(msg => appendMessageToUI(msg));
        scrollToBottom(false); 
    } else {
        // কোনো মেসেজ না থাকলে এম্পটি স্টেট দেখানো
        const pImg = document.getElementById('chatHeaderImg').src;
        const pName = document.getElementById('chatHeaderName').innerText;
        
        container.innerHTML = `
            <div class="empty-chat-placeholder">
                <img src="${pImg}" style="width:80px;height:80px;border-radius:50%;margin-bottom:10px;object-fit:cover;" onerror="this.src='./images/default-avatar.png'">
                <h3>${pName}</h3>
                <p>Say Hi 👋 to start chatting.</p>
            </div>`;
    }
    
    // মেসেজ সিন (Seen) করা
    markAsSeen(partnerId);
}

// ================================================================
// ৯. মেসেজ পাঠানো (টেক্সট, ছবি, রিপ্লাই)
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
    sendBtnIcon.className = 'fas fa-spinner fa-spin'; // লোডিং আইকন

    let imageUrl = null;

    if (selectedImageFile) {
        try {
            imageUrl = await uploadFile(selectedImageFile, 'chat_images');
            if (!imageUrl) {
                alert("Image upload failed. Please try again.");
                isUploading = false;
                sendBtnIcon.className = originalIcon;
                return;
            }
        } catch (error) {
            console.error("Image Upload Error:", error);
            alert("Image upload failed: " + error.message);
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
        const { error } = await supabaseClient.from('messages').insert([newMessage]);
        if (error) throw error;
        
        input.value = '';
        closeImagePreview();
        cancelReply(); 
        
        const empty = document.querySelector('.empty-chat-placeholder');
        if(empty) empty.remove();
        
        document.getElementById('emojiPickerContainer').style.display = 'none';

    } catch (err) {
        console.error("Send failed:", err);
        alert("Failed to send message: " + err.message);
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
    } catch (e) {
        console.error("Like send failed", e);
    }
}

async function uploadFile(file, bucketName) {
    try {
        let fileToUpload = file;
        
        if(file.type && file.type.startsWith('image/') && typeof imageCompression !== 'undefined') {
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
    const container = document.getElementById('messageContainer');
    
    container.appendChild(bubble);
    bubble.style.display = 'flex';
    scrollToBottom(true);

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        bubble.style.display = 'none';
    }, 3000);
}

// ================================================================
// ১১. UI রেন্ডারিং ফাংশন (Audio Player ফিক্সড)
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
        
        replyHTML = `
            <div class="reply-context">
                <span class="reply-sender-name">${rName}</span>
                <span class="reply-text-content">${rText}</span>
            </div>`;
    }

    let contentHTML = '';
    
    if (msg.image_url) {
        contentHTML += `<img src="${msg.image_url}" class="bubble-image" onclick="viewFullScreenImage('${msg.image_url}')" onerror="this.style.display='none'">`;
    }
    
    // [FIXED] অডিও প্লেয়ার রেন্ডারিং
    if (msg.audio_url) {
        contentHTML += `
            <div class="audio-bubble" style="background: ${isMe ? '#0084ff' : '#f0f2f5'}; border: 1px solid ${isMe ? '#0084ff' : '#ddd'};">
                <audio controls controlsList="nodownload noplaybackrate">
                    <source src="${msg.audio_url}" type="audio/webm">
                    <source src="${msg.audio_url}" type="audio/mp4">
                    <source src="${msg.audio_url}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>`;
    }
    
    if (msg.content) { 
        if (msg.content === '👍') {
            contentHTML += `<span style="font-size: 40px; margin: 5px;">👍</span>`; 
        } else {
            contentHTML += `<div class="bubble">${replyHTML}${escapeHtml(msg.content)}</div>`;
        }
    } else if(replyHTML && !msg.image_url && !msg.audio_url) {
        contentHTML += `<div class="bubble">${replyHTML}</div>`;
    }

    // বাবল ক্লাস লজিক
    const bubbleClass = (msg.content === '👍' || (!msg.content && !replyHTML && msg.image_url) || msg.audio_url) ? 'bg-transparent' : '';
    const partnerImgSrc = document.getElementById('chatHeaderImg').src;

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

// ================================================================
// ১২. লং প্রেস এবং রিপ্লাই লজিক
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
    } catch (e) {
        console.error("Delete for me error:", e);
        alert("Failed to delete.");
    }
}

async function deleteMessageForEveryone() {
    if (!selectedMessageId) return;
    if(!confirm("Are you sure you want to delete this message for everyone?")) return;

    try {
        await supabaseClient.from('messages').delete().eq('id', selectedMessageId);
        closeDeleteModal();
    } catch (e) {
        console.error("Delete everyone error:", e);
        alert("Failed to delete.");
    }
}

async function blockUser() {
    if (!activeChatUserId || !confirm("Block this user?")) return;
    try {
        await supabaseClient.from('user_blocks').insert({ blocker_id: currentUser.id, blocked_id: activeChatUserId });
        alert("User blocked successfully.");
        location.reload();
    } catch (e) {
        console.error("Block error:", e);
        alert("Error blocking user.");
    }
}

function closeDeleteModal() {
    document.getElementById('deleteOptionsModal').style.display = 'none';
    selectedMessageId = null;
}

// ================================================================
// ১৩. ভয়েস রেকর্ডিং ফাংশনালিটি
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
        alert("Microphone access needed. Please allow microphone permission.");
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
    document.querySelector('.footer-input-row').style.display = 'flex'; 
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

// ================================================================
// ১৪. ইভেন্ট লিসেনার সেটআপ
// ================================================================
function setupEventListeners() {
    document.getElementById('backToInboxBtn').addEventListener('click', () => {
        document.getElementById('conversation-view').style.display = 'none';
        document.getElementById('inbox-view').style.display = 'block';
        activeChatUserId = null;
        if (realtimeSubscription) supabaseClient.removeChannel(realtimeSubscription);
        if (presenceChannel) supabaseClient.removeChannel(presenceChannel);
        loadChatList(); 
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
    
    document.getElementById('micTriggerBtn')?.addEventListener('click', startRecording);
    document.getElementById('cancelRecordingBtn')?.addEventListener('click', cancelRecording);
    document.getElementById('sendRecordingBtn')?.addEventListener('click', sendRecording);
    
    document.getElementById('videoCallBtn')?.addEventListener('click', () => startZegoCall('video'));
    document.getElementById('audioCallBtn')?.addEventListener('click', () => startZegoCall('audio'));

    document.querySelector('.fs-close-btn')?.addEventListener('click', () => { 
        document.getElementById('fullScreenImageModal').style.display = 'none'; 
    });

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
    document.getElementById('blockUserBtn')?.addEventListener('click', blockUser);
    
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('fullScreenImageModal');
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// ================================================================
// ১৫. হেল্পার ফাংশনস
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
    if (!input) return;
    
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
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Just now';
        
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        if (diffSec < 60) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHour < 24) return `${diffHour}h ago`;
        if (diffDay < 7) return `${diffDay}d ago`;
        
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (e) {
        console.warn("Error parsing date:", e);
        return 'Recently';
    }
}

async function markAsSeen(partnerId) {
    try { 
        await supabaseClient
            .from('messages')
            .update({ is_read: true })
            .match({ sender_id: partnerId, receiver_id: currentUser.id, is_read: false }); 
    } catch (e) {
        console.warn("Mark as seen error:", e);
    }
}

function scrollToBottom(smooth = false) { 
    const main = document.getElementById('messageContainer'); 
    if (main) {
        setTimeout(() => {
            main.scrollTo({ top: main.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); 
        }, 100);
    }
}

window.viewFullScreenImage = function(src) {
    const modal = document.getElementById('fullScreenImageModal');
    if (modal) {
        const img = document.getElementById('fsModalImg');
        const downloadBtn = document.getElementById('downloadImgBtn');
        
        if (img) img.src = src;
        if (downloadBtn) downloadBtn.href = src;
        modal.style.display = 'flex';
    }
}

window.openChat = openChat;
window.handleMessagePressStart = handleMessagePressStart;
window.handleMessagePressEnd = handleMessagePressEnd;