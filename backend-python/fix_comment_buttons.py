"""One-time script: update comment buttons in published posts from startapp to direct URL."""
import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))


async def main():
    from app.database import init_database, fetch_all, fetch_one, execute
    from app.config import settings

    await init_database()

    # Find all published posts with comment buttons
    for table, post_type in [("pin_posts", "pin"), ("content_posts", "content")]:
        posts = await fetch_all(f"""
            SELECT p.id, p.channel_id, p.telegram_message_id, p.message_text, p.inline_buttons,
                   p.file_type, p.max_file_token,
                   c.platform, c.max_chat_id
            FROM {table} p
            JOIN channels c ON c.id = p.channel_id
            WHERE p.status = 'published'
              AND p.telegram_message_id IS NOT NULL
              AND p.inline_buttons LIKE '%comments%'
        """)

        print(f"\n=== {table}: {len(posts)} posts with comment buttons ===")

        for post in posts:
            try:
                buttons = json.loads(post["inline_buttons"]) if isinstance(post["inline_buttons"], str) else post["inline_buttons"]
                if not isinstance(buttons, list):
                    continue

                needs_update = False
                new_buttons = []

                for btn in buttons:
                    if btn.get("type") == "comments" or (btn.get("url", "").find("startapp=comments_") >= 0):
                        # Replace with direct URL
                        direct_url = f"{settings.APP_URL}/comments-app/comments_{post_type}_{post['id']}"
                        new_buttons.append({
                            "text": btn.get("text", "Комментарии"),
                            "type": "link",
                            "url": direct_url,
                        })
                        needs_update = True
                        print(f"  Post {post['id']}: {btn.get('url', 'no url')} -> {direct_url}")
                    else:
                        new_buttons.append(btn)

                if not needs_update:
                    continue

                msg_id = post["telegram_message_id"]
                platform = post.get("platform", "")

                if platform == "max" and msg_id:
                    from app.services.max_api import get_max_api
                    from app.services.messenger import html_to_max_markdown, build_max_inline_buttons

                    max_api = get_max_api()
                    if not max_api:
                        print(f"  SKIP: no MAX API")
                        continue

                    max_text = html_to_max_markdown(post.get("message_text", ""))
                    max_buttons = build_max_inline_buttons(json.dumps(new_buttons))

                    # Rebuild attachments if file exists
                    attachments = None
                    if post.get("max_file_token"):
                        _type_map = {"photo": "image", "video": "video", "audio": "audio"}
                        attach_type = _type_map.get(post.get("file_type", "file"), "file")
                        attachments = [{"type": attach_type, "payload": {"token": post["max_file_token"]}}]

                    result = await max_api.edit_message(msg_id, max_text, attachments, max_buttons)
                    if result.get("success"):
                        print(f"  OK: post {post['id']} updated in channel")
                    else:
                        print(f"  FAIL: post {post['id']}: {result.get('error')}")

                # Update DB buttons too
                await execute(
                    f"UPDATE {table} SET inline_buttons = $1 WHERE id = $2",
                    json.dumps(new_buttons), post["id"],
                )

            except Exception as e:
                print(f"  ERROR post {post['id']}: {e}")

    print("\nDone!")


if __name__ == "__main__":
    asyncio.run(main())
