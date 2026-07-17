# IDLR-PTS Translation Guide

## Overview

The Integrated Digital Land Registry & Property Title System (IDLR-PTS) supports multilingual access to serve diverse African communities. This guide documents the translation infrastructure, current status, and instructions for completing translations.

---

## Supported Languages

The platform is configured to support **9 languages**, prioritizing African languages and major international languages:

| Language | Code | Status | RTL Support | Target Regions |
|----------|------|--------|-------------|----------------|
| English | `en` | ✅ Complete | No | International, Nigeria, Kenya |
| French | `fr` | 🔄 Partial | No | West/Central Africa |
| Hausa | `ha` | 🔄 Partial | No | Northern Nigeria, Niger |
| Yoruba | `yo` | ⏳ Pending | No | Southwest Nigeria, Benin |
| Igbo | `ig` | ⏳ Pending | No | Southeast Nigeria |
| Nigerian Pidgin | `pcm` | ⏳ Pending | No | Nigeria (informal) |
| Swahili | `sw` | ⏳ Pending | No | East Africa (Kenya, Tanzania) |
| Amharic | `am` | ⏳ Pending | Yes | Ethiopia |
| Arabic | `ar` | ⏳ Pending | Yes | North Africa, Sudan |

**Legend:**
- ✅ Complete: All translation keys implemented
- 🔄 Partial: Some sections translated
- ⏳ Pending: Infrastructure ready, translations needed

---

## Translation Infrastructure

### Technology Stack

The platform uses **react-i18next** for internationalization with the following architecture:

**Frontend:**
- `react-i18next` v13.x for React component integration
- `i18next` v23.x for core translation engine
- `i18next-browser-languagedetector` for automatic language detection

**Configuration:**
- Translation files: `public/locales/{lang}.json`
- Default language: English (`en`)
- Fallback language: English
- Detection order: localStorage → browser settings → default

**RTL Support:**
- Automatic direction detection for Arabic (`ar`) and Amharic (`am`)
- Dynamic `dir` attribute on `<html>` element
- CSS adjustments for RTL layouts

### File Structure

```
public/locales/
├── en.json          # English (base language)
├── fr.json          # French (partial)
├── ha.json          # Hausa (partial)
├── yo.json          # Yoruba (to be created)
├── ig.json          # Igbo (to be created)
├── pcm.json         # Nigerian Pidgin (to be created)
├── sw.json          # Swahili (to be created)
├── am.json          # Amharic (to be created)
└── ar.json          # Arabic (to be created)
```

### Translation Key Structure

Translation keys follow a hierarchical namespace pattern:

```
{section}.{subsection}.{key}
```

**Examples:**
- `home.hero.title` - Homepage hero section title
- `dashboard.stats.totalParcels` - Dashboard statistics label
- `admin.userManagement.actions` - Admin user management actions
- `common.loading` - Common UI element (loading state)

---

## Current Translation Status

### Completed Sections

**English (`en.json`):**
- ✅ Common UI elements (30 keys)
- ✅ API Key Management (40 keys)
- ⏳ Home page (60 keys) - Keys defined in code, values needed
- ⏳ Dashboard (40 keys) - Keys defined in code, values needed
- ⏳ Search Parcels (30 keys) - Keys defined in code, values needed
- ⏳ Admin sections (100+ keys) - Keys defined in code, values needed

**French (`fr.json`):**
- ✅ Admin User Management section
- ✅ Verification Workflow section
- ✅ Executive Dashboard section

**Hausa (`ha.json`):**
- ✅ Admin User Management section
- ✅ Verification Workflow section
- ✅ Executive Dashboard section

### Translation Coverage

| Section | English | French | Hausa | Other Languages |
|---------|---------|--------|-------|-----------------|
| Common UI | ✅ 100% | ⏳ 0% | ⏳ 0% | ⏳ 0% |
| API Keys | ✅ 100% | ⏳ 0% | ⏳ 0% | ⏳ 0% |
| Home Page | 🔄 50% | ⏳ 0% | ⏳ 0% | ⏳ 0% |
| Dashboard | 🔄 50% | ⏳ 0% | ⏳ 0% | ⏳ 0% |
| Search Parcels | 🔄 50% | ⏳ 0% | ⏳ 0% | ⏳ 0% |
| Admin Pages | 🔄 50% | ✅ 30% | ✅ 30% | ⏳ 0% |

**Total Keys:** ~213 unique translation keys across all pages

---

## Translation Guidelines

### General Principles

1. **Context Matters**: Understand the UI context before translating
2. **Consistency**: Use consistent terminology across the platform
3. **Formality**: Use formal language for official documents, informal for UI elements
4. **Cultural Sensitivity**: Adapt idioms and expressions to local context
5. **Technical Terms**: Keep technical terms in English when no local equivalent exists
6. **Length**: Keep translations concise to fit UI constraints

### Domain-Specific Terminology

**Land Registry Terms:**
| English | French | Hausa | Notes |
|---------|--------|-------|-------|
| Parcel | Parcelle | Yanki | Land subdivision |
| Title Deed | Titre de propriété | Takardun Mallaka | Ownership document |
| Survey Plan | Plan d'arpentage | Tsarin Auna | Land measurement document |
| Cadastre | Cadastre | Cadastre | Keep in English/French |
| Registrar | Registraire | Mai Rajista | Official who registers |
| Verification | Vérification | Tabbatarwa | Confirmation process |
| Transaction | Transaction | Ciniki | Property transfer |
| Blockchain | Blockchain | Blockchain | Keep in English |

**UI Terms:**
| English | French | Hausa | Notes |
|---------|--------|-------|-------|
| Dashboard | Tableau de bord | Allon Aiki | Main interface |
| Search | Rechercher | Bincika | Search function |
| Filter | Filtrer | Tace | Filter results |
| Export | Exporter | Fitar da | Export data |
| Loading | Chargement | Ana Lodi | Loading state |
| Error | Erreur | Kuskure | Error message |
| Success | Succès | Nasara | Success message |

### Translation Best Practices

**DO:**
- ✅ Use native speakers or professional translators when possible
- ✅ Test translations in the UI to ensure they fit
- ✅ Use gender-neutral language where applicable
- ✅ Include diacritical marks and special characters correctly
- ✅ Maintain the same tone and formality level as English
- ✅ Verify technical terms with domain experts

**DON'T:**
- ❌ Use machine translation without human review
- ❌ Translate proper nouns (e.g., "Polygon Mumbai", "MetaMask")
- ❌ Change the meaning or add/remove information
- ❌ Use offensive or culturally inappropriate language
- ❌ Ignore context and translate word-by-word
- ❌ Mix languages within a single translation

---

## How to Add Translations

### Step 1: Extract Translation Keys

Extract all translation keys from the codebase:

```bash
cd /home/ubuntu/idlr-pts-platform

# Extract all t() function calls
find client/src/pages -name "*.tsx" -exec grep -oh "t('[^']*')" {} \; \
  | sed "s/t('//g" | sed "s/')//g" | sort -u > translation_keys.txt

# Count total keys
wc -l translation_keys.txt
```

### Step 2: Create Language File

Create a new JSON file for the target language:

```bash
# Example: Create Yoruba translation file
touch public/locales/yo.json
```

### Step 3: Structure the JSON

Use the hierarchical key structure:

```json
{
  "common": {
    "loading": "Ṣiṣẹ́...",
    "error": "Àṣìṣe",
    "success": "Àṣeyọrí"
  },
  "home": {
    "hero": {
      "title": "Ètò Ìforúkọsílẹ̀ Ilẹ̀ Dígítà",
      "subtitle": "Ètò àkọsílẹ̀ ilẹ̀ tí ó ní ààbò"
    }
  }
}
```

### Step 4: Translate Content

**For Professional Translation:**
1. Export English JSON to spreadsheet format
2. Send to professional translator with context
3. Review translated content
4. Import back to JSON format

**For Community Translation:**
1. Use translation management platform (e.g., Crowdin, Lokalise)
2. Invite community members to contribute
3. Review and approve translations
4. Export to JSON format

**For Machine-Assisted Translation:**
1. Use AI translation with human review
2. Provide context for each key
3. Review for accuracy and cultural appropriateness
4. Test in the UI

### Step 5: Test Translations

1. Start the development server:
```bash
pnpm dev
```

2. Change language in the UI (Language Selector dropdown)

3. Navigate through all pages and verify:
   - ✅ All text is translated
   - ✅ Text fits in UI elements (no overflow)
   - ✅ Special characters display correctly
   - ✅ RTL layout works (for Arabic/Amharic)
   - ✅ Formatting is correct (dates, numbers, currency)

4. Check browser console for missing translation warnings

### Step 6: Submit for Review

1. Create a pull request with the new translation file
2. Include screenshots of translated pages
3. Note any UI adjustments needed for the language
4. Request review from native speaker

---

## Translation Tools & Resources

### Recommended Tools

**Translation Management:**
- [Crowdin](https://crowdin.com/) - Collaborative translation platform
- [Lokalise](https://lokalise.com/) - Translation management system
- [POEditor](https://poeditor.com/) - Localization management platform

**Machine Translation (with human review):**
- [DeepL](https://www.deepl.com/) - High-quality machine translation
- [Google Translate](https://translate.google.com/) - General-purpose translation
- [Microsoft Translator](https://www.microsoft.com/translator/) - Enterprise translation

**Quality Assurance:**
- [i18n-tasks](https://github.com/glebm/i18n-tasks) - Find missing translations
- [i18next-parser](https://github.com/i18next/i18next-parser) - Extract translation keys
- [Translation Checker](https://www.freetranslation.com/) - Verify translations

### Language Resources

**Yoruba:**
- [Yoruba Language Resources](https://www.yorubaname.com/)
- [Yoruba Dictionary](https://www.yorubadictionary.com/)

**Igbo:**
- [Igbo Dictionary](https://www.igbodictionary.com/)
- [Igbo Language Resources](https://www.igboguide.org/)

**Hausa:**
- [Hausa Dictionary](https://hausadictionary.com/)
- [Hausa Language Resources](https://www.hausa.info/)

**Swahili:**
- [Kamusi Project](https://kamusi.org/) - Swahili dictionary
- [Swahili Language Resources](https://www.swahililanguage.com/)

**Amharic:**
- [Amharic Dictionary](https://www.amharicdictionary.com/)
- [Amharic Language Resources](https://www.ethiopianlanguage.com/)

**Arabic:**
- [Reverso Context](https://context.reverso.net/translation/arabic-english/) - Contextual translation
- [Almaany Dictionary](https://www.almaany.com/) - Arabic dictionary

---

## Automated Translation Script

For rapid initial translation (requires human review), use this script:

```bash
#!/bin/bash
# translate.sh - Automated translation script

LANG_CODE=$1  # e.g., yo, ig, sw
LANG_NAME=$2  # e.g., Yoruba, Igbo, Swahili

if [ -z "$LANG_CODE" ] || [ -z "$LANG_NAME" ]; then
  echo "Usage: ./translate.sh <lang_code> <lang_name>"
  echo "Example: ./translate.sh yo Yoruba"
  exit 1
fi

echo "Generating $LANG_NAME translations..."

# Create translation file
cat > "public/locales/${LANG_CODE}.json" << EOF
{
  "common": {
    "loading": "Loading...",
    "error": "Error",
    "success": "Success"
  }
}
EOF

echo "✅ Created public/locales/${LANG_CODE}.json"
echo "⚠️  Please review and complete translations manually"
```

---

## Maintenance & Updates

### Adding New Features

When adding new features with UI text:

1. **Define translation keys** in the component:
```typescript
const { t } = useTranslation();
<h1>{t('newFeature.title')}</h1>
```

2. **Add English translations** to `en.json`:
```json
{
  "newFeature": {
    "title": "New Feature Title"
  }
}
```

3. **Update all language files** with the new keys

4. **Test in all languages** to ensure nothing breaks

### Updating Existing Translations

1. Update the English version first
2. Mark updated keys in other language files
3. Request re-translation from translators
4. Test updated translations in the UI

### Quality Assurance Checklist

Before releasing translations:

- [ ] All translation keys have values (no missing translations)
- [ ] Text fits in UI elements (no overflow or truncation)
- [ ] Special characters display correctly
- [ ] RTL layout works for Arabic and Amharic
- [ ] Date/time formatting is correct for locale
- [ ] Currency formatting uses correct symbols
- [ ] Numbers use correct decimal/thousand separators
- [ ] Pluralization rules are correctly implemented
- [ ] Gender-specific language is handled appropriately
- [ ] Technical terms are consistent across the platform
- [ ] Native speaker has reviewed the translations
- [ ] No machine translation artifacts remain

---

## Priority Translation Roadmap

### Phase 1: Core UI (High Priority)

**Target: 2 weeks**

1. Complete English base language (all 213 keys)
2. Translate common UI elements to all 9 languages
3. Translate Home page to all 9 languages
4. Translate Dashboard to all 9 languages

**Estimated Effort:** 40 hours (professional translator)

### Phase 2: User-Facing Pages (Medium Priority)

**Target: 3 weeks**

1. Search Parcels page
2. Parcel Details page
3. Transaction pages
4. User Profile page

**Estimated Effort:** 30 hours (professional translator)

### Phase 3: Admin Pages (Lower Priority)

**Target: 4 weeks**

1. Admin Dashboard
2. User Management
3. Verification Workflow
4. Reporting Dashboard
5. Security Monitoring
6. Document Validation
7. Verification Analytics
8. Blockchain Transactions

**Estimated Effort:** 50 hours (professional translator)

### Phase 4: Documentation & Help (Future)

1. Help documentation
2. Tooltips and hints
3. Error messages
4. Email templates
5. SMS templates

**Estimated Effort:** 20 hours (professional translator)

---

## Budget Estimates

**Professional Translation Services:**

| Language | Rate (per word) | Total Words | Estimated Cost |
|----------|-----------------|-------------|----------------|
| French | $0.10 | 5,000 | $500 |
| Hausa | $0.12 | 5,000 | $600 |
| Yoruba | $0.15 | 5,000 | $750 |
| Igbo | $0.15 | 5,000 | $750 |
| Nigerian Pidgin | $0.15 | 5,000 | $750 |
| Swahili | $0.12 | 5,000 | $600 |
| Amharic | $0.18 | 5,000 | $900 |
| Arabic | $0.12 | 5,000 | $600 |
| **Total** | | **40,000** | **$5,450** |

**Alternative: Community Translation (Free)**
- Recruit volunteers from target language communities
- Use translation management platform (Crowdin free tier)
- Professional review: $1,000 total

---

## Contact & Support

For translation questions or contributions:

- **Technical Issues**: Check i18next documentation
- **Translation Contributions**: Submit pull requests with translations
- **Professional Translation**: Contact translation@idlr-pts.org (example)
- **Community Translation**: Join our Crowdin project (to be set up)

---

**Last Updated**: February 19, 2026  
**Maintained By**: IDLR-PTS Development Team  
**Version**: 1.0
