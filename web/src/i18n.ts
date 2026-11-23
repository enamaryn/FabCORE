import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import ICU from 'i18next-icu';
import { readPreference } from './preferences.ts';

const modules = import.meta.glob<{ default: Record<string, unknown> }>('../locales/*/*.json', { eager: true });
export const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, module] of Object.entries(modules)) {
  const [, language, namespace] = /locales\/([^/]+)\/([^/]+)\.json$/.exec(path) ?? [];
  if (language && namespace) (resources[language] ??= {})[namespace] = module.default;
}
export const i18n = createInstance();
export async function initializeI18n() {
  await i18n.use(ICU).use(initReactI18next).init({
    resources, lng: readPreference('fabcore-lang', navigator.language.split('-')[0] ?? 'fr'),
    fallbackLng: ['en', 'fr'], defaultNS: 'common', interpolation: { escapeValue: false },
  });
}
