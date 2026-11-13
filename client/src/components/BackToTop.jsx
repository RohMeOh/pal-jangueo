import { useEffect, useState } from 'react';
import './BackToTop.css';
import './IconAction.css';
import { t } from '../i18n';

const SHOW_AFTER_PX = 420;

export default function BackToTop({ language }) {
  const [visible, setVisible] = useState(false);
  const [footerPosition, setFooterPosition] = useState(null);

  useEffect(() => {
    let frame = 0;

    function updatePosition() {
      setVisible(window.scrollY > SHOW_AFTER_PX);

      const footer = document.querySelector('.pj-site-footer');

      if (!footer) {
        setFooterPosition(null);
        return;
      }

      const lineY = footer.getBoundingClientRect().top;
      const radius = 23;
      const mobile = window.matchMedia('(max-width: 620px)').matches;
      const defaultBottom = 50;

      if (mobile) {
        // Keep the button fixed to the viewport on small screens.
        setFooterPosition(null);
        return;
      }

      // Preserve the existing desktop behavior.
      const alignWithFooter =
        lineY >= radius &&
        lineY <= window.innerHeight - defaultBottom - radius;

      setFooterPosition(alignWithFooter
        ? { bottom: `${Math.round(window.innerHeight - lineY - radius)}px` }
        : null
      );
    }

    function scheduleUpdate() {
      if (frame) return;

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updatePosition();
      });
    }

    const observer = new ResizeObserver(scheduleUpdate);

    for (const selector of ['.pj-discovery', '.pj-site-footer']) {
      const element = document.querySelector(selector);
      if (element) observer.observe(element);
    }

    const viewport = window.visualViewport;

    updatePosition();

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    viewport?.addEventListener('resize', scheduleUpdate);
    viewport?.addEventListener('scroll', scheduleUpdate);

    return () => {
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      viewport?.removeEventListener('resize', scheduleUpdate);
      viewport?.removeEventListener('scroll', scheduleUpdate);
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
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
      style={footerPosition || undefined}
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
