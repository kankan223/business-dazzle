/**
 * Internationalization (i18n) Service for Bharat Biz-Agent
 * Provides multi-language support for the application
 */

class I18nService {
  constructor() {
    this.defaultLanguage = 'en';
    this.supportedLanguages = ['en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur'];
    this.translations = new Map();
    this.userLanguages = new Map();
    this.loadTranslations();
  }

  /**
   * Load all translation files
   */
  loadTranslations() {
    // English translations (default)
    this.translations.set('en', {
      // Common
      'welcome': 'Welcome',
      'hello': 'Hello',
      'goodbye': 'Goodbye',
      'thank_you': 'Thank you',
      'please': 'Please',
      'sorry': 'Sorry',
      'yes': 'Yes',
      'no': 'No',
      'ok': 'OK',
      'cancel': 'Cancel',
      'save': 'Save',
      'delete': 'Delete',
      'edit': 'Edit',
      'search': 'Search',
      'filter': 'Filter',
      'export': 'Export',
      'import': 'Import',
      'settings': 'Settings',
      'help': 'Help',
      'about': 'About',
      'contact': 'Contact',
      
      // Navigation
      'dashboard': 'Dashboard',
      'analytics': 'Analytics',
      'customers': 'Customers',
      'orders': 'Orders',
      'invoices': 'Invoices',
      'products': 'Products',
      'inventory': 'Inventory',
      'reports': 'Reports',
      'users': 'Users',
      'security': 'Security',
      'notifications': 'Notifications',
      
      // Business terms
      'customer': 'Customer',
      'order': 'Order',
      'invoice': 'Invoice',
      'payment': 'Payment',
      'delivery': 'Delivery',
      'refund': 'Refund',
      'support': 'Support',
      'approval': 'Approval',
      'status': 'Status',
      'amount': 'Amount',
      'quantity': 'Quantity',
      'price': 'Price',
      'total': 'Total',
      'balance': 'Balance',
      
      // Status
      'pending': 'Pending',
      'approved': 'Approved',
      'rejected': 'Rejected',
      'completed': 'Completed',
      'cancelled': 'Cancelled',
      'active': 'Active',
      'inactive': 'Inactive',
      'processing': 'Processing',
      'shipped': 'Shipped',
      'delivered': 'Delivered',
      
      // Messages
      'order_placed_successfully': 'Order placed successfully',
      'payment_successful': 'Payment successful',
      'invoice_generated': 'Invoice generated',
      'customer_added': 'Customer added successfully',
      'order_cancelled': 'Order cancelled',
      'refund_processed': 'Refund processed',
      'approval_required': 'Approval required',
      'approval_granted': 'Approval granted',
      'approval_denied': 'Approval denied',
      
      // Errors
      'error_occurred': 'An error occurred',
      'invalid_input': 'Invalid input',
      'not_found': 'Not found',
      'unauthorized': 'Unauthorized',
      'forbidden': 'Forbidden',
      'server_error': 'Server error',
      'network_error': 'Network error',
      'timeout_error': 'Request timeout',
      
      // Time
      'today': 'Today',
      'yesterday': 'Yesterday',
      'tomorrow': 'Tomorrow',
      'this_week': 'This week',
      'last_week': 'Last week',
      'this_month': 'This month',
      'last_month': 'Last month',
      'this_year': 'This year',
      'last_year': 'Last year',
      
      // Numbers
      'one': 'One',
      'two': 'Two',
      'three': 'Three',
      'four': 'Four',
      'five': 'Five',
      'six': 'Six',
      'seven': 'Seven',
      'eight': 'Eight',
      'nine': 'Nine',
      'ten': 'Ten',
      
      // Currency
      'currency': '₹',
      'rupee': 'Rupee',
      'rupees': 'Rupees',
      'price_rupees': 'Price in Rupees',
      'total_amount': 'Total Amount',
      'amount_payable': 'Amount Payable',
      
      // Bot responses
      'bot_greeting': 'Hello! I am your business assistant. How can I help you today?',
      'bot_help': 'I can help you with orders, payments, invoices, and customer support.',
      'bot_order_help': 'To place an order, please tell me what you want to order.',
      'bot_payment_help': 'For payment assistance, I can help you check your balance and process payments.',
      'bot_invoice_help': 'I can generate invoices for your orders and send them to customers.',
      'bot_farewell': 'Thank you for using our service. Have a great day!',
      
      // AI responses
      'ai_processing': 'Processing your request...',
      'ai_thinking': 'Thinking...',
      'ai_generating': 'Generating response...',
      'ai_analyzing': 'Analyzing data...',
      'ai_creating': 'Creating...',
      'ai_updating': 'Updating...',
      
      // System messages
      'system_maintenance': 'System under maintenance',
      'system_update': 'System update in progress',
      'system_backup': 'Creating backup',
      'system_restore': 'Restoring from backup',
      'system_ready': 'System ready',
      
      // Validation messages
      'required_field': 'This field is required',
      'invalid_email': 'Invalid email address',
      'invalid_phone': 'Invalid phone number',
      'invalid_amount': 'Invalid amount',
      'min_length': 'Minimum length is {min} characters',
      'max_length': 'Maximum length is {max} characters',
      'password_mismatch': 'Passwords do not match',
      'invalid_date': 'Invalid date format',
      
      // Success messages
      'operation_successful': 'Operation completed successfully',
      'data_saved': 'Data saved successfully',
      'data_updated': 'Data updated successfully',
      'data_deleted': 'Data deleted successfully',
      'file_uploaded': 'File uploaded successfully',
      'file_downloaded': 'File downloaded successfully',
      
      // Navigation hints
      'click_here': 'Click here',
      'learn_more': 'Learn more',
      'view_details': 'View details',
      'edit_details': 'Edit details',
      'delete_item': 'Delete item',
      'add_new': 'Add new',
      'back_to_top': 'Back to top',
      
      // Business specific
      'place_order': 'Place Order',
      'track_order': 'Track Order',
      'make_payment': 'Make Payment',
      'view_invoice': 'View Invoice',
      'contact_support': 'Contact Support',
      'check_status': 'Check Status',
      'update_profile': 'Update Profile',
      'change_password': 'Change Password',
      
      // Analytics
      'total_revenue': 'Total Revenue',
      'total_orders': 'Total Orders',
      'total_customers': 'Total Customers',
      'conversion_rate': 'Conversion Rate',
      'average_order_value': 'Average Order Value',
      'customer_satisfaction': 'Customer Satisfaction',
      
      // Time based
      'last_7_days': 'Last 7 days',
      'last_30_days': 'Last 30 days',
      'last_90_days': 'Last 90 days',
      'last_12_months': 'Last 12 months',
      'year_to_date': 'Year to date',
      
      // Support
      'faq': 'Frequently Asked Questions',
      'contact_info': 'Contact Information',
      'business_hours': 'Business Hours',
      'response_time': 'Response Time',
      'ticket_number': 'Ticket Number',
      
      // Security
      'login_required': 'Login required',
      'access_denied': 'Access denied',
      'session_expired': 'Session expired',
      'please_login': 'Please login to continue',
      'invalid_credentials': 'Invalid credentials',
      
      // Notifications
      'new_order_received': 'New order received',
      'payment_received': 'Payment received',
      'customer_registered': 'New customer registered',
      'inventory_low': 'Inventory running low',
      'system_alert': 'System alert',
      
      // General
      'loading': 'Loading...',
      'please_wait': 'Please wait...',
      'no_data_available': 'No data available',
      'no_results_found': 'No results found',
      'try_again': 'Please try again',
      'refresh_page': 'Refresh page',
      'close_window': 'Close window'
    });

    // Hindi translations
    this.translations.set('hi', {
      // Common
      'welcome': 'स्वागत है',
      'hello': 'नमस्ते',
      'goodbye': 'लविदा',
      'thank_you': 'धन्यवाद',
      'please': 'कृपया',
      'sorry': 'क्षमा करें',
      'yes': 'हाँ',
      'no': 'नहीं',
      'ok': 'ठीक है',
      'cancel': 'रद्द करें',
      'save': 'सेव करें',
      'delete': 'हटाएं',
      'edit': 'संपादित करें',
      'search': 'खोजें',
      'filter': 'फ़िल्टर',
      'export': 'निर्यात करें',
      'import': 'आयात करें',
      'settings': 'सेटिंग्स',
      'help': 'मदद',
      'about': 'के बारे में',
      'contact': 'संपर्क करें',
      
      // Navigation
      'dashboard': 'डैशबोर्ड',
      'analytics': 'विश्लेषण',
      'customers': 'ग्राहक',
      'orders': 'ऑर्डर',
      'invoices': 'चालान',
      'products': 'उत्पादन',
      'inventory': 'इन्वेंटरी',
      'reports': 'रिपोर्ट',
      'users': 'उपयोगकर्ता',
      'security': 'सुरक्षा',
      'notifications': 'सूचनाएं',
      
      // Business terms
      'customer': 'ग्राहक',
      'order': 'ऑर्डर',
      'invoice': 'चालान',
      'payment': 'भुगतान',
      'delivery': 'डिलीवरी',
      'refund': 'रिफंड',
      'support': 'समर्थन',
      'approval': 'अनुमति',
      'status': 'स्थिति',
      'amount': 'राशि',
      'quantity': 'मात्रा',
      'price': 'मूल्य',
      'total': 'कुल',
      'balance': 'शेष',
      
      // Status
      'pending': 'लंबित',
      'approved': 'अनुमत',
      'rejected': 'अस्वीकृत',
      'completed': 'पूर्ण',
      'cancelled': 'रद्द',
      'active': 'सक्रिय',
      'inactive': 'निष्क्रिय',
      'processing': 'प्रसंस्करण',
      'shipped': 'भेजा गया',
      'delivered': 'पहुंचा गया',
      
      // Messages
      'order_placed_successfully': 'ऑर्डर सफलतापूर्वक दिया गया',
      'payment_successful': 'भुगतान सफल',
      'invoice_generated': 'चालान जेनरेट किया गया',
      'customer_added': 'ग्राहक सफलतापूर्वक जोड़ा गया',
      'order_cancelled': 'ऑर्डर रद्द',
      'refund_processed': 'रिफंड प्रोसेस किया गया',
      'approval_required': 'अनुमति आवश्यक',
      'approval_granted': 'अनुमति दी गई',
      'approval_denied': 'अनुमति अस्वीकृत',
      
      // Currency
      'currency': '₹',
      'rupee': 'रुपया',
      'rupees': 'रुपये',
      'price_rupees': 'रुपये में मूल्य',
      'total_amount': 'कुल राशि',
      'amount_payable': 'भुगतानीय राशि',
      
      // Bot responses
      'bot_greeting': 'नमस्ते! मैं आपका व्यापारिक सहायक हूँ। आज मैं आपकी क्या सहायता कर सकता हूँ?',
      'bot_help': 'मैं आपको ऑर्डर, भुगतान, चालान और ग्राहक समर्थन में मदद कर सकता हूँ।',
      'bot_farewell': 'हमारी सेवा का उपयोग करने के लिए धन्यवाद। आपका दिन शुभ हो!',
      
      // System messages
      'system_maintenance': 'सिस्टम रखरखाव में है',
      'system_update': 'सिस्टम अपडेट प्रगति पर है',
      'system_ready': 'सिस्टम तैयार है',
      
      // Validation messages
      'required_field': 'यह फ़ील्ड आवश्यक है',
      'invalid_email': 'अमान्य ईमेल पता',
      'invalid_phone': 'अमान्य फोन नंबर',
      'invalid_amount': 'अमान्य राशि',
      
      // Success messages
      'operation_successful': 'ऑपरेशन सफलतापूर्वक पूर्ण',
      'data_saved': 'डेटा सफलतापूर्वक सेव किया गया',
      'data_updated': 'डेटा सफलतापूर्वक अपडेट किया गया',
      'data_deleted': 'डेटा सफलतापूर्वक हटाया गया',
      
      // General
      'loading': 'लोड हो रहा है...',
      'please_wait': 'कृपया प्रतीक्षा करें...',
      'no_data_available': 'कोई डेटा उपलब्ध नहीं',
      'no_results_found': 'कोई परिणाम नहीं मिला',
      'try_again': 'कृपया फिर से कोशिश करें'
    });

    // Bengali translations
    this.translations.set('bn', {
      'welcome': 'স্বাগতম',
      'hello': 'হ্যালো',
      'goodbye': 'বিদায',
      'thank_you': 'ন্যবাদ',
      'please': 'অনুগ্রহ করুন',
      'yes': 'হ্যাঁ',
      'no': 'না',
      'ok': 'ঠিক আছে',
      'cancel': 'বাতিল করুন',
      'save': 'সংরক্ষণ করুন',
      'delete': 'মুছে ফেলুন',
      'edit': 'সম্পাদনা করুন',
      'search': 'অনুসন্ধান করুন',
      'filter': 'ফিল্টার',
      'export': 'রপ্তানি করুন',
      'import': 'আমদানি করুন',
      'settings': 'সেটিংস',
      'help': 'সাহায্য',
      'about': 'সম্পর্কে',
      'contact': 'যোগাযোগ করুন',
      
      // Navigation
      'dashboard': 'ড্যাশবোর্ড',
      'customers': 'গ্রাহক',
      'orders': 'অর্ডার',
      'invoices': 'চালান',
      'products': 'পণ্য',
      'reports': 'প্রতিবেদন',
      
      // Business terms
      'customer': 'গ্রাহক',
      'order': 'অর্ডার',
      'invoice': 'চালান',
      'payment': 'পেমেন্ট',
      'delivery': 'ডেলিভারি',
      'refund': 'ফেরত',
      'support': 'সমর্থন',
      'status': 'অবস্থা',
      'amount': 'পরিমাণ',
      'quantity': 'পরিমাণ',
      'price': 'মূল্য',
      'total': 'মোট',
      
      // Currency
      'currency': '₹',
      'rupee': 'টাকা',
      'rupees': 'টাকা',
      'total_amount': 'মোট পরিমাণ',
      'amount_payable': 'পরিশোধ পরিমাণ',
      
      // Bot responses
      'bot_greeting': 'হ্যালো! আমি আপনার ব্যবসায়িক সহায়ক। আজ আমি কিভাবে আপনাকে সাহায্য করতে পারি?',
      'bot_help': 'আমি আপনাকে অর্ডার, পেমেন্ট, চালান এবং গ্রাহক সমর্থনে সাহায্য করতে পারি।',
      'bot_farewell': 'আমাদের পরিষেবা ব্যবহারের জন্য ধন্যবাদ। আপনার দিন শুভ হোক!',
      
      // General
      'loading': 'লোড হচ্ছে...',
      'please_wait': 'অনুগ্রহ করেন অপেক্ষা করুন...',
      'no_data_available': 'কোনো তথ্য উপলব্ধ নেই',
      'no_results_found': 'কোনো ফলাফল পাওয়া যায়নি',
      'try_again': 'আবার চেষ্টা করুন'
    });

    // Tamil translations
    this.translations.set('ta', {
      'welcome': 'வரவுக்கள்',
      'hello': 'வணக்கம்',
      'goodbye': 'விடை',
      'thank_you': 'நன்றி',
      'please': 'தயவுரியா',
      'yes': 'ஆம்',
      'no': 'இல்லை',
      'ok': 'சரி',
      'cancel': 'ரத்து',
      'save': 'சேமிக்க',
      'delete': 'அழி',
      'edit': 'திருத்த',
      'search': 'தேடு',
      'filter': 'வடிக்க',
      'export': 'ஏற்றுமதி',
      'import': 'இறக்குமதி',
      'settings': 'அமைப்புகள்',
      'help': 'உதவி',
      'about': 'பற்றி',
      'contact': 'தொடர்பு',
      
      // Navigation
      'dashboard': 'டாஷ்போர்டு',
      'customers': 'வாடிகள்',
      'orders': 'ஆணைகள்',
      'invoices': 'சலான்கள்',
      'products': 'தயாரிப்பொருட்கள்',
      'reports': 'அறிக்கைகள்',
      
      // Business terms
      'customer': 'வாடி',
      'order': 'ஆணை',
      'invoice': 'சலான்',
      'payment': 'கட்டணம்',
      'delivery': 'டெலிவரி',
      'refund': 'திருப்ப',
      'support': 'ஆதரவு',
      'status': 'நிலை',
      'amount': 'தொகை',
      'quantity': 'அளவு',
      'price': 'விலை',
      'total': 'மொத்த',
      
      // Currency
      'currency': '₹',
      'rupee': 'ரூபாய்',
      'rupees': 'ரூபாய்கள்',
      'total_amount': 'மொத்த தொகை',
      'amount_payable': 'செலும்படிக்க தொகை',
      
      // Bot responses
      'bot_greeting': 'வணக்கம்! நான் உங்கள் வணிக உதவியாளன். இன்று நான் உங்களுக்கு எபடி உதவலாம்?',
      'bot_help': 'நான் ஆணைகள், கட்டணங்கள், சலான்கள் மற்றும் வாடிகள் ஆதரவில் உங்களுக்கு உதவலாம்.',
      'bot_farewell': 'எங்கள் எங்கள் சேவையை பயன்படுத்தியததற்கு நன்றி. நல்ல ஒரு நாள்!',
      
      // General
      'loading': 'ஏற்றுமதிகிறது...',
      'please_wait': 'தயவுரியா காத்திருங்கள்...',
      'no_data_available': 'தரவு கிடையாது',
      'no_results_found': 'முடிவுகள் காணவில்லை',
      'try_again': 'மீண்டும் முயற்சிக்க'
    });

    console.log('🌍 Translations loaded for', this.supportedLanguages.length, 'languages');
  }

  /**
   * Get translation for a key
   */
  translate(key, language = null, params = {}) {
    const lang = language || this.defaultLanguage;
    const translations = this.translations.get(lang);
    
    if (!translations) {
      console.warn(`Translation not found for language: ${lang}`);
      return key;
    }
    
    let translation = translations[key];
    
    if (!translation) {
      // Fallback to English
      const englishTranslations = this.translations.get('en');
      translation = englishTranslations[key] || key;
    }
    
    // Replace parameters in translation
    if (params && typeof translation === 'string') {
      Object.keys(params).forEach(param => {
        translation = translation.replace(new RegExp(`{${param}}`, 'g'), params[param]);
      });
    }
    
    return translation;
  }

  /**
   * Detect language from text
   */
  detectLanguage(text) {
    // Simple language detection based on common words
    const textLower = text.toLowerCase();
    
    // Hindi detection
    if (/[नमस्ते|धन्यवाद|कृपया|हाँ|नहीं]/.test(textLower)) {
      return 'hi';
    }
    
    // Bengali detection
    if (/[স্বাগতম|ধন্যবাদ|অনুগ্রহ|হ্যাঁ|না]/.test(textLower)) {
      return 'bn';
    }
    
    // Tamil detection
    if (/[வணக்கம்|நன்றி|தயவுரியா|ஆம்|இல்லை]/.test(textLower)) {
      return 'ta';
    }
    
    // Default to English
    return 'en';
  }

  /**
   * Set user language preference
   */
  setUserLanguage(userId, language) {
    if (this.supportedLanguages.includes(language)) {
      this.userLanguages.set(userId, language);
      return true;
    }
    return false;
  }

  /**
   * Get user language preference
   */
  getUserLanguage(userId) {
    return this.userLanguages.get(userId) || this.defaultLanguage;
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return this.supportedLanguages.map(lang => ({
      code: lang,
      name: this.getLanguageName(lang),
      nativeName: this.getNativeLanguageName(lang)
    }));
  }

  /**
   * Get language name in English
   */
  getLanguageName(code) {
    const names = {
      'en': 'English',
      'hi': 'Hindi',
      'bn': 'Bengali',
      'ta': 'Tamil',
      'te': 'Telugu',
      'mr': 'Marathi',
      'gu': 'Gujarati',
      'kn': 'Kannada',
      'ml': 'Malayalam',
      'pa': 'Punjabi',
      'ur': 'Urdu'
    };
    return names[code] || code.toUpperCase();
  }

  /**
   * Get native language name
   */
  getNativeLanguageName(code) {
    const names = {
      'en': 'English',
      'hi': 'हिन्दी',
      'bn': 'বাংলা',
      'ta': 'தமிழ்',
      'te': 'తెలుగు',
      'mr': 'मराठी',
      'gu': 'ગુજરાતી',
      'kn': 'ಕನ್ನಡ',
      'ml': 'മലയാളം',
      'pa': 'ਪੰਜਾਬੀ',
      'ur': 'اردو'
    };
    return names[code] || code.toUpperCase();
  }

  /**
   * Format currency for language
   */
  formatCurrency(amount, language = 'en') {
    const formatter = new Intl.NumberFormat(language === 'hi' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    
    return formatter.format(amount);
  }

  /**
   * Format date for language
   */
  formatDate(date, language = 'en') {
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    
    return new Intl.DateTimeFormat(language, options).format(date);
  }

  /**
   * Format number for language
   */
  formatNumber(number, language = 'en') {
    return new Intl.NumberFormat(language).format(number);
  }

  /**
   * Get localized bot response
   */
  getBotResponse(type, language = 'en', params = {}) {
    const responses = {
      greeting: 'bot_greeting',
      help: 'bot_help',
      order_help: 'bot_order_help',
      payment_help: 'bot_payment_help',
      invoice_help: 'bot_invoice_help',
      farewell: 'bot_farewell',
      processing: 'ai_processing',
      thinking: 'ai_thinking',
      error: 'error_occurred'
    };
    
    const key = responses[type];
    return key ? this.translate(key, language, params) : this.translate(type, language, params);
  }

  /**
   * Get localized validation message
   */
  getValidationMessage(type, language = 'en', params = {}) {
    const messages = {
      required: 'required_field',
      email: 'invalid_email',
      phone: 'invalid_phone',
      amount: 'invalid_amount',
      minLength: 'min_length',
      maxLength: 'max_length',
      passwordMismatch: 'password_mismatch',
      date: 'invalid_date'
    };
    
    const key = messages[type];
    return key ? this.translate(key, language, params) : this.translate(type, language, params);
  }

  /**
   * Get localized success message
   */
  getSuccessMessage(type, language = 'en', params = {}) {
    const messages = {
      operation: 'operation_successful',
      saved: 'data_saved',
      updated: 'data_updated',
      deleted: 'data_deleted',
      uploaded: 'file_uploaded',
      downloaded: 'file_downloaded'
    };
    
    const key = messages[type];
    return key ? this.translate(key, language, params) : this.translate(type, language, params);
  }

  /**
   * Get localized error message
   */
  getErrorMessage(type, language = 'en', params = {}) {
    const messages = {
      general: 'error_occurred',
      input: 'invalid_input',
      notFound: 'not_found',
      unauthorized: 'unauthorized',
      forbidden: 'forbidden',
      server: 'server_error',
      network: 'network_error',
      timeout: 'timeout_error'
    };
    
    const key = messages[type];
    return key ? this.translate(key, language, params) : this.translate(type, language, params);
  }

  /**
   * Get localized status text
   */
  getStatusText(status, language = 'en') {
    return this.translate(status, language);
  }

  /**
   * Get localized navigation text
   */
  getNavigationText(key, language = 'en') {
    return this.translate(key, language);
  }

  /**
   * Get localized business term
   */
  getBusinessTerm(term, language = 'en') {
    return this.translate(term, language);
  }

  /**
   * Create localized response object
   */
  createLocalizedResponse(data, language = 'en') {
    return {
      ...data,
      message: data.message ? this.translate(data.message, language) : undefined,
      error: data.error ? this.translate(data.error, language) : undefined,
      localized: true,
      language
    };
  }

  /**
   * Middleware to handle language detection and setting
   */
  languageMiddleware() {
    return (req, res, next) => {
      // Get language from header
      const acceptLanguage = req.headers['accept-language'];
      const userLanguage = req.headers['x-user-language'];
      
      if (userLanguage && this.supportedLanguages.includes(userLanguage)) {
        req.language = userLanguage;
      } else if (acceptLanguage) {
        // Parse Accept-Language header
        const preferredLanguage = acceptLanguage.split(',')[0].split('-')[0];
        req.language = this.supportedLanguages.includes(preferredLanguage) ? preferredLanguage : this.defaultLanguage;
      } else {
        req.language = this.defaultLanguage;
      }
      
      // Add translation helper to response
      res.t = (key, params) => this.translate(key, req.language, params);
      res.locals.language = req.language;
      
      next();
    };
  }
}

// Create singleton instance
const i18nService = new I18nService();

module.exports = i18nService;
