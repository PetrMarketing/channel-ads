export const PROVIDERS = [
  { id: 'yoomoney', name: 'ЮMoney', fields: [{ key: 'shop_id', label: 'Shop ID' }, { key: 'secret_key', label: 'Секретный ключ' }] },
  { id: 'prodamus', name: 'Продамус', fields: [{ key: 'api_key', label: 'API-ключ' }, { key: 'shop_url', label: 'URL магазина' }] },
  { id: 'tinkoff', name: 'Тинькофф Эквайринг', fields: [{ key: 'terminal_key', label: 'Terminal Key' }, { key: 'password', label: 'Пароль' }] },
  { id: 'robokassa', name: 'Робокасса', fields: [{ key: 'merchant_login', label: 'Merchant Login' }, { key: 'password1', label: 'Пароль #1' }, { key: 'password2', label: 'Пароль #2' }] },
  { id: 'getcourse', name: 'GetCourse', fields: [{ key: 'account_name', label: 'Аккаунт (поддомен)' }, { key: 'secret_key', label: 'Секретный ключ API' }] },
];

export const EVENT_LABELS = {
  before_subscribe: 'Перед подпиской (описание канала)',
  after_subscribe: 'После подписки (приветствие)',
  '3_days_before_expiry': 'За 3 дня до конца подписки',
  '1_day_before_expiry': 'За 1 день до конца подписки',
};
