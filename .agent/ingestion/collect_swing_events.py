#!/usr/bin/env python3
"""스윙댄스 이벤트 수집 스크립트 - 2026-06-11"""

import asyncio
import hashlib
import json
import os
import re
import sys
import time
import subprocess
import tempfile
from datetime import datetime, date

from playwright.async_api import async_playwright

# ── 설정 ──────────────────────────────────────────────────────────────────────
TODAY = date(2026, 6, 11)
TODAY_STR = "2026-06-11"
NETLIFY_API = "https://swingenjoy.com/.netlify/functions/scraped-events"
SUPABASE_URL = "https://mkoryudscamnopvxdelk.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE"

# 이미 DB에 있는 게시물 ID
SKIP_IDS = {"155957", "156147", "156272", "156348", "53903", "54730", "55138"}

# 이미 DB에 있는 소스
SKIP_SOURCES = [
    "cafe.naver.com/f-e/cafes/10342583/menus/13",
    "cafe.naver.com/f-e/cafes/10026855/menus/85",
    "cafe.naver.com/f-e/cafes/10342583/menus/264",
]

results = {
    "new": 0,
    "skipped": 0,
    "inaccessible": [],
    "collected": [],
    "issues": []
}

def make_id(source_url: str, date_str: str) -> str:
    raw = f"{source_url}|{date_str}"
    return hashlib.md5(raw.encode()).hexdigest()[:16]

def log(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def upload_image_to_supabase(image_url: str, filename: str) -> str | None:
    """이미지를 다운로드하고 Supabase Storage에 업로드"""
    try:
        tmp_path = f"/tmp/{filename}"
        # 이미지 다운로드
        r = subprocess.run(
            ["curl", "-s", "-L", "--max-time", "15", "-o", tmp_path, image_url],
            capture_output=True, timeout=20
        )
        if r.returncode != 0:
            log(f"  이미지 다운로드 실패: {image_url}")
            return None
        
        # 파일 타입 확인
        fr = subprocess.run(["file", tmp_path], capture_output=True, text=True)
        ftype = fr.stdout.lower()
        if "jpeg" in ftype or "jpg" in ftype:
            ct = "image/jpeg"
            ext = ".jpg"
        elif "png" in ftype:
            ct = "image/png"
            ext = ".png"
        elif "gif" in ftype:
            ct = "image/gif"
            ext = ".gif"
        elif "webp" in ftype:
            ct = "image/webp"
            ext = ".webp"
        else:
            log(f"  알 수 없는 이미지 타입: {ftype[:50]}")
            return None
        
        # 파일 크기 확인
        size = os.path.getsize(tmp_path)
        if size < 1000:
            log(f"  이미지 너무 작음: {size}bytes")
            return None
        
        # 파일명에 확장자 추가
        if not filename.endswith(ext):
            new_path = tmp_path + ext
            os.rename(tmp_path, new_path)
            tmp_path = new_path
            filename = filename + ext
        
        # Supabase 업로드
        upload_url = f"{SUPABASE_URL}/storage/v1/object/scraped/{filename}"
        ur = subprocess.run([
            "curl", "-s", "-X", "POST", upload_url,
            "-H", f"apikey: {SUPABASE_KEY}",
            "-H", f"Authorization: Bearer {SUPABASE_KEY}",
            "-H", f"Content-Type: {ct}",
            "-H", "x-upsert: true",
            "--data-binary", f"@{tmp_path}"
        ], capture_output=True, text=True, timeout=30)
        
        resp = ur.stdout
        if '"Key"' in resp or '"key"' in resp or "scraped/" in resp:
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/scraped/{filename}"
            log(f"  이미지 업로드 성공: {public_url}")
            return public_url
        else:
            log(f"  이미지 업로드 실패: {resp[:100]}")
            return None
    except Exception as e:
        log(f"  이미지 처리 오류: {e}")
        return None

def insert_event(event_data: dict) -> bool:
    """Netlify API로 이벤트 삽입"""
    try:
        payload = json.dumps(event_data, ensure_ascii=False)
        r = subprocess.run([
            "curl", "-s", "-X", "POST", NETLIFY_API,
            "-H", "Content-Type: application/json",
            "-d", payload
        ], capture_output=True, text=True, timeout=30)
        
        resp = r.stdout
        log(f"  API 응답: {resp[:150]}")
        
        # 성공 체크
        if '"id"' in resp or '"success"' in resp or r.returncode == 0:
            try:
                j = json.loads(resp)
                if "error" in j and j["error"]:
                    log(f"  삽입 실패: {j['error']}")
                    return False
                return True
            except:
                if resp and "error" not in resp.lower():
                    return True
        return False
    except Exception as e:
        log(f"  삽입 오류: {e}")
        return False

def check_l3_duplicate(event_id: str) -> bool:
    """L3 중복 체크: Supabase에서 해당 ID가 있는지 확인"""
    try:
        r = subprocess.run([
            "curl", "-s",
            f"{SUPABASE_URL}/rest/v1/scraped_events?id=eq.{event_id}&select=id",
            "-H", f"apikey: {SUPABASE_KEY}",
            "-H", f"Authorization: Bearer {SUPABASE_KEY}"
        ], capture_output=True, text=True, timeout=15)
        resp = r.stdout.strip()
        if resp == "[]" or resp == "":
            return False  # 중복 아님
        return True  # 이미 있음
    except:
        return False

async def extract_best_image(page, context="naver") -> str | None:
    """페이지에서 가장 큰 이미지 URL 추출"""
    try:
        if context == "naver":
            images = await page.evaluate("""
                () => {
                    const imgs = Array.from(document.querySelectorAll(
                        '.se-image-resource, img[src*="cafeptthumb"], img[src*="postfiles"]'
                    ));
                    return imgs.map(img => ({
                        src: img.src || img.getAttribute('src'),
                        naturalWidth: img.naturalWidth || 0,
                        naturalHeight: img.naturalHeight || 0,
                        area: (img.naturalWidth || 0) * (img.naturalHeight || 0)
                    })).filter(i => i.src && i.area > 0).sort((a,b) => b.area - a.area);
                }
            """)
            if images:
                return images[0]['src']
            
            # 폴백: 일반 이미지
            images = await page.evaluate("""
                () => {
                    const imgs = Array.from(document.querySelectorAll('img'));
                    return imgs.map(img => ({
                        src: img.src,
                        naturalWidth: img.naturalWidth || 0,
                        naturalHeight: img.naturalHeight || 0,
                        area: (img.naturalWidth || 0) * (img.naturalHeight || 0)
                    })).filter(i => i.src && i.area > 10000).sort((a,b) => b.area - a.area);
                }
            """)
            if images:
                return images[0]['src']
        else:  # daum
            images = await page.evaluate("""
                () => {
                    const imgs = Array.from(document.querySelectorAll('img'));
                    return imgs.map(img => ({
                        src: img.src,
                        naturalWidth: img.naturalWidth || 0,
                        naturalHeight: img.naturalHeight || 0,
                        area: (img.naturalWidth || 0) * (img.naturalHeight || 0)
                    })).filter(i => i.src && i.area > 5000 && !i.src.includes('profile') && !i.src.includes('thumb')).sort((a,b) => b.area - a.area);
                }
            """)
            if images:
                return images[0]['src']
    except Exception as e:
        log(f"  이미지 추출 오류: {e}")
    return None

def parse_korean_date(text: str) -> str | None:
    """한국어 날짜 텍스트에서 날짜 추출"""
    patterns = [
        r'(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})',
        r'(\d{1,2})[-./월\s]+(\d{1,2})',  # 월/일 (올해 기준)
        r'6월\s*(\d{1,2})일?',
        r'7월\s*(\d{1,2})일?',
        r'8월\s*(\d{1,2})일?',
        r'9월\s*(\d{1,2})일?',
    ]
    
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            groups = m.groups()
            if len(groups) == 3:
                y, mo, d = groups
                try:
                    dt = date(int(y), int(mo), int(d))
                    if dt >= TODAY:
                        return dt.strftime("%Y-%m-%d")
                except:
                    pass
            elif len(groups) == 2:
                mo, d = groups
                try:
                    dt = date(2026, int(mo), int(d))
                    if dt >= TODAY:
                        return dt.strftime("%Y-%m-%d")
                except:
                    pass
            elif len(groups) == 1:
                d = groups[0]
                # 월을 텍스트에서 파악
                if '6월' in text or '6/') in text:
                    mo = 6
                elif '7월' in text:
                    mo = 7
                elif '8월' in text:
                    mo = 8
                elif '9월' in text:
                    mo = 9
                else:
                    continue
                try:
                    dt = date(2026, mo, int(d))
                    if dt >= TODAY:
                        return dt.strftime("%Y-%m-%d")
                except:
                    pass
    return None

DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"]

def get_day_name(date_str: str) -> str:
    try:
        dt = date.fromisoformat(date_str)
        return DAY_NAMES[dt.weekday()]
    except:
        return ""

async def collect_naver_cafe(page, cafe_url: str, cafe_name: str, source_key: str):
    """네이버 카페 게시물 수집"""
    log(f"\n{'='*60}")
    log(f"[{cafe_name}] 수집 시작: {cafe_url}")
    
    # L1 소스 중복 체크 - 이미 있는 소스는 스킵
    for skip_src in SKIP_SOURCES:
        if skip_src in cafe_url:
            log(f"  이미 DB에 있는 소스 스킵: {skip_src}")
            results["skipped"] += 1
            return
    
    try:
        await page.goto(cafe_url, wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(3)
        
        # 로그인 요구 확인
        content = await page.content()
        if "로그인" in content and "게시글" not in content:
            log(f"  로그인 필요 - 로그인 없이 시도")
        
        # iframe 확인
        frames = page.frames
        log(f"  프레임 수: {len(frames)}")
        
        target_frame = None
        for frame in frames:
            fname = frame.name
            furl = frame.url
            log(f"  프레임: name={fname}, url={furl[:80]}")
            if "cafe_main" in fname or "ArticleList" in furl or "articles" in furl.lower():
                target_frame = frame
                break
        
        if target_frame is None:
            target_frame = page
        
        await asyncio.sleep(2)
        
        # 게시물 링크 추출
        links = await target_frame.evaluate("""
            () => {
                // 게시물 링크 찾기
                const anchors = Array.from(document.querySelectorAll('a[href*="articles"], a[href*="/ArticleRead"]'));
                return anchors.map(a => ({
                    href: a.href,
                    text: a.textContent.trim().substring(0, 100)
                })).filter(a => a.href && a.text.length > 2);
            }
        """)
        
        log(f"  게시물 링크 수: {len(links)}")
        
        if not links:
            # 페이지 HTML 일부 확인
            html = await target_frame.content()
            log(f"  페이지 HTML 일부: {html[:300]}")
            results["inaccessible"].append(f"{cafe_name}(링크 없음)")
            return
        
        # 중복 ID 필터링
        filtered_links = []
        for link in links[:10]:  # 최신 10개
            href = link['href']
            # 게시물 ID 추출
            id_match = re.search(r'/(\d+)(?:\?|$)', href)
            if id_match:
                post_id = id_match.group(1)
                if post_id in SKIP_IDS:
                    log(f"  스킵(이미존재): {post_id} - {link['text'][:40]}")
                    results["skipped"] += 1
                    continue
            filtered_links.append(link)
        
        log(f"  처리할 링크 수: {len(filtered_links)}")
        
        for link in filtered_links[:7]:  # 최대 7개 처리
            await process_naver_post(page, link['href'], link['text'], cafe_name, source_key)
            await asyncio.sleep(2)
            
    except Exception as e:
        log(f"  오류: {e}")
        results["inaccessible"].append(f"{cafe_name}({str(e)[:50]})")

async def process_naver_post(page, post_url: str, title: str, cafe_name: str, source_key: str):
    """네이버 카페 개별 게시물 처리"""
    log(f"\n  글 처리: {title[:50]} | {post_url[:80]}")
    
    try:
        await page.goto(post_url, wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(3)
        
        # iframe 내 본문 확인
        frames = page.frames
        content_frame = None
        for frame in frames:
            if "cafe_main" in frame.name or "ArticleRead" in frame.url:
                content_frame = frame
                break
        
        if content_frame is None:
            content_frame = page
        
        # 본문 텍스트 추출
        body_text = await content_frame.evaluate("""
            () => {
                const el = document.querySelector('.se-main-container, .article_container, #postListBody, .ContentRenderer');
                return el ? el.innerText : document.body.innerText;
            }
        """)
        
        if not body_text or len(body_text) < 20:
            log(f"    본문 없음 스킵")
            results["skipped"] += 1
            return
        
        log(f"    본문 길이: {len(body_text)}")
        log(f"    본문 일부: {body_text[:200]}")
        
        # 날짜 파싱
        event_date = parse_korean_date(body_text + " " + title)
        if not event_date:
            log(f"    날짜 파싱 실패 - 스킵")
            results["skipped"] += 1
            return
        
        log(f"    이벤트 날짜: {event_date}")
        
        # 날짜 필터 (미래인 경우만)
        try:
            if date.fromisoformat(event_date) < TODAY:
                log(f"    과거 날짜 스킵: {event_date}")
                results["skipped"] += 1
                return
        except:
            pass
        
        # ID 생성
        event_id = make_id(post_url, event_date)
        
        # L3 중복 체크
        if check_l3_duplicate(event_id):
            log(f"    L3 중복 스킵: {event_id}")
            results["skipped"] += 1
            return
        
        # 이미지 추출
        image_url = await extract_best_image(content_frame, "naver")
        
        if not image_url:
            log(f"    이미지 없음 - 삽입 금지 스킵")
            results["skipped"] += 1
            return
        
        log(f"    이미지: {image_url[:100]}")
        
        # 이미지 업로드
        img_filename = f"swing_{event_id}"
        poster_url = upload_image_to_supabase(image_url, img_filename)
        
        if not poster_url:
            log(f"    이미지 업로드 실패 - 삽입 금지 스킵")
            results["skipped"] += 1
            return
        
        # 이벤트 유형 판단
        event_type = "강습"
        activity_type = "class"
        if any(k in title + body_text for k in ["파티", "소셜", "사교", "social", "party"]):
            event_type = "파티"
            activity_type = "social"
        elif any(k in title + body_text for k in ["행사", "이벤트", "공연", "워크샵", "워크숍"]):
            event_type = "행사"
            activity_type = "event"
        
        # 장소 추출
        location_match = re.search(r'(?:장소|위치|venue)[:\s]*([^\n,]{3,30})', body_text)
        location = location_match.group(1).strip() if location_match else ""
        
        # 수강료 추출
        fee_match = re.search(r'(?:수강료|참가비|비용|fee)[:\s]*([^\n,]{2,20})', body_text)
        fee = fee_match.group(1).strip() if fee_match else ""
        
        # 이벤트 데이터 구성
        event_data = {
            "id": event_id,
            "keyword": "스윙강습",
            "source_url": post_url,
            "poster_url": poster_url,
            "extracted_text": body_text[:2000],
            "structured_data": {
                "date": event_date,
                "day": get_day_name(event_date),
                "title": title[:100],
                "event_type": event_type,
                "activity_type": activity_type,
                "genre_family": "partner",
                "dance_genre": "swing",
                "tags": [],
                "status": "정상운영",
                "djs": [],
                "times": [],
                "location": location,
                "fee": fee,
                "note": ""
            },
            "is_collected": False
        }
        
        # 삽입
        success = insert_event(event_data)
        
        if success:
            log(f"    ✅ 삽입 성공: {event_id}")
            results["new"] += 1
            results["collected"].append({
                "id": event_id,
                "title": title[:50],
                "date": event_date,
                "source": cafe_name,
                "url": post_url
            })
        else:
            log(f"    ❌ 삽입 실패")
            results["issues"].append(f"{title[:30]} - 삽입 실패")
            
    except Exception as e:
        log(f"    오류: {e}")
        results["issues"].append(f"{title[:30]} - {str(e)[:50]}")

async def collect_daum_cafe(page, cafe_url: str, cafe_name: str):
    """다음 카페 게시물 수집"""
    log(f"\n{'='*60}")
    log(f"[{cafe_name}] 수집 시작: {cafe_url}")
    
    try:
        await page.goto(cafe_url, wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(3)
        
        content = await page.content()
        log(f"  페이지 타이틀: {await page.title()}")
        
        # 게시물 링크 추출
        links = await page.evaluate("""
            () => {
                const anchors = Array.from(document.querySelectorAll('a[href*="/ArticleView"], a[href*="fldid"], a.tit_c, a.txt_area'));
                return anchors.map(a => ({
                    href: a.href,
                    text: a.textContent.trim().substring(0, 100)
                })).filter(a => a.href && a.text.length > 2);
            }
        """)
        
        log(f"  게시물 링크 수: {len(links)}")
        
        if not links:
            # 모바일 다음 카페 링크 패턴 시도
            links = await page.evaluate("""
                () => {
                    const anchors = Array.from(document.querySelectorAll('a'));
                    return anchors.map(a => ({
                        href: a.href,
                        text: a.textContent.trim().substring(0, 100)
                    })).filter(a => {
                        const h = a.href || '';
                        return (h.includes('ArticleView') || h.includes('daum.net/')) && a.text.length > 5;
                    });
                }
            """)
            log(f"  링크 재시도 수: {len(links)}")
        
        if not links:
            html_snippet = content[:500]
            log(f"  HTML 일부: {html_snippet}")
            results["inaccessible"].append(f"{cafe_name}(링크 없음)")
            return
        
        for link in links[:7]:
            await process_daum_post(page, link['href'], link['text'], cafe_name)
            await asyncio.sleep(2)
            
    except Exception as e:
        log(f"  오류: {e}")
        results["inaccessible"].append(f"{cafe_name}({str(e)[:50]})")

async def process_daum_post(page, post_url: str, title: str, cafe_name: str):
    """다음 카페 개별 게시물 처리"""
    log(f"\n  글 처리: {title[:50]} | {post_url[:80]}")
    
    try:
        await page.goto(post_url, wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(3)
        
        # 본문 텍스트 추출
        body_text = await page.evaluate("""
            () => {
                const el = document.querySelector('.article_view, .post_view, #content, .article-view');
                return el ? el.innerText : document.body.innerText;
            }
        """)
        
        if not body_text or len(body_text) < 20:
            log(f"    본문 없음 스킵")
            results["skipped"] += 1
            return
        
        log(f"    본문 길이: {len(body_text)}")
        log(f"    본문 일부: {body_text[:200]}")
        
        # 날짜 파싱
        event_date = parse_korean_date(body_text + " " + title)
        if not event_date:
            log(f"    날짜 파싱 실패 - 스킵")
            results["skipped"] += 1
            return
        
        # 날짜 필터
        try:
            if date.fromisoformat(event_date) < TODAY:
                log(f"    과거 날짜 스킵: {event_date}")
                results["skipped"] += 1
                return
        except:
            pass
        
        # ID 생성
        event_id = make_id(post_url, event_date)
        
        # L3 중복 체크
        if check_l3_duplicate(event_id):
            log(f"    L3 중복 스킵: {event_id}")
            results["skipped"] += 1
            return
        
        # 이미지 추출
        image_url = await extract_best_image(page, "daum")
        
        if not image_url:
            log(f"    이미지 없음 - 삽입 금지 스킵")
            results["skipped"] += 1
            return
        
        log(f"    이미지: {image_url[:100]}")
        
        # 이미지 업로드
        img_filename = f"swing_{event_id}"
        poster_url = upload_image_to_supabase(image_url, img_filename)
        
        if not poster_url:
            log(f"    이미지 업로드 실패 - 삽입 금지 스킵")
            results["skipped"] += 1
            return
        
        # 이벤트 유형 판단
        event_type = "강습"
        activity_type = "class"
        if any(k in title + body_text for k in ["파티", "소셜", "사교"]):
            event_type = "파티"
            activity_type = "social"
        
        location_match = re.search(r'(?:장소|위치)[:\s]*([^\n,]{3,30})', body_text)
        location = location_match.group(1).strip() if location_match else ""
        
        fee_match = re.search(r'(?:수강료|참가비|비용)[:\s]*([^\n,]{2,20})', body_text)
        fee = fee_match.group(1).strip() if fee_match else ""
        
        event_data = {
            "id": event_id,
            "keyword": "스윙강습",
            "source_url": post_url,
            "poster_url": poster_url,
            "extracted_text": body_text[:2000],
            "structured_data": {
                "date": event_date,
                "day": get_day_name(event_date),
                "title": title[:100],
                "event_type": event_type,
                "activity_type": activity_type,
                "genre_family": "partner",
                "dance_genre": "swing",
                "tags": [],
                "status": "정상운영",
                "djs": [],
                "times": [],
                "location": location,
                "fee": fee,
                "note": ""
            },
            "is_collected": False
        }
        
        success = insert_event(event_data)
        
        if success:
            log(f"    ✅ 삽입 성공: {event_id}")
            results["new"] += 1
            results["collected"].append({
                "id": event_id,
                "title": title[:50],
                "date": event_date,
                "source": cafe_name,
                "url": post_url
            })
        else:
            log(f"    ❌ 삽입 실패")
            results["issues"].append(f"{title[:30]} - 삽입 실패")
            
    except Exception as e:
        log(f"    오류: {e}")
        results["issues"].append(f"{title[:30]} - {str(e)[:50]}")

async def main():
    log("스윙댄스 이벤트 수집 시작 - " + TODAY_STR)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
            ]
        )
        
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="ko-KR"
        )
        
        page = await context.new_page()
        
        # 소스 목록 (L1 중복 소스는 제외)
        # 스윙패밀리 카페 [외강&행사&연습실] - SKIP (이미 DB에 있음)
        # 스윙타운 카페 - SKIP (이미 DB에 있음)
        
        # 1. 스윗티스윗 카페
        await collect_naver_cafe(
            page,
            "https://cafe.naver.com/f-e/cafes/14933600/menus/501?viewType=I",
            "스윗티스윗",
            "cafe.naver.com/f-e/cafes/14933600/menus/501"
        )
        await asyncio.sleep(10)
        
        # 2. 스웰티스윙 다음 카페
        await collect_daum_cafe(
            page,
            "https://m.cafe.daum.net/sweetyswing/5ngW",
            "스웰티스윙"
        )
        await asyncio.sleep(10)
        
        # 3. 네오스윙 다음 카페
        await collect_daum_cafe(
            page,
            "https://m.cafe.daum.net/neoswing",
            "네오스윙"
        )
        
        await browser.close()
    
    # 결과 출력
    log("\n" + "="*60)
    log("수집 완료!")
    log(f"신규: {results['new']}건")
    log(f"스킵: {results['skipped']}건")
    log(f"접근불가: {results['inaccessible']}")
    log(f"이슈: {results['issues']}")
    log("\n수집 목록:")
    for item in results["collected"]:
        log(f"  - {item['date']} [{item['source']}] {item['title']}")
    
    # JSON 결과 파일 저장
    with open("/tmp/swing_collection_result.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print("\n__RESULT__")
    print(json.dumps(results, ensure_ascii=False))

if __name__ == "__main__":
    asyncio.run(main())
