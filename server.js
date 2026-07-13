/**
 * Prosciutki, lokalny serwer statyczny - zero zaleznosci, zero logowania, zero kluczy API.
 * Sluzy wylacznie do tego, zeby przegladarka mogla poprawnie wczytac pliki data/*.json
 * (przy otwarciu index.html bezposrednio z dysku - protokol file:// - przegladarki
 * czesto blokuja fetch() do lokalnych plikow JSON ze wzgledow bezpieczenstwa).
 *
 * Uruchomienie:  node server.js
 * Potem otworz:  http://localhost:3000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 - nie znaleziono pliku');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Wyszukiwarka zaburzen psychicznych dziala na http://localhost:${PORT}`);
  console.log('Serwer jest wylacznie lokalny - zaden klucz API ani logowanie nie sa potrzebne.');
});
