// ====================================
// Supabase ক্লায়েন্ট এবং গ্লোবাল ভ্যারিয়েবল
// ====================================
const SUPABASE_URL = 'https://pnsvptaanvtdaspqjwbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuc3ZwdGFhbnZ0ZGFzcHFqd2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMzcxNjMsImV4cCI6MjA3NTkxMzE2M30.qposYOL-W17DnFF11cJdZ7zrN1wh4Bop6YnclkUe_rU';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// ====================================
// অ্যাপলিকেশন শুরু করার প্রধান লজিক
// ====================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAdminAccess();
    await loadCampaigns();
    setupEventListeners();
});

async function checkAdminAccess() {
    const loadingOverlay = document.getElementById('adminLoading');
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error || !session || !session.user) {
            throw new Error("You must be logged in to access this page.");
        }
        currentUser = session.user;

        // --- SECURITY UPDATE: ডাটাবেজ থেকে রোল চেক করা হচ্ছে ---
        const { data: userProfile, error: profileError } = await supabaseClient
            .from('users')
            .select('role')
            .eq('id', currentUser.id)
            .single();

        if (profileError || !userProfile || userProfile.role !== 'admin') {
            throw new Error("You do not have permission to view this page.");
        }
        // -----------------------------------------------------

        document.getElementById('adminUserName').textContent = currentUser.email;
    } catch (error) {
        alert(error.message);
        window.location.href = '/index.html';
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

// ====================================
// ইভেন্ট লিসেনার সেটআপ
// ====================================
function setupEventListeners() {
    document.getElementById('refreshCampaigns').addEventListener('click', loadCampaigns);
    document.getElementById('saveCampaignBtn').addEventListener('click', handleSaveCampaign);
    document.getElementById('campaignsContainer').addEventListener('click', handleCardButtonClick);
}

// ====================================
// ক্যাম্পেইন লোড এবং রেন্ডার
// ====================================
async function loadCampaigns() {
    const container = document.getElementById('campaignsContainer');
    container.innerHTML = `<div class="loading-spinner-container" style="text-align: center; padding: 40px;"><div class="loading-spinner"></div><p>ক্যাম্পেইন লোড হচ্ছে...</p></div>`;

    try {
        const { data: campaigns, error } = await supabaseClient
            .from('prayers')
            .select('*')
            .eq('is_fundraising', true)
            .order('created_at', { ascending: false });

        if (error) throw error;
        renderCampaigns(campaigns);

    } catch (error) {
        container.innerHTML = `<p style="color: red; text-align: center;">ক্যাম্পেইন লোড করতে সমস্যা হয়েছে: ${error.message}</p>`;
    }
}

function renderCampaigns(campaigns) {
    const container = document.getElementById('campaignsContainer');
    if (!campaigns || campaigns.length === 0) {
        container.innerHTML = `<p style="text-align: center; padding: 20px;">কোনো ফান্ডরাইজিং ক্যাম্পেইন পাওয়া যায়নি।</p>`;
        return;
    }

    container.innerHTML = campaigns.map(campaign => {
        const goal = campaign.goal_amount || 0;
        const current = campaign.current_amount || 0;
        const percentage = goal > 0 ? Math.min(100, (current / goal) * 100).toFixed(0) : 0;
        
        let statusClass = '';
        let statusText = campaign.status.toUpperCase();
        
        const now = new Date();
        const expiryDate = campaign.expires_at ? new Date(campaign.expires_at) : null;
        
        if (expiryDate && now > expiryDate && campaign.status === 'active') {
            statusClass = 'expired';
            statusText = 'EXPIRED';
        } else if (campaign.status === 'hidden') {
            statusClass = 'hidden';
        } else if (campaign.status === 'completed') {
            statusClass = 'completed';
        }

        return `
            <div class="content-item campaign-card ${statusClass}" data-campaign-id="${campaign.id}">
                <div class="content-header">
                    <div class="content-info">
                        <div class="content-title">${campaign.title}</div>
                        <div class="content-author"><strong>প্রতিষ্ঠান:</strong> ${campaign.organization_name}</div>
                    </div>
                    <div class="content-status ${statusClass}">${statusText}</div>
                </div>
                <div class="content-body">
                    <p>${(campaign.details || '').substring(0, 150)}...</p>
                    <div class="fundraising-progress" style="margin-top: 10px;">
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px;">
                            <span>সংগৃহীত: ৳${current.toLocaleString('bn-BD')}</span>
                            <span>লক্ষ্য: ৳${goal.toLocaleString('bn-BD')}</span>
                        </div>
                        <div class="progress-bar-container" style="height: 8px;">
                            <div class="progress-bar-fill" style="width: ${percentage}%; height: 8px;"></div>
                        </div>
                         <div style="text-align: center; font-size: 14px; font-weight: bold; margin-top: 5px;">${percentage}% সম্পন্ন হয়েছে</div>
                    </div>
                    ${expiryDate ? `<p style="font-size: 12px; color: #e74c3c; margin-top: 10px; text-align: center;"><strong>মেয়াদ শেষ হবে:</strong> ${expiryDate.toLocaleString('bn-BD')}</p>` : ''}
                </div>
                <div class="content-footer">
                    <div class="content-actions">
                        <button class="btn btn-sm btn-info" data-action="edit"><i class="fas fa-pencil-alt"></i> এডিট</button>
                        <button class="btn btn-sm btn-warning" data-action="hide"><i class="fas fa-eye-slash"></i> হাইড</button>
                        <button class="btn btn-sm btn-danger" data-action="delete"><i class="fas fa-trash"></i> ডিলিট</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}


// ====================================
// কার্ড বাটনের ইভেন্ট হ্যান্ডলিং
// ====================================
async function handleCardButtonClick(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const card = button.closest('.campaign-card');
    const campaignId = card.dataset.campaignId;
    const action = button.dataset.action;

    if (action === 'edit') {
        await openEditModal(campaignId);
    } else if (action === 'hide') {
        if (confirm("আপনি কি নিশ্চিতভাবে এই ক্যাম্পেইনটি হাইড করতে চান?")) {
            await updateCampaignStatus(campaignId, 'hidden');
        }
    } else if (action === 'delete') {
        if (confirm("সতর্কবার্তা! আপনি কি এই ক্যাম্পেইনটি স্থায়ীভাবে মুছে ফেলতে চান? এই কাজটি ফেরানো যাবে না।")) {
            await deleteCampaign(campaignId);
        }
    }
}

// ====================================
// এডিট মডাল এবং সেভ ফাংশনালিটি
// ====================================
async function openEditModal(campaignId) {
    try {
        const { data: campaign, error } = await supabaseClient
            .from('prayers')
            .select('*')
            .eq('id', campaignId)
            .single();
        if (error) throw error;

        document.getElementById('editCampaignId').value = campaign.id;
        document.getElementById('editCampaignTitle').value = campaign.title;
        document.getElementById('editCampaignOrgName').value = campaign.organization_name;
        document.getElementById('editCampaignDescription').value = campaign.details;
        document.getElementById('editCampaignGoal').value = campaign.goal_amount;
        document.getElementById('editCampaignCurrent').value = campaign.current_amount;
        document.getElementById('editCampaignPayment').value = campaign.payment_details?.info || '';
        document.getElementById('editCampaignStatus').value = campaign.status;

        // datetime-local ইনপুটের জন্য তারিখ ফরম্যাট করা
        if (campaign.expires_at) {
            const date = new Date(campaign.expires_at);
            const timezoneOffset = date.getTimezoneOffset() * 60000;
            const localISOTime = new Date(date - timezoneOffset).toISOString().slice(0, 16);
            document.getElementById('editCampaignExpiresAt').value = localISOTime;
        } else {
            document.getElementById('editCampaignExpiresAt').value = '';
        }

        document.getElementById('campaignEditModal').style.display = 'flex';

    } catch (error) {
        alert("ক্যাম্পেইনের তথ্য লোড করতে সমস্যা হয়েছে: " + error.message);
    }
}

async function handleSaveCampaign() {
    const btn = document.getElementById('saveCampaignBtn');
    btn.disabled = true;
    
    const campaignId = document.getElementById('editCampaignId').value;
    const expiresAtValue = document.getElementById('editCampaignExpiresAt').value;

    const dataToUpdate = {
        title: document.getElementById('editCampaignTitle').value,
        organization_name: document.getElementById('editCampaignOrgName').value,
        details: document.getElementById('editCampaignDescription').value,
        goal_amount: parseFloat(document.getElementById('editCampaignGoal').value),
        current_amount: parseFloat(document.getElementById('editCampaignCurrent').value),
        payment_details: { "info": document.getElementById('editCampaignPayment').value },
        status: document.getElementById('editCampaignStatus').value,
        expires_at: expiresAtValue ? new Date(expiresAtValue).toISOString() : null
    };

    try {
        const { error } = await supabaseClient
            .from('prayers')
            .update(dataToUpdate)
            .eq('id', campaignId);
        
        if (error) throw error;
        
        alert("ক্যাম্পেইন সফলভাবে আপডেট করা হয়েছে!");
        document.getElementById('campaignEditModal').style.display = 'none';
        await loadCampaigns();

    } catch (error) {
        alert("আপডেট করতে সমস্যা হয়েছে: " + error.message);
    } finally {
        btn.disabled = false;
    }
}

// ====================================
// স্ট্যাটাস পরিবর্তন এবং ডিলিট ফাংশন
// ====================================
async function updateCampaignStatus(campaignId, status) {
    try {
        const { error } = await supabaseClient
            .from('prayers')
            .update({ status: status })
            .eq('id', campaignId);
        if (error) throw error;
        alert(`ক্যাম্পেইনটি সফলভাবে "${status}" করা হয়েছে।`);
        await loadCampaigns();
    } catch (error) {
        alert("স্ট্যাটাস আপডেট করতে সমস্যা হয়েছে: " + error.message);
    }
}

async function deleteCampaign(campaignId) {
    try {
        // প্রথমে স্টোরেজ থেকে সংশ্লিষ্ট ছবি ডিলিট করার চেষ্টা (যদি থাকে)
        const { data: campaignData, error: fetchError } = await supabaseClient.from('prayers').select('image_url').eq('id', campaignId).single();
        if (fetchError) throw fetchError;

        if (campaignData.image_url) {
            try {
                const path = new URL(campaignData.image_url).pathname.split('/post_images/')[1];
                if (path) {
                    await supabaseClient.storage.from('post_images').remove([path]);
                }
            } catch (e) {
                console.warn(`স্টোরেজ থেকে ছবি ডিলিট করা যায়নি: ${e.message}`);
            }
        }
        
        // ডাটাবেজ থেকে ক্যাম্পেইন ডিলিট করা
        const { error: deleteError } = await supabaseClient
            .from('prayers')
            .delete()
            .eq('id', campaignId);
        if (deleteError) throw deleteError;

        alert("ক্যাম্পেইনটি স্থায়ীভাবে মুছে ফেলা হয়েছে।");
        await loadCampaigns();

    } catch (error) {
        alert("ক্যাম্পেইন ডিলিট করতে সমস্যা হয়েছে: " + error.message);
    }
}