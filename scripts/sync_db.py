import requests
import json
import os

PROD_URL = os.environ.get("PROD_SUPABASE_URL", "")
PROD_KEY = os.environ.get("PROD_SUPABASE_SERVICE_KEY", "")

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "http://127.0.0.1:54321/rest/v1")
LOCAL_KEY = os.environ.get("LOCAL_SUPABASE_SERVICE_KEY", "")

TABLE = "events"

def sync_events():
    print(f"[*] Fetching events from production ({TABLE})...")
    
    # 최신 순으로 100개 가져오기
    headers = {
        "apikey": PROD_KEY,
        "Authorization": f"Bearer {PROD_KEY}",
        "Range-Unit": "items"
    }
    params = {
        "select": "*",
        "order": "id.desc",
        "limit": 100
    }
    
    response = requests.get(f"{PROD_URL}/{TABLE}", headers=headers, params=params)
    
    if response.status_code != 200:
        print(f"[!] Error fetching from prod: {response.status_code} - {response.text}")
        return

    events = response.json()
    print(f"[*] Successfully fetched {len(events)} events.")

    if not events:
        print("[!] No events found to sync.")
        return

    print(f"[*] Syncing to local DB...")
    
    local_headers = {
        "apikey": LOCAL_KEY,
        "Authorization": f"Bearer {LOCAL_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    
    # Upsert 수행
    # PostgREST upsert: POST with Prefer: resolution=merge-duplicates or resolution=ignore-duplicates
    # Or PATCH if we know the ID, but POST is better for batch upsert.
    # Note: resolution=merge-duplicates requires the table to have a unique constraint/PK which 'id' likely is.
    
    upsert_response = requests.post(f"{LOCAL_URL}/{TABLE}", headers=local_headers, data=json.dumps(events))
    
    if upsert_response.status_code in [200, 201, 204]:
        print("[+] Successfully synced events to local DB.")
    else:
        print(f"[!] Error syncing to local: {upsert_response.status_code} - {upsert_response.text}")

if __name__ == "__main__":
    sync_events()
