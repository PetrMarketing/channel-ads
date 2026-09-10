"""Discover the actual API (not a second, drifting implementation of business routes).

Legacy Request.json/form fields are hints, not invented validation contracts.
Typed FastAPI schemas are preserved verbatim.
"""
import ast
import copy
import inspect
import re
import textwrap
from functools import lru_cache

from fastapi.routing import APIRoute
from fastapi.openapi.utils import get_openapi

TITLES = {
    "channels": "Каналы, подписчики и корзина", "links": "Ссылки и пиксели",
    "pins": "Закрепы и лид-магниты", "funnels": "Воронки и шаги",
    "content": "Посты и публикации", "broadcasts": "Рассылки",
    "shop": "Интернет-магазин", "services": "Услуги и запись",
    "paid-chats": "Платные чаты", "ai-design": "ИИ-оформление и лид-магниты",
    "ai-landing": "ИИ-сайты", "ai-content": "ИИ-контент",
    "ai-post": "ИИ-посты", "ai-agent": "ИИ-Агент", "ai-assistant": "ИИ-помощник",
    "files": "Библиотека файлов", "analytics": "Аналитика",
    "comments": "Комментарии", "polls": "Опросы", "streams": "Эфиры",
    "giveaways": "Розыгрыши", "billing": "Тарифы, оплата и сотрудники",
    "payments": "Платежи", "ord": "Маркировка рекламы", "referrals": "Партнёры",
    "support": "Поддержка", "clients": "Заметки о клиентах",
    "admin": "Администрирование платформы", "auth": "Авторизация и аккаунт",
    "integration": "API-ключи и документация", "dashboard": "Обзор",
    "metrics": "Служебные метрики", "track": "Трекинг конверсий",
    "notifications": "Уведомления", "onboarding": "Онбординг",
    "feature-visibility": "Доступность функций", "blog": "Блог",
    "modules": "Модули канала", "achievements": "Достижения",
    "announcements": "Объявления", "staff": "Приглашения сотрудников",
    "paid-chat-pay": "Оплата участия в чате", "max": "Подключение MAX",
    "telegram": "Подключение Telegram", "geo": "Геопоиск", "bot-info": "Данные бота",
    "landings": "Лендинги",
}


def dependency_names(dep):
    names = {getattr(dep.call, "__name__", "")}
    for child in dep.dependencies:
        names.update(dependency_names(child))
    return names


def access_for(route):
    names = dependency_names(route.dependant)
    if "session_user" in names:
        return "session-jwt"
    if route.path.startswith("/api/auth/") and route.path != "/api/auth/me" and "get_current_user" in names:
        return "session-jwt"
    if route.endpoint.__module__.endswith(".metrics") and "verify_api_key" in names:
        return "metrics-key"
    if names & {"get_current_admin", "require_superadmin"}:
        return "superadmin" if "require_superadmin" in names else "admin"
    if "optional_user" in names:
        return "optional-user"
    if "get_current_user" in names:
        return "user"
    # Explicit credentials / webhook checks live inside these handlers.
    return "custom-or-public"


@lru_cache(maxsize=1024)
def source_hints(endpoint):
    try:
        tree = ast.parse(textwrap.dedent(inspect.getsource(endpoint)))
    except (OSError, TypeError, SyntaxError):
        return {}
    containers = {}
    for n in ast.walk(tree):
        if isinstance(n, (ast.Assign, ast.AnnAssign)):
            value = n.value
            if isinstance(value, ast.Await):
                value = value.value
            if (isinstance(value, ast.Call) and isinstance(value.func, ast.Attribute)
                    and isinstance(value.func.value, ast.Name)
                    and value.func.value.id == "request" and value.func.attr in {"json", "form"}):
                targets = n.targets if isinstance(n, ast.Assign) else [n.target]
                for target in targets:
                    if isinstance(target, ast.Name):
                        containers[target.id] = "application/json" if value.func.attr == "json" else "multipart/form-data"
    # Raw dict Body parameters also lack their field names in stock OpenAPI.
    for p in inspect.signature(endpoint).parameters.values():
        if p.annotation is dict:
            containers[p.name] = "application/json"
    result = {media: set() for media in containers.values()}
    # Legacy UPDATE handlers often use `for key in ("name", ...): body[key]`.
    for loop in (n for n in ast.walk(tree) if isinstance(n, ast.For)):
        if not isinstance(loop.target, ast.Name) or not isinstance(loop.iter, (ast.Tuple, ast.List)):
            continue
        keys = [e.value for e in loop.iter.elts if isinstance(e, ast.Constant) and isinstance(e.value, str)]
        for node in ast.walk(loop):
            if (isinstance(node, ast.Subscript) and isinstance(node.value, ast.Name)
                    and node.value.id in containers and isinstance(node.slice, ast.Name)
                    and node.slice.id == loop.target.id):
                result[containers[node.value.id]].update(keys)
    for n in ast.walk(tree):
        container, key = None, None
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr in {"get", "getlist"}:
            container = n.func.value
            key = n.args[0] if n.args else None
        elif isinstance(n, ast.Subscript):
            container, key = n.value, n.slice
        if (isinstance(container, ast.Name) and container.id in containers
                and isinstance(key, ast.Constant) and isinstance(key.value, str)):
            result[containers[container.id]].add(key.value)
    return {media: sorted(fields) for media, fields in result.items()}


def api_routes(app):
    return [r for r in app.routes if isinstance(r, APIRoute) and r.path.startswith("/api/")]


def build_schema(app):
    routes = api_routes(app)
    schema = get_openapi(title="MAX Marketing REST API", version="1.0.0", routes=routes)
    schema["info"]["description"] = (
        "API всех существующих разделов MAX Marketing. Пути /api сохраняются как в интерфейсе. "
        "Для пользовательских методов: Authorization: Bearer mmk_… (или JWT). "
        "Административные методы требуют отдельный admin JWT; вебхуки и публичные методы имеют свой протокол. "
        "API-ключи не дают дополнительных прав или бесплатных генераций. "
        "x-source-fields — подсказки из legacy-кода, НЕ полная типизированная схема. "
        "Публикации/рассылки/оплаты выполняют реальные действия: не повторяйте POST автоматически."
    )
    schema["servers"] = [{"url": "/"}]
    scheme = schema.setdefault("components", {}).setdefault("securitySchemes", {})
    scheme["UserBearer"] = {"type": "http", "scheme": "bearer", "description": "API-ключ mmk_… либо пользовательский JWT"}
    scheme["AdminBearer"] = {"type": "http", "scheme": "bearer", "description": "Только JWT администратора платформы"}
    scheme["SessionBearer"] = {"type": "http", "scheme": "bearer", "description": "Только пользовательский JWT после входа; API-ключ не подходит"}
    scheme["MetricsKey"] = {"type": "apiKey", "in": "header", "name": "X-API-Key", "description": "Отдельный служебный METRICS_API_KEY"}
    for route in routes:
        module = route.path.split("/")[2]
        hints = source_hints(route.endpoint)
        for method in sorted(route.methods):
            op = schema.get("paths", {}).get(route.path_format, {}).get(method.lower())
            if not op:
                continue
            op["tags"] = [module]
            op["x-access"] = access_for(route)
            op["x-source-fields"] = hints
            op["x-handler"] = f"{route.endpoint.__module__}.{route.endpoint.__name__}"
            op["operationId"] = method.lower() + "_" + re.sub(r"[^a-zA-Z0-9]+", "_", route.path).strip("_")
            if op["x-access"] == "user":
                op["security"] = [{"UserBearer": []}]
            elif op["x-access"] == "session-jwt":
                op["security"] = [{"SessionBearer": []}]
            elif op["x-access"] in {"admin", "superadmin"}:
                op["security"] = [{"AdminBearer": []}]
            elif op["x-access"] == "optional-user":
                op["security"] = [{}, {"UserBearer": []}]
            elif op["x-access"] == "metrics-key":
                op["security"] = [{"MetricsKey": []}]
            if hints:
                content = op.setdefault("requestBody", {}).setdefault("content", {})
                for media, fields in hints.items():
                    if media not in content:
                        content[media] = {"schema": {"type": "object", "additionalProperties": True,
                            "properties": {f: (
                                {"type": "string", "format": "binary"} if media == "multipart/form-data" and f == "file" else
                                {"type": "array", "items": {"type": "string", "format": "binary"}} if media == "multipart/form-data" and f == "files" else
                                {"description": "Поле legacy-обработчика; тип и обязательность проверяет сервер."}
                            ) for f in fields}}}
                op["description"] = (op.get("description", "") + "\n\n"
                    "Legacy-body: перечислены непосредственно читаемые поля. Вложенные структуры, "
                    "условная обязательность и динамические поля могут требовать сверки с обработчиком. "
                    "В multipart объекты и массивы передаются JSON-строками, файлы — binary.").strip()
    schema["tags"] = [{"name": m, "description": TITLES.get(m, m)} for m in sorted({r.path.split('/')[2] for r in routes})]
    return schema


def module_schema(schema, module):
    result = copy.deepcopy(schema)
    result["paths"] = {p: ops for p, ops in result["paths"].items() if p.split('/')[2] == module}
    result["tags"] = [t for t in result["tags"] if t["name"] == module]
    # Keep only transitively referenced models; a shop spec must not carry every admin model.
    retained = {}
    def collect(node):
        if isinstance(node, dict):
            ref = node.get("$ref", "")
            if ref.startswith("#/components/schemas/"):
                name = ref.rsplit("/", 1)[1]
                if name not in retained:
                    retained[name] = result["components"]["schemas"][name]
                    collect(retained[name])
            for value in node.values():
                collect(value)
        elif isinstance(node, list):
            for value in node:
                collect(value)
    collect(result["paths"])
    result["components"]["schemas"] = retained
    return result


def catalog(schema):
    modules = {}
    for path, ops in schema["paths"].items():
        module = path.split('/')[2]
        for method, op in ops.items():
            if method not in {"get", "post", "put", "patch", "delete", "head", "options"}:
                continue
            modules.setdefault(module, []).append({"method": method.upper(), "path": path,
                "summary": op.get("summary", ""), "access": op["x-access"],
                "parameters": op.get("parameters", []), "source_fields": op["x-source-fields"],
                "handler": op["x-handler"]})
    return {"version": "1.0.0", "total": sum(map(len, modules.values())), "modules": [
        {"id": m, "title": TITLES.get(m, m), "count": len(ops), "operations": ops,
         "openapi_url": f"/api/integration/openapi/{m}.json"} for m, ops in sorted(modules.items())]}


def postman_collection(schema):
    def deref(node):
        if "$ref" in node:
            current = schema
            for part in node["$ref"].removeprefix("#/").split("/"):
                current = current[part]
            return current
        return node
    folders = {}
    for path, ops in schema["paths"].items():
        module = path.split('/')[2]
        for method, op in ops.items():
            url = "{{base_url}}" + re.sub(r"\{([^}]+)\}", r"{{\1}}", path)
            req = {"method": method.upper(), "url": url, "header": [],
                   "description": op.get("description", "") + "\nAccess: " + op["x-access"]}
            query = [{"key": p["name"], "value": "{{" + p["name"] + "}}",
                      "disabled": not p.get("required", False), "description": p.get("description", "")}
                     for p in op.get("parameters", []) if p.get("in") == "query"]
            if query:
                required_query = "&".join(p["key"] + "=" + p["value"] for p in query if not p["disabled"])
                req["url"] = {"raw": url + ("?" + required_query if required_query else ""),
                              "host": ["{{base_url}}"], "path": url.split("{{base_url}}/", 1)[1].split("/"), "query": query}
            if op["x-access"] in {"admin", "superadmin"}:
                req["auth"] = {"type": "bearer", "bearer": [{"key": "token", "value": "{{admin_token}}", "type": "string"}]}
            elif op["x-access"] == "session-jwt":
                req["auth"] = {"type": "bearer", "bearer": [{"key": "token", "value": "{{session_token}}", "type": "string"}]}
            elif op["x-access"] == "custom-or-public":
                req["auth"] = {"type": "noauth"}
            elif op["x-access"] == "metrics-key":
                req["auth"] = {"type": "noauth"}
                req["header"].append({"key": "X-API-Key", "value": "{{metrics_key}}"})
            body = op.get("requestBody", {}).get("content", {})
            if body:
                media = "application/json" if "application/json" in body else next(iter(body))
                props = deref(body[media].get("schema", {})).get("properties", {})
                if media == "application/json":
                    req["body"] = {"mode": "raw", "raw": "{}", "options": {"raw": {"language": "json"}}}
                    req["description"] += "\nЗаполните JSON по спецификации: " + ", ".join(props)
                elif media in {"multipart/form-data", "application/x-www-form-urlencoded"}:
                    mode = "formdata" if media == "multipart/form-data" else "urlencoded"
                    req["body"] = {"mode": mode, mode: [{"key": f, "value": "", "disabled": True,
                        "type": "file" if p.get("format") == "binary" or f == "file" else "text"} for f, p in props.items()]}
            folders.setdefault(module, []).append({"name": method.upper() + " " + path, "request": req})
    return {"info": {"name": "MAX Marketing — все разделы", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
            "auth": {"type": "bearer", "bearer": [{"key": "token", "value": "{{api_key}}", "type": "string"}]},
            "variable": [{"key": "base_url", "value": "https://itcakes.ru"}, {"key": "api_key", "value": ""},
                         {"key": "admin_token", "value": ""}, {"key": "session_token", "value": ""}, {"key": "metrics_key", "value": ""},
                         {"key": "tc", "value": ""}, {"key": "tracking_code", "value": ""}],
            "item": [{"name": TITLES.get(m, m), "item": items} for m, items in sorted(folders.items())]}
