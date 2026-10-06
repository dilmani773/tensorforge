/* Category → team mapping from the API contract */
export const TEAM_BY_CATEGORY = {
  payment_refund: 'Payments & Refunds',
  ride_trip_issue: 'Ride Operations',
  lost_item: 'Lost & Found',
  order_missing_wrong: 'Food Operations',
  delivery_delay: 'Delivery Operations',
  food_quality: 'Restaurant Quality',
  account_promo: 'Account Services',
  safety_conduct: 'Trust & Safety',
  app_technical: 'Tech Support',
  general_inquiry: 'Front-line Support',
  spam_irrelevant: 'Auto-close / Spam Filter',
};

/* Team metadata for icons, descriptions, and keys */
export const TEAMS_METADATA = [
  {
    name: 'Payments & Refunds',
    key: 'payments_refunds',
    category: 'payment_refund',
    icon: '💳',
    desc: 'Disputed charges, wallet & payouts',
  },
  {
    name: 'Ride Operations',
    key: 'ride_operations',
    category: 'ride_trip_issue',
    icon: '🚗',
    desc: 'Fares, pickups & ride cancellations',
  },
  {
    name: 'Lost & Found',
    key: 'lost_and_found',
    category: 'lost_item',
    icon: '🎒',
    desc: 'Left items in cabs & vehicle recovery',
  },
  {
    name: 'Food Operations',
    key: 'food_operations',
    category: 'order_missing_wrong',
    icon: '🍔',
    desc: 'Missing portions & dish preparation',
  },
  {
    name: 'Delivery Operations',
    key: 'delivery_operations',
    category: 'delivery_delay',
    icon: '🛵',
    desc: 'Rider routing, delays & GPS dropoffs',
    isPrimary: true,
  },
  {
    name: 'Restaurant Quality',
    key: 'restaurant_quality',
    category: 'food_quality',
    icon: '🍽️',
    desc: 'Food temp, spillage & packaging standards',
  },
  {
    name: 'Account Services',
    key: 'account_services',
    category: 'account_promo',
    icon: '👤',
    desc: 'Profile updates, KYC & login verification',
  },
  {
    name: 'Trust & Safety',
    key: 'trust_and_safety',
    category: 'safety_conduct',
    icon: '🛡️',
    desc: 'Immediate threat & harassment triage',
    isUrgent: true,
  },
  {
    name: 'Tech Support',
    key: 'tech_support',
    category: 'app_technical',
    icon: '📱',
    desc: 'App crashes, bugs & checkout errors',
  },
  {
    name: 'Front-line Support',
    key: 'frontline_support',
    category: 'general_inquiry',
    icon: '🎧',
    desc: 'General questions & promo guidance',
  },
  {
    name: 'Auto-close / Spam Filter',
    key: 'auto_close_spam',
    category: 'spam_irrelevant',
    icon: '🧹',
    desc: 'Automated bot filters & non-actionable',
  },
];

export const TEAM_ICONS = {
  'Payments & Refunds': '💳',
  'Ride Operations': '🚗',
  'Lost & Found': '🎒',
  'Food Operations': '🍔',
  'Delivery Operations': '🛵',
  'Restaurant Quality': '🍽️',
  'Account Services': '👤',
  'Trust & Safety': '🛡️',
  'Tech Support': '📱',
  'Front-line Support': '🎧',
  'Auto-close / Spam Filter': '🧹',
};

export function getTeamIcon(teamName) {
  return TEAM_ICONS[teamName] || '📋';
}

/* Humanise a snake_case category name */
export function niceCategory(c) {
  if (!c || c === 'none') return 'None';
  return c.replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase());
}

/* Detect language from text */
export function detectLanguage(text) {
  if (!text) return 'English';
  if (/[\u0D80-\u0DFF]/.test(text)) return 'Sinhala (සිංහල)';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'Tamil (தமிழ்)';
  const lower = text.toLowerCase();
  const singlishTokens = ['mage', 'eka', 'nisa', 'thiyenawa', 'salli', 'danna', 'nehe', 'wela', 'kottu', 'awe', 'pls', 'bro'];
  const tanglishTokens = ['aagala', 'varala', 'enna', 'panreenga', 'ila', 'romba', 'kedaikula', 'bro'];
  const words = lower.split(/\s+/);
  if (words.some((w) => singlishTokens.includes(w))) return 'Singlish (Sinhala-English Mix)';
  if (words.some((w) => tanglishTokens.includes(w))) return 'Tanglish (Tamil-English Mix)';
  return 'English';
}

/* Multilingual sample presets matching the design */
export const PRESETS = [
  {
    id: 'sinhala',
    flag: '🇱🇰',
    title: 'Delivery delay (Sinhala)',
    tag: 'Delivery',
    channel: 'chat',
    subject: 'කෑම ඇනවුම තවම ලැබුනේ නැත',
    message: 'මගේ කෑම එක තවම ආවෙ නෑ, පැයක් ගියා. රයිඩර් කෝල් එක ආන්සර් කරන්නෙ නෑ. කරුණාකරලා ඉක්මනින් බලන්න.',
  },
  {
    id: 'tamil',
    flag: '🇮🇳',
    title: 'Missing item (Tamil)',
    tag: 'Food Ops',
    channel: 'chat',
    subject: 'உணவு விடுபட்டுள்ளது',
    message: 'என் ஆர்டரில் ஜூස් பாக்கெட் விடுபட்டுள்ளது. ஹோட்டல் காரங்க சேர்க்க மறந்துட்டாங்க, உடனே ரீபண்ட் தாங்க.',
  },
  {
    id: 'singlish',
    flag: '🔤',
    title: 'Payment query (Singlish)',
    tag: 'Payments',
    channel: 'email',
    subject: 'Double charge on card during checkout',
    message: 'Card eken 2 times charge wela thiyenne checkout eke glitch ekak nisa. Pls refund excess deduction asap bro.',
  },
  {
    id: 'english',
    flag: '🇬🇧',
    title: 'Urgent safety (English)',
    tag: 'Trust & Safety',
    channel: 'call_transcript',
    subject: 'Driver verbal altercation',
    message: 'Driver was aggressive during ride dropoff, shouted at me and refused to move vehicle. Need urgent help.',
  },
];

export const CHANNELS = [
  { id: 'chat', label: 'In-App Chat', icon: '💬' },
  { id: 'email', label: 'Email', icon: '✉️' },
  { id: 'call_transcript', label: 'Call Note', icon: '🎧' },
];
