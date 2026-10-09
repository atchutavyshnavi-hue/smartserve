import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

// ← arrow that returns to the previous page (or `fallback` if the page was opened directly).
export default function BackButton({ fallback = '/' }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(fallback));
  return (
    <button type="button" className="back-btn" onClick={goBack} aria-label={t('od.back')}>
      <span aria-hidden="true">←</span> {t('od.back')}
    </button>
  );
}