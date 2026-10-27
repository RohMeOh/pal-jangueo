import { useEffect, useState } from 'react';
import './BackToTop.css';
import './IconAction.css';
import { t } from '../i18n';

const SHOW_AFTER_PX = 420;

export default function BackToTop({ language }) {
  const [visible, setVisible] = useState(false);
  const [footerLineBottom, setFooterLineBottom] = useState(null);

  useEffect(() => {
    function updatePosition() {
      setVisible(window.scrollY > SHOW_AFTER_PX);

      const footer = document.querySelector('.pj-site-footer');

      if (!footer) {
        setFooterLineBottom(null);
        return;
      }

      // Posición exacta de la línea superior del footer.
      const lineY = footer.getBoundingClientRect().top;

      // El círculo mide 46px: radio de 23px.
      const radius = 23;

      const mobile = window.matchMedia(
        '(max-width: 620px)'
      ).matches;

      const defaultBottom = mobile ? 24 : 50;

      const alignWithFooter =
        lineY >= radius &&
        lineY <= window.innerHeight - defaultBottom - radius;

      // El centro de la burbuja coincide con la línea.
      const nextBottom = alignWithFooter
        ? Math.round(window.innerHeight - lineY - radius)
        : null;

      setFooterLineBottom(nextBottom);
    }

    updatePosition();

    window.addEventListener('scroll', updatePosition, {
      passive: true
    });
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, []);

  function scrollToTop() {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  if (!visible) return null;

  return (
    <button
      type="button"
      className="pj-back-to-top pj-icon-action"
      style={footerLineBottom === null
        ? undefined
        : { bottom: `${footerLineBottom}px` }
      }
      onClick={scrollToTop}
      aria-label={t(language, 'Volver arriba')}
      title={t(language, 'Volver arriba')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 19V5m-6 6 6-6 6 6" />
      </svg>
    </button>
  );
}
