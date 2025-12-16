// ====================================================================
// FILE: healer.js
// বিবরণ: AI এর মাধ্যমে ইউজারের মুড অনুযায়ী গল্প ও সমাধান জেনারেট করা
// ====================================================================

console.log("Healer Module Loaded");

// 🔑 আপনার Google Gemini API Key এখানে বসান
// এটি ফ্রি-তে পেতে পারেন: https://aistudio.google.com/app/apikey
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE"; 

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// 1. Check Mood on App Load
function checkMoodStatus() {
    if (!currentUser) return;

    // শেষ কবে চেক করা হয়েছে তা লোকাল স্টোরেজ থেকে দেখা
    const lastCheck = localStorage.getItem('lastMoodCheck');
    const today = new Date().toDateString();

    // টেস্টিংয়ের জন্য আমরা এখন সব সময় দেখাবো (পরে if কন্ডিশনটি আনকমেন্ট করতে পারেন)
    // if (lastCheck !== today) { 
        setTimeout(() => {
            const modal = document.getElementById('moodModal');
            const userNameSpan = document.getElementById('moodUserName');
            
            // ইউজারের নাম সেট করা
            if (userNameSpan) {
                userNameSpan.innerText = currentUser.profile?.display_name || "বন্ধু";
            }
            
            // মডাল ওপেন করা (Bottom Sheet Animation)
            if (modal) {
                modal.style.display = 'flex';
                setTimeout(() => modal.classList.add('active'), 10);
            }
        }, 2000); // অ্যাপ খোলার ২ সেকেন্ড পর আসবে
    // }
}

// 2. Generate Healing Content (AI Call)
async function generateHealing(mood) {
    // API Key চেক
    if (GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
        alert("দয়া করে healer.js ফাইলে আপনার Gemini API Key বসান।");
        return;
    }

    // ১. মডাল বন্ধ করা
    const modal = document.getElementById('moodModal');
    modal.classList.remove('active');
    setTimeout(() => modal.style.display = 'none', 300);

    // ২. হিলার ভিউ ওপেন করা
    const healerView = document.getElementById('healer-view');
    const homeView = document.getElementById('appContainer');
    
    if (homeView) homeView.style.display = 'none';
    if (healerView) {
        healerView.style.display = 'block';
        window.scrollTo(0, 0);
    }

    // ৩. লোডার দেখানো
    document.getElementById('aiLoader').style.display = 'block';
    document.getElementById('aiResultContainer').style.display = 'none';

    // ৪. ইউজারের তথ্য ও প্রম্পট তৈরি
    const userName = currentUser ? currentUser.profile.display_name : "মুমিন";
    
    const prompt = `
        User Name: ${userName}
        Current Mood: ${mood}
        Language: Bengali (Bangla)

        Task:
        You are an Islamic spiritual healer AI. Based on the user's mood ("${mood}"), generate a comforting response.
        1. Select one powerful Quranic verse (Arabic text & Bangla translation) that comforts this specific mood.
        2. Provide the reference (Surah: Verse).
        3. Write a SHORT, engaging, and emotional Islamic story (from Seerah of Prophet PBUH or Sahaba) that matches this mood and teaches a lesson. Max 150 words.
        4. Suggest one small, easy action (Amal/Dua) to do right now.

        Output Format (Return ONLY JSON, no markdown):
        {
            "greeting": "A warm greeting addressing ${userName}",
            "quran_arabic": "Arabic Verse",
            "quran_bangla": "Bangla Translation",
            "quran_ref": "Surah Name: Verse",
            "story_title": "Story Title",
            "story_body": "Story content...",
            "action_text": "Amal instruction"
        }
    `;

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        
        // রেসপন্স পার্সিং
        if (data.candidates && data.candidates[0].content) {
            const rawText = data.candidates[0].content.parts[0].text;
            // ক্লিন JSON (Markdown রিমুভ করা)
            const jsonString = rawText.replace(/```json|```/g, "").trim();
            const result = JSON.parse(jsonString);

            renderHealingResult(result, mood);
            
            // আজকের জন্য চেক কমপ্লিট হিসেবে সেভ করা
            localStorage.setItem('lastMoodCheck', new Date().toDateString());
        } else {
            throw new Error("AI gave no response");
        }

    } catch (error) {
        console.error("AI Error:", error);
        alert("ইন্টারনেট সংযোগে সমস্যা বা API কোটায় সমস্যা হয়েছে।");
        closeHealerView();
    }
}

// 3. Render Result on Screen
function renderHealingResult(data, mood) {
    document.getElementById('aiLoader').style.display = 'none';
    document.getElementById('aiResultContainer').style.display = 'block';

    // ডাটা সেট করা
    document.getElementById('aiGreeting').innerText = data.greeting;
    document.getElementById('aiMoodText').innerText = `আপনার বর্তমান অবস্থা: ${getMoodBangla(mood)}`;
    
    document.getElementById('aiQuranArabic').innerText = data.quran_arabic;
    document.getElementById('aiQuranBangla').innerText = data.quran_bangla;
    document.getElementById('aiQuranRef').innerText = data.quran_ref;

    // গল্প রেন্ডার
    const storyHtml = `<strong style="font-size:18px; display:block; margin-bottom:10px;">${data.story_title}</strong>${data.story_body}`;
    document.getElementById('aiStory').innerHTML = storyHtml;

    document.getElementById('aiAction').innerText = data.action_text;
}

// 4. Helpers
function getMoodBangla(mood) {
    const moods = {
        'happy': 'খুশি 😊', 
        'sad': 'মন খারাপ 😔', 
        'anxious': 'দুশ্চিন্তাগ্রস্ত 😟',
        'angry': 'রাগান্বিত 😠', 
        'lazy': 'অলস 😴', 
        'confused': 'দ্বিধাগ্রস্ত 🤔'
    };
    return moods[mood] || mood;
}

function closeHealerView() {
    document.getElementById('healer-view').style.display = 'none';
    const appContainer = document.getElementById('appContainer');
    if (appContainer) appContainer.style.display = 'block';
    
    // রিসেট
    document.getElementById('aiLoader').style.display = 'block';
    document.getElementById('aiResultContainer').style.display = 'none';
}