# R.C.T.F.

- **Role:**
 Инженер-ревьюер. Обновить ADR по `SEC-1`, `API-1`, `REL-1`, `OUT-1`, `QA-1`, `OBS-1` без новых фактов.
 - **Context:**
 Источники: `practices/practice_01/CASE.md`, `practices/practice_01/P1-02.md`, `practices/practice_01/tests_unit.md`, `practices/practice_01/tests_integration.md`, `practices/practice_01/tests_e2e.md`, `practices/practice_01/tests_load.md`.
 - **Task:**
 Сопоставить факты из источников, обновить ADR: статус=proposed; критерий accepted — пройти tests_unit/integration/e2e/load на соблюдение `SEC-1`/`API-1`/`REL-1`/`OUT-1`/`QA-1`/`OBS-1`; для каждого правила «Действие + Как проверим» со ссылками на tests_*; кратко «Последствия и главный риск»; Mermaid: `API-1 → SEC-1 → REL-1 → OUT-1/QA-1 → OBS-1 → JSON`; «Как использовали AI»: тип R.C.T.F., ссылка на prompts.md, что исправили сами.
 - **Format:**
 Готовые тексты для `rctf/updated_adr.md` и заполненный `rctf/experiment.md`.

## Источники

 - CASE: `practices/practice_01/CASE.md`
 - Анализ: `practices/practice_01/P1-02.md`
 - Тесты: `practices/practice_01/tests_unit.md`, `practices/practice_01/tests_integration.md`, `practices/practice_01/tests_e2e.md`, `practices/practice_01/tests_load.md`

## Факты

 - SEC-1: перед отправкой во внешний LLM секреты в diff редактируются до `[REDACTED]` (CASE.md).
 - API-1: diff > 20 000 символов отклоняется с HTTP 413; 20 000 — граничное допустимое (CASE.md; tests_e2e.md граничный сценарий).
 - REL-1: таймаут LLM 10 секунд; ошибка/таймаут преобразуется в контролируемый ответ (CASE.md; tests_integration.md, tests_e2e.md негативный сценарий без 500).
 - OUT-1: ответ — `summary`, `risks` (≤3, с `file`, `line`, `evidence`, `risk`), `checks` (CASE.md; tests_unit.md валидирует структуру/ограничения; tests_e2e.md позитивный сценарий 200 JSON по OUT-1).
 - QA-1: в ответ включаются только подтверждённые риски (evidence из diff или правило репозитория); лишние отбрасываются (CASE.md; tests_unit.md фильтрация/обрезка).
 - OBS-1: логируются только `request_id`, длительность, статус; diff и содержимое ответа не логируются (CASE.md).

## Изменения

 - Файл: `practices/practice_02/rctf/updated_adr.md`.
 - Добавлено: статус=proposed; критерий accepted — прохождение tests_unit/integration/e2e/load по SEC-1/API-1/REL-1/OUT-1/QA-1/OBS-1 (с прямыми ссылками на tests_*).
 - Для каждого правила: «Действие + Как проверим» со ссылками на соответствующие tests_*.
 - Убраны дубли; добавлена блок-схема Mermaid: `API-1 → SEC-1 → REL-1 → OUT-1/QA-1 → OBS-1 → JSON`.
 - Заполнен раздел «Как использовали AI»: тип R.C.T.F., ссылка на `prompts.md`, что исправлено вручную.

## Проверка

 - Сопоставление с правилами: `CASE.md` и `P1-02.md` подтверждают формулировки действий и рисков.
 - Ссылки на проверки: `tests_unit.md`, `tests_integration.md`, `tests_e2e.md`, `tests_load.md` присутствуют в ADR и покрывают SEC-1/API-1/REL-1/OUT-1/QA-1/OBS-1.

## Отклонённое

 - Новые факты вне перечисленных источников.
 - Изменение порогов (например, лимит diff) без обновления tests_*.
 - Логирование содержимого diff и ответов модели, противоречащее OBS-1.

## Что получили

 Обновлённый ADR: `practices/practice_02/rctf/updated_adr.md` с разделами «Статус и критерий принятия», «Контекст», «Решение и как проверим», «Альтернативы», «Последствия и главный риск», «Схема», «Как использовали AI». Все утверждения подтверждены `CASE.md`, `P1-02.md` и tests_*.

## Что изменили в исходном артефакте

- Файл и раздел:
 `practices/practice_02/rctf/updated_adr.md`, все разделы по списку.
 - Изменение:
 Статус=proposed; критерий accepted через прохождение tests_unit/integration/e2e/load; для каждого правила добавлены «Действие + Как проверим» со ссылками на tests_*; убраны дубли; добавлена схема и раздел про AI.
 - Как проверили:
 Сопоставили пункты с `CASE.md`, `P1-02.md` и ссылками на `tests_unit.md`, `tests_integration.md`, `tests_e2e.md`, `tests_load.md`.
 - Что отклонили:
 Новые факты вне источников; изменение порогов и контрактов, не подтверждённое tests_*; логирование содержимого diff/ответа.
