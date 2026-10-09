import { useLanguage } from '../context/LanguageContext';

export default function LanguageSwitcher() {
  const { lang, setLang, languages, t } = useLanguage();
  return (
    <select
      className="lang-switcher"
      aria-label={t('nav.language')}
      title={t('nav.language')}
      value={lang}
      onChange={(e) => setLang(e.target.value)}
    >
      {languages.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  );
}