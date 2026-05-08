const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(__dirname, 'viewer.html')));
  } else if (req.url === '/api/data') {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify([]));
    }
    
    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('naver_results_') && f.endsWith('.json'));
    if (files.length === 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify([]));
    }
    
    // 가장 최신 파일 가져오기
    files.sort().reverse();
    const latestFile = files[0];
    const data = fs.readFileSync(path.join(dataDir, latestFile), 'utf-8');
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(data);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`📊 데이터 뷰어 서버가 실행되었습니다: http://localhost:${PORT}`);
});
