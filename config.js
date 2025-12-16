// ====================================================================
// FILE: config.js
// বিবরণ: সুপাবেস কনফিগারেশন, গ্লোবাল ভ্যারিয়েবল এবং স্টেট ম্যানেজমেন্ট
// ====================================================================

console.log("Config Module Loaded");

// --------------------------------------------------------------------
// 1. SUPABASE CONFIGURATION
// --------------------------------------------------------------------
const SUPABASE_URL = 'https://pnsvptaanvtdaspqjwbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuc3ZwdGFhbnZ0ZGFzcHFqd2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMzcxNjMsImV4cCI6MjA3NTkxMzE2M30.qposYOL-W17DnFF11cJdZ7zrN1wh4Bop6YnclkUe_rU';

// Initialize Supabase Client
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --------------------------------------------------------------------
// 2. USER & AUTH STATE
// --------------------------------------------------------------------
let currentUser = null; // বর্তমান লগইন করা ইউজার

// অ্যাডমিন ইমেইল লিস্ট (যাদের বিশেষ ক্ষমতা থাকবে)
const ADMIN_USERS = [
    'bm15.telecom@gmail.com', 
    'alaminsarkar.bsc@gmail.com'
];

// --------------------------------------------------------------------
// 3. FEED & PAGINATION STATE
// --------------------------------------------------------------------
let currentPage = 0;
const prayersPerPage = 8; 
let isLoadingMore = false;
let noMorePrayers = false;

// শাফেল করা পোস্টের আইডি রাখার জন্য (র‍্যান্ডম ফিড)
let shuffledPrayerIds = [];
let isFeedInitialized = false;

// ফান্ডরাইজিং পোস্ট ইনজেকশন লজিক
let fundraisingPosts = [];
let currentFundraisingIndex = 0;

// ফিড ফিল্টারিং
let currentFeedType = 'for_you'; // অপশন: 'for_you', 'following'
let filteredUserId = null;       // নির্দিষ্ট ইউজারের প্রোফাইল দেখার জন্য
let isVideoFeedActive = false;   // শর্টস মোড অন/অফ ফ্ল্যাগ

// --------------------------------------------------------------------
// 4. DATA CACHE (To reduce DB calls & enhance performance)
// --------------------------------------------------------------------
let allFetchedPrayers = new Map(); // লোড হওয়া সব পোস্ট এখানে থাকবে

// ইউজার ইন্টারেকশন ক্যাশ
let savedPostIds = new Set();
let userLovedPrayers = new Set();
let userAmeenedPrayers = new Set();
const viewedVideosSession = new Set(); // ভিডিও ভিউ কাউন্ট ডুপ্লিকেট রোধ করতে

// --------------------------------------------------------------------
// 5. OBSERVERS & SUBSCRIPTIONS
// --------------------------------------------------------------------
let feedObserver = null;      // ইনফিনিটি স্ক্রল মনিটর
let shortsObserver = null;    // শর্টস ভিডিও অটো-প্লে মনিটর
let prayersSubscription = null; // রিয়েলটাইম ডাটাবেজ লিসেনার

// --------------------------------------------------------------------
// 6. DONATION STATE
// --------------------------------------------------------------------
let activeDonationCampaignId = null;
let adminPaymentNumbers = {}; // সার্ভার থেকে লোড হওয়া পেমেন্ট নাম্বার

// --------------------------------------------------------------------
// 7. STORY EDITOR STATE
// --------------------------------------------------------------------
let storyGroups = []; 

// স্টোরি তৈরির সময় ব্যবহৃত টেম্পোরারি ডাটা
let storyEditorState = {
    mode: 'text',       // 'text' or 'media'
    mediaFile: null,      
    mediaBlob: null,      
    bgColor: 'linear-gradient(135deg, #fc4a1a 0%, #f7b733 100%)',
    textColor: '#ffffff',
    isRecording: false,
    isMuted: false,       
    recordingTimer: null, 
    mediaRecorder: null,
    recordedChunks: [],
    stream: null,
    maxDuration: 30       
};

// স্টোরি দেখার সময় ব্যবহৃত স্টেট
let storyViewerState = {
    isOpen: false,
    currentUserIndex: 0,
    currentStoryIndex: 0,
    storyTimeout: null,
    isPaused: false
};

// স্টোরি ব্যাকগ্রাউন্ড কালার অপশন (টেক্সট মোড)
const STORY_GRADIENTS = [
    'linear-gradient(135deg, #fc4a1a 0%, #f7b733 100%)',
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    'linear-gradient(135deg, #000000 0%, #434343 100%)',
    'linear-gradient(135deg, #FF0099 0%, #493240 100%)',
    'linear-gradient(135deg, #8E2DE2 0%, #4A00E0 100%)'
];
let currentGradientIndex = 0;

console.log("✅ Config Loaded Successfully");