// ====================================================================
// FILE: healer.js
// বিবরণ: AI এর মাধ্যমে ইউজারের মুড অনুযায়ী গল্প ও সমাধান জেনারেট করা
// মডেল: Gemini Pro (Standard Stable Version)
// ====================================================================

console.log("Healer Module Loaded");

// 🔑 আপনার Google Gemini API Key
const GEMINI_API_KEY = "AIzaSyA4NIpHyyQnM0Z_E3YHfa_cndm9KeTS88U"; 

// ফিক্স: মডেল পরিবর্তন করে 'gemini-pro' করা হয়েছে যা ১০০% কাজ করবে
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

// ====================================================================
// 1. MOOD CHECKER
// ====================================================================
function checkMoodStatus() {
    if (!currentUser) return;

    // টেস্টিংয়ের জন্য আমরা ২ সেকেন্ড পরেই মডাল ওপেন করছি
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
        Act as an empathetic Islamic spiritual healer.
        1. Quote a Quran verse (Arabic & Bangla) for this mood.
        2. Reference (Surah:Verse).
        3. Tell a very short, emotional Islamic story (Seerah/Sahaba) relevant to this mood (Max 100 words).
        4. Suggest a small Amal.

        Output JSON format ONLY (No markdown, just raw JSON):
        {
            "greeting": "Greeting",
            "quran_arabic": "Arabic text",
            "quran_bangla": "Bangla text",
            "quran_ref": "Ref",
            "story_title": "Story Title",
            "story_body": "Story text",
            "action_text": "Amal"
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

        // --- ERROR HANDLING ---
        if (!response.ok) {
            const errorText = await response.text(); 
            throw new Error(`API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        
        if (data.candidates && data.candidates[0].content) {
            const rawText = data.candidates[0].content.parts[0].text;
            let jsonString = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
            const result = JSON.parse(jsonString);

            renderHealingResult(result, mood);
        } else {
            throw new Error("No content generated. Try again.");
        }

    } catch (error) {
        console.error("AI Error:", error);
        alert("সমস্যা হয়েছে:\n" + error.message);
        closeHealerView();
    }
}

// ====================================================================
// 3. RENDER RESULT
// ====================================================================
function renderHealingResult(data, mood) {
    document.getElementById('aiLoader').style.display = 'none';
    document.getElementById('aiResultContainer').style.display = 'block';

    document.getElementById('aiGreeting').innerText = data.greeting || "আসসালামু আলাইকুম";
    document.getElementById('aiMoodText').innerText = `আপনার বর্তমান অবস্থা: ${getMoodBangla(mood)}`;
    
    document.getElementById('aiQuranArabic').innerText = data.quran_arabic || "";
    document.getElementById('aiQuranBangla').innerText = data.quran_bangla || "";
    document.getElementById('aiQuranRef').innerText = data.quran_ref || "";

    const storyHtml = `<strong style="font-size:18px; display:block; margin-bottom:10px; color:#d35400;">${data.story_title}</strong>${data.story_body}`;
    document.getElementById('aiStory').innerHTML = storyHtml;

    document.getElementById('aiAction').innerText = data.action_text || "";
}

// 4. Helpers
function getMoodBangla(mood) {
    const moods = { 'happy': 'খুশি 😊', 'sad': 'মন খারাপ 😔', 'anxious': 'দুশ্চিন্তাগ্রস্ত 😟', 'angry': 'রাগান্বিত 😠', 'lazy': 'অলস 😴', 'confused': 'দ্বিধাগ্রস্ত 🤔' };
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
