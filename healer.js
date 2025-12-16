// ====================================================================
// FILE: healer.js
// বিবরণ: AI এর মাধ্যমে ইউজারের মুড অনুযায়ী গল্প ও সমাধান জেনারেট করা
// মডেল: Gemini 1.5 Flash (Latest & Stable)
// ====================================================================

console.log("Healer Module Loaded");

// 🔑 আপনার Google Gemini API Key
// সতর্কতা: এখানে কোনো স্পেস বা ভুল অক্ষর যেন না থাকে
const GEMINI_API_KEY = "AIzaSyA4NIpHyyQnM0Z_E3YHfa_cndm9KeTS88U"; 

// ফিক্স: মডেল পরিবর্তন করে 'gemini-1.5-flash' করা হয়েছে (এটি এখন স্ট্যান্ডার্ড)
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// ====================================================================
// 1. MOOD CHECKER
// ====================================================================
function checkMoodStatus() {
    if (!currentUser) return;

    const lastCheck = localStorage.getItem('lastMoodCheck');
    const today = new Date().toDateString();

    // টেস্টিং মোড (লাইভ করার সময় if আনকমেন্ট করবেন)
    // if (lastCheck !== today) { 
        setTimeout(() => {
            const modal = document.getElementById('moodModal');
            const userNameSpan = document.getElementById('moodUserName');
            
            if (userNameSpan) {
                userNameSpan.innerText = currentUser.profile?.display_name || "বন্ধু";
            }
            
            if (modal) {
                modal.style.display = 'flex';
                setTimeout(() => modal.classList.add('active'), 10);
            }
        }, 2000); 
    // }
}

// ====================================================================
// 2. GENERATE CONTENT (AI API CALL)
// ====================================================================
async function generateHealing(mood) {
    // ১. মডাল বন্ধ করা
    const modal = document.getElementById('moodModal');
    if(modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.style.display = 'none', 300);
    }

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

    // ৪. প্রম্পট তৈরি
    const userName = currentUser ? currentUser.profile.display_name : "মুমিন";
    
    const prompt = `
        User Name: ${userName}
        Current Mood: ${mood}
        Language: Bengali (Bangla)

        Task:
        You are an Islamic spiritual healer AI. Based on the user's mood ("${mood}"), generate a comforting response.
        
        1. Select one powerful Quranic verse (Arabic text & Bangla translation) that comforts this specific mood.
        2. Provide the reference (Surah Name: Verse Number).
        3. Write a SHORT, engaging, and emotional Islamic story (from Seerah of Prophet PBUH or Sahaba) that matches this mood and teaches a lesson. (Max 150 words).
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

        // এরর চেকিং
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} (${response.statusText})`);
        }

        const data = await response.json();
        
        if (data.candidates && data.candidates[0].content) {
            const rawText = data.candidates[0].content.parts[0].text;
            let jsonString = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
            const result = JSON.parse(jsonString);

            renderHealingResult(result, mood);
            localStorage.setItem('lastMoodCheck', new Date().toDateString());
        } else {
            throw new Error("AI gave no response. Try again.");
        }

    } catch (error) {
        console.error("AI Error:", error);
        alert("সমস্যা হয়েছে: " + error.message + "\nদয়া করে ইন্টারনেট সংযোগ চেক করুন।");
        closeHealerView();
    }
}

// ====================================================================
// 3. RENDER RESULT
// ====================================================================
function renderHealingResult(data, mood) {
    const loader = document.getElementById('aiLoader');
    const resultContainer = document.getElementById('aiResultContainer');

    if(loader) loader.style.display = 'none';
    if(resultContainer) resultContainer.style.display = 'block';

    document.getElementById('aiGreeting').innerText = data.greeting || "আসসালামু আলাইকুম";
    document.getElementById('aiMoodText').innerText = `আপনার বর্তমান অবস্থা: ${getMoodBangla(mood)}`;
    
    document.getElementById('aiQuranArabic').innerText = data.quran_arabic || "";
    document.getElementById('aiQuranBangla').innerText = data.quran_bangla || "";
    document.getElementById('aiQuranRef').innerText = data.quran_ref || "";

    const storyHtml = `<strong style="font-size:18px; display:block; margin-bottom:10px; color:#d35400;">${data.story_title}</strong>${data.story_body}`;
    document.getElementById('aiStory').innerHTML = storyHtml;

    document.getElementById('aiAction').innerText = data.action_text || "";
}

// ====================================================================
// 4. HELPERS
// ====================================================================
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
    
    document.getElementById('aiLoader').style.display = 'block';
    document.getElementById('aiResultContainer').style.display = 'none';
    window.scrollTo(0, 0);
}
