# Comprehensive Functions Review Report

## Date: 2026-03-13

## Summary
Full review of all functions across frontend (React), backend (FastAPI/Python), and database queries.
**Found and fixed 23 bugs** across 11 files.

---

## CRITICAL Fixes

### 1. Route Ordering — broadcasts.py
**Problem:** `GET /{tc}/lead-magnets` was registered AFTER `GET /{tc}`, so FastAPI matched `lead-magnets` as a `tc` parameter. The lead magnets endpoint was completely unreachable.
**Fix:** Moved `/{tc}/lead-magnets` route before `/{tc}`.

### 2. Route Ordering — billing.py
**Problem:** `GET /plans`, `GET /overview`, and `POST /pay-multi` were registered AFTER `GET /{tracking_code}/status`. FastAPI treated "plans", "overview", "pay-multi" as tracking_code values. These critical billing endpoints were unreachable.
**Fix:** Moved all fixed-path routes (`/plans`, `/overview`, `/calculate`, `/pay-multi`) before parameterized `/{tracking_code}/...` routes.

---

## HIGH Severity Fixes

### 3. Broadcast filter_rules — broadcasts.py
**Problem:** `isinstance(filter_rules, dict)` check always failed because frontend sends filter rules as a JSON array (list), not dict. All broadcast recipient filtering was silently ignored.
**Fix:** Added support for both list format (new) and dict format (legacy). List rules support `platform`, `lead_magnet_id`, and `registration_date` fields.

### 4. billing_checker.py — Wrong Column Name
**Problem:** Query used `c.owner_id` and `JOIN users u ON u.id = c.owner_id`, but channels table uses `user_id`, not `owner_id`. All billing expiry notifications were failing silently.
**Fix:** Changed to `c.user_id as owner_id` and `JOIN users u ON u.id = c.user_id`.

### 5. MAX Webhook — Re-raise Causing Retries
**Problem:** `process_max_update()` re-raised exceptions, causing the webhook endpoint to return 500. MAX retries failed webhooks, causing duplicate event processing (duplicate leads, subscriptions).
**Fix:** Removed `raise` — errors are logged but the webhook returns success to prevent retries.

### 6. MAX Webhook — Owner Fallback Query No Time Constraint
**Problem:** Method 3 owner binding selected the most recent user globally with no time window. Comment said "last 10 min" but query had no time filter. Could assign random users as channel owners.
**Fix:** Added `AND created_at > NOW() - INTERVAL '10 minutes'` to the fallback query.

### 7. MAX Webhook — channel_id Type Mismatch
**Problem:** MAX bot_added inserted `channel_id` as integer (`chat_id_int`), but TG inserts it as string (`str(chat_id)`). Type inconsistency in the database.
**Fix:** Changed to `chat_id_str` for consistent string storage.

### 8. funnel_processor.py — Boolean Comparison
**Problem:** `is_active = 1` in PostgreSQL doesn't match boolean columns. Funnel steps were never scheduled for new leads — the entire funnel system was broken.
**Fix:** Changed to `is_active = TRUE`.

### 9. GiveawaysPage.jsx — Edit With Image Returns 404
**Problem:** Frontend used `_method: 'PUT'` in FormData (Django convention) but FastAPI doesn't support method override. Edit-with-image always sent POST to a PUT-only endpoint.
**Fix:** Changed to `api.upload(..., 'PUT')` to send actual PUT request.

---

## MEDIUM Severity Fixes

### 10. messenger.py — send_to_user Drops Files
**Problem:** `send_to_user` checked `os.path.exists(file_path)` and silently set `file_path = None` without trying `ensure_file()`. On Render's ephemeral filesystem, funnel messages lost their attachments.
**Fix:** Added `ensure_file()` call before giving up on missing files.

### 11. messenger.py — send_to_channel Same Issue
**Problem:** Same file existence check without recovery in `send_to_channel`.
**Fix:** Added `ensure_file()` call.

### 12. messenger.py — notify_owner Platform Logic
**Problem:** Used channel's `platform` field to determine how to notify the owner. A TG user who added a MAX channel would get notifications via MAX (where they might not check).
**Fix:** Changed logic to prefer Telegram if owner has `telegram_id`; fall back to MAX only if TG fails or unavailable.

### 13. messenger.py — voice/video_note Type Mapping for MAX
**Problem:** MAX attach type whitelist only included `video`, `audio`, `file`. Voice messages were silently converted to `file` type.
**Fix:** Added `voice` to the whitelist.

### 14. billing.py — pay-multi Stores Total Instead of Per-Channel Amount
**Problem:** Each channel's payment record stored the full combined total instead of that channel's share. Payment history showed inflated amounts.
**Fix:** Calculate and store per-channel amount (`price_per_user * channel_users`).

### 15. billing.py — Tinkoff Token Boolean Handling
**Problem:** `str(False)` = `"False"` but Tinkoff expects `"true"`/`"false"`. Token verification failed for payments with boolean fields, rejecting all webhook confirmations.
**Fix:** Convert booleans to lowercase `"true"`/`"false"` per Tinkoff spec.

### 16. content.py — AI Generated Posts Missing Status
**Problem:** Generated posts inserted with `ai_generated = 1` (int, not boolean) and no `status` field. Posts defaulted to NULL status and were invisible in the UI.
**Fix:** Changed to `ai_generated = TRUE` and added explicit `status = 'draft'` (or `'scheduled'` if `scheduled_at` is set).

### 17. pins.py — create_pin_json Missing attach_type
**Problem:** JSON create-pin path didn't read or save `attach_type` from the request body. The field was silently dropped.
**Fix:** Added `attach_type` to INSERT query.

### 18. MAX Webhook — handle_lead_magnet Missing dialog_chat_id
**Problem:** For `lm_` deep links, `_find_or_create_max_user` was called without `dialog_chat_id`. New users' dialog chat IDs weren't saved, preventing future messages.
**Fix:** Pass `dialog_chat_id=chat_id` to `_find_or_create_max_user`.

### 19. MAX Webhook — No Fallback Text When Upload Fails
**Problem:** When file upload failed and `message_text` was empty, MAX bot sent an empty/blank message to the user.
**Fix:** Added fallback: "Материал пока не загружен. Попробуйте позже."

---

## LOW Severity Fixes

### 20. file_storage.py — Empty dirname Crash
**Problem:** `os.makedirs("")` raises `FileNotFoundError` when `file_path` has no directory component.
**Fix:** Check `dir_name` before calling `os.makedirs`.

### 21. pins.py — unpin Returns 400 Instead of 404
**Problem:** Missing pin returned HTTP 400 (Bad Request) instead of 404 (Not Found).
**Fix:** Changed to `status_code=404`.

### 22. PinsPage.jsx — Form Reset Missing attach_type
**Problem:** `openCreateLm` and inline LM form resets omitted `attach_type`, causing value leakage from previously edited items.
**Fix:** Added `attach_type: ''` to all form reset objects.

### 23. PinsPage.jsx — Inline LM Selection Wrong Order
**Problem:** After creating an inline lead magnet, code selected `updatedLms[length - 1]` but the list is ordered DESC. This picked the oldest, not newest.
**Fix:** Changed to `updatedLms[0]`.

---

## Files Modified
- `backend-python/app/routes/broadcasts.py` — route ordering, filter_rules fix
- `backend-python/app/routes/billing.py` — route ordering, pay-multi amount, Tinkoff token
- `backend-python/app/routes/max_webhook.py` — error handling, owner fallback, channel_id type, lead magnet fixes
- `backend-python/app/routes/pins.py` — attach_type in create, unpin status code
- `backend-python/app/routes/content.py` — ai_generated boolean, post status
- `backend-python/app/services/messenger.py` — ensure_file, notify_owner, type mapping
- `backend-python/app/services/funnel_processor.py` — boolean comparison
- `backend-python/app/services/billing_checker.py` — column name fix
- `backend-python/app/services/file_storage.py` — empty dirname crash
- `frontend-react/src/pages/GiveawaysPage.jsx` — PUT method for edit
- `frontend-react/src/pages/PinsPage.jsx` — form reset, LM selection order
