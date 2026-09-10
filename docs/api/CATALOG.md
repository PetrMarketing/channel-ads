# Полный каталог REST API MAX Marketing

Всего: 564 методов, 46 разделов.

Сгенерировано из зарегистрированных маршрутов. Не является отчётом об E2E-тестировании всех операций.

[Инструкция и примеры](README.md). `tc` / `tracking_code` — код канала, не его числовой ID.

`user` — API-ключ/JWT; `admin`/`superadmin` — отдельный admin JWT; `metrics-key` — X-API-Key;
`custom-or-public` — публичный или специальный протокол: проверяйте обработчик и параметры.

## Достижения (`achievements`) — 3

[Отдельная OpenAPI-спецификация](achievements.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/achievements/notifications` | List Achievement Notifications | user |
| `POST /api/achievements/notifications/{aid}/seen` | Mark Achievement Seen | user |
| `GET /api/achievements/race` | Get Race Leaderboard | user |

## Администрирование платформы (`admin`) — 120

[Отдельная OpenAPI-спецификация](admin.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `POST /api/admin/auth/login` | Admin Login | custom-or-public |
| `GET /api/admin/auth/me` | Admin Me | admin |
| `GET /api/admin/dashboard/stats` | Dashboard Stats | admin |
| `GET /api/admin/dashboard/charts` | Dashboard Charts | admin |
| `GET /api/admin/users` | List Users | admin |
| `GET /api/admin/users/{user_id}` | Get User | admin |
| `POST /api/admin/channels/{channel_id}/extend-billing` | Extend Billing | admin |
| `POST /api/admin/users/{user_id}/add-tokens` | Add Tokens | admin |
| `GET /api/admin/users/{user_id}/channels` | User Channels | admin |
| `GET /api/admin/users/{user_id}/pins` | User Pins | admin |
| `GET /api/admin/users/{user_id}/broadcasts` | User Broadcasts | admin |
| `GET /api/admin/users/{user_id}/giveaways` | User Giveaways | admin |
| `GET /api/admin/users/{user_id}/lead-magnets` | User Lead Magnets | admin |
| `GET /api/admin/users/{user_id}/generations` | User Generations | admin |
| `GET /api/admin/users/{user_id}/balance-history` | User Balance History | admin |
| `GET /api/admin/onboarding/overrides` | Admin Get Onboarding Overrides | admin |
| `PUT /api/admin/onboarding/overrides/{step_id}` | Admin Set Onboarding Override | admin |
| `POST /api/admin/upload` | Admin Upload | admin |
| `GET /api/admin/notifications` | Admin List Notifications | admin |
| `POST /api/admin/notifications` | Admin Create Notification | admin |
| `PUT /api/admin/notifications/{nid}` | Admin Update Notification | admin |
| `DELETE /api/admin/notifications/{nid}` | Admin Delete Notification | admin |
| `GET /api/admin/broadcasts-users` | Admin List Broadcasts | admin |
| `POST /api/admin/broadcasts-users` | Admin Create Broadcast | admin |
| `PUT /api/admin/broadcasts-users/{bid}` | Admin Update Broadcast | admin |
| `DELETE /api/admin/broadcasts-users/{bid}` | Admin Delete Broadcast | admin |
| `POST /api/admin/broadcasts-users/preview-audience` | Admin Preview Audience | admin |
| `POST /api/admin/broadcasts-users/{bid}/send-test` | Admin Send Test | admin |
| `POST /api/admin/broadcasts-users/{bid}/send-now` | Admin Send Now | admin |
| `POST /api/admin/broadcasts-users/{bid}/cancel` | Admin Cancel Broadcast | admin |
| `GET /api/admin/referrals/overview` | Admin Referrals Overview | admin |
| `GET /api/admin/funnel/registrations` | Admin Registration Funnel | admin |
| `GET /api/admin/action-log` | Admin Action Log List | admin |
| `GET /api/admin/users/{user_id}/referrals` | User Referrals | admin |
| `PUT /api/admin/users/{user_id}/extend-tariff` | Extend Tariff | admin |
| `DELETE /api/admin/users/{user_id}/pins/{pin_id}` | Delete User Pin | admin |
| `PUT /api/admin/users/{user_id}/pins/{pin_id}` | Edit User Pin | admin |
| `DELETE /api/admin/users/{user_id}/broadcasts/{broadcast_id}` | Delete User Broadcast | admin |
| `DELETE /api/admin/users/{user_id}/giveaways/{giveaway_id}` | Delete User Giveaway | admin |
| `PUT /api/admin/users/{user_id}/giveaways/{giveaway_id}` | Edit User Giveaway | admin |
| `DELETE /api/admin/users/{user_id}/lead-magnets/{lm_id}` | Delete User Lead Magnet | admin |
| `GET /api/admin/channels` | List Channels | admin |
| `PUT /api/admin/channels/{channel_id}/billing-status` | Admin Set Billing Status | admin |
| `DELETE /api/admin/channels/{channel_id}` | Admin Delete Channel | admin |
| `GET /api/admin/channels/{channel_id}` | Get Channel | admin |
| `POST /api/admin/channels/{channel_id}/staff` | Add Channel Staff | admin |
| `DELETE /api/admin/channels/{channel_id}/staff/{user_id}` | Remove Channel Staff | admin |
| `GET /api/admin/channels/{channel_id}/pins` | Channel Pins | admin |
| `GET /api/admin/channels/{channel_id}/lead-magnets` | Channel Lead Magnets | admin |
| `GET /api/admin/channels/{channel_id}/content` | Channel Content | admin |
| `GET /api/admin/channels/{channel_id}/giveaways` | Channel Giveaways | admin |
| `GET /api/admin/channels/{channel_id}/links` | Channel Links | admin |
| `PUT /api/admin/channels/{channel_id}/links/{link_id}` | Edit Channel Link | admin |
| `DELETE /api/admin/channels/{channel_id}/links/{link_id}` | Delete Channel Link | admin |
| `GET /api/admin/channels/{channel_id}/broadcasts` | Channel Broadcasts | admin |
| `GET /api/admin/channels/{channel_id}/comments` | Channel Comments | admin |
| `GET /api/admin/channels/{channel_id}/paid-chats` | Channel Paid Chats | admin |
| `GET /api/admin/channels/{channel_id}/funnels` | Channel Funnels | admin |
| `GET /api/admin/channels/{channel_id}/subscribers` | Channel Subscribers | admin |
| `PUT /api/admin/channels/{channel_id}/pins/{item_id}` | Edit Channel Pin | admin |
| `DELETE /api/admin/channels/{channel_id}/pins/{item_id}` | Delete Channel Pin | admin |
| `PUT /api/admin/channels/{channel_id}/content/{item_id}` | Edit Channel Content | admin |
| `DELETE /api/admin/channels/{channel_id}/content/{item_id}` | Delete Channel Content | admin |
| `PUT /api/admin/channels/{channel_id}/broadcasts/{item_id}` | Edit Channel Broadcast | admin |
| `DELETE /api/admin/channels/{channel_id}/broadcasts/{item_id}` | Delete Channel Broadcast | admin |
| `PUT /api/admin/channels/{channel_id}/giveaways/{item_id}` | Edit Channel Giveaway | admin |
| `DELETE /api/admin/channels/{channel_id}/giveaways/{item_id}` | Delete Channel Giveaway | admin |
| `PUT /api/admin/channels/{channel_id}/lead-magnets/{item_id}` | Edit Channel Lm | admin |
| `DELETE /api/admin/channels/{channel_id}/lead-magnets/{item_id}` | Delete Channel Lm | admin |
| `GET /api/admin/channels/{channel_id}/logs` | Channel Logs | admin |
| `GET /api/admin/subscribers` | List Subscribers | admin |
| `GET /api/admin/subscribers/{identifier}` | Get Subscriber | admin |
| `GET /api/admin/subscribers/{identifier}/channels` | Subscriber Channels | admin |
| `GET /api/admin/subscribers/{identifier}/dialog` | Subscriber Dialog | admin |
| `DELETE /api/admin/subscribers/{identifier}/dialog/{message_id}` | Delete Dialog Message | admin |
| `GET /api/admin/admins` | List Admins | superadmin |
| `POST /api/admin/admins` | Create Admin | superadmin |
| `PUT /api/admin/admins/{admin_id}` | Update Admin | superadmin |
| `DELETE /api/admin/admins/{admin_id}` | Delete Admin | superadmin |
| `GET /api/admin/tariffs` | List Tariffs | admin |
| `POST /api/admin/tariffs` | Create Tariff | admin |
| `PUT /api/admin/tariffs/{tariff_id}` | Update Tariff | admin |
| `DELETE /api/admin/tariffs/{tariff_id}` | Delete Tariff | admin |
| `GET /api/admin/finance` | Finance Overview | admin |
| `GET /api/admin/generations` | Admin Generations | admin |
| `GET /api/admin/landings` | List Landings | admin |
| `POST /api/admin/landings` | Create Landing | admin |
| `PUT /api/admin/landings/{landing_id}` | Update Landing | admin |
| `DELETE /api/admin/landings/{landing_id}` | Delete Landing | admin |
| `POST /api/admin/landings/{landing_id}/track` | Track Landing Event | custom-or-public |
| `POST /api/admin/fix-comment-buttons` | Fix Comment Buttons | admin |
| `GET /api/admin/support/tickets` | Admin Support Tickets | admin |
| `GET /api/admin/support/tickets/{ticket_id}` | Admin Support Ticket Detail | admin |
| `POST /api/admin/support/tickets/{ticket_id}/reply` | Admin Support Reply | admin |
| `POST /api/admin/support/tickets/{ticket_id}/return-to-ai` | Admin Return To Ai | admin |
| `POST /api/admin/support/tickets/{ticket_id}/close` | Admin Close Ticket | admin |
| `GET /api/admin/promocodes` | List Promocodes | admin |
| `POST /api/admin/promocodes` | Create Promocode | admin |
| `PUT /api/admin/promocodes/{pid}` | Update Promocode | admin |
| `DELETE /api/admin/promocodes/{pid}` | Delete Promocode | admin |
| `GET /api/admin/blog/categories` | Admin List Categories | admin |
| `POST /api/admin/blog/categories` | Admin Create Category | admin |
| `PUT /api/admin/blog/categories/{cid}` | Admin Update Category | admin |
| `DELETE /api/admin/blog/categories/{cid}` | Admin Delete Category | admin |
| `GET /api/admin/blog/articles` | Admin List Articles | admin |
| `POST /api/admin/blog/articles` | Admin Create Article | admin |
| `GET /api/admin/blog/articles/{aid}` | Admin Get Article | admin |
| `PUT /api/admin/blog/articles/{aid}` | Admin Update Article | admin |
| `DELETE /api/admin/blog/articles/{aid}` | Admin Delete Article | admin |
| `GET /api/admin/blog/articles/{aid}/stats` | Admin Article Stats | admin |
| `GET /api/admin/blog/screenshots` | Admin List Screenshots | admin |
| `POST /api/admin/blog/screenshots` | Admin Create Screenshot | admin |
| `PUT /api/admin/blog/screenshots/{sid}` | Admin Update Screenshot | admin |
| `DELETE /api/admin/blog/screenshots/{sid}` | Admin Delete Screenshot | admin |
| `GET /api/admin/blog/screenshots/{sid}/usages` | Admin Screenshot Usages | admin |
| `GET /api/admin/blog/overview` | Admin Blog Overview | admin |
| `GET /api/admin/blog/missing-screenshots` | Admin Missing Screenshots | admin |
| `GET /api/admin/feature-visibility/` | Admin List | admin |
| `PUT /api/admin/feature-visibility/{key}` | Admin Upsert | admin |
| `DELETE /api/admin/feature-visibility/{key}` | Admin Delete | admin |

## ИИ-Агент (`ai-agent`) — 7

[Отдельная OpenAPI-спецификация](ai-agent.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/ai-agent/{tc}/current` | Current Project | user |
| `POST /api/ai-agent/{tc}/project` | Create Project | user |
| `PUT /api/ai-agent/{tc}/project/{project_id}/brief` | Save Brief | user |
| `POST /api/ai-agent/{tc}/project/{project_id}/source-file` | Upload Source | user |
| `POST /api/ai-agent/{tc}/project/{project_id}/source-url` | Add Source Url | user |
| `DELETE /api/ai-agent/{tc}/project/{project_id}/source/{source_id}` | Delete Source | user |
| `POST /api/ai-agent/{tc}/project/{project_id}/start` | Start Project | user |

## ИИ-помощник (`ai-assistant`) — 5

[Отдельная OpenAPI-спецификация](ai-assistant.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `POST /api/ai-assistant/parse` | Parse Query | user |
| `POST /api/ai-assistant/{task_id}/answer` | Submit Answers | user |
| `POST /api/ai-assistant/{task_id}/confirm` | Confirm Task | user |
| `GET /api/ai-assistant/tasks` | List Tasks | user |
| `GET /api/ai-assistant/{task_id}` | Get Task | user |

## ИИ-контент (`ai-content`) — 25

[Отдельная OpenAPI-спецификация](ai-content.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/ai-content/{tc}/cost` | Get Cost | user |
| `GET /api/ai-content/{tc}/sessions` | List Sessions | user |
| `POST /api/ai-content/{tc}/session` | Create Session | user |
| `GET /api/ai-content/{tc}/session/{session_id}` | Get Session | user |
| `PUT /api/ai-content/{tc}/session/{session_id}/brief` | Save Brief | user |
| `PUT /api/ai-content/{tc}/session/{session_id}/style` | Save Style | user |
| `POST /api/ai-content/{tc}/session/{session_id}/style-file` | Upload Style File | user |
| `PUT /api/ai-content/{tc}/session/{session_id}/products` | Save Products | user |
| `POST /api/ai-content/{tc}/session/{session_id}/products-file` | Upload Products File | user |
| `POST /api/ai-content/{tc}/session/{session_id}/generate` | Generate Posts | user |
| `GET /api/ai-content/{tc}/session/{session_id}/text-progress` | Get Text Progress | user |
| `PUT /api/ai-content/{tc}/session/{session_id}/post/{post_id}` | Update Session Post | user |
| `DELETE /api/ai-content/{tc}/session/{session_id}/post/{post_id}` | Delete Session Post | user |
| `POST /api/ai-content/{tc}/session/{session_id}/post/{post_id}/file` | Upload Post File | user |
| `POST /api/ai-content/{tc}/session/{session_id}/post/{post_id}/publish` | Publish Session Post | user |
| `POST /api/ai-content/{tc}/session/{session_id}/publish-all` | Publish All | user |
| `GET /api/ai-content/{tc}/photos` | List Photos | user |
| `POST /api/ai-content/{tc}/photos` | Upload Photo | user |
| `PUT /api/ai-content/{tc}/photos/{photo_id}` | Update Photo | user |
| `DELETE /api/ai-content/{tc}/photos/{photo_id}` | Delete Photo | user |
| `POST /api/ai-content/{tc}/session/{sid}/post/{pid}/generate-prompt` | Generate Image Prompt | user |
| `POST /api/ai-content/{tc}/session/{sid}/post/{pid}/generate-image` | Generate Image For Post | user |
| `POST /api/ai-content/{tc}/session/{sid}/generate-images-all` | Generate Images All | user |
| `GET /api/ai-content/{tc}/session/{sid}/batch-progress` | Get Batch Progress | user |
| `DELETE /api/ai-content/{tc}/session/{sid}/post/{pid}/image` | Delete Post Image | user |

## ИИ-оформление и лид-магниты (`ai-design`) — 15

[Отдельная OpenAPI-спецификация](ai-design.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/ai-design/{tc}/sessions` | List Sessions | user |
| `POST /api/ai-design/{tc}/session` | Create Session | user |
| `PUT /api/ai-design/{tc}/session/{session_id}/survey` | Save Survey | user |
| `POST /api/ai-design/{tc}/session/{session_id}/photo` | Upload Photo | user |
| `POST /api/ai-design/{tc}/session/{session_id}/generate-avatars` | Generate Avatars | user |
| `POST /api/ai-design/{tc}/session/{session_id}/generate-descriptions` | Generate Descriptions | user |
| `POST /api/ai-design/{tc}/session/{session_id}/choose-avatar` | Choose Avatar | user |
| `POST /api/ai-design/{tc}/session/{session_id}/choose-description` | Choose Description | user |
| `POST /api/ai-design/{tc}/session/{session_id}/apply` | Apply To Channel | user |
| `GET /api/ai-design/{tc}/session/{session_id}` | Get Session | user |
| `POST /api/ai-design/{tc}/session/{session_id}/lm-pdf` | Upload Lm Pdf | user |
| `POST /api/ai-design/{tc}/session/{session_id}/generate-lm-ideas` | Generate Lm Ideas | user |
| `POST /api/ai-design/{tc}/session/{session_id}/choose-lm-idea` | Choose Lm Idea | user |
| `POST /api/ai-design/{tc}/session/{session_id}/generate-lm-content` | Generate Lm Content | user |
| `POST /api/ai-design/{tc}/session/{session_id}/install-lm` | Install Lead Magnet | user |

## ИИ-сайты (`ai-landing`) — 13

[Отдельная OpenAPI-спецификация](ai-landing.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/ai-landing/{tc}/landings` | List Landings | user |
| `POST /api/ai-landing/{tc}/landing` | Create Landing | user |
| `PUT /api/ai-landing/{tc}/landing/{landing_id}/survey` | Save Survey | user |
| `POST /api/ai-landing/{tc}/landing/{landing_id}/photo` | Upload Photo | user |
| `DELETE /api/ai-landing/{tc}/landing/{landing_id}/photo/{photo_index}` | Delete Photo | user |
| `PUT /api/ai-landing/{tc}/landing/{landing_id}/photo/{photo_index}` | Update Photo Desc | user |
| `PUT /api/ai-landing/{tc}/landing/{landing_id}/spec` | Save Spec | user |
| `POST /api/ai-landing/{tc}/landing/{landing_id}/generate-spec` | Generate Spec | user |
| `POST /api/ai-landing/{tc}/landing/{landing_id}/generate` | Generate Landing | user |
| `POST /api/ai-landing/{tc}/landing/{landing_id}/edit` | Edit Landing | user |
| `POST /api/ai-landing/{tc}/landing/{landing_id}/publish` | Publish Landing | user |
| `GET /api/ai-landing/{tc}/landing/{landing_id}` | Get Landing Data | user |
| `PUT /api/ai-landing/{tc}/landing/{landing_id}/metrika` | Save Metrika | user |

## ИИ-посты (`ai-post`) — 2

[Отдельная OpenAPI-спецификация](ai-post.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `POST /api/ai-post/{tc}/generate-text` | Generate Post Text | user |
| `POST /api/ai-post/{tc}/generate-image` | Generate Post Image | user |

## Аналитика (`analytics`) — 2

[Отдельная OpenAPI-спецификация](analytics.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/analytics/{tc}` | Get Analytics | user |
| `GET /api/analytics/{tc}/summary` | Get Summary | user |

## Объявления (`announcements`) — 2

[Отдельная OpenAPI-спецификация](announcements.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/announcements/active` | List Active Announcements | user |
| `POST /api/announcements/{nid}/seen` | Mark Announcement Seen | user |

## Авторизация и аккаунт (`auth`) — 8

[Отдельная OpenAPI-спецификация](auth.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/auth/me` | Get Me | user |
| `POST /api/auth/set-source` | Set Source | session-jwt |
| `POST /api/auth/telegram` | Auth Telegram | custom-or-public |
| `POST /api/auth/max-webapp` | Auth Max Webapp | custom-or-public |
| `POST /api/auth/merge` | Merge Accounts | session-jwt |
| `POST /api/auth/unlink` | Generate Unlink Code | session-jwt |
| `POST /api/auth/generate-link-code` | Generate Link Code | session-jwt |
| `POST /api/auth/verify-link-code` | Verify Link Code | custom-or-public |

## Тарифы, оплата и сотрудники (`billing`) — 19

[Отдельная OpenAPI-спецификация](billing.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/billing/plans` | Get Plans Protected | user |
| `GET /api/billing/overview` | Billing Overview | user |
| `POST /api/billing/calculate` | Calculate | user |
| `POST /api/billing/calculate-multi` | Calculate Multi | user |
| `POST /api/billing/pay-multi` | Create Multi Payment | user |
| `GET /api/billing/{tracking_code}/status` | Get Billing Status | user |
| `POST /api/billing/{tracking_code}/pay` | Create Payment | user |
| `GET /api/billing/{tracking_code}/payment-status/{payment_id}` | Get Payment Status | user |
| `GET /api/billing/{tracking_code}/payments` | List Payments | user |
| `GET /api/billing/{tracking_code}/staff` | List Staff | user |
| `POST /api/billing/{tracking_code}/staff` | Add Staff | user |
| `PUT /api/billing/{tracking_code}/staff/{staff_id}` | Update Staff Role | user |
| `DELETE /api/billing/{tracking_code}/staff/{staff_id}` | Remove Staff | user |
| `POST /api/billing/{tracking_code}/staff/invite` | Create Staff Invite | user |
| `GET /api/billing/ai-tokens` | Get Ai Tokens | user |
| `POST /api/billing/ai-tokens/buy` | Buy Ai Tokens | user |
| `POST /api/billing/ai-tokens/fulfill` | Fulfill Ai Tokens | custom-or-public |
| `GET /api/billing/public/plans` | Get Plans | custom-or-public |
| `POST /api/billing/public/webhook/tinkoff` | Tinkoff Webhook | custom-or-public |

## Блог (`blog`) — 4

[Отдельная OpenAPI-спецификация](blog.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/blog/categories` | List Categories | custom-or-public |
| `GET /api/blog/articles` | List Articles | custom-or-public |
| `GET /api/blog/articles/{slug}` | Get Article | custom-or-public |
| `POST /api/blog/articles/{slug}/cta-click` | Track Cta Click | custom-or-public |

## Данные бота (`bot-info`) — 1

[Отдельная OpenAPI-спецификация](bot-info.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/bot-info` | Bot Info | custom-or-public |

## Рассылки (`broadcasts`) — 16

[Отдельная OpenAPI-спецификация](broadcasts.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/broadcasts/{tc}/lead-magnets` | List Lead Magnets | user |
| `GET /api/broadcasts/{tc}` | List Broadcasts | user |
| `POST /api/broadcasts/{tc}` | Create Broadcast | user |
| `PUT /api/broadcasts/{tc}/{bc_id}` | Update Broadcast | user |
| `DELETE /api/broadcasts/{tc}/{bc_id}` | Delete Broadcast | user |
| `POST /api/broadcasts/{tc}/count-recipients` | Count Recipients With Filters | user |
| `GET /api/broadcasts/{tc}/{bc_id}/recipients-count` | Recipients Count | user |
| `GET /api/broadcasts/{tc}/total-recipients` | Total Recipients | user |
| `POST /api/broadcasts/{tc}/{bc_id}/send` | Send Broadcast | user |
| `GET /api/broadcasts/{tc}/{bc_id}/status` | Broadcast Status | user |
| `POST /api/broadcasts/{tc}/{bc_id}/send-test` | Send Test | user |
| `GET /api/broadcasts/{tc}/{bc_id}/stats` | Broadcast Stats | user |
| `POST /api/broadcasts/{tc}/{bc_id}/copy` | Copy Broadcast | user |
| `POST /api/broadcasts/{tc}/{bc_id}/copy-to/{target_tc}` | Copy To Channel | user |
| `POST /api/broadcasts/{tc}/{bc_id}/edit-sent` | Edit Sent Messages | user |
| `POST /api/broadcasts/{tc}/{bc_id}/delete-sent` | Delete Sent Messages | user |

## Каналы, подписчики и корзина (`channels`) — 15

[Отдельная OpenAPI-спецификация](channels.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/channels/unclaimed/list` | List Unclaimed | user |
| `POST /api/channels/scan` | Scan Channels | user |
| `GET /api/channels/trash` | List Trash | user |
| `GET /api/channels/` | List Channels | user |
| `GET /api/channels/{tracking_code}` | Get Channel | user |
| `PUT /api/channels/{tracking_code}` | Update Channel | user |
| `DELETE /api/channels/{tracking_code}` | Delete Channel | user |
| `GET /api/channels/{tracking_code}/achievements` | Get Channel Achievements | user |
| `GET /api/channels/{tracking_code}/levels` | Get Channel Levels | user |
| `GET /api/channels/{tracking_code}/stats` | Get Channel Stats | user |
| `GET /api/channels/{tracking_code}/subscribers` | Get Subscribers | user |
| `POST /api/channels/{tracking_code}/claim` | Claim Channel | user |
| `POST /api/channels/{tracking_code}/restore` | Restore Channel | user |
| `DELETE /api/channels/{tracking_code}/purge` | Purge Channel | user |
| `POST /api/channels/{tracking_code}/refresh-invite-link` | Refresh Invite Link | user |

## Заметки о клиентах (`clients`) — 5

[Отдельная OpenAPI-спецификация](clients.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/clients/{tc}/notes/{identifier}` | Get Notes | user |
| `POST /api/clients/{tc}/notes/{identifier}` | Add Note | user |
| `GET /api/clients/{tc}/wazzup-settings` | Get Wazzup Settings | user |
| `POST /api/clients/{tc}/wazzup-settings` | Save Wazzup Settings | user |
| `GET /api/clients/{tc}/wazzup-channels` | Get Wazzup Channels | user |

## Комментарии (`comments`) — 8

[Отдельная OpenAPI-спецификация](comments.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/comments/{tc}` | List Comments | user |
| `DELETE /api/comments/{tc}/{comment_id}` | Delete Comment | user |
| `POST /api/comments/{tc}/{comment_id}/reply` | Reply Comment | user |
| `GET /api/comments/{tc}/settings` | Get Comment Settings | user |
| `PUT /api/comments/{tc}/settings` | Update Comment Settings | user |
| `POST /api/comments/{tc}/settings/upload-bg` | Upload Comment Bg | user |
| `GET /api/comments/public/{post_type}/{post_id}` | Public Get Comments | custom-or-public |
| `POST /api/comments/public/{post_type}/{post_id}` | Public Add Comment | custom-or-public |

## Посты и публикации (`content`) — 8

[Отдельная OpenAPI-спецификация](content.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/content/{tc}` | List Posts | user |
| `POST /api/content/{tc}` | Create Post | user |
| `PUT /api/content/{tc}/{post_id}` | Update Post | user |
| `DELETE /api/content/{tc}/{post_id}` | Delete Post | user |
| `POST /api/content/{tc}/{post_id}/publish` | Publish Post | user |
| `POST /api/content/{tc}/generate-plan` | Generate Plan | user |
| `POST /api/content/{tc}/generate-posts` | Generate Posts | user |
| `POST /api/content/{tc}/generate` | Generate Legacy | user |

## Обзор (`dashboard`) — 3

[Отдельная OpenAPI-спецификация](dashboard.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/dashboard` | Dashboard Stats | user |
| `GET /api/dashboard/subscription-bonuses` | List Subscription Bonuses | user |
| `POST /api/dashboard/subscription-bonuses/{key}/claim` | Claim Subscription Bonus | user |

## Доступность функций (`feature-visibility`) — 1

[Отдельная OpenAPI-спецификация](feature-visibility.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/feature-visibility/` | List Visibility | custom-or-public |

## Библиотека файлов (`files`) — 5

[Отдельная OpenAPI-спецификация](files.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/files/{tc}/files` | List User Files | user |
| `GET /api/files/{tc}/text-generations` | List Text Generations | user |
| `GET /api/files/{tc}/image-generations` | List Image Generations | user |
| `DELETE /api/files/{tc}/text-generations/{gen_id}` | Delete Text Generation | user |
| `DELETE /api/files/{tc}/image-generations/{gen_id}` | Delete Image Generation | user |

## Воронки и шаги (`funnels`) — 6

[Отдельная OpenAPI-спецификация](funnels.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/funnels/{tc}` | List Funnels | user |
| `POST /api/funnels/{tc}/{lm_id}/steps` | Create Step | user |
| `PUT /api/funnels/{tc}/{lm_id}/steps/{step_id}` | Update Step | user |
| `DELETE /api/funnels/{tc}/{lm_id}/steps/{step_id}` | Delete Step | user |
| `POST /api/funnels/{tc}/{lm_id}/steps/reorder` | Reorder Steps | user |
| `POST /api/funnels/{tc}/{lm_id}/steps/{step_id}/copy` | Copy Step | user |

## Геопоиск (`geo`) — 2

[Отдельная OpenAPI-спецификация](geo.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/geo/reverse` | Geo Reverse | custom-or-public |
| `GET /api/geo/suggest` | Geo Suggest | custom-or-public |

## Розыгрыши (`giveaways`) — 6

[Отдельная OpenAPI-спецификация](giveaways.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/giveaways/{tc}` | List Giveaways | user |
| `POST /api/giveaways/{tc}` | Create Giveaway | user |
| `PUT /api/giveaways/{tc}/{giveaway_id}` | Update Giveaway | user |
| `DELETE /api/giveaways/{tc}/{giveaway_id}` | Delete Giveaway | user |
| `POST /api/giveaways/{tc}/{giveaway_id}/publish` | Publish Giveaway | user |
| `POST /api/giveaways/{tc}/{giveaway_id}/draw` | Draw Winner | user |

## API-ключи и документация (`integration`) — 4

[Отдельная OpenAPI-спецификация](integration.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/integration/keys` | List Keys | session-jwt |
| `POST /api/integration/keys` | Create Key | session-jwt |
| `DELETE /api/integration/keys/{key_id}` | Revoke Key | session-jwt |
| `GET /api/integration/catalog` | Get Catalog | custom-or-public |

## Ссылки и пиксели (`links`) — 8

[Отдельная OpenAPI-спецификация](links.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/links/{tracking_code}` | List Links | user |
| `POST /api/links/{tracking_code}` | Create Link | user |
| `PUT /api/links/{tracking_code}/{link_id}` | Update Link | user |
| `DELETE /api/links/{tracking_code}/{link_id}` | Delete Link | user |
| `PUT /api/links/{tracking_code}/{link_id}/metrika` | Update Metrika | user |
| `POST /api/links/{tracking_code}/{link_id}/lm-image` | Upload Lm Image | user |
| `PATCH /api/links/{tracking_code}/{link_id}/pause` | Toggle Pause | user |
| `GET /api/links/{tracking_code}/{link_id}/daily-stats` | Link Daily Stats | user |

## Подключение MAX (`max`) — 6

[Отдельная OpenAPI-спецификация](max.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/max/{tc}/status` | Max Status | user |
| `GET /api/max/{tc}/chats` | List Chats | user |
| `POST /api/max/{tc}/connect` | Connect Channel | user |
| `POST /api/max/{tc}/disconnect` | Disconnect Channel | user |
| `POST /api/max/{tc}/discover` | Discover Channels | user |
| `POST /api/max/{tc}/refresh` | Refresh Chat Info | user |

## Служебные метрики (`metrics`) — 14

[Отдельная OpenAPI-спецификация](metrics.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/metrics/overview` | Overview | metrics-key |
| `GET /api/metrics/users` | Users Metrics | metrics-key |
| `GET /api/metrics/channels` | Channels Metrics | metrics-key |
| `GET /api/metrics/revenue` | Revenue Metrics | metrics-key |
| `GET /api/metrics/engagement` | Engagement Metrics | metrics-key |
| `GET /api/metrics/billing` | Billing Metrics | metrics-key |
| `GET /api/metrics/lead-magnets` | Lead Magnets Metrics | metrics-key |
| `GET /api/metrics/giveaways` | Giveaways Metrics | metrics-key |
| `GET /api/metrics/broadcasts` | Broadcasts Metrics | metrics-key |
| `GET /api/metrics/funnels` | Funnels Metrics | metrics-key |
| `GET /api/metrics/paid-chats` | Paid Chats Metrics | metrics-key |
| `GET /api/metrics/courses` | Courses Metrics | metrics-key |
| `GET /api/metrics/top-channels` | Top Channels Metrics | metrics-key |
| `GET /api/metrics/conversion-funnel` | Conversion Funnel | metrics-key |

## Модули канала (`modules`) — 2

[Отдельная OpenAPI-спецификация](modules.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/modules/{tracking_code}` | Get Module Settings | custom-or-public |
| `PUT /api/modules/{tracking_code}/{module_type}` | Toggle Module | custom-or-public |

## Уведомления (`notifications`) — 8

[Отдельная OpenAPI-спецификация](notifications.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/notifications/{tc}/templates` | List Templates | user |
| `POST /api/notifications/{tc}/templates` | Create Template | user |
| `PUT /api/notifications/{tc}/templates/{tmpl_id}` | Update Template | user |
| `DELETE /api/notifications/{tc}/templates/{tmpl_id}` | Delete Template | user |
| `GET /api/notifications/{tc}/log` | List Log | user |
| `GET /api/notifications/{tc}/stats` | Notification Stats | user |
| `POST /api/notifications/{tc}/send` | Send Notification | user |
| `POST /api/notifications/{tc}/send-bulk` | Send Bulk Notification | user |

## Онбординг (`onboarding`) — 6

[Отдельная OpenAPI-спецификация](onboarding.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/onboarding/text-overrides` | Get Text Overrides | custom-or-public |
| `GET /api/onboarding/state` | Get State | user |
| `POST /api/onboarding/complete-step` | Complete Step | user |
| `POST /api/onboarding/skip` | Skip Onboarding | user |
| `POST /api/onboarding/finish` | Finish Onboarding | user |
| `POST /api/onboarding/reset` | Reset Onboarding | user |

## Маркировка рекламы (`ord`) — 12

[Отдельная OpenAPI-спецификация](ord.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/ord/{tc}/settings` | Get Settings | user |
| `POST /api/ord/{tc}/settings` | Save Settings | user |
| `GET /api/ord/{tc}/persons` | List Persons | user |
| `POST /api/ord/{tc}/persons` | Create Person | user |
| `GET /api/ord/{tc}/contracts` | List Contracts | user |
| `POST /api/ord/{tc}/contracts` | Create Contract | user |
| `POST /api/ord/{tc}/pads` | Create Pad | user |
| `POST /api/ord/{tc}/creatives` | Create Creative | user |
| `GET /api/ord/{tc}/creatives` | List Creatives | user |
| `POST /api/ord/{tc}/statistics` | Send Statistics | user |
| `GET /api/ord/{tc}/marked-posts` | List Marked Posts | user |
| `GET /api/ord/{tc}/kktu` | Search Kktu | user |

## Оплата участия в чате (`paid-chat-pay`) — 9

[Отдельная OpenAPI-спецификация](paid-chat-pay.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/paid-chat-pay/{tc}/info` | Get Payment Info | custom-or-public |
| `POST /api/paid-chat-pay/{tc}/create` | Create Payment | custom-or-public |
| `POST /api/paid-chat-pay/confirm/{order_id}` | Confirm Payment From Redirect | custom-or-public |
| `GET /api/paid-chat-pay/status/{order_id}` | Get Payment Status | custom-or-public |
| `POST /api/paid-chat-pay/webhook/tinkoff` | Webhook Tinkoff | custom-or-public |
| `POST /api/paid-chat-pay/webhook/yoomoney` | Webhook Yoomoney | custom-or-public |
| `POST /api/paid-chat-pay/webhook/prodamus` | Webhook Prodamus | custom-or-public |
| `POST /api/paid-chat-pay/webhook/robokassa` | Webhook Robokassa | custom-or-public |
| `POST /api/paid-chat-pay/webhook/getcourse/{tc}` | Webhook Getcourse | custom-or-public |

## Платные чаты (`paid-chats`) — 32

[Отдельная OpenAPI-спецификация](paid-chats.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/paid-chats/{tc}/payment-settings` | List Payment Settings | user |
| `POST /api/paid-chats/{tc}/payment-settings` | Save Payment Settings | user |
| `DELETE /api/paid-chats/{tc}/payment-settings/{setting_id}` | Delete Payment Settings | user |
| `GET /api/paid-chats/{tc}/plans` | List Plans | user |
| `POST /api/paid-chats/{tc}/plans` | Create Plan | user |
| `PUT /api/paid-chats/{tc}/plans/{plan_id}` | Update Plan | user |
| `DELETE /api/paid-chats/{tc}/plans/{plan_id}` | Delete Plan | user |
| `GET /api/paid-chats/{tc}/chats` | List Chats | user |
| `POST /api/paid-chats/{tc}/chats` | Create Chat | user |
| `GET /api/paid-chats/{tc}/available-chats` | List Available Chats | user |
| `PUT /api/paid-chats/{tc}/chats/{chat_id}` | Update Chat | user |
| `DELETE /api/paid-chats/{tc}/chats/{chat_id}` | Delete Chat | user |
| `GET /api/paid-chats/{tc}/members` | List Members | user |
| `POST /api/paid-chats/{tc}/members` | Add Member | user |
| `PUT /api/paid-chats/{tc}/members/{member_id}` | Update Member | user |
| `DELETE /api/paid-chats/{tc}/members/{member_id}` | Remove Member | user |
| `POST /api/paid-chats/{tc}/members/mark-paid/{payment_id}` | Mark Payment As Paid | user |
| `GET /api/paid-chats/{tc}/notifications` | List Notifications | user |
| `POST /api/paid-chats/{tc}/notifications` | Save Notification | user |
| `POST /api/paid-chats/{tc}/notifications-upload` | Save Notification Upload | user |
| `DELETE /api/paid-chats/{tc}/notifications/{notif_id}/image` | Delete Notification Image | user |
| `DELETE /api/paid-chats/{tc}/notifications/{notif_id}` | Delete Notification | user |
| `GET /api/paid-chats/{tc}/posts` | List Posts | user |
| `POST /api/paid-chats/{tc}/posts` | Create Post | user |
| `POST /api/paid-chats/{tc}/posts-upload` | Create Post Upload | user |
| `PUT /api/paid-chats/{tc}/posts/{post_id}` | Update Post | user |
| `DELETE /api/paid-chats/{tc}/posts/{post_id}` | Delete Post | user |
| `PUT /api/paid-chats/{tc}/posts-upload/{post_id}` | Update Post Upload | user |
| `POST /api/paid-chats/{tc}/posts/{post_id}/publish` | Publish Saved Post | user |
| `POST /api/paid-chats/{tc}/publish-post` | Publish Post Json | user |
| `POST /api/paid-chats/{tc}/publish-post-upload` | Publish Post Upload | user |
| `GET /api/paid-chats/{tc}/setup-status` | Setup Status | user |

## Платежи (`payments`) — 13

[Отдельная OpenAPI-спецификация](payments.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/payments/{tc}/plans` | List Plans | user |
| `POST /api/payments/{tc}/plans` | Create Plan | user |
| `PUT /api/payments/{tc}/plans/{plan_id}` | Update Plan | user |
| `DELETE /api/payments/{tc}/plans/{plan_id}` | Delete Plan | user |
| `GET /api/payments/{tc}/payments` | List Payments | user |
| `POST /api/payments/{tc}/payments` | Record Payment | user |
| `POST /api/payments/{tc}/payments/{payment_id}/refund` | Refund Payment | user |
| `GET /api/payments/{tc}/analytics` | Payment Analytics | user |
| `POST /api/payments/webhook/tinkoff` | Webhook Tinkoff | custom-or-public |
| `POST /api/payments/webhook/yoomoney` | Webhook Yoomoney | custom-or-public |
| `POST /api/payments/webhook/prodamus` | Webhook Prodamus | custom-or-public |
| `POST /api/payments/webhook/robokassa` | Webhook Robokassa | custom-or-public |
| `POST /api/payments/webhook/getcourse/{tc}` | Webhook Getcourse | custom-or-public |

## Закрепы и лид-магниты (`pins`) — 14

[Отдельная OpenAPI-спецификация](pins.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/pins/{tc}/lead-magnets` | List Lead Magnets | user |
| `POST /api/pins/{tc}/lead-magnets` | Create Lead Magnet | user |
| `PUT /api/pins/{tc}/lead-magnets/{lm_id}` | Update Lead Magnet | user |
| `DELETE /api/pins/{tc}/lead-magnets/{lm_id}` | Delete Lead Magnet | user |
| `GET /api/pins/{tc}` | List Pins | user |
| `POST /api/pins/{tc}` | Create Pin Json | user |
| `POST /api/pins/{tc}/upload` | Create Pin Upload | user |
| `PUT /api/pins/{tc}/{pin_id}` | Update Pin | user |
| `DELETE /api/pins/{tc}/{pin_id}` | Delete Pin | user |
| `POST /api/pins/{tc}/{pin_id}/upload` | Update Pin Upload | user |
| `POST /api/pins/{tc}/send-preview` | Send Preview | user |
| `POST /api/pins/{tc}/{pin_id}/publish` | Publish Pin | user |
| `POST /api/pins/{tc}/{pin_id}/unpin` | Unpin Post | user |
| `GET /api/pins/{tc}/{pin_id}/leads` | Get Pin Leads | user |

## Опросы (`polls`) — 8

[Отдельная OpenAPI-спецификация](polls.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/polls/public/{poll_id}` | Public Get Poll | custom-or-public |
| `POST /api/polls/public/{poll_id}/vote` | Public Vote | custom-or-public |
| `GET /api/polls/{tc}` | List Polls | user |
| `POST /api/polls/{tc}` | Create Poll | user |
| `GET /api/polls/{tc}/{poll_id}` | Get Poll | user |
| `PUT /api/polls/{tc}/{poll_id}` | Update Poll | user |
| `DELETE /api/polls/{tc}/{poll_id}` | Delete Poll | user |
| `GET /api/polls/{tc}/{poll_id}/results` | Poll Results | user |

## Партнёры (`referrals`) — 7

[Отдельная OpenAPI-спецификация](referrals.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/referrals/dashboard` | Referral Dashboard | user |
| `GET /api/referrals/links` | List Links | user |
| `POST /api/referrals/links` | Create Link | user |
| `DELETE /api/referrals/links/{link_id}` | Delete Link | user |
| `GET /api/referrals/earnings` | List Earnings | user |
| `POST /api/referrals/use-balance` | Use Balance | user |
| `POST /api/referrals/register` | Register Referral Endpoint | user |

## Услуги и запись (`services`) — 40

[Отдельная OpenAPI-спецификация](services.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/services/{tc}/branches` | List Branches | user |
| `POST /api/services/{tc}/branches` | Create Branch | user |
| `PUT /api/services/{tc}/branches/{bid}` | Update Branch | user |
| `DELETE /api/services/{tc}/branches/{bid}` | Delete Branch | user |
| `GET /api/services/{tc}/categories` | List Categories | user |
| `POST /api/services/{tc}/categories` | Create Category | user |
| `PUT /api/services/{tc}/categories/{cid}` | Update Category | user |
| `DELETE /api/services/{tc}/categories/{cid}` | Delete Category | user |
| `GET /api/services/{tc}/services` | List Services | user |
| `POST /api/services/{tc}/services` | Create Service | user |
| `PUT /api/services/{tc}/services/{sid}` | Update Service | user |
| `DELETE /api/services/{tc}/services/{sid}` | Delete Service | user |
| `GET /api/services/{tc}/specialists` | List Specialists | user |
| `POST /api/services/{tc}/specialists` | Create Specialist | user |
| `PUT /api/services/{tc}/specialists/{sid}` | Update Specialist | user |
| `DELETE /api/services/{tc}/specialists/{sid}` | Delete Specialist | user |
| `POST /api/services/{tc}/specialists/{sid}/photo` | Upload Specialist Photo | user |
| `POST /api/services/{tc}/services/{sid}/image` | Upload Service Image | user |
| `POST /api/services/{tc}/settings/cover` | Upload Settings Cover | user |
| `POST /api/services/{tc}/specialists/{sid}/services` | Assign Specialist Services | user |
| `GET /api/services/{tc}/specialists/{sid}/services` | Get Specialist Services | user |
| `GET /api/services/{tc}/bookings` | List Bookings | user |
| `POST /api/services/{tc}/bookings` | Create Booking | user |
| `PUT /api/services/{tc}/bookings/{bid}` | Update Booking | user |
| `DELETE /api/services/{tc}/bookings/{bid}` | Delete Booking | user |
| `GET /api/services/{tc}/clients` | List Clients | user |
| `GET /api/services/{tc}/client-bookings` | Client Bookings | user |
| `GET /api/services/{tc}/notification-templates` | List Notification Templates | user |
| `POST /api/services/{tc}/notification-templates` | Upsert Notification Template | user |
| `GET /api/services/{tc}/settings` | Get Settings | user |
| `POST /api/services/{tc}/settings` | Save Settings | user |
| `GET /api/services/{tc}/payment-settings` | List Payment Settings | user |
| `POST /api/services/{tc}/payment-settings` | Save Payment Settings | user |
| `DELETE /api/services/{tc}/payment-settings/{setting_id}` | Delete Payment Settings | user |
| `GET /api/services/public/{tc}/catalog` | Public Catalog | custom-or-public |
| `GET /api/services/public/{tc}/specialists` | Public Specialists | custom-or-public |
| `GET /api/services/public/{tc}/available-dates` | Public Available Dates | custom-or-public |
| `GET /api/services/public/{tc}/slots` | Public Slots | custom-or-public |
| `POST /api/services/public/{tc}/book` | Public Book | custom-or-public |
| `GET /api/services/public/{tc}/appearance` | Public Appearance | custom-or-public |

## Интернет-магазин (`shop`) — 52

[Отдельная OpenAPI-спецификация](shop.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `POST /api/shop/{tc}/upload-image` | Upload Image | user |
| `GET /api/shop/{tc}/settings` | Get Settings | user |
| `POST /api/shop/{tc}/settings` | Save Settings | user |
| `GET /api/shop/{tc}/payment-settings` | List Payment Settings | user |
| `POST /api/shop/{tc}/payment-settings` | Save Payment Settings | user |
| `DELETE /api/shop/{tc}/payment-settings/{setting_id}` | Delete Payment Settings | user |
| `GET /api/shop/{tc}/categories` | List Categories | user |
| `POST /api/shop/{tc}/categories` | Create Category | user |
| `PUT /api/shop/{tc}/categories/{cid}` | Update Category | user |
| `DELETE /api/shop/{tc}/categories/{cid}` | Delete Category | user |
| `GET /api/shop/{tc}/products` | List Products | user |
| `POST /api/shop/{tc}/products` | Create Product | user |
| `PUT /api/shop/{tc}/products/{pid}` | Update Product | user |
| `DELETE /api/shop/{tc}/products/{pid}` | Delete Product | user |
| `POST /api/shop/{tc}/import-feed` | Import Feed | user |
| `POST /api/shop/{tc}/import-feed-file` | Import Feed File | user |
| `GET /api/shop/{tc}/attributes` | List Attributes | user |
| `POST /api/shop/{tc}/attributes` | Create Attribute | user |
| `PUT /api/shop/{tc}/attributes/{aid}` | Update Attribute | user |
| `DELETE /api/shop/{tc}/attributes/{aid}` | Delete Attribute | user |
| `GET /api/shop/{tc}/products/{pid}/images` | List Product Images | user |
| `POST /api/shop/{tc}/products/{pid}/images` | Upload Product Image | user |
| `DELETE /api/shop/{tc}/products/{pid}/images/{idx}` | Delete Product Image | user |
| `PUT /api/shop/{tc}/products/{pid}/main-image` | Set Main Image | user |
| `GET /api/shop/{tc}/products/{pid}/variants` | List Variants | user |
| `POST /api/shop/{tc}/products/{pid}/variants` | Create Variant | user |
| `PUT /api/shop/{tc}/products/{pid}/variants/{vid}` | Update Variant | user |
| `DELETE /api/shop/{tc}/products/{pid}/variants/{vid}` | Delete Variant | user |
| `GET /api/shop/{tc}/delivery` | List Delivery | user |
| `POST /api/shop/{tc}/delivery` | Create Delivery | user |
| `PUT /api/shop/{tc}/delivery/{did}` | Update Delivery | user |
| `DELETE /api/shop/{tc}/delivery/{did}` | Delete Delivery | user |
| `GET /api/shop/{tc}/promotions` | List Promotions | user |
| `POST /api/shop/{tc}/promotions` | Create Promotion | user |
| `PUT /api/shop/{tc}/promotions/{pid}` | Update Promotion | user |
| `DELETE /api/shop/{tc}/promotions/{pid}` | Delete Promotion | user |
| `GET /api/shop/{tc}/orders` | List Orders | user |
| `PUT /api/shop/{tc}/orders/{oid}/status` | Update Order Status | user |
| `GET /api/shop/{tc}/orders/stats` | Orders Stats | user |
| `GET /api/shop/{tc}/clients` | Clients Funnel | user |
| `GET /api/shop/{tc}/clients/{identifier}/orders` | Client Orders | user |
| `GET /api/shop/public/{tc}/catalog` | Public Catalog | custom-or-public |
| `GET /api/shop/public/{tc}/product/{pid}` | Public Product | custom-or-public |
| `GET /api/shop/public/{tc}/appearance` | Public Appearance | custom-or-public |
| `GET /api/shop/public/{tc}/customer-info` | Get Customer Info | custom-or-public |
| `GET /api/shop/public/{tc}/delivery-methods` | Public Delivery Methods | custom-or-public |
| `GET /api/shop/public/{tc}/cart/{user_id}` | Get Cart | custom-or-public |
| `POST /api/shop/public/{tc}/cart` | Add To Cart | custom-or-public |
| `DELETE /api/shop/public/{tc}/cart/{user_id}/{item_id}` | Remove Cart Item | custom-or-public |
| `POST /api/shop/public/{tc}/checkout` | Checkout | custom-or-public |
| `POST /api/shop/public/{tc}/apply-promo` | Apply Promo | custom-or-public |
| `POST /api/shop/public/{tc}/track-visit` | Track Visit | custom-or-public |

## Приглашения сотрудников (`staff`) — 2

[Отдельная OpenAPI-спецификация](staff.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/staff/invite/{token}` | Get Staff Invite Info | custom-or-public |
| `POST /api/staff/invite/{token}/accept` | Accept Staff Invite | user |

## Эфиры (`streams`) — 7

[Отдельная OpenAPI-спецификация](streams.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/streams/public/{stream_id}` | Public Get Stream | custom-or-public |
| `GET /api/streams/{tc}` | List Streams | user |
| `POST /api/streams/{tc}` | Create Stream | user |
| `GET /api/streams/{tc}/{stream_id}` | Get Stream | user |
| `PUT /api/streams/{tc}/{stream_id}` | Update Stream | user |
| `DELETE /api/streams/{tc}/{stream_id}` | Delete Stream | user |
| `POST /api/streams/{tc}/{stream_id}/regenerate-key` | Regenerate Key | user |

## Поддержка (`support`) — 8

[Отдельная OpenAPI-спецификация](support.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `GET /api/support/topics` | Get Support Topics | custom-or-public |
| `POST /api/support/operator-request` | Operator Request | user |
| `GET /api/support/ticket` | Get Or Create Ticket | user |
| `GET /api/support/ticket/{ticket_id}/messages` | Get Messages | user |
| `POST /api/support/ticket/{ticket_id}/escalate` | Escalate Ticket | user |
| `POST /api/support/ticket/{ticket_id}/message` | Send Message | user |
| `POST /api/support/ticket/{ticket_id}/photo` | Send Photo | user |
| `POST /api/support/ticket/{ticket_id}/close` | Close Ticket | user |

## Подключение Telegram (`telegram`) — 1

[Отдельная OpenAPI-спецификация](telegram.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `POST /api/telegram/webhook` | Telegram Webhook | custom-or-public |

## Трекинг конверсий (`track`) — 10

[Отдельная OpenAPI-спецификация](track.openapi.json)

| Метод и путь | Операция | Доступ |
| --- | --- | --- |
| `POST /api/track/miniapp-visit` | Miniapp Visit | custom-or-public |
| `POST /api/track/click/{short_code}` | Record Click | custom-or-public |
| `GET /api/track/info/{short_code}` | Get Link Info | custom-or-public |
| `POST /api/track/visit` | Create Visit | custom-or-public |
| `POST /api/track/subscribe` | Create Subscription | custom-or-public |
| `GET /api/track/check-subscription` | Check Subscription | custom-or-public |
| `POST /api/track/visit/{visit_id}/await-subscription` | Await Subscription | custom-or-public |
| `POST /api/track/visit/{visit_id}/ym-client-id` | Update Visit Ym Client Id | custom-or-public |
| `GET /api/track/check-subscription-by-visit` | Check Subscription By Visit | custom-or-public |
| `GET /api/track/check-subscription-by-token` | Check Subscription By Token | custom-or-public |
