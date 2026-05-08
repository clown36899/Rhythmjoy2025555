const fetch = require('node-fetch'); // wait, fetch is built-in in Node 18+
async function check() {
  const urls = [
    'https://www.spacecloud.kr/search?q=사당',
    'https://www.spacecloud.kr/search/space?q=사당',
    'https://www.spacecloud.kr/search?keyword=사당',
    'https://www.spacecloud.kr/search?searchKeyword=사당'
  ];
  for (let url of urls) {
    const res = await fetch(url);
    console.log(url, res.status);
  }
}
check();
