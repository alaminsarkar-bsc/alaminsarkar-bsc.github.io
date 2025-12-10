// ====================================
// COMMENTS PAGE LOGIC (FULL FILE)
// ====================================

// গ্লোবাল ভ্যারিয়েবল
let currentPrayerIdForComment = null;
let currentParentCommentId = null;
let isCommentSubmitting = false;

// অডিও রেকর্ডিং ভ্যারিয়েবল
let mediaRecorder = null;
let audioChunks = [];
let audioBlob = null;
let recordInterval = null;
let isRecording = false;
let currentlyPlayingAudio = null; // এক সাথে একাধিক অডিও যাতে না বাজে

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('postId');

    if (postId) {
        currentPrayerIdForComment = parseInt(postId, 10);
        await initializeCommentPage();
    } else {
        document.getElementById('originalPostContainer').innerHTML = '<p style="text-align:center; padding:20px;">পোস্ট খুঁজে পাওয়া যায়নি।</p>';
    }

    setupCommentPageEventListeners();
    setupAudioRecordingLogic(); // ভয়েস রেকর্ডার সেটআপ
});

async function initializeCommentPage() {
    // অথেন্টিকেশন চেক
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        if (!currentUser) {
            const { data: profile } = await supabaseClient.from('users').select('*').eq('id', session.user.id).single();
            currentUser = { ...session.user, profile };
        }
        updateFooterAvatar();
    }
    await loadPageContent(currentPrayerIdForComment);
}

function updateFooterAvatar() {
    const avatarContainer = document.getElementById('currentUserAvatarFooter');
    if (avatarContainer && currentUser) {
        avatarContainer.style.display = 'flex';
        if (currentUser.profile?.photo_url) {
            avatarContainer.innerHTML = `<img src="${currentUser.profile.photo_url}" alt="Me" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            const initial = (currentUser.profile?.display_name || 'U').charAt(0).toUpperCase();
            avatarContainer.textContent = initial;
            avatarContainer.style.backgroundColor = generateAvatarColor(currentUser.profile?.display_name || 'User');
            avatarContainer.style.color = 'white';
        }
    }
}

// ====================================
// AUDIO RECORDING FUNCTIONS
// ====================================
function setupAudioRecordingLogic() {
    const startBtn = document.getElementById('startRecordBtn');
    const stopBtn = document.getElementById('stopRecordBtn');
    const cancelBtn = document.getElementById('cancelRecordBtn');

    if(startBtn) startBtn.addEventListener('click', startRecording);
    if(stopBtn) stopBtn.addEventListener('click', stopRecordingAndSubmit); 
    if(cancelBtn) cancelBtn.addEventListener('click', cancelRecording);
}

async function startRecording() {
    if (!currentUser) { document.getElementById('loginPage').style.display = 'flex'; return; }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            if (!isRecording) return; 
            handleCommentSubmit(new Event('submit')); 
        };

        mediaRecorder.start();
        isRecording = true;
        
        document.getElementById('commentForm').style.display = 'none';
        document.getElementById('audioRecordUI').style.display = 'flex';
        startTimer();

    } catch (error) {
        console.error("Mic Error:", error);
        alert("মাইক্রোফোনের অনুমতি পাওয়া যায়নি।");
    }
}

function stopRecordingAndSubmit() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        stopTimer();
    }
}

function cancelRecording() {
    isRecording = false;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        if(mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    }
    stopTimer();
    audioBlob = null;
    audioChunks = [];
    
    document.getElementById('audioRecordUI').style.display = 'none';
    document.getElementById('commentForm').style.display = 'flex';
    document.getElementById('startRecordBtn').style.display = 'inline-block';
}

function startTimer() {
    let seconds = 0;
    const timerEl = document.getElementById('recordTimer');
    clearInterval(recordInterval);
    recordInterval = setInterval(() => {
        seconds++;
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(recordInterval);
    document.getElementById('recordTimer').textContent = "00:00";
}

// ====================================
// CORE FUNCTIONS
// ====================================

function setupCommentPageEventListeners() {
    const commentForm = document.getElementById('commentForm');
    if (commentForm) {
        const newForm = commentForm.cloneNode(true);
        commentForm.parentNode.replaceChild(newForm, commentForm);
        newForm.addEventListener('submit', handleCommentSubmit);
    }
    
    const editCommentForm = document.getElementById('editCommentForm');
    if(editCommentForm) {
        const newEditForm = editCommentForm.cloneNode(true);
        editCommentForm.parentNode.replaceChild(newEditForm, editCommentForm);
        newEditForm.addEventListener('submit', handleEditCommentSubmit);
    }

    const list = document.getElementById('commentList');
    if (list) list.addEventListener('click', handleCommentListClick);
    
    document.getElementById('cancelReplyBtn')?.addEventListener('click', resetReplyState);

    const commentInput = document.getElementById('commentInput');
    if(commentInput) {
        commentInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            if(this.value === '') this.style.height = 'auto';
            
            const micBtn = document.getElementById('startRecordBtn');
            if(this.value.trim().length > 0) micBtn.style.display = 'none';
            else micBtn.style.display = 'inline-block';
        });
    }
}

async function loadPageContent(postId) {
    await loadOriginalPost(postId);
    await loadComments(postId);
}

async function loadOriginalPost(postId) {
    const container = document.getElementById('originalPostContainer');
    container.innerHTML = '<div class="loader" style="margin: 20px auto; border-color: #ccc; border-bottom-color: transparent;"></div>';
    try {
        const { data: prayer, error } = await supabaseClient
            .from('prayers')
            .select('*, users!author_uid(id, display_name, photo_url)')
            .eq('id', postId)
            .single();

        if (error) throw error;
        if (prayer) {
            allFetchedPrayers.set(prayer.id, prayer);
            const card = createPrayerCardElement(prayer);
            const commentBtn = card.querySelector('.comment-btn');
            if(commentBtn) commentBtn.style.display = 'none'; 
            container.innerHTML = '';
            container.appendChild(card);
        }
    } catch (error) {
        console.error('পোস্ট লোড সমস্যা:', error);
        container.innerHTML = '<p style="text-align:center; padding: 20px; color: red;">পোস্টটি লোড করা যায়নি বা ডিলিট হয়েছে।</p>';
    }
}

async function loadComments(postId) {
    const commentList = document.getElementById('commentList');
    
    // ১. লোডিং শুরু: স্কেলেটন লোডার দেখানো হচ্ছে
    renderCommentSkeleton(commentList);

    try {
        const { data, error } = await supabaseClient
            .from('comments')
            .select(`*, users!author_uid(display_name, photo_url)`)
            .eq('prayer_id', postId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        
        // ২. ডেটা আসার পর রেন্ডার
        renderComments(commentList, data);
        
        // হেডার কাউন্ট আপডেট
        const headerCount = document.querySelector('.comment-count-header');
        if(headerCount) headerCount.textContent = `সকল কমেন্ট (${data.length})`;

    } catch (error) {
        console.error('কমেন্ট লোড সমস্যা:', error);
        commentList.innerHTML = `<p style="color:red; text-align:center; padding: 20px;">কমেন্ট লোড করা যায়নি।</p>`;
    }
}

// স্কেলেটন জেনারেটর ফাংশন
function renderCommentSkeleton(container) {
    const skeletonHTML = Array(6).fill('').map(() => `
        <div class="skeleton-comment-wrapper">
            <div class="skeleton-comment-avatar"></div>
            <div class="skeleton-comment-block">
                <div class="skeleton-comment-bubble"></div>
                <div class="skeleton-comment-meta"></div>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = skeletonHTML;
}

function renderComments(container, comments) {
    if (!comments || comments.length === 0) {
        container.innerHTML = '<div class="no-results-message" style="background:none; padding:20px;">এখনো কোনো কমেন্ট নেই। প্রথম কমেন্টটি আপনি করুন!</div>';
        return;
    }
    
    const commentMap = {};
    const roots = [];

    comments.forEach(comment => {
        comment.replies = [];
        commentMap[comment.id] = comment;
    });

    comments.forEach(comment => {
        if (comment.parent_id && commentMap[comment.parent_id]) {
            commentMap[comment.parent_id].replies.push(comment);
        } else {
            roots.push(comment);
        }
    });

    container.innerHTML = '';
    roots.forEach(rootComment => {
        container.appendChild(createCommentNode(rootComment));
    });
}

function createCommentNode(comment, isReply = false) {
    const wrapper = document.createElement('div');
    wrapper.className = `comment-wrapper ${isReply ? 'is-reply' : ''}`;
    wrapper.id = `comment-wrapper-${comment.id}`;

    const author = comment.users || {};
    const authorName = author.display_name || 'নাম নেই';
    
    let avatarHTML;
    if (author.photo_url) {
        avatarHTML = `<img src="${author.photo_url}" alt="${authorName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
        avatarHTML = (authorName.charAt(0) || '?').toUpperCase();
    }
    const avatarStyle = author.photo_url ? '' : `background-color: ${generateAvatarColor(authorName)}; color: white; display: flex; align-items: center; justify-content: center;`;

    const hasLiked = currentUser && JSON.parse(localStorage.getItem(`userCommentLikes_${currentUser.id}`) || '[]').includes(comment.id);

    let menuItems = '';
    if (currentUser && currentUser.id === comment.author_uid) {
        menuItems = `
            <button class="action-edit" data-id="${comment.id}" data-text="${(comment.text || '').replace(/"/g, '&quot;')}"><i class="fas fa-pencil-alt"></i> এডিট</button>
            <button class="action-delete" data-id="${comment.id}"><i class="fas fa-trash-alt"></i> ডিলিট</button>
        `;
    } else {
        menuItems = `<button class="action-report" data-id="${comment.id}"><i class="fas fa-flag"></i> রিপোর্ট</button>`;
    }

    // ====================================
    // CUSTOM VOICE PLAYER HTML
    // ====================================
    let audioPlayerHTML = '';
    if (comment.audio_url) {
        const uniqueId = `audio-${comment.id}`;
        audioPlayerHTML = `
            <div class="voice-note-wrapper">
                <button class="voice-play-btn" data-audio-id="${uniqueId}" onclick="toggleVoice('${uniqueId}', this)">
                    <i class="fas fa-play"></i>
                </button>
                <div class="voice-progress-container">
                    <div class="voice-progress-track">
                        <div class="voice-progress-fill" id="fill-${uniqueId}"></div>
                    </div>
                    <span class="voice-duration" id="time-${uniqueId}">0:00</span>
                </div>
                <audio id="${uniqueId}" src="${comment.audio_url}" preload="metadata" hidden ontimeupdate="updateVoiceProgress('${uniqueId}')" onended="resetVoiceBtn('${uniqueId}')"></audio>
            </div>
        `;
    }

    const html = `
        <div class="comment-item" id="comment-${comment.id}">
            <a href="/profile.html?id=${comment.author_uid}" class="avatar" style="${avatarStyle}">
                ${avatarHTML}
            </a>
            <div class="comment-content">
                <div class="comment-body">
                    <a href="/profile.html?id=${comment.author_uid}" style="text-decoration:none; color:inherit; font-weight:bold; font-size:14px;">${authorName}</a>
                    ${comment.text ? `<p class="comment-text">${linkifyText(comment.text)}</p>` : ''}
                    ${audioPlayerHTML}
                </div>
                <div class="comment-meta">
                    <span>${timeAgo(comment.created_at)}</span>
                    <button class="like-comment-btn ${hasLiked ? 'liked' : ''}" data-id="${comment.id}">
                        ${hasLiked ? 'লাইকড' : 'লাইক'} <span class="like-count">${comment.like_count || 0}</span>
                    </button>
                    <button class="reply-comment-btn" data-id="${comment.id}" data-name="${authorName}">রিপ্লাই</button>
                </div>
            </div>
            
            <div class="actions-menu-trigger comment-menu-trigger" data-dropdown-id="dropdown-comment-${comment.id}">
                <i class="fas fa-ellipsis-h"></i>
            </div>
            <div class="dropdown-menu" id="dropdown-comment-${comment.id}">
                ${menuItems}
            </div>
        </div>
    `;

    wrapper.innerHTML = html;

    if (comment.replies && comment.replies.length > 0) {
        comment.replies.forEach(reply => {
            wrapper.appendChild(createCommentNode(reply, true));
        });
    }

    // টাইম লোডিং ফিক্স
    if (comment.audio_url) {
        setTimeout(() => {
            const audioEl = wrapper.querySelector('audio');
            if(audioEl) {
                audioEl.onloadedmetadata = function() {
                    const timeEl = document.getElementById(`time-${audioEl.id}`);
                    if(timeEl && isFinite(audioEl.duration)) {
                        timeEl.textContent = formatTime(audioEl.duration);
                    }
                };
            }
        }, 100);
    }

    return wrapper;
}

// ====================================
// VOICE PLAYER CONTROL FUNCTIONS
// ====================================

window.toggleVoice = function(audioId, btn) {
    const audio = document.getElementById(audioId);
    
    if (currentlyPlayingAudio && currentlyPlayingAudio !== audio) {
        currentlyPlayingAudio.pause();
        const oldBtn = document.querySelector(`button[data-audio-id="${currentlyPlayingAudio.id}"]`);
        if (oldBtn) oldBtn.innerHTML = '<i class="fas fa-play"></i>';
    }

    if (audio.paused) {
        audio.play().catch(e => console.log("Playback error:", e));
        btn.innerHTML = '<i class="fas fa-pause"></i>';
        currentlyPlayingAudio = audio;
    } else {
        audio.pause();
        btn.innerHTML = '<i class="fas fa-play"></i>';
        currentlyPlayingAudio = null;
    }
};

window.updateVoiceProgress = function(audioId) {
    const audio = document.getElementById(audioId);
    const fill = document.getElementById(`fill-${audioId}`);
    const time = document.getElementById(`time-${audioId}`);
    
    if (audio.duration && isFinite(audio.duration)) {
        const percent = (audio.currentTime / audio.duration) * 100;
        fill.style.width = `${percent}%`;
        
        const timeLeft = Math.max(0, audio.duration - audio.currentTime);
        time.textContent = formatTime(timeLeft);
    }
};

window.resetVoiceBtn = function(audioId) {
    const btn = document.querySelector(`button[data-audio-id="${audioId}"]`);
    const fill = document.getElementById(`fill-${audioId}`);
    const time = document.getElementById(`time-${audioId}`);
    const audio = document.getElementById(audioId);

    if (btn) btn.innerHTML = '<i class="fas fa-play"></i>';
    if (fill) fill.style.width = '0%';
    
    if (time && audio && isFinite(audio.duration)) {
        time.textContent = formatTime(audio.duration);
    }
    
    currentlyPlayingAudio = null;
};

function formatTime(seconds) {
    if(isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// ====================================
// SUBMIT, LIKE, DELETE FUNCTIONS
// ====================================

async function handleCommentSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (isCommentSubmitting) return;
    if (!currentUser) { document.getElementById('loginPage').style.display = 'flex'; return; }

    const input = document.getElementById('commentInput');
    let text = input.value.trim();
    
    if (!text && !audioBlob) {
        if(!isRecording && !audioBlob) return;
    }

    isCommentSubmitting = true;
    const btn = document.getElementById('submitCommentBtn');
    
    if(document.getElementById('audioRecordUI').style.display !== 'none') {
        const stopBtn = document.getElementById('stopRecordBtn');
        if(stopBtn) stopBtn.innerHTML = 'পাঠানো হচ্ছে... <i class="fas fa-spinner fa-spin"></i>';
    } else {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;
    }

    try {
        let audioUrl = null;

        if (audioBlob) {
            console.log("Uploading audio...");
            const fileName = `comment_audio_${currentUser.id}_${Date.now()}.webm`;
            const { data: uploadData, error: uploadError } = await supabaseClient.storage
                .from('comment_audios')
                .upload(fileName, audioBlob, { cacheControl: '3600', upsert: false });

            if (uploadError) throw new Error("অডিও আপলোড ব্যর্থ হয়েছে: " + uploadError.message);
            
            const { data: publicUrlData } = supabaseClient.storage
                .from('comment_audios')
                .getPublicUrl(uploadData.path);
            
            audioUrl = publicUrlData.publicUrl;
        }

        if (!text && audioUrl) text = null; 

        const { data, error } = await supabaseClient
            .from('comments')
            .insert([{
                text: text,
                audio_url: audioUrl,
                author_uid: currentUser.id,
                prayer_id: currentPrayerIdForComment,
                parent_id: currentParentCommentId
            }])
            .select(`*, users!author_uid(display_name, photo_url)`)
            .single();

        if (error) throw error;

        input.value = '';
        input.style.height = 'auto';
        document.getElementById('startRecordBtn').style.display = 'inline-block';
        
        cancelRecording();

        if (!document.getElementById(`comment-wrapper-${data.id}`)) {
            const newCommentNode = createCommentNode({ ...data, replies: [] }, !!currentParentCommentId);
            const list = document.getElementById('commentList');
            
            if (currentParentCommentId) {
                const parentWrapper = document.getElementById(`comment-wrapper-${currentParentCommentId}`);
                if (parentWrapper) parentWrapper.appendChild(newCommentNode);
                else list.appendChild(newCommentNode);
            } else {
                const noMsg = list.querySelector('.no-results-message');
                if (noMsg) noMsg.remove();
                list.appendChild(newCommentNode);
                setTimeout(() => { newCommentNode.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
            }
        }

        const card = document.getElementById(`prayer-${currentPrayerIdForComment}`);
        if(card) {
             const countSpan = card.querySelector('.comment-count-text');
             if(countSpan) {
                 const currentText = countSpan.innerText;
                 const currentCount = parseInt(currentText) || 0;
                 countSpan.innerText = `${currentCount + 1} টি কমেন্ট`;
             }
        }

        resetReplyState();

        const prayer = allFetchedPrayers.get(currentPrayerIdForComment);
        if (prayer && prayer.author_uid !== currentUser.id) {
             const notifText = audioUrl ? `${currentUser.profile.display_name} আপনার পোস্টে একটি ভয়েস কমেন্ট করেছেন।` : `${currentUser.profile.display_name} আপনার পোস্টে কমেন্ট করেছেন।`;
             await createNotification(prayer.author_uid, currentUser.id, 'comment', notifText, `post_id=${prayer.id}`);
        }

    } catch (error) {
        console.error('কমেন্ট পোস্ট ত্রুটি:', error);
        alert(error.message || 'কমেন্ট পোস্ট করতে সমস্যা হয়েছে।');
    } finally {
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        btn.disabled = false;
        const stopBtn = document.getElementById('stopRecordBtn');
        if(stopBtn) stopBtn.innerHTML = 'থেমে পাঠান <i class="fas fa-paper-plane"></i>';
        isCommentSubmitting = false; 
    }
}

function handleCommentListClick(e) {
    const btn = e.target.closest('button') || e.target.closest('.actions-menu-trigger');
    if (!btn) return;

    if (btn.classList.contains('voice-play-btn')) return;

    if (btn.classList.contains('actions-menu-trigger')) {
        e.stopPropagation();
        const dropdownId = btn.dataset.dropdownId;
        const dropdown = document.getElementById(dropdownId);
        document.querySelectorAll('.dropdown-menu').forEach(d => { if(d.id !== dropdownId) d.style.display = 'none'; });
        if (dropdown) dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        return;
    }

    if (!currentUser) { document.getElementById('loginPage').style.display = 'flex'; return; }
    const id = btn.dataset.id;

    if (btn.classList.contains('reply-comment-btn')) {
        startReply(id, btn.dataset.name);
    } else if (btn.classList.contains('like-comment-btn')) {
        handleCommentLike(id, btn);
    } else if (btn.classList.contains('action-delete')) {
        handleDeleteComment(id);
    } else if (btn.classList.contains('action-edit')) {
        openEditCommentModal(id, btn.dataset.text);
    } else if (btn.classList.contains('action-report')) {
        showReportModal(id, 'comment');
    }
    
    if(btn.parentElement.classList.contains('dropdown-menu')) {
        btn.parentElement.style.display = 'none';
    }
}

function startReply(commentId, authorName) {
    currentParentCommentId = commentId;
    const container = document.getElementById('replyingToContainer');
    const textSpan = document.getElementById('replyingToText');
    const input = document.getElementById('commentInput');
    container.style.display = 'flex';
    textSpan.innerHTML = `রিপ্লাই দিচ্ছেন: <strong>${authorName}</strong>`;
    input.focus();
    input.placeholder = "রিপ্লাই লিখুন...";
}

function resetReplyState() {
    currentParentCommentId = null;
    document.getElementById('replyingToContainer').style.display = 'none';
    const input = document.getElementById('commentInput');
    input.placeholder = "একটি কমেন্ট লিখুন...";
}

async function handleCommentLike(commentId, btn) {
    const countSpan = btn.querySelector('.like-count');
    let currentCount = parseInt(countSpan.textContent, 10);
    const storageKey = `userCommentLikes_${currentUser.id}`;
    let userCommentLikes = JSON.parse(localStorage.getItem(storageKey) || '[]').map(Number);
    const isLiked = userCommentLikes.includes(parseInt(commentId));

    btn.classList.toggle('liked');
    if(isLiked) {
        btn.childNodes[0].textContent = 'লাইক ';
        countSpan.textContent = Math.max(0, currentCount - 1);
        userCommentLikes = userCommentLikes.filter(id => id !== parseInt(commentId));
    } else {
        btn.childNodes[0].textContent = 'লাইকড ';
        countSpan.textContent = currentCount + 1;
        userCommentLikes.push(parseInt(commentId));
    }
    localStorage.setItem(storageKey, JSON.stringify(userCommentLikes));

    try {
        const rpcName = isLiked ? 'decrement_comment_like' : 'increment_comment_like';
        await supabaseClient.rpc(rpcName, { c_id: parseInt(commentId) });
    } catch (err) { console.error("Like error:", err); }
}

async function handleDeleteComment(commentId) {
    if (!confirm('আপনি কি নিশ্চিত?')) return;
    try {
        const { data: commentData } = await supabaseClient.from('comments').select('audio_url').eq('id', commentId).single();
        const { error } = await supabaseClient.from('comments').delete().eq('id', commentId);
        if (error) throw error;

        if (commentData && commentData.audio_url) {
            try {
                const urlParts = commentData.audio_url.split('/comment_audios/');
                if (urlParts.length > 1) {
                    await supabaseClient.storage.from('comment_audios').remove([urlParts[1]]);
                }
            } catch (storageErr) { console.warn("Audio delete failed:", storageErr); }
        }

        const wrapper = document.getElementById(`comment-wrapper-${commentId}`);
        if (wrapper) wrapper.remove();
        
        const card = document.getElementById(`prayer-${currentPrayerIdForComment}`);
        if(card) {
             const countSpan = card.querySelector('.comment-count-text');
             if(countSpan) {
                 const currentText = countSpan.innerText;
                 const currentCount = parseInt(currentText) || 0;
                 countSpan.innerText = `${Math.max(0, currentCount - 1)} টি কমেন্ট`;
             }
        }
    } catch (error) { alert("ডিলিট করতে সমস্যা হয়েছে।"); }
}

function openEditCommentModal(id, text) {
    document.getElementById('editCommentId').value = id;
    document.getElementById('editCommentTextarea').value = text;
    document.getElementById('editCommentModal').style.display = 'flex';
}

async function handleEditCommentSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('saveCommentBtn');
    const id = document.getElementById('editCommentId').value;
    const newText = document.getElementById('editCommentTextarea').value.trim();
    if (!newText) return;
    btn.textContent = 'আপডেট হচ্ছে...'; btn.disabled = true;
    try {
        const { error } = await supabaseClient.from('comments').update({ text: newText }).eq('id', id);
        if (error) throw error;
        const commentTextEl = document.querySelector(`#comment-${id} .comment-text`);
        if (commentTextEl) commentTextEl.innerHTML = linkifyText(newText);
        document.getElementById('editCommentModal').style.display = 'none';
    } catch (error) { alert('সমস্যা হয়েছে।'); } finally { btn.textContent = 'আপডেট করুন'; btn.disabled = false; }
}
