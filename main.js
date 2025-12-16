// ====================================================================
// FILE: main.js
// বিবরণ: অ্যাপের এন্ট্রি পয়েন্ট। এখান থেকেই অ্যাপ ইনিশিয়ালাইজ এবং রান হয়।
// ====================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 iPray App Initializing...");

    // ----------------------------------------------------------------
    // 1. অ্যাপ কন্টেইনার দৃশ্যমান করা (White Screen Fix)
    // ----------------------------------------------------------------
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
        appContainer.style.display = 'block';
    } else {
        console.error("❌ Critical Error: 'appContainer' not found in DOM!");
    }

    // ----------------------------------------------------------------
    // 2. মডিউল সেটআপ (Dependencies Check)
    // ----------------------------------------------------------------
    
    // গ্লোবাল ইভেন্ট লিসেনার (interactions.js)
    if (typeof setupEventListeners === 'function') {
        setupEventListeners();
        console.log("✅ Global Event Listeners Attached");
    } else {
        console.error("⚠️ Warning: setupEventListeners function not found.");
    }

    // নেভিগেশন লজিক (interactions.js)
    if (typeof setupNavigationLogic === 'function') {
        setupNavigationLogic();
        console.log("✅ Navigation Logic Initialized");
    }

    // স্টোরি এডিটর (stories.js)
    if (typeof setupStoryEditor === 'function') {
        setupStoryEditor();
        console.log("✅ Story Editor Setup Complete");
    }

    // ----------------------------------------------------------------
    // 3. অথেন্টিকেশন চেক এবং অ্যাপ স্টার্ট
    // ----------------------------------------------------------------
    try {
        // সুপাবেস সেশন চেক করা
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) throw error;

        if (session) {
            // --- ইউজার লগইন অবস্থায় আছে ---
            console.log("👤 User Logged In:", session.user.email);
            
            // লগইন মডাল লুকানো
            const loginPage = document.getElementById('loginPage');
            if (loginPage) loginPage.style.display = 'none';
            
            // ইউজার ডাটা এবং ফিড লোড করা (auth.js থেকে)
            if(typeof handleUserLoggedIn === 'function') {
                await handleUserLoggedIn(session.user);
                
                // হিলার মুড চেক (healer.js থেকে) - ইউজার লগইন হওয়ার পরেই চেক হবে
                if (typeof checkMoodStatus === 'function') {
                    // একটু দেরি করে চেক করা যাতে ইউজার ইন্টারফেস আগে লোড হয়
                    setTimeout(() => checkMoodStatus(), 2000);
                }
            }
        } else {
            // --- ইউজার লগইন নেই (Guest Mode) ---
            console.log("👤 No User Logged In (Guest Mode)");
            
            // লগআউট হ্যান্ডলার কল করে ক্লিনআপ করা
            if(typeof handleUserLoggedOut === 'function') {
                handleUserLoggedOut();
            }
        }

        // ----------------------------------------------------------------
        // 4. অথেন্টিকেশন স্টেট মনিটর (Realtime Login/Logout Listener)
        // ----------------------------------------------------------------
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            console.log("🔄 Auth State Changed:", event);
            
            if (event === 'SIGNED_IN' && session) {
                // নতুন করে লগইন হলে
                const loginPage = document.getElementById('loginPage');
                if (loginPage) loginPage.style.display = 'none';
                
                if(typeof handleUserLoggedIn === 'function') {
                    await handleUserLoggedIn(session.user);
                    // মুড চেক
                    if (typeof checkMoodStatus === 'function') setTimeout(() => checkMoodStatus(), 2000);
                }
            } else if (event === 'SIGNED_OUT') {
                // লগআউট হলে
                if(typeof handleUserLoggedOut === 'function') {
                    handleUserLoggedOut();
                }
            }
        });

    } catch (err) {
        console.error("❌ Auth Initialization Error:", err);
        // কোনো ক্রিটিক্যাল এরর হলে অ্যাপ ক্র্যাশ না করে গেস্ট মোডে রাখা
        if(typeof handleUserLoggedOut === 'function') {
            handleUserLoggedOut();
        }
    }
});