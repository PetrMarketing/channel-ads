"""Generate reviewable API artifacts from registered routes without starting workers/DB.

Run from repository root: PYTHONPATH=backend-python python scripts/export_api_catalog.py
"""
import json
from pathlib import Path
from app.main import app
from app.services.api_catalog import build_schema, catalog, module_schema, postman_collection


def main():
    output = Path(__file__).resolve().parents[1] / "docs" / "api"
    output.mkdir(parents=True, exist_ok=True)
    schema = build_schema(app)
    cat = catalog(schema)
    artifacts = {"openapi.json": schema, "catalog.json": cat,
                 "postman_collection.json": postman_collection(schema)}
    lines = ["# Полный каталог REST API MAX Marketing", "",
             f"Всего: {cat['total']} методов, {len(cat['modules'])} разделов.", "",
             "Сгенерировано из зарегистрированных маршрутов. Не является отчётом об E2E-тестировании всех операций.", "",
             "[Инструкция и примеры](README.md). `tc` / `tracking_code` — код канала, не его числовой ID.", "",
             "`user` — API-ключ/JWT; `admin`/`superadmin` — отдельный admin JWT; `metrics-key` — X-API-Key;",
             "`custom-or-public` — публичный или специальный протокол: проверяйте обработчик и параметры.", ""]
    for module in cat["modules"]:
        artifacts[f"{module['id']}.openapi.json"] = module_schema(schema, module["id"])
        lines += [f"## {module['title']} (`{module['id']}`) — {module['count']}", "",
                  f"[Отдельная OpenAPI-спецификация]({module['id']}.openapi.json)", "",
                  "| Метод и путь | Операция | Доступ |", "| --- | --- | --- |"]
        for op in module["operations"]:
            lines.append(f"| `{op['method']} {op['path']}` | {op['summary']} | {op['access']} |")
        lines.append("")
    for filename, value in artifacts.items():
        (output / filename).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "CATALOG.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"Exported {cat['total']} operations in {len(cat['modules'])} modules to {output}")


if __name__ == "__main__":
    main()
