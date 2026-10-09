import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LANGUAGES, TRANSLATIONS } from '../i18n/translations';
import { NAMES } from '../i18n/names';

const LanguageContext = createContext(null);
const STORAGE_KEY = 'smartserve_lang';
const NAME_CACHE_KEY = 'smartserve_names_v1';

function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && TRANSLATIONS[saved]) return saved;
    const guess = (navigator.language || 'en').slice(0, 2);
    if (TRANSLATIONS[guess]) return guess;
  } catch { /* storage unavailable */ }
  return 'en';
}

function loadNameCache() {
  try { return JSON.parse(localStorage.getItem(NAME_CACHE_KEY)) || {}; } catch { return {}; }
}

// Transliterates a proper name (e.g. "Home Food" -> "होम फूड") using Google's
// public Input Tools endpoint. Best-effort: on any failure the original name is kept.
async function transliterate(text, lang) {
  const url = `https://inputtools.google.com/request?text=${encodeURIComponent(text)}`
    + `&itc=${lang}-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=smartserve`;
  const res = await fetch(url);
  const data = await res.json();
  if (data[0] !== 'SUCCESS') throw new Error('no result');
  return data[1][0][1][0];
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);
  const [nameVersion, setNameVersion] = useState(0);
  const nameCache = useRef(loadNameCache());
  const pending = useRef(new Set());

  useEffect(() => {
    document.documentElement.lang = lang;
    const brand = TRANSLATIONS[lang]?.brand || 'SmartServe';
    document.title = (TRANSLATIONS[lang]?.['page.title'] || TRANSLATIONS.en['page.title']).replace('{brand}', brand);
  }, [lang]);

  const setLang = useCallback((code) => {
    if (!TRANSLATIONS[code]) return;
    setLangState(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
  }, []);

  // t('key', { n: 3 }) -> translated string; falls back to English, then the key.
  // {brand} is always available (SmartServe written in the current script).
  const t = useCallback((key, vars) => {
    let str = TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
    const all = { brand: TRANSLATIONS[lang]?.brand || TRANSLATIONS.en.brand, ...vars };
    Object.entries(all).forEach(([k, v]) => { str = str.replaceAll(`{${k}}`, v); });
    return str;
  }, [lang]);

  // tn('Burger Barn') -> name in the current language's script.
  // Order: built-in list -> cached transliteration -> fetch one (shows English meanwhile).
  const tn = useCallback((text) => {
    if (!text || lang === 'en') return text;
    const known = NAMES[lang]?.[text];
    if (known) return known;
    const key = `${lang}|${text}`;
    if (nameCache.current[key]) return nameCache.current[key];
    if (!pending.current.has(key)) {
      pending.current.add(key);
      transliterate(text, lang)
        .then((out) => {
          nameCache.current[key] = out;
          try { localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(nameCache.current)); } catch { /* ignore */ }
          setNameVersion((v) => v + 1);
        })
        .catch(() => { /* keep original text */ });
    }
    return text;
    // nameVersion makes consumers pick up newly cached names
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, nameVersion]);

  const value = useMemo(() => ({ lang, setLang, t, tn, languages: LANGUAGES }), [lang, setLang, t, tn]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}