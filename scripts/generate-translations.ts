import { invokeLLM } from '../server/_core/llm';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TranslationConfig {
  code: string;
  name: string;
  nativeName: string;
  isRTL: boolean;
}

const languages: TranslationConfig[] = [
  { code: 'fr', name: 'French', nativeName: 'Français', isRTL: false },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', isRTL: false },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá', isRTL: false },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo', isRTL: false },
  { code: 'pcm', name: 'Nigerian Pidgin', nativeName: 'Naijá', isRTL: false },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', isRTL: false },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', isRTL: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', isRTL: true },
];

async function translateContent(content: string, targetLanguage: string, languageName: string, isRTL: boolean): Promise<string> {
  const prompt = `You are a professional translator specializing in land registry and property management systems.

Translate the following JSON content from English to ${languageName} (${targetLanguage}).

IMPORTANT GUIDELINES:
1. Maintain the exact JSON structure - only translate the VALUES, never the KEYS
2. Keep technical terms in English when no local equivalent exists (e.g., "blockchain", "API", "dashboard")
3. Use formal, professional language appropriate for government land registry systems
4. Preserve all placeholders, variables, and formatting (e.g., "e.g., Production Server")
5. Ensure translations are culturally appropriate for African contexts
6. For land registry terms, use established terminology from ${languageName} legal/administrative systems
7. Keep translations concise to fit UI constraints
${isRTL ? '8. This is a RIGHT-TO-LEFT language - ensure proper text direction' : ''}

Domain-specific terminology guidance:
- "Parcel" = land subdivision unit
- "Title Deed" = official ownership document
- "Survey Plan" = land measurement document
- "Registrar" = official who registers property
- "Verification" = confirmation/validation process
- "Transaction" = property transfer/sale

English JSON to translate:
${content}

Return ONLY the translated JSON with the same structure. Do not include any explanations or notes.`;

  const response = await invokeLLM({
    messages: [
      { role: 'system', content: 'You are a professional translator. Return only valid JSON without any markdown formatting or code blocks.' },
      { role: 'user', content: prompt }
    ],
  });

  let translatedText = response.choices[0].message.content.trim();
  
  // Remove markdown code blocks if present
  translatedText = translatedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  
  return translatedText;
}

async function generateTranslations() {
  console.log('🌍 Starting translation generation for IDLR-PTS platform\n');

  // Read English source file
  const enPath = path.join(__dirname, '../public/locales/en.json');
  const enContent = fs.readFileSync(enPath, 'utf-8');
  const enJson = JSON.parse(enContent);

  console.log(`📖 Loaded English source file with ${Object.keys(enJson).length} sections\n`);

  // Generate translations for each language
  for (const lang of languages) {
    console.log(`🔄 Translating to ${lang.name} (${lang.code})...`);
    
    try {
      const translatedContent = await translateContent(
        JSON.stringify(enJson, null, 2),
        lang.code,
        lang.name,
        lang.isRTL
      );

      // Validate JSON
      const translatedJson = JSON.parse(translatedContent);

      // Save to file
      const outputPath = path.join(__dirname, `../public/locales/${lang.code}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(translatedJson, null, 2), 'utf-8');

      console.log(`✅ ${lang.name} translation saved to ${lang.code}.json`);
      console.log(`   Sections: ${Object.keys(translatedJson).length}`);
      console.log(`   Keys: ${countKeys(translatedJson)}\n`);

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`❌ Error translating to ${lang.name}:`, error);
      console.error(`   Skipping ${lang.code}.json\n`);
    }
  }

  console.log('\n🎉 Translation generation complete!');
  console.log(`\n📊 Summary:`);
  console.log(`   Languages processed: ${languages.length}`);
  console.log(`   Total translation files: ${languages.length + 1} (including English)`);
}

function countKeys(obj: any, count = 0): number {
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      count = countKeys(obj[key], count);
    } else {
      count++;
    }
  }
  return count;
}

// Run the script
generateTranslations()
  .then(() => {
    console.log('\n✨ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
