// ====================================================================
// FILE: healer.js
// বিবরণ: AI এর মাধ্যমে ইউজারের মুড অনুযায়ী গল্প ও সমাধান জেনারেট করা
// মডেল: Gemini Pro (Stable & Free)
// ====================================================================

console.log("Healer Module Loaded");

// 🔑 আপনার Google Gemini API Key
const GEMINI_API_KEY = "AIzaSyA4NIpHyyQnM0Z_E3YHfa_cndm9KeTS88U"; 

// মডেল কনফিগারেশন (gemini-pro ব্যবহার করা হচ্ছে যা বেশি শক্তিশালী এবং স্টেবল)
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

// ====================================================================
// 1. MOOD CHECKER (অ্যাপ চালু হলে চেক করবে)
// ====================================================================
function checkMoodStatus() {
    // ইউজার লগইন না থাকলে চেক করবে না
    if (!currentUser) return;

    // শেষ কবে চেক করা হয়েছে তা লোকাল স্টোরেজ থেকে দেখা
    const lastCheck = localStorage.getItem('lastMoodCheck');
    const today = new Date().toDateString();

    // আপনি টেস্টিং করছেন, তাই আমি তারিখের চেকটি কমেন্ট করে রাখলাম।
    // অ্যাপ লাইভ করার সময় 'if' এর কমেন্ট তুলে দেবেন।
    
    // if (lastCheck !== today) { 
        setTimeout(() => {
            const modal = document.getElementById('moodModal');
            const userNameSpan = document.getElementById('moodUserName');
            
            // ইউজারের নাম সেট করা
            if (userNameSpan) {
                userNameSpan.innerText = currentUser.profile?.display_name || "বন্ধু";
            }
            
            // মডাল ওপেন করা (এনিমেশন সহ)
            if (modal) {
                modal.style.display = 'flex';
                // এনিমেশনের জন্য সামান্য দেরি
                setTimeout(() => modal.classList.add('active'), 10);
            }
        }, 2000); // অ্যাপ খোলার ২ সেকেন্ড পর পপ-আপ আসবে
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
        window.scrollTo(0, 0); // পেজের শুরুতে নিয়ে যাওয়া
    }

    // ৩. লোডার দেখানো
    const loader = document.getElementById('aiLoader');
    const resultContainer = document.getElementById('aiResultContainer');
    
    if(loader) loader.style.display = 'block';
    if(resultContainer) resultContainer.style.display = 'none';

    // ৪. ইউজারের তথ্য ও প্রম্পট তৈরি
    const userName = currentUser ? currentUser.profile.display_name : "মুমিন";
    
    // AI কে বাংলায় নির্দেশনা দেওয়া (Prompt Engineering)
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

        Output Format (Return ONLY JSON, no markdown, no code blocks):
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

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        
        // রেসপন্স পার্সিং
        if (data.candidates && data.candidates[0].content) {
            const rawText = data.candidates[0].content.parts[0].text;
            
            // ক্লিন JSON (Markdown এবং ```json রিমুভ করা)
            let jsonString = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
            
            const result = JSON.parse(jsonString);

            // ফলাফল রেন্ডার করা
            renderHealingResult(result, mood);
            
            // আজকের জন্য চেক কমপ্লিট হিসেবে সেভ করা
            localStorage.setItem('lastMoodCheck', new Date().toDateString());
        } else {
            throw new Error("AI gave no response");
        }

    } catch (error) {
        console.error("AI Error:", error);
        alert("সমস্যা হয়েছে: " + error.message + "\nদয়া করে ইন্টারনেট সংযোগ চেক করুন।");
        closeHealerView();
    }
}

// ====================================================================
// 3. RENDER RESULT (UI আপডেট)
// ====================================================================
function renderHealingResult(data, mood) {
    const loader = document.getElementById('aiLoader');
    const resultContainer = document.getElementById('aiResultContainer');

    if(loader) loader.style.display = 'none';
    if(resultContainer) resultContainer.style.display = 'block';

    // ডাটা সেট করা
    document.getElementById('aiGreeting').innerText = data.greeting || "আসসালামু আলাইকুম";
    document.getElementById('aiMoodText').innerText = `আপনার বর্তমান অবস্থা: ${getMoodBangla(mood)}`;
    
    document.getElementById('aiQuranArabic').innerText = data.quran_arabic || "";
    document.getElementById('aiQuranBangla').innerText = data.quran_bangla || "";
    document.getElementById('aiQuranRef').innerText = data.quran_ref || "";

    // গল্প রেন্ডার (টাইটেল বোল্ড করে)
    const storyHtml = `<strong style="font-size:18px; display:block; margin-bottom:10px; color:#d35400;">${data.story_title}</strong>${data.story_body}`;
    document.getElementById('aiStory').innerHTML = storyHtml;

    document.getElementById('aiAction').innerText = data.action_text || "";
}

// ====================================================================
// 4. HELPER FUNCTIONS
// ====================================================================

// মুড এর বাংলা নাম ও ইমোজি
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

// হিলার ভিউ বন্ধ করে হোমে ফেরত যাওয়া
function closeHealerView() {
    const healerView = document.getElementById('healer-view');
    const appContainer = document.getElementById('appContainer');
    
    if (healerView) healerView.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';
    
    // রিসেট (যাতে পরের বার আবার লোডার দেখায়)
    const loader = document.getElementById('aiLoader');
    const resultContainer = document.getElementById('aiResultContainer');
    
    if(loader) loader.style.display = 'block';
    if(resultContainer) resultContainer.style.display = 'none';
    
    // স্ক্রল টপ
    window.scrollTo(0, 0);
}