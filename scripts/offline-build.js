const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });

fs.writeFileSync(path.join(dist, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HT Auctions West Coast</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0D1B2A;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card { text-align: center; max-width: 420px; width: 100%; }
    .icon { font-size: 64px; margin-bottom: 24px; }
    h1 { font-size: 28px; font-weight: 800; color: #E07B39; margin-bottom: 12px; }
    p { font-size: 16px; color: #9CA3AF; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔨</div>
    <h1>HT Auctions West Coast</h1>
    <p>This site is currently offline.<br>Please check back soon.</p>
  </div>
</body>
</html>
`);

console.log('Offline page written to dist/index.html');
