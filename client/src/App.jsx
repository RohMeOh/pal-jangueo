import { useEffect, useState } from 'react';

function App() {
  const [api, setApi] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then((response) => {
        if (!response.ok) {
          throw new Error('API unavailable');
        }
        return response.json();
      })
      .then((data) => setApi(data))
      .catch(() => setError(true));
  }, []);

  return (
    <main>
      <h1>Pa'l Jangueo 🇵🇷</h1>
      <h2>Descubre la música local de Puerto Rico</h2>

      {api ? (
        <div>
          <p>✅ Frontend conectado al backend</p>
          <p>Aplicación: {api.application}</p>
          <p>Servicio: {api.service}</p>
          <p>Estado: {api.status}</p>
        </div>
      ) : error ? (
        <p>❌ No se pudo conectar con el backend.</p>
      ) : (
        <p>Conectando con el servidor...</p>
      )}
    </main>
  );
}

export default App;
