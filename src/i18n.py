"""
Translations.

Five languages, chosen by SC population rather than convenience: Hindi, English,
Marathi, Bengali and Tamil. Doing five properly beats claiming twenty-two.

Two rules that keep this honest:

1. NUMBERS ARE NEVER TRANSLATED, only formatted. Rupee figures come from the
   calculator and pass through untouched, so a translation bug can never change
   what a loan costs.

2. SCHEME NAMES STAY IN ENGLISH. "Micro Finance Scheme" is what is printed on the
   form at the branch counter. Translating it would help nobody at the window.

Script detection is a Unicode lookup, not a model — PRD-v3 §6.5's guess-then-
confirm approach. Someone who types देवनागरी should never be shown a language
menu in English first.
"""

from __future__ import annotations

from typing import Optional

DEFAULT_LANGUAGE = "en"

LANGUAGES: dict[str, dict[str, str]] = {
    "en": {"name": "English", "native": "English"},
    "hi": {"name": "Hindi", "native": "हिन्दी"},
    "mr": {"name": "Marathi", "native": "मराठी"},
    "bn": {"name": "Bengali", "native": "বাংলা"},
    "ta": {"name": "Tamil", "native": "தமிழ்"},
}

# Unicode blocks -> language. Devanagari is genuinely ambiguous (Hindi/Marathi),
# so it resolves to Hindi and the user can switch in one tap; everything else
# maps cleanly.
_SCRIPT_RANGES: list[tuple[int, int, str]] = [
    (0x0900, 0x097F, "hi"),   # Devanagari — Hindi or Marathi
    (0x0980, 0x09FF, "bn"),   # Bengali
    (0x0B80, 0x0BFF, "ta"),   # Tamil
]


def detect_language(text: str) -> Optional[str]:
    """Guess a language from the script used. None when it's plain ASCII.

    Free, deterministic, no model, and it runs on the very first message — which
    is the whole point: nobody should have to pick a language before they can ask
    a question.
    """
    if not text:
        return None
    counts: dict[str, int] = {}
    for char in text:
        code = ord(char)
        for lo, hi, lang in _SCRIPT_RANGES:
            if lo <= code <= hi:
                counts[lang] = counts.get(lang, 0) + 1
                break
    if not counts:
        return None
    return max(counts, key=counts.get)


# ---------------------------------------------------------------------------
# Catalogue
# ---------------------------------------------------------------------------

STRINGS: dict[str, dict[str, str]] = {
    # ---- greeting and intake ----
    "greet": {
        "en": "Namaste. I can find the government loan schemes you qualify for, tell you what they really cost, and point you to an office that can actually pay out. It takes about a minute.",
        "hi": "नमस्ते। मैं आपको बता सकता हूँ कि आप किन सरकारी ऋण योजनाओं के लिए पात्र हैं, उनकी असली लागत क्या है, और कौन-सा कार्यालय सचमुच पैसा दे सकता है। इसमें लगभग एक मिनट लगेगा।",
        "mr": "नमस्कार. तुम्ही कोणत्या सरकारी कर्ज योजनांसाठी पात्र आहात, त्यांचा खरा खर्च किती आहे आणि कोणते कार्यालय प्रत्यक्षात पैसे देऊ शकते हे मी सांगू शकतो. यास सुमारे एक मिनिट लागेल.",
        "bn": "নমস্কার। আপনি কোন সরকারি ঋণ প্রকল্পের জন্য যোগ্য, সেগুলির প্রকৃত খরচ কত, এবং কোন দপ্তর সত্যিই টাকা দিতে পারবে — আমি বলে দিতে পারি। প্রায় এক মিনিট লাগবে।",
        "ta": "வணக்கம். நீங்கள் எந்த அரசு கடன் திட்டங்களுக்குத் தகுதியானவர், அவற்றின் உண்மையான செலவு என்ன, எந்த அலுவலகம் உண்மையில் பணம் வழங்க முடியும் என்பதை நான் சொல்ல முடியும். ஒரு நிமிடம் ஆகும்.",
    },
    "ask_purpose": {
        "en": "What do you need the money for?",
        "hi": "आपको पैसे किस काम के लिए चाहिए?",
        "mr": "तुम्हाला पैसे कशासाठी हवे आहेत?",
        "bn": "আপনার টাকা কী কাজে লাগবে?",
        "ta": "உங்களுக்கு எதற்காகப் பணம் தேவை?",
    },
    "opt_business": {
        "en": "Start or grow a business", "hi": "काम या दुकान शुरू करने के लिए",
        "mr": "व्यवसाय सुरू करण्यासाठी", "bn": "ব্যবসা শুরু করতে", "ta": "தொழில் தொடங்க",
    },
    "opt_education": {
        "en": "Study or a course", "hi": "पढ़ाई या कोर्स के लिए",
        "mr": "शिक्षणासाठी", "bn": "পড়াশোনার জন্য", "ta": "படிப்புக்காக",
    },
    "ask_cost": {
        "en": "Roughly how much will it cost to set up? A rough figure is fine.",
        "hi": "इसे शुरू करने में लगभग कितना खर्च आएगा? अंदाज़ा बता दीजिए।",
        "mr": "हे सुरू करण्यासाठी अंदाजे किती खर्च येईल? अंदाजे रक्कम सांगा.",
        "bn": "এটি শুরু করতে আনুমানিক কত খরচ হবে? আনুমানিক অঙ্কই যথেষ্ট।",
        "ta": "இதைத் தொடங்க தோராயமாக எவ்வளவு செலவாகும்? தோராயமான தொகை போதும்.",
    },
    "ask_income": {
        "en": "And your family's total income in a year — everyone in the household added together, not just you.",
        "hi": "और आपके पूरे परिवार की साल भर की आमदनी — घर के सब लोगों की मिलाकर, सिर्फ़ आपकी नहीं।",
        "mr": "आणि तुमच्या संपूर्ण कुटुंबाचे वर्षभराचे उत्पन्न — घरातील सर्वांचे मिळून, फक्त तुमचे नाही.",
        "bn": "এবং আপনার পরিবারের এক বছরের মোট আয় — বাড়ির সবার মিলিয়ে, শুধু আপনার নয়।",
        "ta": "உங்கள் குடும்பத்தின் ஒரு வருட மொத்த வருமானம் — வீட்டில் உள்ள அனைவரும் சேர்த்து, உங்களுடையது மட்டும் அல்ல.",
    },
    "ask_category": {
        "en": "Which category do you belong to?",
        "hi": "आप किस वर्ग से हैं?",
        "mr": "तुम्ही कोणत्या प्रवर्गातील आहात?",
        "bn": "আপনি কোন শ্রেণিভুক্ত?",
        "ta": "நீங்கள் எந்தப் பிரிவைச் சேர்ந்தவர்?",
    },
    "ask_gender": {
        "en": "Some schemes give women a lower rate. Who is applying?",
        "hi": "कुछ योजनाओं में महिलाओं को ब्याज में छूट मिलती है। आवेदन कौन कर रहा है?",
        "mr": "काही योजनांमध्ये महिलांना व्याजात सवलत मिळते. अर्ज कोण करत आहे?",
        "bn": "কিছু প্রকল্পে মহিলাদের সুদের হার কম। আবেদন করছেন কে?",
        "ta": "சில திட்டங்களில் பெண்களுக்கு வட்டி குறைவு. யார் விண்ணப்பிக்கிறார்?",
    },
    "opt_woman": {"en": "A woman", "hi": "महिला", "mr": "महिला", "bn": "একজন মহিলা", "ta": "ஒரு பெண்"},
    "opt_man": {"en": "A man", "hi": "पुरुष", "mr": "पुरुष", "bn": "একজন পুরুষ", "ta": "ஒரு ஆண்"},
    "opt_other": {"en": "Other", "hi": "अन्य", "mr": "इतर", "bn": "অন্যান্য", "ta": "மற்றவை"},
    "ask_place": {
        "en": "Last one — where are you? I'll find offices near you.",
        "hi": "आख़िरी सवाल — आप कहाँ रहते हैं? मैं आपके पास के कार्यालय ढूँढ़ूँगा।",
        "mr": "शेवटचा प्रश्न — तुम्ही कुठे राहता? मी जवळची कार्यालये शोधतो.",
        "bn": "শেষ প্রশ্ন — আপনি কোথায় থাকেন? আমি কাছের দপ্তর খুঁজে দেব।",
        "ta": "கடைசி கேள்வி — நீங்கள் எங்கு இருக்கிறீர்கள்? அருகிலுள்ள அலுவலகங்களைத் தேடுகிறேன்.",
    },

    # ---- results ----
    "checking": {
        "en": "Checking every scheme against what you told me…",
        "hi": "आपकी जानकारी हर योजना से मिलाकर देख रहा हूँ…",
        "mr": "तुमची माहिती प्रत्येक योजनेशी तपासत आहे…",
        "bn": "আপনার তথ্য প্রতিটি প্রকল্পের সাথে মিলিয়ে দেখছি…",
        "ta": "உங்கள் தகவலை ஒவ்வொரு திட்டத்துடனும் சரிபார்க்கிறேன்…",
    },
    "result_intro_one": {
        "en": "Good news — you qualify for one scheme.",
        "hi": "अच्छी ख़बर — आप एक योजना के लिए पात्र हैं।",
        "mr": "चांगली बातमी — तुम्ही एका योजनेसाठी पात्र आहात.",
        "bn": "সুখবর — আপনি একটি প্রকল্পের জন্য যোগ্য।",
        "ta": "நல்ல செய்தி — நீங்கள் ஒரு திட்டத்திற்குத் தகுதியானவர்.",
    },
    "result_intro_many": {
        "en": "Good news — you qualify for {n} schemes. They do not cost the same, so I have put the cheapest first.",
        "hi": "अच्छी ख़बर — आप {n} योजनाओं के लिए पात्र हैं। इनकी लागत अलग-अलग है, इसलिए सबसे सस्ती सबसे ऊपर रखी है।",
        "mr": "चांगली बातमी — तुम्ही {n} योजनांसाठी पात्र आहात. त्यांचा खर्च वेगवेगळा आहे, म्हणून सर्वात स्वस्त सर्वात वर ठेवली आहे.",
        "bn": "সুখবর — আপনি {n}টি প্রকল্পের জন্য যোগ্য। এগুলির খরচ এক নয়, তাই সবচেয়ে সস্তাটি উপরে রেখেছি।",
        "ta": "நல்ல செய்தி — நீங்கள் {n} திட்டங்களுக்குத் தகுதியானவர். அவற்றின் செலவு வெவ்வேறு, எனவே மலிவானதை முதலில் வைத்துள்ளேன்.",
    },
    "no_match": {
        "en": "I could not find an NSFDC scheme that fits this exactly.",
        "hi": "मुझे ऐसी कोई NSFDC योजना नहीं मिली जो इसमें बिलकुल सही बैठे।",
        "mr": "यात अगदी बसणारी NSFDC योजना मला सापडली नाही.",
        "bn": "ঠিক এর সাথে মেলে এমন কোনও NSFDC প্রকল্প পাইনি।",
        "ta": "இதற்குச் சரியாகப் பொருந்தும் NSFDC திட்டம் எதுவும் கிடைக்கவில்லை.",
    },

    # ---- card headings ----
    "card_cost": {
        "en": "What this loan really costs", "hi": "इस ऋण की असली लागत",
        "mr": "या कर्जाचा खरा खर्च", "bn": "এই ঋণের প্রকৃত খরচ", "ta": "இந்தக் கடனின் உண்மையான செலவு",
    },
    "card_compare": {
        "en": "Compared to a local moneylender", "hi": "साहूकार से तुलना",
        "mr": "सावकाराशी तुलना", "bn": "স্থানীয় মহাজনের সাথে তুলনা", "ta": "உள்ளூர் வட்டிக்காரருடன் ஒப்பீடு",
    },
    "card_where": {
        "en": "Where to go", "hi": "कहाँ जाएँ", "mr": "कुठे जायचे",
        "bn": "কোথায় যাবেন", "ta": "எங்கு செல்ல வேண்டும்",
    },
    "card_whynot": {
        "en": "Not a match, and why", "hi": "जो योजनाएँ नहीं मिलीं, और क्यों",
        "mr": "न मिळालेल्या योजना, आणि का", "bn": "যেগুলি মেলেনি, এবং কেন",
        "ta": "பொருந்தாதவை, ஏன்",
    },
    "card_blocked": {
        "en": "Cannot help you right now", "hi": "अभी मदद नहीं कर सकते",
        "mr": "आत्ता मदत करू शकत नाहीत", "bn": "এখন সাহায্য করতে পারবে না",
        "ta": "இப்போது உதவ முடியாது",
    },

    # ---- labels ----
    "you_borrow": {"en": "You borrow", "hi": "आप लेंगे", "mr": "तुम्ही घ्याल", "bn": "আপনি নেবেন", "ta": "நீங்கள் பெறுவீர்கள்"},
    "you_repay": {"en": "You repay", "hi": "आप लौटाएँगे", "mr": "तुम्ही परत कराल", "bn": "আপনি ফেরত দেবেন", "ta": "நீங்கள் திருப்பிச் செலுத்துவீர்கள்"},
    "it_costs": {"en": "So it costs you", "hi": "यानी लागत", "mr": "म्हणजे खर्च", "bn": "অর্থাৎ খরচ", "ta": "அதாவது செலவு"},
    "this_scheme": {"en": "This scheme", "hi": "यह योजना", "mr": "ही योजना", "bn": "এই প্রকল্প", "ta": "இந்தத் திட்டம்"},
    "moneylender": {"en": "A moneylender at 5% a month", "hi": "साहूकार, 5% महीना", "mr": "सावकार, दरमहा 5%", "bn": "মহাজন, মাসে 5%", "ta": "வட்டிக்காரர், மாதம் 5%"},
    "you_save": {"en": "You save", "hi": "आपकी बचत", "mr": "तुमची बचत", "bn": "আপনার সাশ্রয়", "ta": "உங்கள் சேமிப்பு"},
    "per_year": {"en": "a year", "hi": "सालाना", "mr": "वार्षिक", "bn": "বছরে", "ta": "ஆண்டுக்கு"},
    "quarterly": {"en": "every 3 months", "hi": "हर 3 महीने", "mr": "दर 3 महिन्यांनी", "bn": "প্রতি ৩ মাসে", "ta": "ஒவ்வொரு 3 மாதமும்"},
    "per_month_budget": {"en": "set aside about {amount} a month", "hi": "हर महीने लगभग {amount} अलग रखें", "mr": "दरमहा सुमारे {amount} बाजूला ठेवा", "bn": "প্রতি মাসে প্রায় {amount} সরিয়ে রাখুন", "ta": "மாதம் சுமார் {amount} ஒதுக்கி வையுங்கள்"},
    "km_away": {"en": "km away", "hi": "किमी दूर", "mr": "किमी अंतरावर", "bn": "কিমি দূরে", "ta": "கிமீ தொலைவில்"},
    "cheapest": {"en": "Lowest cost", "hi": "सबसे सस्ती", "mr": "सर्वात स्वस्त", "bn": "সবচেয়ে সস্তা", "ta": "மிகக் குறைந்த செலவு"},

    # ---- trust ----
    "fraud_shield": {
        "en": "NSFDC never charges a fee to apply. If anyone asks you for money to process your loan, that is fraud.",
        "hi": "NSFDC आवेदन के लिए कोई शुल्क नहीं लेता। अगर कोई आपसे ऋण पास कराने के नाम पर पैसे माँगे, तो वह धोखाधड़ी है।",
        "mr": "NSFDC अर्जासाठी कोणतेही शुल्क घेत नाही. कर्ज मंजूर करण्यासाठी कोणी पैसे मागत असेल, तर ती फसवणूक आहे.",
        "bn": "NSFDC আবেদনের জন্য কোনও ফি নেয় না। ঋণ পাশ করানোর নামে কেউ টাকা চাইলে সেটি প্রতারণা।",
        "ta": "NSFDC விண்ணப்பத்திற்குக் கட்டணம் வசூலிப்பதில்லை. கடன் அனுமதிக்க யாரேனும் பணம் கேட்டால், அது மோசடி.",
    },
    "estimates_note": {
        "en": "These are estimates. Final terms are set by the office you apply to.",
        "hi": "ये अनुमान हैं। अंतिम शर्तें उस कार्यालय द्वारा तय होंगी जहाँ आप आवेदन करेंगे।",
        "mr": "हे अंदाज आहेत. अंतिम अटी तुम्ही अर्ज कराल त्या कार्यालयाकडून ठरतील.",
        "bn": "এগুলি আনুমানিক। চূড়ান্ত শর্ত ঠিক করবে যে দপ্তরে আপনি আবেদন করবেন।",
        "ta": "இவை மதிப்பீடுகள். இறுதி நிபந்தனைகளை நீங்கள் விண்ணப்பிக்கும் அலுவலகம் நிர்ணயிக்கும்.",
    },

    # ---- UI chrome ----
    "app_tagline": {
        "en": "Government loans, explained plainly", "hi": "सरकारी ऋण, आसान भाषा में",
        "mr": "सरकारी कर्ज, सोप्या भाषेत", "bn": "সরকারি ঋণ, সহজ ভাষায়", "ta": "அரசு கடன்கள், எளிய மொழியில்",
    },
    "start_now": {"en": "Start", "hi": "शुरू करें", "mr": "सुरू करा", "bn": "শুরু করুন", "ta": "தொடங்கு"},
    "type_here": {"en": "Type your answer, or tap an option", "hi": "अपना जवाब लिखें, या विकल्प चुनें", "mr": "तुमचे उत्तर लिहा, किंवा पर्याय निवडा", "bn": "উত্তর লিখুন, বা বিকল্প বেছে নিন", "ta": "பதிலை எழுதுங்கள், அல்லது ஒன்றைத் தேர்வு செய்யுங்கள்"},
    "start_over": {"en": "Start over", "hi": "फिर से शुरू करें", "mr": "पुन्हा सुरू करा", "bn": "আবার শুরু করুন", "ta": "மீண்டும் தொடங்கு"},
    "didnt_understand": {
        "en": "Sorry, I did not follow that. Could you say it another way, or tap one of the options?",
        "hi": "माफ़ कीजिए, मैं समझ नहीं पाया। दूसरे शब्दों में बताएँ, या नीचे से कोई विकल्प चुनें।",
        "mr": "क्षमस्व, मला समजले नाही. दुसऱ्या शब्दांत सांगा, किंवा खालील पर्याय निवडा.",
        "bn": "দুঃখিত, বুঝতে পারিনি। অন্যভাবে বলুন, বা নিচের একটি বিকল্প বেছে নিন।",
        "ta": "மன்னிக்கவும், புரியவில்லை. வேறு விதமாகச் சொல்லுங்கள், அல்லது கீழே ஒன்றைத் தேர்வு செய்யுங்கள்.",
    },
}


def t(key: str, lang: str = DEFAULT_LANGUAGE, **kwargs) -> str:
    """Look up a string, falling back to English then to the key itself.

    Falling back to English rather than raising matters: a missing translation
    should degrade to a comprehensible message, never to a blank screen or a
    stack trace, in front of someone trying to get a loan.
    """
    entry = STRINGS.get(key, {})
    text = entry.get(lang) or entry.get(DEFAULT_LANGUAGE) or key
    return text.format(**kwargs) if kwargs else text


def ui_strings(lang: str = DEFAULT_LANGUAGE) -> dict[str, str]:
    """The whole catalogue in one language, for the browser to hold."""
    return {key: t(key, lang) for key in STRINGS}
