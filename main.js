// ====================================
// FILE: main.js
// বিবরণ: অ্যাপের এন্ট্রি পয়েন্ট (এখান থেকেই অ্যাপ শুরু হবে)
// ====================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 iPray App Initializing...");

    // ১. অ্যাপ কন্টেইনার দৃশ্যমান করা (Default hidden থাকে)
    // এটি না থাকলে পেজ সাদা দেখাবে
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
        appContainer.style.display = 'block';
    }

    // ২. গ্লোবাল ইভেন্ট লিসেনার সেটআপ (interactions.js থেকে)
    // এটি সবচেয়ে জরুরি: নোটিফিকেশন, ডোনেশন, রিপোর্ট বাটন কাজ করার জন্য
    if (typeof setupEventListeners === 'function') {
        setupEventListeners();
        console.log("✅ Global Event Listeners Attached");
    } else {
        console.error("❌ Error: setupEventListeners function not found in interactions.js");
    }

    // ৩. নেভিগেশন লজিক সেটআপ (interactions.js থেকে)
    if (typeof setupNavigationLogic === 'function') {
        setupNavigationLogic();
    }

    // ৪. স্টোরি এডিটর সেটআপ (stories.js থেকে)
    if (typeof setupStoryEditor === 'function') {
        setupStoryEditor();
    }

    // ৫. অফলাইন সিঙ্ক লিসেনার সেটআপ (NEW FEATURE: Auto Sync)
    // যখন ইন্টারনেট ফিরে আসবে, তখন অফলাইন পোস্টগুলো আপলোড হবে
    window.addEventListener('online', () => {
        console.log("Internet restored. Attempting to sync offline posts...");
        if (typeof window.syncOfflinePosts === 'function') {
            window.syncOfflinePosts();
        }
    });

    // অ্যাপ চালু হওয়ার সময় যদি ইন্টারনেট থাকে, তবে পেন্ডিং পোস্ট চেক করবে
    if (navigator.onLine && typeof window.syncOfflinePosts === 'function') {
        // একটু সময় দিয়ে কল করা যাতে অন্য স্ক্রিপ্টগুলো লোড হয়ে যায়
        setTimeout(() => {
            window.syncOfflinePosts();
        }, 3000);
    }

    // ৬. অথেন্টিকেশন চেক (লগইন আছে কি না)
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) throw error;

        if (session) {
            // --- ইউজার লগইন করা আছে ---
            console.log("✅ User Logged In:", session.user.email);
            
            // লগইন মডাল লুকানো
            const loginPage = document.getElementById('loginPage');
            if (loginPage) loginPage.style.display = 'none';
            
            // ইউজার ডাটা লোড করা (auth.js থেকে)
            if(typeof handleUserLoggedIn === 'function') {
                await handleUserLoggedIn(session.user);
            }
        } else {
            // --- ইউজার লগইন নেই ---
            console.log("ℹ️ No User Logged In");
            
            // লগআউট হ্যান্ডলার কল করা (auth.js থেকে)
            if(typeof handleUserLoggedOut === 'function') {
                handleUserLoggedOut();
            }
        }

        // ৭. অথেন্টিকেশন পরিবর্তনের লিসেনার (লগইন/লগআউট মনিটর)
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            console.log("🔄 Auth State Changed:", event);
            
            if (event === 'SIGNED_IN' && session) {
                const loginPage = document.getElementById('loginPage');
                if (loginPage) loginPage.style.display = 'none';
                
                if(typeof handleUserLoggedIn === 'function') {
                    await handleUserLoggedIn(session.user);
                }
            } else if (event === 'SIGNED_OUT') {
                if(typeof handleUserLoggedOut === 'function') {
                    handleUserLoggedOut();
                }
            }
        });

    } catch (err) {
        console.error("❌ Auth Initialization Error:", err);
        // এরর হলেও অন্তত অ্যাপ যাতে ক্র্যাশ না করে, তাই লগআউট মোডে লোড করা
        if(typeof handleUserLoggedOut === 'function') {
            handleUserLoggedOut();
        }
    }
});