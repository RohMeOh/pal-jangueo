import { useEffect, useRef } from 'react';
import { t } from '../i18n';

// Preview local: recupera solamente los elementos gráficos
// del arte aprobado y deja el fondo al CSS original.
export default function ApprovedHeroArt({ language }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    let active = true;
    const image = new Image();

    image.onload = () => {
      const canvas = canvasRef.current;
      if (!active || !canvas) return;

      const width = image.naturalWidth;
      const height = image.naturalHeight;

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d', {
        willReadFrequently: true
      });

      if (!context) return;

      context.drawImage(image, 0, 0);

      const frame = context.getImageData(
        0, 0, width, height
      );

      const pixels = frame.data;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;

          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];

          const inside =
            (x >= 55 && x < 350 && y >= 72 && y < 148) ||
            (x >= 1250 && x < 1370 && y >= 42 && y < 150) ||
            (x >= 45 && x < 900 && y >= 195 && y < 570) ||
            (x >= 900 && x < 1090 && y >= 288 && y < 510) ||
            (x >= 1120 && x < 1360 && y >= 280 && y < 445) ||
            (x >= 1040 && x < 1360 && y >= 415 && y < 590) ||
            (x >= 50 && x < 1190 && y >= 640 && y < 920);

          // Eliminar el fondo y el borde incorporados
          // en la imagen, manteniendo barras y textos.
          pixels[i + 3] = 0;

          if (!inside) continue;

          // El texto original se sustituye por HTML
          // para permitir el cambio de idioma.
          const embeddedText =
            (x >= 40 && x < 480 &&
             y >= 55 && y < 180) ||
            (x >= 45 && x < 1230 &&
             y >= 620 && y < 930);

          if (embeddedText) continue;

          const white =
            r > 29 && g > 30 && b > 30 &&
            Math.abs(r - g) < 28 &&
            Math.abs(g - b) < 37;

          const cyan =
            g > 66 && b > 89 &&
            b > r + 55 && g > r + 50;

          const red =
            r > 37 && r > g + 23 && r > b + 10;

          if (white) {
            pixels[i] = 248;
            pixels[i + 1] = 250;
            pixels[i + 2] = 252;
            pixels[i + 3] = Math.max(
              0, Math.min(255, (r - 11) / 242 * 255)
            );
          }

          if (cyan) {
            pixels[i] = 19;
            pixels[i + 1] = 197;
            pixels[i + 2] = 255;
            pixels[i + 3] = Math.max(
              0, Math.min(255, (g - 17) / 180 * 255)
            );
          }

          if (red) {
            pixels[i] = 255;
            pixels[i + 1] = 23;
            pixels[i + 2] = 68;
            pixels[i + 3] = Math.max(
              0, Math.min(255, (r - 7) / 248 * 255)
            );
          }
        }
      }

      context.putImageData(frame, 0, 0);
    };

    image.src = '/pal-jangueo-hero-aprobado.webp';

    return () => {
      active = false;
      image.onload = null;
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pj-approved-hero-image"
        width="1408"
        height="955"
        aria-hidden="true"
      />

      <span
        className="pj-approved-art-eyebrow"
        aria-hidden="true"
      >
        {t(language, 'EN VIVO · PR')}
      </span>

      <div
        className="pj-approved-art-copy"
        aria-hidden="true"
      >
        <span>
          {t(language, 'Todos los ritmos.')}
        </span>
        <strong>
          {t(language, 'Un solo archipiélago.')}
        </strong>
      </div>
    </>
  );
}
