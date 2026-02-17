import requests
import json
from datetime import datetime

url = "https://mkoryudscamnopvxdelk.supabase.co/rest/v1/scraped_events"
headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

events = [
    {
        "id": "ss_260218_wed",
        "keyword": "스윙스캔들",
        "source_url": "https://cafe.naver.com/swingscandal/101953",
        "poster_url": "/scraped/ss_260218_livenight.png",
        "extracted_text": "February Savoy Live Night!! Wednesday, February 18, 2026. DJ: Tail. Live Jazz Performance.",
        "structured_data": {
            "date": "2026-02-18",
            "day": "수",
            "title": "사보이 라이브 나이트 (DJ 테일)",
            "status": "정상운영",
            "djs": ["테일"],
            "times": ["20:00 ~ 24:00"],
            "location": "사보이볼룸",
            "fee": "24,000원",
            "note": "라이브 세션 포함. 예매 시 21,000원."
        },
        "created_at": datetime.now().isoformat()
    },
    {
        "id": "ss_260219_thu",
        "keyword": "스윙스캔들",
        "source_url": "https://calendar.google.com/calendar/u/0/embed?src=870m6uha5ctklbeu2o6g8vb9hs@group.calendar.google.com",
        "poster_url": "/scraped/ss_monthly_timetable.png",
        "extracted_text": "Savoy Ballroom Feb-Mar Schedule. Thu Social DJ: J.G",
        "structured_data": {
            "date": "2026-02-19",
            "day": "목",
            "title": "목요 소셜 (DJ J.G)",
            "status": "정상운영",
            "djs": ["J.G"],
            "times": ["19:30 ~ 23:00"],
            "location": "사보이볼룸",
            "fee": "null",
            "note": "정기 목요 소셜"
        },
        "created_at": datetime.now().isoformat()
    },
    {
        "id": "sf_260221_sat",
        "keyword": "스윙프렌즈",
        "source_url": "https://www.instagram.com/p/DU0MIrGkuZe/",
        "poster_url": "/scraped/sf_260221_tc.png",
        "extracted_text": "2026.02.21. 토. 스몰스파라다이스 저녁 7시 30분 DJ tc_dances",
        "structured_data": {
            "date": "2026-02-21",
            "day": "토",
            "title": "청주 파스텔 스윙 소셜 (DJ TC)",
            "status": "정상운영",
            "djs": ["tc_dances"],
            "times": ["19:30 ~"],
            "location": "스몰스파라다이스",
            "fee": "null",
            "note": "청주 원정 소셜"
        },
        "created_at": datetime.now().isoformat()
    },
    {
        "id": "ss_260305_thu",
        "keyword": "스윙스캔들",
        "source_url": "https://calendar.google.com/calendar/u/0/embed?src=870m6uha5ctklbeu2o6g8vb9hs@group.calendar.google.com",
        "poster_url": "/scraped/ss_monthly_timetable.png",
        "extracted_text": "Savoy Ballroom 2026 Q1 Timetable. Mar 5 Thu DJ Jae",
        "structured_data": {
            "date": "2026-03-05",
            "day": "목",
            "title": "목요 소셜 (DJ Jae)",
            "status": "정상운영",
            "djs": ["Jae"],
            "times": ["19:30 ~ 23:00"],
            "location": "사보이볼룸",
            "fee": "null",
            "note": "3월 첫 목요 소셜"
        },
        "created_at": datetime.now().isoformat()
    },
    {
        "id": "st_260306_fri",
        "keyword": "스윙타임",
        "source_url": "https://www.instagram.com/p/DTPAj7_ky65/",
        "poster_url": "/scraped/st_260306_q1schedule.png",
        "extracted_text": "2026 Q1 Schedule. MAR 6 SLOW JAM",
        "structured_data": {
            "date": "2026-03-06",
            "day": "금",
            "title": "스윙타임 슬로우 잼",
            "status": "정상운영",
            "djs": [],
            "times": ["20:00 ~"],
            "location": "스윙타임바",
            "fee": "null",
            "note": "1분기 정기 슬로우 잼 소셜"
        },
        "created_at": datetime.now().isoformat()
    },
    {
        "id": "ss_260307_sat",
        "keyword": "스윙스캔들",
        "source_url": "https://calendar.google.com/calendar/u/0/embed?src=870m6uha5ctklbeu2o6g8vb9hs@group.calendar.google.com",
        "poster_url": "/scraped/ss_monthly_timetable.png",
        "extracted_text": "Savoy Ballroom 2026 Q1 Timetable. Mar 7 Sat DJ Tail",
        "structured_data": {
            "date": "2026-03-07",
            "day": "토",
            "title": "토요 소셜 (DJ 테일)",
            "status": "정상운영",
            "djs": ["테일"],
            "times": ["19:30 ~ 23:00"],
            "location": "사보이볼룸",
            "fee": "null",
            "note": "3월 첫 토요 소셜"
        },
        "created_at": datetime.now().isoformat()
    }
]

response = requests.post(url, headers=headers, data=json.dumps(events))
print(f"Status Code: {response.status_code}")
print(f"Response: {response.text}")
