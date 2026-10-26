import { useEffect, useState } from 'react';
import EventFeed from './components/EventFeed';
import BackToTop from './components/BackToTop';
import { t } from './i18n';

function App() {
  const [language, setLanguage] = useState(() => {
    try {
      return window.localStorage.getItem('pj-language') === 'en' ? 'en' : 'es';
    } catch {
      return 'es';
    }
  });

  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'es-PR';
    document.title = `Pa'l Jangueo | ${t(language, 'La isla suena. Sigue la música.')}`;
    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute('content', language === 'en'
        ? "Pa'l Jangueo: discover Puerto Rico's live music scene. The island has its own sound. Follow the music."
        : "Pa'l Jangueo: descubre la escena musical en vivo de Puerto Rico. La isla suena. Sigue la música.");
    }
    try {
      window.localStorage.setItem('pj-language', language);
    } catch {
      // Browser may block local storage. Language still works for this visit.
    }
  }, [language]);

  return (
    <>
      <EventFeed language={language} onLanguageChange={setLanguage} />
      <BackToTop language={language} />
    </>
  );
}

export default App;
