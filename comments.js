// ====================================
// COMMENTS PAGE LOGIC
// ====================================

let currentPrayerIdForComment = null;
let currentParentCommentId = null;
// ডাবল সাবমিশন রোধ করার জন্য ফ্ল্যাগ (Lock)
let isCommentSubmitting = false;

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
});

async function initializeCommentPage() {
    // অথেন্টিকেশন চেক
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        // যদি গ্লোবাল currentUser সেট না থাকে তবে সেট করে নিচ্ছি
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

function setupCommentPageEventListeners() {
    const commentForm = document.getElementById('commentForm');
    if (commentForm) {
        // পুরনো লিসেনার রিমুভ করে নতুন করে অ্যাড করা হচ্ছে যাতে ডুপ্লিকেট না হয়
        const newForm = commentForm.cloneNode(true);
        commentForm.parentNode.replaceChild(newForm, commentForm);
        newForm.addEventListener('submit', handleCommentSubmit);
    }
    
    const editCommentForm = document.getElementById('editCommentForm');
    if(editCommentForm) {
        editCommentForm.addEventListener('submit', handleEditCommentSubmit);
    }

    // ডেলিগেটেড ইভেন্ট লিসেনার
    const list = document.getElementById('commentList');
    if (list) {
        list.addEventListener('click', handleCommentListClick);
    }
    
    // রিপ্লাই বাতিল বাটন
    document.getElementById('cancelReplyBtn')?.addEventListener('click', resetReplyState);

    // ইনপুট বক্স অটো-রিসাইজ
    const commentInput = document.getElementById('commentInput');
    if(commentInput) {
        commentInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            if(this.value === '') this.style.height = 'auto';
        });
    }
}

async function loadPageContent(postId) {
    await loadOriginalPost(postId);
    await loadComments(postId);
}

// ১. মূল পোস্ট লোড করা
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
            // গ্লোবাল ম্যাপে ডেটা সেট (script.js এর ফাংশন ব্যবহারের জন্য)
            allFetchedPrayers.set(prayer.id, prayer);
            
            // script.js এর createPrayerCardElement ব্যবহার করা হচ্ছে
            // যাতে কার্ডের ডিজাইন হুবহু হোম পেজের মতো হয়
            const card = createPrayerCardElement(prayer);
            
            // কমেন্ট পেজে কমেন্ট বাটন হাইড রাখা
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

// ২. কমেন্ট লোড করা
async function loadComments(postId) {
    const commentList = document.getElementById('commentList');
    
    try {
        const { data, error } = await supabaseClient
            .from('comments')
            .select(`*, users!author_uid(display_name, photo_url)`)
            .eq('prayer_id', postId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        renderComments(commentList, data);
        
        // হেডার কাউন্ট আপডেট
        const headerCount = document.querySelector('.comment-count-header');
        if(headerCount) headerCount.textContent = `সকল কমেন্ট (${data.length})`;

    } catch (error) {
        console.error('কমেন্ট লোড সমস্যা:', error);
        commentList.innerHTML = `<p style="color:red; text-align:center; padding: 20px;">কমেন্ট লোড করা যায়নি।</p>`;
    }
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
    const authorPhotoURL = author.photo_url;
    
    let avatarHTML;
    if (authorPhotoURL) {
        avatarHTML = `<img src="${authorPhotoURL}" alt="${authorName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
        avatarHTML = (authorName.charAt(0) || '?').toUpperCase();
    }
    const avatarStyle = authorPhotoURL ? '' : `background-color: ${generateAvatarColor(authorName)}; color: white; display: flex; align-items: center; justify-content: center;`;

    const hasLiked = currentUser && JSON.parse(localStorage.getItem(`userCommentLikes_${currentUser.id}`) || '[]').includes(comment.id);

    let menuItems = '';
    if (currentUser && currentUser.id === comment.author_uid) {
        menuItems = `
            <button class="action-edit" data-id="${comment.id}" data-text="${comment.text.replace(/"/g, '&quot;')}"><i class="fas fa-pencil-alt"></i> এডিট</button>
            <button class="action-delete" data-id="${comment.id}"><i class="fas fa-trash-alt"></i> ডিলিট</button>
        `;
    } else {
        menuItems = `
            <button class="action-report" data-id="${comment.id}"><i class="fas fa-flag"></i> রিপোর্ট</button>
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
                    <p class="comment-text">${linkifyText(comment.text)}</p>
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

    return wrapper;
}

// ৩. ইভেন্ট হ্যান্ডলার
function handleCommentListClick(e) {
    const btn = e.target.closest('button') || e.target.closest('.actions-menu-trigger');
    if (!btn) return;

    if (btn.classList.contains('actions-menu-trigger')) {
        e.stopPropagation();
        const dropdownId = btn.dataset.dropdownId;
        const dropdown = document.getElementById(dropdownId);
        
        document.querySelectorAll('.dropdown-menu').forEach(d => {
            if(d.id !== dropdownId) d.style.display = 'none';
        });

        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        }
        return;
    }

    if (!currentUser) {
        document.getElementById('loginPage').style.display = 'flex';
        return;
    }

    const id = btn.dataset.id;

    if (btn.classList.contains('reply-comment-btn')) {
        const name = btn.dataset.name;
        startReply(id, name);
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

// **** FIX: Anti-Double Submission Logic ****
async function handleCommentSubmit(e) {
    e.preventDefault();
    
    // লক চেক: যদি ইতিমধ্যে সাবমিট হতে থাকে, ফিরে যান
    if (isCommentSubmitting) return;

    if (!currentUser) { 
        document.getElementById('loginPage').style.display = 'flex'; 
        return; 
    }

    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    const btn = document.getElementById('submitCommentBtn');

    if (!text || !currentPrayerIdForComment) return;

    // লক চালু
    isCommentSubmitting = true;
    
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        const { data, error } = await supabaseClient
            .from('comments')
            .insert([{
                text: text,
                author_uid: currentUser.id,
                prayer_id: currentPrayerIdForComment,
                parent_id: currentParentCommentId
            }])
            .select(`*, users!author_uid(display_name, photo_url)`)
            .single();

        if (error) throw error;

        // সফল হলে
        input.value = '';
        input.style.height = 'auto';
        
        // নতুন কমেন্ট অ্যাপেন্ড করা (DOM চেক করে যাতে ডুপ্লিকেট না হয়)
        if (!document.getElementById(`comment-wrapper-${data.id}`)) {
            const newCommentNode = createCommentNode({ ...data, replies: [] }, !!currentParentCommentId);
            const list = document.getElementById('commentList');
            
            if (currentParentCommentId) {
                const parentWrapper = document.getElementById(`comment-wrapper-${currentParentCommentId}`);
                if (parentWrapper) {
                    parentWrapper.appendChild(newCommentNode);
                } else {
                    list.appendChild(newCommentNode);
                }
            } else {
                const noMsg = list.querySelector('.no-results-message');
                if (noMsg) noMsg.remove();
                list.appendChild(newCommentNode);
                
                // নতুন কমেন্টে স্ক্রল
                setTimeout(() => {
                   newCommentNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }

        // কমেন্ট কাউন্ট আপডেট (ডাটাবেজ এবং UI)
        if (typeof updateCommentCount === 'function') {
            await updateCommentCount(currentPrayerIdForComment);
        }
        
        // রিসেট
        resetReplyState();

        // নোটিফিকেশন পাঠানো
        const prayer = allFetchedPrayers.get(currentPrayerIdForComment);
        if (prayer && prayer.author_uid !== currentUser.id) {
             await createNotification(prayer.author_uid, currentUser.id, 'comment', `${currentUser.profile.display_name} আপনার পোস্টে কমেন্ট করেছেন।`, `post_id=${prayer.id}`);
        }

    } catch (error) {
        console.error('কমেন্ট পোস্ট ত্রুটি:', error);
        // সাইলেন্ট ফেইল বা ইউজারকে জানানো
    } finally {
        // লক রিলিজ এবং বাটন রিসেট
        btn.innerHTML = originalIcon;
        btn.disabled = false;
        isCommentSubmitting = false; 
    }
}

async function handleCommentLike(commentId, btn) {
    const countSpan = btn.querySelector('.like-count');
    let currentCount = parseInt(countSpan.textContent, 10);
    
    const storageKey = `userCommentLikes_${currentUser.id}`;
    let userCommentLikes = JSON.parse(localStorage.getItem(storageKey) || '[]').map(Number);
    const isLiked = userCommentLikes.includes(parseInt(commentId));

    // UI অপটিমিস্টিক আপডেট
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
    } catch (err) {
        console.error("Like error:", err);
    }
}

async function handleDeleteComment(commentId) {
    if (!confirm('আপনি কি নিশ্চিত যে এই কমেন্টটি ডিলিট করতে চান?')) return;

    try {
        const { error } = await supabaseClient
            .from('comments')
            .delete()
            .eq('id', commentId);

        if (error) throw error;

        const wrapper = document.getElementById(`comment-wrapper-${commentId}`);
        if (wrapper) wrapper.remove();
        
        if (typeof updateCommentCount === 'function') {
            updateCommentCount(currentPrayerIdForComment);
        }

    } catch (error) {
        console.error("Delete error:", error);
        alert("কমেন্ট ডিলিট করতে সমস্যা হয়েছে।");
    }
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

    btn.textContent = 'আপডেট হচ্ছে...';
    btn.disabled = true;

    try {
        const { error } = await supabaseClient
            .from('comments')
            .update({ text: newText })
            .eq('id', id);

        if (error) throw error;

        const commentTextEl = document.querySelector(`#comment-${id} .comment-text`);
        if (commentTextEl) commentTextEl.innerHTML = linkifyText(newText);
        
        const editBtn = document.querySelector(`.action-edit[data-id="${id}"]`);
        if(editBtn) editBtn.dataset.text = newText;

        document.getElementById('editCommentModal').style.display = 'none';

    } catch (error) {
        alert('আপডেট করতে সমস্যা হয়েছে।');
    } finally {
        btn.textContent = 'আপডেট করুন';
        btn.disabled = false;
    }
}