-- Migration 001: Initial schema
-- All CREATE TABLE statements (excluding paid_chat_* tables)

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    password TEXT,
    max_user_id TEXT,
    max_dialog_chat_id TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channels (
    id SERIAL PRIMARY KEY,
    channel_id BIGINT UNIQUE,
    title TEXT,
    username TEXT,
    owner_id INTEGER REFERENCES users(id),
    user_id INTEGER REFERENCES users(id),
    yandex_metrika_id TEXT,
    vk_pixel_id TEXT,
    ym_oauth_token TEXT,
    max_chat_id TEXT,
    max_connected INTEGER DEFAULT 0,
    tracking_code TEXT UNIQUE,
    platform TEXT DEFAULT 'telegram',
    is_active INTEGER DEFAULT 1,
    sheet_share_token TEXT,
    join_link TEXT,
    trial_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracking_links (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id),
    name TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    short_code TEXT UNIQUE,
    ym_counter_id TEXT,
    ym_goal_name TEXT,
    is_paused INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    sheet_share_token TEXT,
    link_type TEXT DEFAULT 'landing',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS visits (
    id SERIAL PRIMARY KEY,
    tracking_link_id INTEGER REFERENCES tracking_links(id) ON DELETE SET NULL,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    telegram_id BIGINT,
    username TEXT,
    first_name TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    ip_address TEXT,
    user_agent TEXT,
    platform TEXT DEFAULT 'telegram',
    max_user_id TEXT,
    ym_client_id TEXT,
    visited_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id),
    telegram_id BIGINT,
    username TEXT,
    first_name TEXT,
    visit_id INTEGER REFERENCES visits(id),
    platform TEXT DEFAULT 'telegram',
    max_user_id TEXT,
    subscribed_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, telegram_id)
);

CREATE TABLE IF NOT EXISTS clicks (
    id SERIAL PRIMARY KEY,
    link_id INTEGER REFERENCES tracking_links(id) ON DELETE CASCADE,
    ip_address TEXT,
    user_agent TEXT,
    clicked_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_magnets (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    message_text TEXT,
    file_path TEXT,
    file_type TEXT,
    telegram_file_id TEXT,
    attach_type TEXT,
    file_data BYTEA,
    max_file_token TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pin_posts (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message_text TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    telegram_message_id TEXT,
    lead_magnet_id INTEGER REFERENCES lead_magnets(id) ON DELETE SET NULL,
    inline_buttons TEXT,
    attach_type TEXT,
    file_path TEXT,
    file_type TEXT,
    file_data BYTEA,
    max_file_token TEXT,
    button_type TEXT DEFAULT 'link',
    lm_button_text TEXT DEFAULT 'Получить бесплатно',
    created_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    lead_magnet_id INTEGER REFERENCES lead_magnets(id) ON DELETE CASCADE,
    telegram_id BIGINT,
    max_user_id TEXT,
    platform TEXT DEFAULT 'telegram',
    username TEXT,
    first_name TEXT,
    claimed_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(lead_magnet_id, telegram_id)
);

CREATE TABLE IF NOT EXISTS offline_conversions (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER UNIQUE REFERENCES subscriptions(id),
    channel_id INTEGER REFERENCES channels(id),
    visit_id INTEGER REFERENCES visits(id),
    ym_client_id TEXT NOT NULL,
    ym_counter_id TEXT NOT NULL,
    goal_name TEXT NOT NULL DEFAULT 'subscribe_channel',
    conversion_time TIMESTAMP NOT NULL,
    uploaded_at TIMESTAMP,
    upload_error TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channel_modules (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    module_type TEXT NOT NULL,
    is_enabled INTEGER DEFAULT 1,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, module_type)
);

CREATE TABLE IF NOT EXISTS broadcasts (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message_text TEXT NOT NULL,
    file_path TEXT,
    file_type TEXT,
    telegram_file_id TEXT,
    target_type TEXT DEFAULT 'all_leads',
    target_lead_magnet_id INTEGER REFERENCES lead_magnets(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'draft',
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    inline_buttons TEXT,
    attach_type TEXT,
    filter_rules TEXT,
    file_data BYTEA,
    max_file_token TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS funnel_steps (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    lead_magnet_id INTEGER REFERENCES lead_magnets(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    delay_minutes INTEGER NOT NULL DEFAULT 60,
    message_text TEXT NOT NULL,
    file_path TEXT,
    file_type TEXT,
    telegram_file_id TEXT,
    is_active INTEGER DEFAULT 1,
    inline_buttons TEXT,
    attach_type TEXT,
    delay_type TEXT DEFAULT 'after_minutes',
    delay_config TEXT,
    file_data BYTEA,
    max_file_token TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS funnel_progress (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    funnel_step_id INTEGER REFERENCES funnel_steps(id) ON DELETE CASCADE,
    telegram_id BIGINT,
    max_user_id TEXT,
    platform TEXT DEFAULT 'telegram',
    status TEXT DEFAULT 'pending',
    scheduled_at TIMESTAMP NOT NULL,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(lead_id, funnel_step_id)
);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    product_type TEXT NOT NULL DEFAULT 'service',
    title TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2),
    currency TEXT DEFAULT 'RUB',
    image_path TEXT,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS specialists (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    photo_path TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_slots (
    id SERIAL PRIMARY KEY,
    specialist_id INTEGER REFERENCES specialists(id) ON DELETE CASCADE,
    slot_date DATE NOT NULL,
    slot_time TIME NOT NULL,
    is_booked INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    specialist_id INTEGER REFERENCES specialists(id) ON DELETE SET NULL,
    time_slot_id INTEGER REFERENCES time_slots(id) ON DELETE SET NULL,
    telegram_id BIGINT,
    username TEXT,
    first_name TEXT,
    status TEXT DEFAULT 'new',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_posts (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    title TEXT,
    message_text TEXT NOT NULL,
    file_path TEXT,
    file_type TEXT,
    telegram_file_id TEXT,
    telegram_message_id TEXT,
    status TEXT DEFAULT 'draft',
    scheduled_at TIMESTAMP,
    published_at TIMESTAMP,
    ai_generated INTEGER DEFAULT 0,
    inline_buttons TEXT,
    attach_type TEXT,
    file_data BYTEA,
    max_file_token TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_plans (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    goal TEXT,
    niche TEXT,
    products TEXT,
    target_audience TEXT,
    utp TEXT,
    pains TEXT,
    tone_sample TEXT,
    plan_json TEXT,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integrations (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS landing_pages (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    html_content TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS landing_form_submissions (
    id SERIAL PRIMARY KEY,
    landing_page_id INTEGER REFERENCES landing_pages(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT DEFAULT '',
    message TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    image_path TEXT,
    price DECIMAL(10,2) DEFAULT 0,
    currency TEXT DEFAULT 'RUB',
    access_days INTEGER,
    drip_enabled INTEGER DEFAULT 0,
    certificate_enabled INTEGER DEFAULT 0,
    certificate_threshold INTEGER DEFAULT 80,
    status TEXT DEFAULT 'draft',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_modules (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    unlock_days INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lessons (
    id SERIAL PRIMARY KEY,
    module_id INTEGER REFERENCES course_modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    lesson_type TEXT DEFAULT 'text',
    video_url TEXT,
    file_path TEXT,
    file_type TEXT,
    duration_minutes INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    is_free INTEGER DEFAULT 0,
    homework_enabled INTEGER DEFAULT 0,
    homework_description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_enrollments (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    client_id INTEGER,
    telegram_id BIGINT,
    max_user_id TEXT,
    platform TEXT DEFAULT 'telegram',
    status TEXT DEFAULT 'active',
    progress INTEGER DEFAULT 0,
    enrolled_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lesson_progress (
    id SERIAL PRIMARY KEY,
    enrollment_id INTEGER REFERENCES course_enrollments(id) ON DELETE CASCADE,
    lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'not_started',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    UNIQUE(enrollment_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS homework_submissions (
    id SERIAL PRIMARY KEY,
    lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
    enrollment_id INTEGER REFERENCES course_enrollments(id) ON DELETE CASCADE,
    content TEXT,
    file_path TEXT,
    file_type TEXT,
    status TEXT DEFAULT 'submitted',
    teacher_comment TEXT,
    grade INTEGER,
    submitted_at TIMESTAMP DEFAULT NOW(),
    reviewed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS certificates (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    enrollment_id INTEGER REFERENCES course_enrollments(id) ON DELETE CASCADE,
    certificate_number TEXT UNIQUE,
    student_name TEXT,
    course_title TEXT,
    issued_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    telegram_id BIGINT,
    max_user_id TEXT,
    platform TEXT DEFAULT 'telegram',
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    email TEXT,
    birth_date DATE,
    gender TEXT,
    avatar_path TEXT,
    source TEXT,
    notes TEXT,
    total_spent DECIMAL(10,2) DEFAULT 0,
    visit_count INTEGER DEFAULT 0,
    loyalty_points INTEGER DEFAULT 0,
    loyalty_tier TEXT DEFAULT 'basic',
    is_blocked INTEGER DEFAULT 0,
    custom_fields JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    last_visit_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_tags (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_tag_links (
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES client_tags(id) ON DELETE CASCADE,
    PRIMARY KEY(client_id, tag_id)
);

CREATE TABLE IF NOT EXISTS client_notes (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL,
    author_name TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_segments (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    conditions JSONB DEFAULT '[]',
    client_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_variants (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    sku TEXT,
    price DECIMAL(10,2),
    old_price DECIMAL(10,2),
    stock INTEGER DEFAULT 0,
    weight DECIMAL(10,3),
    option1_name TEXT,
    option1_value TEXT,
    option2_name TEXT,
    option2_value TEXT,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_properties (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    property_type TEXT DEFAULT 'text',
    values_list JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_property_values (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    property_id INTEGER REFERENCES product_properties(id) ON DELETE CASCADE,
    value TEXT,
    UNIQUE(product_id, property_id)
);

CREATE TABLE IF NOT EXISTS product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL,
    alt_text TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS carts (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    session_id TEXT,
    telegram_id BIGINT,
    max_user_id TEXT,
    platform TEXT DEFAULT 'telegram',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
    id SERIAL PRIMARY KEY,
    cart_id INTEGER REFERENCES carts(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity INTEGER DEFAULT 1,
    price DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipping_methods (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    method_type TEXT DEFAULT 'flat_rate',
    price DECIMAL(10,2) DEFAULT 0,
    free_threshold DECIMAL(10,2),
    description TEXT,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promo_codes (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    discount_type TEXT DEFAULT 'percentage',
    discount_value DECIMAL(10,2) NOT NULL,
    min_order_amount DECIMAL(10,2) DEFAULT 0,
    max_uses INTEGER,
    used_count INTEGER DEFAULT 0,
    applies_to TEXT DEFAULT 'all',
    product_ids JSONB DEFAULT '[]',
    starts_at TIMESTAMP,
    expires_at TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
    movement_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reason TEXT,
    reference_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_programs (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Программа лояльности',
    points_per_ruble DECIMAL(10,4) DEFAULT 0.01,
    ruble_per_point DECIMAL(10,4) DEFAULT 1,
    cashback_percent DECIMAL(5,2) DEFAULT 0,
    tiers JSONB DEFAULT '[]',
    referral_bonus INTEGER DEFAULT 0,
    referral_friend_bonus INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id)
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL,
    points INTEGER NOT NULL,
    description TEXT,
    reference_type TEXT,
    reference_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gift_certificates (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    balance DECIMAL(10,2) NOT NULL,
    purchased_by INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    redeemed_by INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    expires_at TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS membership_subscriptions (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    plan_name TEXT NOT NULL,
    total_visits INTEGER,
    remaining_visits INTEGER,
    price DECIMAL(10,2),
    starts_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_plans (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    plan_type TEXT DEFAULT 'one_time',
    total_amount DECIMAL(10,2) NOT NULL,
    installment_count INTEGER DEFAULT 1,
    interval_days INTEGER DEFAULT 30,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'RUB',
    payment_method TEXT,
    payment_status TEXT DEFAULT 'pending',
    gateway_id TEXT,
    gateway_response JSONB,
    installment_number INTEGER DEFAULT 1,
    plan_id INTEGER REFERENCES payment_plans(id) ON DELETE SET NULL,
    refund_amount DECIMAL(10,2) DEFAULT 0,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_schedules (
    id SERIAL PRIMARY KEY,
    specialist_id INTEGER REFERENCES specialists(id) ON DELETE CASCADE,
    day_of_week INTEGER,
    specific_date DATE,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_start TIME,
    break_end TIME,
    is_day_off INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_services (
    specialist_id INTEGER REFERENCES specialists(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    custom_price DECIMAL(10,2),
    custom_duration INTEGER,
    PRIMARY KEY(specialist_id, product_id)
);

CREATE TABLE IF NOT EXISTS staff_payroll (
    id SERIAL PRIMARY KEY,
    specialist_id INTEGER REFERENCES specialists(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    base_salary DECIMAL(10,2) DEFAULT 0,
    commission_percent DECIMAL(5,2) DEFAULT 0,
    commission_amount DECIMAL(10,2) DEFAULT 0,
    bonus DECIMAL(10,2) DEFAULT 0,
    deductions DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) DEFAULT 0,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_templates (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    template_text TEXT NOT NULL,
    send_via TEXT DEFAULT 'bot',
    delay_minutes INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_log (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    template_id INTEGER REFERENCES notification_templates(id) ON DELETE SET NULL,
    event_type TEXT,
    message_text TEXT,
    send_via TEXT DEFAULT 'bot',
    status TEXT DEFAULT 'sent',
    error TEXT,
    sent_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automations (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT NOT NULL,
    trigger_config JSONB DEFAULT '{}',
    is_active INTEGER DEFAULT 1,
    run_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_steps (
    id SERIAL PRIMARY KEY,
    automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    action_config JSONB DEFAULT '{}',
    delay_minutes INTEGER DEFAULT 0,
    condition_config JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_log (
    id SERIAL PRIMARY KEY,
    automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
    step_id INTEGER REFERENCES automation_steps(id) ON DELETE SET NULL,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    telegram_id BIGINT,
    max_user_id TEXT,
    status TEXT DEFAULT 'executed',
    result JSONB,
    executed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_queue (
    id SERIAL PRIMARY KEY,
    automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
    step_id INTEGER REFERENCES automation_steps(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    telegram_id BIGINT,
    max_user_id TEXT,
    platform TEXT DEFAULT 'telegram',
    scheduled_at TIMESTAMP NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webinars (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    type TEXT NOT NULL DEFAULT 'live',
    status TEXT NOT NULL DEFAULT 'not_started',
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    video_url TEXT,
    recording_url TEXT,
    max_viewers INTEGER DEFAULT 0,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webinar_scenarios (
    id SERIAL PRIMARY KEY,
    webinar_id INTEGER NOT NULL REFERENCES webinars(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'Основной сценарий',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webinar_scenario_events (
    id SERIAL PRIMARY KEY,
    scenario_id INTEGER NOT NULL REFERENCES webinar_scenarios(id) ON DELETE CASCADE,
    timestamp_seconds INTEGER NOT NULL DEFAULT 0,
    action_type TEXT NOT NULL,
    content JSONB DEFAULT '{}',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webinar_chat_messages (
    id SERIAL PRIMARY KEY,
    webinar_id INTEGER NOT NULL REFERENCES webinars(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL DEFAULT 'Гость',
    sender_type TEXT NOT NULL DEFAULT 'viewer',
    message_text TEXT NOT NULL,
    is_pinned INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webinar_selling_blocks (
    id SERIAL PRIMARY KEY,
    webinar_id INTEGER NOT NULL REFERENCES webinars(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    button_text TEXT DEFAULT '',
    button_url TEXT DEFAULT '',
    is_visible INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webinar_slides (
    id SERIAL PRIMARY KEY,
    webinar_id INTEGER NOT NULL REFERENCES webinars(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webinar_viewers (
    id SERIAL PRIMARY KEY,
    webinar_id INTEGER NOT NULL REFERENCES webinars(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    telegram_id BIGINT,
    max_user_id TEXT,
    name TEXT,
    joined_at TIMESTAMP DEFAULT NOW(),
    left_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webinar_registrations (
    id SERIAL PRIMARY KEY,
    webinar_id INTEGER NOT NULL REFERENCES webinars(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    telegram_id BIGINT,
    max_user_id TEXT,
    name TEXT,
    phone TEXT,
    email TEXT,
    registered_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channel_billing (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    plan TEXT NOT NULL DEFAULT 'free',
    status TEXT DEFAULT 'active',
    max_users INTEGER DEFAULT 1,
    billing_months INTEGER DEFAULT 1,
    starts_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    notified_7d BOOLEAN DEFAULT FALSE,
    notified_1d BOOLEAN DEFAULT FALSE,
    notified_expired BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_payments (
    id SERIAL PRIMARY KEY,
    channel_billing_id INTEGER REFERENCES channel_billing(id) ON DELETE CASCADE,
    channel_id INTEGER,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'RUB',
    payment_id TEXT,
    provider_payment_id TEXT,
    status TEXT DEFAULT 'pending',
    gateway_response JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_admins (
    id SERIAL PRIMARY KEY,
    channel_billing_id INTEGER REFERENCES channel_billing(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS giveaways (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message_text TEXT,
    description TEXT,
    prize TEXT,
    prizes TEXT,
    image_path TEXT,
    image_type TEXT,
    legal_text TEXT,
    legal_info TEXT,
    erid TEXT,
    overlay_text TEXT,
    conditions TEXT,
    ends_at TIMESTAMP,
    winner_count INTEGER DEFAULT 1,
    attach_type TEXT,
    deep_link_code TEXT,
    file_data BYTEA,
    prepared_image_path TEXT,
    winner_max_user_id TEXT,
    status TEXT DEFAULT 'draft',
    telegram_message_id TEXT,
    participant_count INTEGER DEFAULT 0,
    winner_id BIGINT,
    winner_username TEXT,
    winner_first_name TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP,
    drawn_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS giveaway_participants (
    id SERIAL PRIMARY KEY,
    giveaway_id INTEGER REFERENCES giveaways(id) ON DELETE CASCADE,
    telegram_id BIGINT,
    max_user_id TEXT,
    username TEXT,
    first_name TEXT,
    participant_number INTEGER,
    platform TEXT DEFAULT 'telegram',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(giveaway_id, telegram_id)
);

CREATE TABLE IF NOT EXISTS waitlist (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    specialist_id INTEGER REFERENCES specialists(id) ON DELETE SET NULL,
    preferred_date DATE,
    preferred_time TIME,
    status TEXT DEFAULT 'waiting',
    notified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resources (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    capacity INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resource_services (
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
    PRIMARY KEY(product_id, resource_id)
);

CREATE TABLE IF NOT EXISTS resource_bookings (
    id SERIAL PRIMARY KEY,
    resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_cohorts (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    start_date DATE NOT NULL,
    max_students INTEGER,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS surveys (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_questions (
    id SERIAL PRIMARY KEY,
    survey_id INTEGER REFERENCES surveys(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type TEXT DEFAULT 'text',
    options JSONB DEFAULT '[]',
    is_required INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS survey_responses (
    id SERIAL PRIMARY KEY,
    survey_id INTEGER REFERENCES surveys(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    answers JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_config (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE UNIQUE,
    bonus_amount DECIMAL(10,2) DEFAULT 0,
    friend_bonus DECIMAL(10,2) DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_codes (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    referral_code_id INTEGER REFERENCES referral_codes(id) ON DELETE CASCADE,
    referred_client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    bonus_paid INTEGER DEFAULT 0,
    friend_bonus_paid INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bundles (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2),
    image_path TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bundle_items (
    id SERIAL PRIMARY KEY,
    bundle_id INTEGER REFERENCES bundles(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS group_bookings (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    slot_id INTEGER REFERENCES time_slots(id),
    client_name TEXT,
    client_phone TEXT,
    client_id INTEGER REFERENCES clients(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    specialist_id INTEGER REFERENCES specialists(id) ON DELETE SET NULL,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT,
    is_published INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT DEFAULT 'admin',
    is_active INTEGER DEFAULT 1,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_message_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
    direction TEXT NOT NULL,
    platform TEXT DEFAULT 'telegram',
    message_text TEXT,
    telegram_message_id TEXT,
    max_message_id TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
