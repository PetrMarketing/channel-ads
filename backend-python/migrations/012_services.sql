-- Migration 012: Services (booking) module

CREATE TABLE IF NOT EXISTS service_branches (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    city TEXT,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    working_hours JSONB DEFAULT '{}',
    buffer_time INTEGER DEFAULT 0,
    phone TEXT,
    email TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_categories (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES service_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES service_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    service_type TEXT DEFAULT 'single',
    duration_minutes INTEGER DEFAULT 60,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    max_participants INTEGER DEFAULT 1,
    cancel_hours INTEGER DEFAULT 24,
    color TEXT DEFAULT '#4F46E5',
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_specialists (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES service_branches(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    position TEXT,
    phone TEXT,
    email TEXT,
    photo_url TEXT,
    description TEXT,
    rating DECIMAL(3,2) DEFAULT 0,
    working_hours JSONB DEFAULT '{}',
    max_bookings_per_day INTEGER DEFAULT 10,
    status TEXT DEFAULT 'working',
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS specialist_services (
    id SERIAL PRIMARY KEY,
    specialist_id INTEGER REFERENCES service_specialists(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    custom_price DECIMAL(10,2),
    UNIQUE(specialist_id, service_id)
);

CREATE TABLE IF NOT EXISTS service_bookings (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES service_branches(id) ON DELETE SET NULL,
    specialist_id INTEGER REFERENCES service_specialists(id) ON DELETE SET NULL,
    service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
    client_name TEXT,
    client_phone TEXT,
    client_email TEXT,
    client_max_user_id TEXT,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status TEXT DEFAULT 'pending',
    payment_status TEXT DEFAULT 'unpaid',
    amount DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_subscriptions (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
    client_name TEXT,
    client_phone TEXT,
    client_max_user_id TEXT,
    total_visits INTEGER DEFAULT 1,
    used_visits INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_notification_templates (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    message_text TEXT NOT NULL DEFAULT '',
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, event_type)
);

CREATE TABLE IF NOT EXISTS service_settings (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE UNIQUE,
    primary_color TEXT DEFAULT '#4F46E5',
    secondary_color TEXT DEFAULT '#7C3AED',
    text_color TEXT DEFAULT '#1F2937',
    bg_color TEXT DEFAULT '#FFFFFF',
    logo_url TEXT,
    welcome_text TEXT DEFAULT '',
    min_booking_hours INTEGER DEFAULT 2,
    slot_step_minutes INTEGER DEFAULT 30,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_bookings_date ON service_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_service_bookings_specialist ON service_bookings(specialist_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_service_bookings_channel ON service_bookings(channel_id);
CREATE INDEX IF NOT EXISTS idx_services_channel ON services(channel_id);
CREATE INDEX IF NOT EXISTS idx_service_specialists_channel ON service_specialists(channel_id);
CREATE INDEX IF NOT EXISTS idx_service_branches_channel ON service_branches(channel_id);
