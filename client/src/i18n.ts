import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

// NOTE: Translation resources are now loaded from /public/locales/{lang}.json files
// This allows for easier management and updates without code changes

// Legacy inline resources (kept for backwards compatibility)
const legacyResources = {
  // Nigerian Pidgin English
  pcm: {
    translation: {
      // Common
      welcome: 'Welcome',
      login: 'Login',
      logout: 'Logout',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      search: 'Search',
      filter: 'Filter',
      export: 'Export',
      loading: 'Dey load...',
      error: 'Error',
      success: 'E don work!',
      
      // Navigation
      nav: {
        home: 'Home',
        dashboard: 'Dashboard',
        parcels: 'Land Plots',
        transactions: 'Transactions',
        reports: 'Reports',
        settings: 'Settings',
        fieldSurveyor: 'Field Surveyor',
        analytics: 'Analytics',
        blockchain: 'Blockchain',
      },
      
      // Field Surveyor
      fieldSurveyor: {
        title: 'Field Surveyor',
        capturePhoto: 'Snap Photo',
        parcelNumber: 'Land Number',
        location: 'Where e dey',
        notes: 'Notes',
        syncStatus: 'Sync Status',
        synced: 'Don sync',
        pending: 'Dey wait',
        analyzing: 'Dey check photo...',
        photoAnalyzed: 'Photo don check finish',
        saved: 'Data don save',
        offlineMode: 'Offline Mode',
        onlineMode: 'Online Mode',
      },
      
      // Dashboard
      dashboard: {
        title: 'Dashboard',
        totalParcels: 'Total Land',
        totalTransactions: 'Total Transactions',
        pendingVerifications: 'Pending Verifications',
        revenue: 'Money wey enter',
      },
      
      // Blockchain
      blockchain: {
        title: 'Blockchain Transactions',
        propertyTransfer: 'Transfer Property',
        fromAddress: 'From Address',
        toAddress: 'To Address',
        propertyId: 'Property ID',
        transfer: 'Transfer',
        transactionHistory: 'Transaction History',
        viewOnExplorer: 'See for Explorer',
      },
    },
  },
  // Yoruba
  yo: {
    translation: {
      // Common
      welcome: 'Káàbọ̀',
      login: 'Wọlé',
      logout: 'Jáde',
      save: 'Fipamọ́',
      cancel: 'Fagilee',
      delete: 'Paarẹ',
      edit: 'Ṣàtúnṣe',
      search: 'Wá',
      filter: 'Ṣàlọ',
      export: 'Gbéjade',
      loading: 'Ń gbé wọlé...',
      error: 'Àṣìṣe',
      success: 'Àṣeyọrí',
      
      // Navigation
      nav: {
        home: 'Ilé',
        dashboard: 'Pátákó',
        parcels: 'Àwọn ilẹ̀',
        transactions: 'Àwọn ìṣòwò',
        reports: 'Àwọn ìròyìn',
        settings: 'Ètò',
        fieldSurveyor: 'Aṣàwárí pápá',
        analytics: 'Ìtúpalẹ̀',
        blockchain: 'Blockchain',
      },
      
      // Field Surveyor
      fieldSurveyor: {
        title: 'Aṣàwárí Pápá',
        capturePhoto: 'Ya àwòrán',
        parcelNumber: 'Nọ́mbà ilẹ̀',
        location: 'Ìpò',
        notes: 'Àkọsílẹ̀',
        syncStatus: 'Ipò ìṣàmúṣiṣẹ́',
        synced: 'Ti ṣàmúṣiṣẹ́',
        pending: 'Ń dúró',
        analyzing: 'Ń ṣàyẹ̀wò àwòrán...',
        photoAnalyzed: 'Àwòrán ti yẹ̀wò tán',
        saved: 'Data ti pamọ́',
        offlineMode: 'Ìpò aláìsí ìsopọ̀',
        onlineMode: 'Ìpò ìsopọ̀',
      },
      
      // Dashboard
      dashboard: {
        title: 'Pátákó',
        totalParcels: 'Àpapọ̀ ilẹ̀',
        totalTransactions: 'Àpapọ̀ ìṣòwò',
        pendingVerifications: 'Ìjẹ́rìísí tó kù',
        revenue: 'Owó wọlé',
      },
      
      // Blockchain
      blockchain: {
        title: 'Àwọn ìṣòwò Blockchain',
        propertyTransfer: 'Gbígbé ohun-ìní',
        fromAddress: 'Láti àdírẹ́sì',
        toAddress: 'Sí àdírẹ́sì',
        propertyId: 'ID ohun-ìní',
        transfer: 'Gbé',
        transactionHistory: 'Ìtàn ìṣòwò',
        viewOnExplorer: 'Wò ní Explorer',
      },
    },
  },
  // Igbo
  ig: {
    translation: {
      // Common
      welcome: 'Nnọọ',
      login: 'Banye',
      logout: 'Pụọ',
      save: 'Chekwa',
      cancel: 'Kagbuo',
      delete: 'Hichapụ',
      edit: 'Dezie',
      search: 'Chọọ',
      filter: 'Họpụta',
      export: 'Wepụta',
      loading: 'Na-ebu...',
      error: 'Njehie',
      success: 'Ihe ọma',
      
      // Navigation
      nav: {
        home: 'Ụlọ',
        dashboard: 'Dashboard',
        parcels: 'Ala niile',
        transactions: 'Azụmahịa',
        reports: 'Akụkọ',
        settings: 'Ntọala',
        fieldSurveyor: 'Onye nyocha ubi',
        analytics: 'Nyocha',
        blockchain: 'Blockchain',
      },
      
      // Field Surveyor
      fieldSurveyor: {
        title: 'Onye Nyocha Ubi',
        capturePhoto: 'Sere foto',
        parcelNumber: 'Nọmba ala',
        location: 'Ebe',
        notes: 'Ndetu',
        syncStatus: 'Ọnọdụ sync',
        synced: 'E sync',
        pending: 'Na-eche',
        analyzing: 'Na-enyocha foto...',
        photoAnalyzed: 'E nyochala foto',
        saved: 'E chekwara data',
        offlineMode: 'Ọnọdụ offline',
        onlineMode: 'Ọnọdụ online',
      },
      
      // Dashboard
      dashboard: {
        title: 'Dashboard',
        totalParcels: 'Ngụkọta ala',
        totalTransactions: 'Ngụkọta azụmahịa',
        pendingVerifications: 'Nkwenye na-eche',
        revenue: 'Ego batara',
      },
      
      // Blockchain
      blockchain: {
        title: 'Azụmahịa Blockchain',
        propertyTransfer: 'Ịnyefe ihe onwunwe',
        fromAddress: 'Site na adreesị',
        toAddress: 'Gaa na adreesị',
        propertyId: 'ID ihe onwunwe',
        transfer: 'Nyefee',
        transactionHistory: 'Akụkọ azụmahịa',
        viewOnExplorer: 'Lee na Explorer',
      },
    },
  },
  // Hausa
  ha: {
    translation: {
      // Common
      welcome: 'Barka da zuwa',
      login: 'Shiga',
      logout: 'Fita',
      save: 'Ajiye',
      cancel: 'Soke',
      delete: 'Share',
      edit: 'Gyara',
      search: 'Nema',
      filter: 'Tace',
      export: 'Fitar',
      loading: 'Ana lodi...',
      error: 'Kuskure',
      success: 'Nasara',
      
      // Navigation
      nav: {
        home: 'Gida',
        dashboard: 'Dashboard',
        parcels: 'Filaye',
        transactions: 'Ciniki',
        reports: 'Rahotanni',
        settings: 'Saitunan',
        fieldSurveyor: 'Mai binciken fili',
        analytics: 'Bincike',
        blockchain: 'Blockchain',
      },
      
      // Field Surveyor
      fieldSurveyor: {
        title: 'Mai Binciken Fili',
        capturePhoto: 'Dauki hoto',
        parcelNumber: 'Lambar fili',
        location: 'Wurin',
        notes: 'Bayanai',
        syncStatus: 'Matsayin sync',
        synced: 'An sync',
        pending: 'Ana jira',
        analyzing: 'Ana bincika hoto...',
        photoAnalyzed: 'An bincika hoto',
        saved: 'An ajiye bayanai',
        offlineMode: 'Yanayin offline',
        onlineMode: 'Yanayin online',
      },
      
      // Dashboard
      dashboard: {
        title: 'Dashboard',
        totalParcels: 'Jimlar filaye',
        totalTransactions: 'Jimlar ciniki',
        pendingVerifications: 'Tabbatarwa masu jira',
        revenue: 'Kudin shiga',
      },
      
      // Blockchain
      blockchain: {
        title: 'Cinikin Blockchain',
        propertyTransfer: 'Canja dukiya',
        fromAddress: 'Daga adireshin',
        toAddress: 'Zuwa adireshin',
        propertyId: 'ID dukiya',
        transfer: 'Canja',
        transactionHistory: 'Tarihin ciniki',
        viewOnExplorer: 'Duba a Explorer',
      },
    },
  },
  en: {
    translation: {
      // Common
      welcome: 'Welcome',
      login: 'Login',
      logout: 'Logout',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      search: 'Search',
      filter: 'Filter',
      export: 'Export',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      
      // Navigation
      nav: {
        home: 'Home',
        dashboard: 'Dashboard',
        parcels: 'Parcels',
        transactions: 'Transactions',
        reports: 'Reports',
        settings: 'Settings',
        fieldSurveyor: 'Field Surveyor',
        analytics: 'Analytics',
        blockchain: 'Blockchain',
      },
      
      // Field Surveyor
      fieldSurveyor: {
        title: 'Field Surveyor',
        capturePhoto: 'Capture Photo',
        parcelNumber: 'Parcel Number',
        location: 'Location',
        notes: 'Notes',
        syncStatus: 'Sync Status',
        synced: 'Synced',
        pending: 'Pending',
        analyzing: 'Analyzing photo...',
        photoAnalyzed: 'Photo analyzed successfully',
        saved: 'Data saved successfully',
        offlineMode: 'Offline Mode',
        onlineMode: 'Online Mode',
      },
      
      // Dashboard
      dashboard: {
        title: 'Dashboard',
        totalParcels: 'Total Parcels',
        totalTransactions: 'Total Transactions',
        pendingVerifications: 'Pending Verifications',
        revenue: 'Revenue',
      },
      
      // Blockchain
      blockchain: {
        title: 'Blockchain Transactions',
        propertyTransfer: 'Property Transfer',
        fromAddress: 'From Address',
        toAddress: 'To Address',
        propertyId: 'Property ID',
        transfer: 'Transfer',
        transactionHistory: 'Transaction History',
        viewOnExplorer: 'View on Explorer',
      },
    },
  },
  fr: {
    translation: {
      // Common
      welcome: 'Bienvenue',
      login: 'Connexion',
      logout: 'Déconnexion',
      save: 'Enregistrer',
      cancel: 'Annuler',
      delete: 'Supprimer',
      edit: 'Modifier',
      search: 'Rechercher',
      filter: 'Filtrer',
      export: 'Exporter',
      loading: 'Chargement...',
      error: 'Erreur',
      success: 'Succès',
      
      // Navigation
      nav: {
        home: 'Accueil',
        dashboard: 'Tableau de bord',
        parcels: 'Parcelles',
        transactions: 'Transactions',
        reports: 'Rapports',
        settings: 'Paramètres',
        fieldSurveyor: 'Arpenteur de terrain',
        analytics: 'Analytique',
        blockchain: 'Blockchain',
      },
      
      // Field Surveyor
      fieldSurveyor: {
        title: 'Arpenteur de terrain',
        capturePhoto: 'Capturer une photo',
        parcelNumber: 'Numéro de parcelle',
        location: 'Emplacement',
        notes: 'Notes',
        syncStatus: 'État de synchronisation',
        synced: 'Synchronisé',
        pending: 'En attente',
        analyzing: 'Analyse de la photo...',
        photoAnalyzed: 'Photo analysée avec succès',
        saved: 'Données enregistrées avec succès',
        offlineMode: 'Mode hors ligne',
        onlineMode: 'Mode en ligne',
      },
      
      // Dashboard
      dashboard: {
        title: 'Tableau de bord',
        totalParcels: 'Total des parcelles',
        totalTransactions: 'Total des transactions',
        pendingVerifications: 'Vérifications en attente',
        revenue: 'Revenu',
      },
      
      // Blockchain
      blockchain: {
        title: 'Transactions Blockchain',
        propertyTransfer: 'Transfert de propriété',
        fromAddress: 'Adresse source',
        toAddress: 'Adresse destination',
        propertyId: 'ID de propriété',
        transfer: 'Transférer',
        transactionHistory: 'Historique des transactions',
        viewOnExplorer: 'Voir sur l\'explorateur',
      },
    },
  },
  es: {
    translation: {
      // Common
      welcome: 'Bienvenido',
      login: 'Iniciar sesión',
      logout: 'Cerrar sesión',
      save: 'Guardar',
      cancel: 'Cancelar',
      delete: 'Eliminar',
      edit: 'Editar',
      search: 'Buscar',
      filter: 'Filtrar',
      export: 'Exportar',
      loading: 'Cargando...',
      error: 'Error',
      success: 'Éxito',
      
      // Navigation
      nav: {
        home: 'Inicio',
        dashboard: 'Panel',
        parcels: 'Parcelas',
        transactions: 'Transacciones',
        reports: 'Informes',
        settings: 'Configuración',
        fieldSurveyor: 'Topógrafo de campo',
        analytics: 'Analítica',
        blockchain: 'Blockchain',
      },
      
      // Field Surveyor
      fieldSurveyor: {
        title: 'Topógrafo de campo',
        capturePhoto: 'Capturar foto',
        parcelNumber: 'Número de parcela',
        location: 'Ubicación',
        notes: 'Notas',
        syncStatus: 'Estado de sincronización',
        synced: 'Sincronizado',
        pending: 'Pendiente',
        analyzing: 'Analizando foto...',
        photoAnalyzed: 'Foto analizada con éxito',
        saved: 'Datos guardados con éxito',
        offlineMode: 'Modo sin conexión',
        onlineMode: 'Modo en línea',
      },
      
      // Dashboard
      dashboard: {
        title: 'Panel',
        totalParcels: 'Total de parcelas',
        totalTransactions: 'Total de transacciones',
        pendingVerifications: 'Verificaciones pendientes',
        revenue: 'Ingresos',
      },
      
      // Blockchain
      blockchain: {
        title: 'Transacciones Blockchain',
        propertyTransfer: 'Transferencia de propiedad',
        fromAddress: 'Dirección de origen',
        toAddress: 'Dirección de destino',
        propertyId: 'ID de propiedad',
        transfer: 'Transferir',
        transactionHistory: 'Historial de transacciones',
        viewOnExplorer: 'Ver en explorador',
      },
    },
  },
  // Swahili (East Africa)
  sw: {
    translation: {
      // Common
      welcome: 'Karibu',
      login: 'Ingia',
      logout: 'Toka',
      save: 'Hifadhi',
      cancel: 'Ghairi',
      delete: 'Futa',
      edit: 'Hariri',
      search: 'Tafuta',
      filter: 'Chuja',
      export: 'Toa',
      loading: 'Inapakia...',
      error: 'Hitilafu',
      success: 'Mafanikio',
      
      // Navigation
      nav: {
        home: 'Nyumbani',
        dashboard: 'Dashibodi',
        parcels: 'Vipande vya ardhi',
        transactions: 'Miamala',
        reports: 'Ripoti',
        settings: 'Mipangilio',
        fieldSurveyor: 'Msahihishaji wa shamba',
        analytics: 'Uchanganuzi',
        blockchain: 'Blockchain',
      },
      
      // Field Surveyor
      fieldSurveyor: {
        title: 'Msahihishaji wa Shamba',
        capturePhoto: 'Piga picha',
        parcelNumber: 'Nambari ya kipande',
        location: 'Mahali',
        notes: 'Maelezo',
        syncStatus: 'Hali ya usawazishaji',
        synced: 'Imesawazishwa',
        pending: 'Inasubiri',
        analyzing: 'Inachambua picha...',
        photoAnalyzed: 'Picha imechambuliwa',
        saved: 'Data imehifadhiwa',
        offlineMode: 'Hali ya nje ya mtandao',
        onlineMode: 'Hali ya mtandaoni',
      },
      
      // Dashboard
      dashboard: {
        title: 'Dashibodi',
        totalParcels: 'Jumla ya vipande',
        totalTransactions: 'Jumla ya miamala',
        pendingVerifications: 'Uthibitisho unasubiri',
        revenue: 'Mapato',
      },
      
      // Blockchain
      blockchain: {
        title: 'Miamala ya Blockchain',
        propertyTransfer: 'Uhamishaji wa mali',
        fromAddress: 'Kutoka anwani',
        toAddress: 'Kwenda anwani',
        propertyId: 'Kitambulisho cha mali',
        transfer: 'Hamisha',
        transactionHistory: 'Historia ya miamala',
        viewOnExplorer: 'Tazama kwenye Explorer',
      },
    },
  },
  ar: {
    translation: {
      // Common
      welcome: 'مرحباً',
      login: 'تسجيل الدخول',
      logout: 'تسجيل الخروج',
      save: 'حفظ',
      cancel: 'إلغاء',
      delete: 'حذف',
      edit: 'تعديل',
      search: 'بحث',
      filter: 'تصفية',
      export: 'تصدير',
      loading: 'جاري التحميل...',
      error: 'خطأ',
      success: 'نجح',
      
      // Navigation
      nav: {
        home: 'الرئيسية',
        dashboard: 'لوحة التحكم',
        parcels: 'القطع',
        transactions: 'المعاملات',
        reports: 'التقارير',
        settings: 'الإعدادات',
        fieldSurveyor: 'مساح ميداني',
        analytics: 'التحليلات',
        blockchain: 'البلوكشين',
      },
      
      // Field Surveyor
      fieldSurveyor: {
        title: 'مساح ميداني',
        capturePhoto: 'التقاط صورة',
        parcelNumber: 'رقم القطعة',
        location: 'الموقع',
        notes: 'ملاحظات',
        syncStatus: 'حالة المزامنة',
        synced: 'تمت المزامنة',
        pending: 'قيد الانتظار',
        analyzing: 'جاري تحليل الصورة...',
        photoAnalyzed: 'تم تحليل الصورة بنجاح',
        saved: 'تم حفظ البيانات بنجاح',
        offlineMode: 'وضع عدم الاتصال',
        onlineMode: 'وضع الاتصال',
      },
      
      // Dashboard
      dashboard: {
        title: 'لوحة التحكم',
        totalParcels: 'إجمالي القطع',
        totalTransactions: 'إجمالي المعاملات',
        pendingVerifications: 'التحققات المعلقة',
        revenue: 'الإيرادات',
      },
      
      // Blockchain
      blockchain: {
        title: 'معاملات البلوكشين',
        propertyTransfer: 'نقل الملكية',
        fromAddress: 'من العنوان',
        toAddress: 'إلى العنوان',
        propertyId: 'معرف الملكية',
        transfer: 'نقل',
        transactionHistory: 'سجل المعاملات',
        viewOnExplorer: 'عرض في المستكشف',
      },
    },
  },
};

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'ha', 'yo', 'ig', 'pcm', 'sw', 'am', 'ar'],
    backend: {
      loadPath: '/locales/{{lng}}.json',
    },
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    // Merge with legacy inline resources as fallback
    resources: legacyResources,
  });

export default i18n;
