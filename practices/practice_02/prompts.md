# Журнал экспериментов Практики 2

- Выбранный слабый артефакт Практики 1: ADR (practices/practice_01/adr.md)
- Что в нём нужно улучшить: статус, критерий принятия, отсутствие привязки к tests_*, неполная схема по правилам, дубли в «Последствиях», пустой раздел про AI.
- Как поймём, что изменение полезно: все пункты ADR подтверждаются CASE.md или P1-02.md и тестами из tests_*; схема покрывает API-1/SEC-1/REL-1/OUT-1/QA-1/OBS-1; убраны дубли и пустые пункты.

| Техника | Файл эксперимента | Изменённый файл Практики 1 | Конкретное изменение | Проверка | Что отклонили |
|---|---|---|---|---|---|
| Few-shot | [`few_shot/experiment.md`](few_shot/experiment.md) | `practices/practice_02/few_shot/updated_adr.md` | Заполнены статус и критерий принятия; добавлены «Решение + Как проверим» по SEC-1/API-1/REL-1/OUT-1/QA-1/OBS-1; убраны дубли; расширена схема; заполнен раздел про AI | Проверка по `few_shot/experiment.md`: ссылки на CASE.md, P1-02.md и tests_*; сопоставление с правилами | Новые факты вне источников; неподтверждённые предположения; дублирующие формулировки |
| R.C.T.F. | [`rctf/experiment.md`](rctf/experiment.md) | `practices/practice_02/rctf/updated_adr.md` | Статус=proposed; критерий accepted через tests_unit/integration/e2e/load; для SEC-1/API-1/REL-1/OUT-1/QA-1/OBS-1 добавлены «Действие + Как проверим» со ссылками на tests_*; удалены дубли; добавлена схема; раздел про AI | Проверка по `rctf/experiment.md`: ссылки на CASE.md, P1-02.md и tests_*; соответствие правилам; отсутствие новых фактов | Новые факты вне источников; изменение порогов/контрактов без tests_*; логирование содержимого diff/ответа |
| Chain of Verification | [`chain_of_verification/experiment.md`](chain_of_verification/experiment.md) | `practices/practice_02/chain_of_verification/updated_adr.md` | Заполнены статус и критерий принятия; добавлены «Как проверим» с ссылками на tests_*; обновлена схема | Проверка по `chain_of_verification/experiment.md`: вопросы и evidence на основе CASE.md, P1-02.md и tests_* | Пустые и дублирующие пункты последствий; неподтверждённые допущения |
| Tree of Thoughts | [`tree_of_thoughts/experiment.md`](tree_of_thoughts/experiment.md) | `practices/practice_02/tree_of_thoughts/updated_adr.md` | Сгенерированы 3 ветви формулировок «Действие + Как проверим» для SEC-1/API-1/REL-1/OUT-1/QA-1/OBS-1; выбрана ветвь A; добавлены краткие «Последствия и главный риск», Mermaid-схема API-1→SEC-1→REL-1→OUT-1/QA-1→OBS-1→JSON; раздел «Как использовали AI» | Проверка по `tree_of_thoughts/experiment.md`: ссылки на CASE.md и tests_*; отсутствие новых фактов; согласованность и краткость | Отклонены новые факты вне CASE.md/tests_*; изменение порогов/контрактов; логирование diff/ответов |
| RAG | [`rag/experiment.md`](rag/experiment.md) | `practices/practice_02/rag/updated_adr.md` | Заполнены статус=proposed и критерий accepted через tests_unit/integration/e2e/load; добавлены «Решение + Как проверим» по SEC-1/API-1/REL-1/OUT-1/QA-1/OBS-1; убраны дубли; обновлена схема; заполнен раздел про AI | Проверка по `rag/experiment.md`: ссылки на CASE.md, P1-02.md и tests_*; сопоставление с правилами | Новые факты вне источников; неподтверждённые предположения; логирование содержимого diff/ответа; изменение порогов без tests_* |
| ReAct | [`react/experiment.md`](react/experiment.md) | `practices/practice_02/react/updated_adr.md` | Статус=proposed; добавлены «Действие + Как проверим» по SEC-1/API-1/REL-1/OUT-1/QA-1/OBS-1; схема Mermaid; раздел про AI | Проверка по `react/experiment.md`: ссылки на CASE.md и tests_*; сопоставление; отсутствие новых фактов | Отклонены новые факты и изменения порогов/логирования |

## Независимое ревью

| Замечание другой команды | Где исправили | Evidence |
|---|---|---|
| Двусмысленность |  |  |
| Непроверяемое требование |  |  |
| Пропущенный риск или источник |  |  |
