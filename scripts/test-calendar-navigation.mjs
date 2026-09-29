// Run against a local Vite server: CALENDAR_TEST_BASE_URL=http://localhost:5199 node scripts/test-calendar-navigation.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.CALENDAR_TEST_BASE_URL || 'http://localhost:5199';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local test server');
const makeEvent = (id, title, date, category = 'event', extra = {}) => ({
  id, title, date, start_date: date, end_date: date, category, genre: '스윙', dance_scope: 'swing',
  location: '검증홀', venue_name: '검증홀', image: '', price: '', organizer: '', ...extra,
});
const events = [
  makeEvent(701, '기간 행사 검증', '2099-10-08', 'event', {event_dates: ['2099-10-08', '2099-10-09'], end_date: '2099-10-09'}),
  makeEvent(702, '다른 기간 행사 검증', '2099-10-08', 'event', {event_dates: ['2099-10-08', '2099-10-09'], end_date: '2099-10-09'}),
  makeEvent('fixture-class', '강습 검증', '2099-10-08', 'class'),
  makeEvent('fixture-legacy', '레거시 강습 검증', '2099-10-08', 'club_lesson'),
  ...Array.from({length:31}, (_, i) => makeEvent(`social-${i + 1}`, `소셜 검증 ${i + 1}`, `2099-10-${String(i + 1).padStart(2,'0')}`, 'social')),
];
const browser = await chromium.launch({headless:true});
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({viewport:{width,height:900}, isMobile:width===390, hasTouch:width===390});
    await page.clock.setFixedTime(new Date('2099-10-01T12:00:00+09:00'));
    const errors=[]; page.on('pageerror', error => errors.push(error.message));
    let rejectEventReads = false;
    let eventReads = 0;
    await page.route(/\/(?:prod-api\/)?api\/events(?:[/?]|$)/, async route => {
      const url = new URL(route.request().url());
      const id = decodeURIComponent(url.pathname.split('/api/events/')[1] || '');
      if (id) {
        eventReads++;
        if(rejectEventReads) return route.fulfill({status:503, json:{error:'deliberate test read failure'}});
        return route.fulfill({json:{event:events.find(e=>String(e.id)===id) || null}});
      }
      // Exercise navigation before data and layout are ready.
      await new Promise(resolve => setTimeout(resolve, 800));
      return route.fulfill({json:{events}});
    });
    const verifyCalendar = async () => {
      await page.locator('.calendar-page-container').waitFor({state:'visible'});
      await page.getByText('기간 행사 검증',{exact:true}).first().waitFor({state:'visible'});
      assert.equal(await page.locator('.calendar-filter-switch').count(), 0);
      assert.equal(await page.locator('.calendar-live-topbar-title').getAttribute('aria-label'), '2099년 10월 선택');
      await page.locator('[data-event-id="fixture-class"]').first().waitFor({state:'visible'});
      await page.locator('[data-event-id="fixture-legacy"]').first().waitFor({state:'visible'});
      await page.locator('[data-event-id="social-8"]').first().waitFor({state:'visible'});
    };
    const verifyDatePosition = async () => {
      await page.waitForFunction(() => {
        const cell=document.querySelector('.calendar-cell-fullscreen[data-date="2099-10-08"]');
        const rect=cell?.getBoundingClientRect();
        return rect && rect.top >= 0 && rect.top < window.innerHeight / 2;
      });
    };
    await page.goto(`${base}/calendar?date=2099-10-08&category=classes`);
    await verifyCalendar(); await verifyDatePosition();
    for (let attempt=0;attempt<2;attempt++) {
      await page.getByText('기간 행사 검증',{exact:true}).first().click();
      const date=page.locator('.EDM-dateLink');await date.waitFor({state:'visible'});
      const readsBefore=eventReads;
      rejectEventReads=true;
      await date.click();
      await date.waitFor({state:'hidden'});
      assert.equal(new URL(page.url()).searchParams.get('id'),null);
      assert.equal(new URL(page.url()).searchParams.get('date'),'2099-10-08');
      assert.equal(new URL(page.url()).searchParams.get('category'),'all');
      assert.equal(new URL(page.url()).searchParams.get('highlight'),'701');
      await verifyCalendar(); await verifyDatePosition();
      await page.locator('.calendar-overlay-item.calendar-event-highlighted').filter({hasText:'기간 행사 검증'}).first().waitFor({state:'visible'});
      assert.equal(await page.locator('.calendar-overlay-item.calendar-event-highlighted').filter({hasText:'다른 기간 행사 검증'}).count(),0);
      assert.equal(await page.locator('.calendar-fullscreen-event-card .calendar-event-highlighted').count(),0);
      assert.equal(eventReads,readsBefore,'Date navigation must not refetch the event');
      rejectEventReads=false;
    }
    const scrollAfterNavigation=await page.evaluate(()=>window.scrollY);
    await page.locator('.calendar-event-highlighted').waitFor({state:'detached',timeout:6000});
    assert.equal(await page.evaluate(()=>window.scrollY),scrollAfterNavigation,'Highlight expiry must not move the calendar');
    // Single-day class and social cards share the same highlight, with string IDs.
    for(const id of ['fixture-class','social-8']) {
      await page.locator(`[data-event-id="${id}"]`).first().click();
      const date=page.locator('.EDM-dateLink');await date.waitFor({state:'visible'});await date.click();
      await date.waitFor({state:'hidden'});await verifyDatePosition();
      await page.locator(`[data-event-id="${id}"] .calendar-event-highlighted`).first().waitFor({state:'visible'});
      assert.equal(await page.locator('.calendar-overlay-item.calendar-event-highlighted').count(),0);
    }
    await page.goBack();await verifyCalendar();await verifyDatePosition();
    // Published notification and old highlight links still resolve, without auto-filtering.
    for(const query of ['id=701&highlightOnly=true&category=social','id=fixture-class&date=2099-10-08&category=classes']) {
      await page.goto(`${base}/calendar?${query}`);
      if(!query.includes('highlightOnly')) {
        const date=page.locator('.EDM-dateLink');await date.waitFor({state:'visible'});await date.click();
      }
      await verifyCalendar();await verifyDatePosition();
    }
    await page.goto(`${base}/calendar?view=list&category=classes`);
    await page.getByText('기간 행사 검증',{exact:true}).first().waitFor({state:'visible'}).catch(async error => {
      console.log('List failure state', await page.evaluate(() => ({url:location.href, today:new Date().toLocaleDateString('en-CA'), text:document.body.innerText.slice(-2000)})));
      throw error;
    });
    assert.ok(await page.getByText('강습 검증',{exact:true}).count());
    assert.ok(await page.getByText('레거시 강습 검증',{exact:true}).count());
    assert.equal(await page.locator('.calendar-filter-switch').count(),0);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}px: delayed load, range/class/social, repeated navigation/highlight without event reads, numeric/string IDs, span/class/social highlight, expiry without scroll, history, legacy links, list, no page errors`);
    await page.close();
  }
} finally {await browser.close();}
