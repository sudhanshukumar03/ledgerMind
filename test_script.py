import urllib.request
import json
import time

BASE_URL = "http://localhost:3001/api/v1"
EXCEPTION_ID = "EXC-20260905120257-006"

def req(url, method="GET", data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    body = json.dumps(data).encode("utf-8") if data else None
    
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        print(f"HTTPError: {e.code} - {e.read().decode()}")
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None

def main():
    print("Logging in as ADMIN...")
    res = req(f"{BASE_URL}/auth/login", method="POST", data={"email": "admin@ledgermind.dev", "password": "demo1234"})
    if not res: return
    token = res["access_token"]
    print("Logged in!")

    print("Running 3 investigations with 61-second delay...")
    for i in range(1, 4):
        print(f"--- Run {i} ---")
        out = req(f"{BASE_URL}/ai/investigate/{EXCEPTION_ID}", method="POST", token=token)
        print("Response likely_cause:", out.get("likely_cause") if out else None)
        if i < 3:
            print("Waiting 61 seconds...")
            time.sleep(61)

    print("--- Proposing an Action ---")
    action_res = req(f"{BASE_URL}/actions", method="POST", token=token, data={"exception_id": EXCEPTION_ID, "action_type": "MARK_REVIEWED", "parameters": {"reason": "Test"}})
    
    if action_res and "id" in action_res:
        action_id = action_res["id"]
        print(f"Action proposed: {action_id}")
        
        print("--- Approving Action ---")
        approve_res = req(f"{BASE_URL}/actions/{action_id}/approve", method="POST", token=token, data={"reason": "Approved manually"})
        print("Approve response status:", approve_res.get("status") if approve_res else None)
    else:
        print("Failed to propose action")

if __name__ == "__main__":
    main()
