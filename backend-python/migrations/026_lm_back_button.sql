-- Кнопка "Вернуться в канал" после получения лид-магнита
ALTER TABLE lead_magnets ADD COLUMN IF NOT EXISTS show_back_button BOOLEAN DEFAULT true;
