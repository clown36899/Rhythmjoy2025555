#!/usr/bin/env python3
"""
스윙댄스 Instagram 이벤트 수집 스크립트
오늘: 2026-06-11 (한국시간)
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, date

from playwright.sync_api import sync_playwright

# ─── 상수 ───────────────────────────────────────────────────────────────
TODAY = date(2026, 6, 11)
TODAY_STR = "2026-06-11"

SUPABASE_URL = "https://mkoryudscamnopvxdelk.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE"
NETLIFY_ENDPOINT = "https://swingenjoy.com/.netlify/functions/scraped-events"

SOURCES = [
    ("https://www.instagram.com/happyhall2004/", "해피홀"),
    ("https://www.instagram.com/bongcheonsalon/", "봉천살롱"),
    ("https://www.instagram.com/swingtimebar/", "스윙타임바"),
    ("https://www.instagram.com/bebopbar_swing/", "비밥바"),
    ("https://www.instagram.com/luna_swingbar/", "루나"),
    ("https://www.instagram.com/inthemood_sillim/", "인더무드신림"),
    ("https://www.instagram.com/dialogue_swing/", "다이알로그"),
    ("https://www.instagram.com/fiesta_swingdance/", "피에스타"),
    ("https://www.instagram.com/swingit_seoul/", "스윙잇"),
    ("https://www.instagram.com/asurajang_swing/", "아수라장"),
]

# 이미 DB에 있는 source_url들 (L1 중복 체크)
EXISTING_IDS = {
    "kyungsunghall/p/DZMbAPNS75d",
    "bongcheonsalon/p/DZUx5ytCb1l",
    "bongcheonsalon/p/DZCji0yiZdr",
    "swingtimebar/p/DXMbsHTE6QF/",
}

# 결과 집계
results = {
    "신규": 0,
    "스킵": 0,
    "접근불가": [],
    "수집목록": [],
    "이슈": []
}

# ─── 유틸 함수 ──────────────────────────────────────────────────────────

def make_id(source_url, date_str):
    raw = f"{source_url}|{date_str}"
    return hashlib.md5(raw.encode()).hexdigest()[:16]


def extract_dates_from_text(text):
    """텍스트에서 날짜 패턴 추출 (6/12, 6월 12일, 2026-06-12 등)"""
    dates = []
    
    # 패턴: 6/12, 06/12
    matches = re.findall(r'\b(\d{1,2})/(\d{1,2})\b', text)
    for m, d in matches:
        try:
            month = int(m)
            day = int(d)
            if 1 <= month <= 12 and 1 <= day <= 31:
                try:
                    candidate = date(2026, month, day)
                    if candidate >= TODAY:
                        dates.append(candidate.strftime("%Y-%m-%d"))
                except:
                    pass
        except:
            pass
    
    # 패턴: 6월 12일
    matches2 = re.findall(r'(\d{1,2})월\s*(\d{1,2})일', text)
    for m, d in matches2:
        try:
            candidate = date(2026, int(m), int(d))
            if candidate >= TODAY:
                dates.append(candidate.strftime("%Y-%m-%d"))
        except:
            pass
    
    # 패턴: YYYY-MM-DD
    matches3 = re.findall(r'(2026-\d{2}-\d{2})', text)
    for dt in matches3:
        try:
            candidate = datetime.strptime(dt, "%Y-%m-%d").date()
            if candidate >= TODAY:
                dates.append(dt)
        except:
            pass
    
    # 중복 제거 및 정렬
    return sorted(list(set(dates)))


def get_day_of_week(date_str):
    """날짜 문자열에서 요일 반환"""
    dt = datetime.strptime(date_str, "%Y-%m-%d").date()
    days = ["월", "화", "수", "목", "금", "토", "일"]
    return days[dt.weekday()]


def extract_event_type(text):
    """텍스트에서 이벤트 타입 추출"""
    text_lower = text.lower()
    if any(k in text for k in ["강습", "클래스", "레슨", "워크샵", "workshop"]):
        return ("강습", "class", ["강습"])
    elif any(k in text for k in ["라이브", "live", "밴드", "band"]):
        return ("라이브소셜", "social", ["라이브", "밴드"])
    elif any(k in text for k in ["소셜", "social", "파티", "party"]):
        return ("소셜", "social", ["dj"])
    elif any(k in text for k in ["공연", "퍼포먼스", "performance", "show"]):
        return ("공연", "performance", ["공연"])
    else:
        return ("소셜", "social", ["dj"])


def extract_djs(text):
    """텍스트에서 DJ 이름 추출"""
    djs = []
    # DJ 패턴
    dj_matches = re.findall(r'DJ\s+([A-Za-z가-힣]+)', text, re.IGNORECASE)
    djs.extend(dj_matches)
    # 이름 패턴 (DJ 앞 뒤 맥락)
    return list(set(djs))


def extract_fee(text):
    """요금 추출"""
    fee_matches = re.findall(r'(\d{1,3}[,.]?\d{3})\s*원', text)
    if fee_matches:
        return f"{fee_matches[0]}원"
    fee_matches2 = re.findall(r'(\d{1,2})만\s*원', text)
    if fee_matches2:
        return f"{fee_matches2[0]}만원"
    if any(k in text for k in ["무료", "free", "Free"]):
        return "무료"
    return ""


def extract_times(text):
    """시간 추출"""
    times = []
    time_matches = re.findall(r'(\d{1,2}):(\d{2})', text)
    for h, m in time_matches:
        times.append(f"{h}:{m}")
    # 오후/오전 패턴
    pm_matches = re.findall(r'오후\s*(\d{1,2})시', text)
    for h in pm_matches:
        times.append(f"{int(h)+12}:00")
    am_matches = re.findall(r'오전\s*(\d{1,2})시', text)
    for h in am_matches:
        times.append(f"{h}:00")
    return list(set(times))


def check_db_duplicate(date_str, source_url_prefix):
    """Supabase에서 같은 날짜의 이벤트 중복 체크"""
    try:
        cmd = [
            "curl", "-s",
            f"{SUPABASE_URL}/rest/v1/scraped_events?date=eq.{date_str}&source_url=like.{source_url_prefix}*",
            "-H", f"apikey: {SUPABASE_KEY}",
            "-H", f"Authorization: Bearer {SUPABASE_KEY}",
            "-H", "Content-Type: application/json"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        data = json.loads(result.stdout)
        return len(data) > 0
    except Exception as e:
        print(f"  [DB 체크 오류] {e}")
        return False


def upload_image_to_supabase(image_url, filename):
    """이미지를 다운로드하고 Supabase Storage에 업로드"""
    tmp_path = f"/tmp/{filename}"
    
    try:
        # 이미지 다운로드
        dl_cmd = ["curl", "-s", "-L", "--max-time", "30", image_url, "-o", tmp_path]
        result = subprocess.run(dl_cmd, capture_output=True, timeout=35)
        
        if not os.path.exists(tmp_path) or os.path.getsize(tmp_path) < 1000:
            print(f"  [이미지 다운로드 실패] {image_url}")
            return None
        
        # Supabase Storage 업로드
        storage_path = f"scraped/{filename}"
        upload_cmd = [
            "curl", "-s", "-X", "POST",
            f"{SUPABASE_URL}/storage/v1/object/{storage_path}",
            "-H", f"apikey: {SUPABASE_KEY}",
            "-H", f"Authorization: Bearer {SUPABASE_KEY}",
            "-H", "Content-Type: image/jpeg",
            "-H", "x-upsert: true",
            "--data-binary", f"@{tmp_path}"
        ]
        upload_result = subprocess.run(upload_cmd, capture_output=True, text=True, timeout=30)
        
        if '"Key"' in upload_result.stdout or '"key"' in upload_result.stdout.lower():
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/{storage_path}"
            print(f"  [이미지 업로드 성공] {public_url}")
            return public_url
        else:
            print(f"  [이미지 업로드 실패] {upload_result.stdout}")
            return None
    except Exception as e:
        print(f"  [이미지 처리 오류] {e}")
        return None
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def insert_event(event_data):
    """Netlify API로 이벤트 삽입"""
    try:
        payload = json.dumps(event_data)
        cmd = [
            "curl", "-s", "-X", "POST", NETLIFY_ENDPOINT,
            "-H", "Content-Type: application/json",
            "-d", payload
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        response = result.stdout
        print(f"  [API 응답] {response[:200]}")
        
        if '"id"' in response or '"success"' in response.lower() or '"inserted"' in response.lower():
            return True
        elif '"error"' in response.lower() or '"duplicate"' in response.lower():
            print(f"  [삽입 실패/중복] {response[:200]}")
            return False
        else:
            # 응답이 비어있거나 다른 경우 - 성공으로 간주
            try:
                rdata = json.loads(response)
                if isinstance(rdata, dict) and rdata.get("id"):
                    return True
            except:
                pass
            return False
    except Exception as e:
        print(f"  [삽입 오류] {e}")
        return False


def is_social_event_valid(text, event_type_str):
    """소셜 이벤트의 경우 DJ 이름 또는 구체적 내용이 있어야 함"""
    if event_type_str == "소셜":
        has_dj = bool(re.search(r'DJ\s+\w+', text, re.IGNORECASE))
        has_specific = any(k in text for k in ["선착순", "입장", "신청", "예약", "웨이팅", "waiting", "entry"])
        return has_dj or has_specific
    return True  # 강습, 공연, 라이브 등은 항상 유효


def collect_from_instagram(page, account_url, name):
    """특정 Instagram 계정에서 이벤트 수집"""
    print(f"\n{'='*60}")
    print(f"[{name}] 수집 시작: {account_url}")
    print(f"{'='*60}")
    
    collected = []
    
    try:
        # 페이지 로드
        page.goto(account_url, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(3000)
        
        # 로그인 모달이 있으면 닫기
        try:
            close_btn = page.locator("[aria-label='닫기'], [aria-label='Close'], button:has-text('나중에'), button:has-text('Not Now')")
            if close_btn.count() > 0:
                close_btn.first.click()
                page.wait_for_timeout(1000)
        except:
            pass
        
        # 포스트 링크 수집 (최근 3개)
        post_links = []
        try:
            links = page.locator("a[href*='/p/']").all()
            for link in links[:6]:
                href = link.get_attribute("href")
                if href and "/p/" in href:
                    if not href.startswith("http"):
                        href = f"https://www.instagram.com{href}"
                    if href not in post_links:
                        post_links.append(href)
                if len(post_links) >= 3:
                    break
        except Exception as e:
            print(f"  [포스트 링크 추출 오류] {e}")
        
        print(f"  발견된 포스트: {len(post_links)}개")
        
        for post_url in post_links:
            print(f"\n  → 포스트 확인: {post_url}")
            
            # L1 중복 체크
            post_id_part = re.search(r'/p/([^/]+)/', post_url)
            if post_id_part:
                username = account_url.split("instagram.com/")[1].rstrip("/")
                check_key = f"{username}/p/{post_id_part.group(1)}"
                if check_key in EXISTING_IDS:
                    print(f"  [L1 중복] 이미 DB에 있음: {check_key}")
                    results["스킵"] += 1
                    continue
            
            try:
                page.goto(post_url, wait_until="networkidle", timeout=25000)
                page.wait_for_timeout(2000)
                
                # 텍스트 추출
                text = ""
                try:
                    # 본문 텍스트
                    caption_selectors = [
                        "article div[class*='Caption']",
                        "article h1",
                        "article span[dir='auto']",
                        "div[data-testid='post-comment-root-container'] span",
                        "article div > span",
                    ]
                    for sel in caption_selectors:
                        try:
                            elements = page.locator(sel).all()
                            for el in elements:
                                txt = el.inner_text()
                                if len(txt) > 50:
                                    text = txt
                                    break
                            if text:
                                break
                        except:
                            continue
                    
                    if not text:
                        # 전체 페이지에서 긴 텍스트 추출
                        all_text = page.locator("article").inner_text()
                        text = all_text[:2000] if all_text else ""
                except Exception as e:
                    print(f"    [텍스트 추출 오류] {e}")
                
                if not text:
                    print(f"    [스킵] 텍스트 없음")
                    results["스킵"] += 1
                    continue
                
                print(f"    텍스트 미리보기: {text[:100]}...")
                
                # 날짜 추출
                dates = extract_dates_from_text(text)
                if not dates:
                    print(f"    [스킵] 미래 날짜 없음")
                    results["스킵"] += 1
                    continue
                
                print(f"    추출된 날짜: {dates}")
                
                # 이미지 URL 추출 (가장 큰 것)
                best_image_url = None
                best_size = 0
                try:
                    images = page.evaluate("""() => {
                        const imgs = document.querySelectorAll('article img');
                        return Array.from(imgs).map(img => ({
                            src: img.src,
                            w: img.naturalWidth,
                            h: img.naturalHeight
                        })).filter(i => i.src && i.w > 100 && i.h > 100);
                    }""")
                    
                    for img in images:
                        size = img.get("w", 0) * img.get("h", 0)
                        if size > best_size:
                            best_size = size
                            best_image_url = img.get("src")
                except Exception as e:
                    print(f"    [이미지 추출 오류] {e}")
                
                if not best_image_url:
                    print(f"    [스킵] 이미지 없음 (이미지 없으면 삽입 금지)")
                    results["스킵"] += 1
                    continue
                
                print(f"    이미지 URL: {best_image_url[:80]}...")
                
                # 이벤트 타입 추출
                event_type_str, activity_type, tags = extract_event_type(text)
                
                # 소셜 이벤트 유효성 체크
                if not is_social_event_valid(text, event_type_str):
                    print(f"    [스킵] 소셜 이벤트 - DJ 정보 또는 구체적 내용 부재")
                    results["스킵"] += 1
                    continue
                
                # 각 날짜별로 이벤트 처리
                for event_date in dates[:2]:  # 최대 2개 날짜
                    username = account_url.split("instagram.com/")[1].rstrip("/")
                    
                    # L3 DB 중복 체크 (같은 날짜)
                    if check_db_duplicate(event_date, f"https://www.instagram.com/{username}"):
                        print(f"    [L3 중복] {event_date} 이미 DB에 있음")
                        results["스킵"] += 1
                        continue
                    
                    # ID 생성
                    event_id = make_id(post_url, event_date)
                    
                    # 이미지 업로드
                    safe_name = re.sub(r'[^a-zA-Z0-9]', '_', username)
                    img_filename = f"{safe_name}_{event_date}_{event_id[:8]}.jpg"
                    poster_url = upload_image_to_supabase(best_image_url, img_filename)
                    
                    if not poster_url:
                        print(f"    [스킵] 이미지 업로드 실패")
                        results["스킵"] += 1
                        continue
                    
                    # 이벤트 데이터 구성
                    day_of_week = get_day_of_week(event_date)
                    djs = extract_djs(text)
                    fee = extract_fee(text)
                    times = extract_times(text)
                    
                    # 제목 생성
                    title = f"{name} {event_type_str} {event_date}"
                    
                    event_payload = {
                        "id": event_id,
                        "keyword": f"스윙{event_type_str}",
                        "source_url": post_url,
                        "poster_url": poster_url,
                        "extracted_text": text[:1000],
                        "structured_data": {
                            "date": event_date,
                            "day": day_of_week,
                            "title": title,
                            "event_type": event_type_str,
                            "activity_type": activity_type,
                            "genre_family": "partner",
                            "dance_genre": "swing",
                            "tags": tags,
                            "status": "정상운영",
                            "djs": djs,
                            "times": times,
                            "location": name,
                            "fee": fee,
                            "note": ""
                        },
                        "is_collected": False
                    }
                    
                    print(f"    → 삽입 시도: {event_date} {title}")
                    
                    success = insert_event(event_payload)
                    
                    if success:
                        results["신규"] += 1
                        results["수집목록"].append({
                            "source": name,
                            "title": title,
                            "date": event_date,
                            "inserted": True
                        })
                        print(f"    ✅ 삽입 성공!")
                    else:
                        results["스킵"] += 1
                        results["수집목록"].append({
                            "source": name,
                            "title": title,
                            "date": event_date,
                            "inserted": False
                        })
                        print(f"    ❌ 삽입 실패")
            
            except Exception as e:
                print(f"  [포스트 처리 오류] {post_url}: {e}")
                results["이슈"].append(f"{name} 포스트 오류: {str(e)[:100]}")
                continue
        
        return collected
    
    except Exception as e:
        print(f"  [계정 접근 오류] {name}: {e}")
        results["접근불가"].append(f"{name}({str(e)[:50]})")
        return []


def main():
    print(f"스윙댄스 Instagram 수집 시작 - {TODAY_STR}")
    print(f"수집 소스: {len(SOURCES)}개")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
            ]
        )
        
        context = browser.new_context(
            viewport={"width": 1600, "height": 1200},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            locale="ko-KR",
        )
        
        page = context.new_page()
        
        # Instagram 먼저 방문해서 세션 초기화
        try:
            page.goto("https://www.instagram.com/", wait_until="domcontentloaded", timeout=15000)
            page.wait_for_timeout(2000)
        except:
            pass
        
        for i, (account_url, name) in enumerate(SOURCES):
            collect_from_instagram(page, account_url, name)
            
            # 마지막 소스가 아니면 대기
            if i < len(SOURCES) - 1:
                print(f"\n  [대기 45초 → 다음 소스]")
                time.sleep(45)
        
        browser.close()
    
    # 최종 보고
    print("\n" + "="*60)
    print("📊 수집 완료 보고")
    print("="*60)
    print(f"신규: {results['신규']}건")
    print(f"스킵: {results['스킵']}건")
    print(f"접근불가: {', '.join(results['접근불가']) if results['접근불가'] else '없음'}")
    print(f"수집목록: {json.dumps(results['수집목록'], ensure_ascii=False, indent=2)}")
    print(f"이슈: {', '.join(results['이슈']) if results['이슈'] else '없음'}")
    
    # 결과 파일 저장
    result_path = f"/tmp/swing_collection_{TODAY_STR.replace('-','')}.json"
    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n결과 저장: {result_path}")
    
    return results


if __name__ == "__main__":
    main()
