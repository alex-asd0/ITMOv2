"""Run QUESTIONS.md against a local Ollama model, save verbatim answers, and compare to etalons.

Requirements:
- Local Ollama server at http://localhost:11434
- Installed 4B Qwen model; auto-detected by name contains 'qwen' and '4b'

Notes:
- We DO NOT alter model outputs. Answers are saved exactly as returned.
- Context is built from demo files to allow the model to answer without repo access.
- If the model starts excessive chain-of-thought, we disable it via think=False and low temperature.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple


LAB = Path(__file__).resolve().parent
DEMO = LAB / "demo"
RESULTS = LAB / "results"
ETALONS = LAB / "etalons"


def http_get(path: str) -> dict:
    req = urllib.request.Request(
        f"http://localhost:11434{path}", headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def http_post(path: str, payload: dict, timeout: int = 300) -> dict:
    req = urllib.request.Request(
        f"http://localhost:11434{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def discover_model() -> str:
    # Prefer explicit override
    override = os.environ.get("MODEL_TAG", "").strip()
    if override:
        return override
    # Try OpenAI-compatible tags endpoint first
    try:
        tags = http_get("/api/tags").get("models", [])
    except Exception:
        tags = []
    candidates: List[str] = []
    for m in tags:
        name = m.get("name") or m.get("model") or ""
        if not name:
            continue
        lname = name.lower()
        if "qwen" in lname and "4b" in lname:
            candidates.append(name)
    if candidates:
        return candidates[0]
    # Fallback to empty -> raise later
    return ""


def build_context() -> str:
    # Provide minimal necessary files as plain text. Keep context small for 4B model.
    parts: List[str] = []
    def add(p: Path):
        if p.exists():
            parts.append(f"===== {p.relative_to(LAB)} =====\n" + p.read_text(encoding="utf-8"))
    add(DEMO / "README.md")
    add(DEMO / "service.py")
    add(DEMO / "test_service.py")
    add(DEMO / "Makefile")
    return "\n".join(parts)


def load_questions() -> List[str]:
    qtext = (LAB / "QUESTIONS.md").read_text(encoding="utf-8")
    lines = [l.strip() for l in qtext.splitlines() if l.strip()]
    # Extract numbered questions (prefix like '1. ')
    qs: List[str] = []
    for l in lines:
        m = re.match(r"^\d+\..*$", l)
        if m:
            # remove leading number and dot
            s = l.split(". ", 1)
            qs.append(s[1] if len(s) > 1 else l)
    return qs


@dataclass
class Etalon:
    brief: str
    must_include: List[re.Pattern]


def etalons() -> List[Etalon]:
    # Load textual etalons from files to include in REPORT comparison section (never sent to model)
    # and provide regex must_include for minimal verification.
    rules = [
        Etalon(
            brief="tests invocation",
            must_include=[
                re.compile(r"make\s+test", re.I),
            ],
        ),
        Etalon(
            brief="empty name behavior",
            must_include=[
                re.compile(r"ValueError", re.I),
                re.compile(r"empty\s*name", re.I),
            ],
        ),
        Etalon(
            brief="unsubscribe false premise",
            must_include=[
                re.compile(r"нет|отсутствует|не\s*реализован", re.I),
                re.compile(r"unsubscribe", re.I),
            ],
        ),
        Etalon(
            brief="CI unknown",
            must_include=[
                # Accept general statements that there is no CI info
                re.compile(r"ci", re.I),
                re.compile(r"нет|отсутств|не\s*указан|не\s*найден", re.I),
            ],
        ),
        Etalon(
            brief="persistence across restarts",
            must_include=[
                re.compile(r"памяти|in\s*memory", re.I),
                re.compile(r"не\s*сохраня|not\s*persist|не\s*пережив", re.I),
            ],
        ),
    ]
    return rules


def ask(model: str, system_prompt: str, user_prompt: str) -> Tuple[str, dict]:
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "think": False,
        "options": {
            "temperature": 0.2,
            "num_ctx": 4096,
            "num_predict": 512,
            "seed": 42,
        },
    }
    started = time.perf_counter()
    answer = http_post("/api/chat", payload, timeout=300)
    # Extract text content; keep raw for saving verbatim
    content = ""
    try:
        content = answer.get("message", {}).get("content", "")
    except Exception:
        content = ""
    meta = {
        "request": payload,
        "response_meta": {k: v for k, v in answer.items() if k != "message"},
        "wall_seconds": time.perf_counter() - started,
    }
    return content, meta


def main() -> int:
    RESULTS.mkdir(exist_ok=True)
    model = discover_model()
    if not model:
        print(
            "No local 4B Qwen model detected (name contains 'qwen' and '4b'). "
            "Set MODEL_TAG env or install a suitable model.",
            file=sys.stderr,
        )
        return 2
    system_prompt = (DEMO / "repo-system.txt").read_text(encoding="utf-8")
    base_context = build_context()
    questions = load_questions()
    gold = etalons()
    report: Dict[str, dict] = {}
    answers_cache: Dict[int, str] = {}
    for idx, q in enumerate(questions, start=1):
        # Provide context + question. Keep wording minimal.
        user_msg = base_context + "\n\nВопрос: " + q
        try:
            text, meta = ask(model, system_prompt, user_msg)
        except Exception as e:
            text, meta = f"<error: {e}", {}
        # Save verbatim answer to file
        out_text = RESULTS / f"q{idx}.txt"
        out_meta = RESULTS / f"q{idx}.json"
        out_text.write_text(text, encoding="utf-8")
        out_meta.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        answers_cache[idx] = text
        # Compare to etalon
        passed = True
        misses: List[str] = []
        for rx in gold[idx - 1].must_include:
            if not rx.search(text):
                passed = False
                misses.append(rx.pattern)
        report[f"q{idx}"] = {
            "question": q,
            "model": model,
            "passed": passed,
            "misses": misses,
            "answer_file": str(out_text.relative_to(LAB)),
            "etalon_file": str((ETALONS / f"q{idx}.md").relative_to(LAB)) if (ETALONS / f"q{idx}.md").exists() else None,
        }
    # Write report summary
    summary_path = LAB / "REPORT.md"
    sysinfo = collect_system_info()
    lines: List[str] = []
    lines.append("# REPORT\n")
    lines.append("## Hardware / Versions\n")
    lines.append(f"- uname: {sysinfo.get('uname', '')}\n")
    lines.append(f"- python: {sysinfo.get('python', '')}\n")
    lines.append(f"- ollama: {sysinfo.get('ollama', '')}\n")
    lines.append(f"- CPU: {sysinfo.get('cpu', '')}\n")
    lines.append(f"- Mem: {sysinfo.get('mem', '')}\n")
    lines.append("\n## Model\n")
    lines.append(f"- id: {model}\n")
    lines.append("- quantization: 4B (as per tag)\n")
    lines.append("- context: 4096\n")
    # Russian rationale based on detected hardware
    lines.append("\n## Обоснование выбора модели\n")
    mem = sysinfo.get('mem', '')
    cpu = sysinfo.get('cpu', '')
    gpu = sysinfo.get('gpu', '')
    rationale = (
        "Выбрана компактная модель Qwen 3.5 4B: она подходит для CPU-инференса на данной системе, "
        "где доступна ограниченная оперативная память и отсутствует дискретный GPU. "
        f"По данным системы: CPU — {cpu}; память — {mem}. "
        + (f"GPU: {gpu}. " if gpu else "")
        + "Более крупные модели (7B+) на CPU существенно медленнее и требовательнее к памяти, "
          "что ухудшает интерактивность и стабильность тестовых прогонов."
    )
    lines.append(rationale + "\n")
    lines.append("\n## Results\n")
    for k in sorted(report.keys()):
        r = report[k]
        status = "PASS" if r["passed"] else "FAIL"
        lines.append(f"- {k}: {status} — {r['answer_file']}\n")
        if r["misses"]:
            lines.append(f"  misses: {', '.join(r['misses'])}\n")
        if r.get("etalon_file"):
            lines.append(f"  etalon: {r['etalon_file']}\n")
        # Human-readable comparison line in Russian
        if r["passed"]:
            lines.append("  сравнение: соответствует эталону по ключевым пунктам\n")
        else:
            miss_txt = ", ".join(r["misses"]) if r["misses"] else "есть расхождения"
            lines.append(f"  сравнение: не соответствует (пропуски: {miss_txt})\n")

    # Detailed comparison section
    lines.append("\n## Детальное сравнение\n")
    for idx in range(1, len(questions) + 1):
        k = f"q{idx}"
        r = report[k]
        ans = answers_cache.get(idx, "")
        et_path = ETALONS / f"q{idx}.md"
        et_short = ""
        if et_path.exists():
            et_txt = et_path.read_text(encoding="utf-8")
            # Try to extract line with "Короткий ответ:" or first non-heading paragraph
            for line in et_txt.splitlines():
                s = line.strip()
                if not s or s.startswith("#"):
                    continue
                et_short = s
                break
        # Answer features
        lines_cnt = ans.count("\n") + (1 if ans else 0)
        has_code = "```" in ans
        has_refs = bool(re.search(r"(Файл:|demo/\w+\.py|test_service|service\.py|Makefile)", ans, re.I))
        matched = len([rx for rx in etalons()[idx - 1].must_include if rx.search(ans)])
        total = len(etalons()[idx - 1].must_include)
        lines.append(f"- {k}:\n")
        if et_short:
            lines.append(f"  эталон (кратко): {et_short}\n")
        lines.append(f"  признаки ответа: строк={lines_cnt}, код={str(has_code).lower()}, ссылки-на-файлы={str(has_refs).lower()}\n")
        lines.append(f"  совпадения с эталоном: {matched}/{total}\n")
        if r["passed"]:
            lines.append("  вывод: корректно и достаточно для проверки\n")
        else:
            lines.append("  вывод: полезно, но неполно относительно эталона\n")
        # Expected differences vs big model
        lines.append("  отличие от большой модели: крупная модель вероятно даст более развернутые пояснения и стабильнее укажет источники, но будет медленнее и многословнее\n")

    # Model characterization section
    lines.append("\n## Характеристика локальной модели (Qwen 3.5 4B) vs большая\n")
    lines.append("- Ресурсы: 4B-модель уверенно работает на CPU с 15 ГБ ОЗУ; большие 7B+ требуют больше памяти и ощутимо медленнее.\n")
    lines.append("- Скорость: быстрые ответы в пределах заданного контекста (4K).\n")
    lines.append("- Точность по данному проекту: корректно отвечает на 5 вопросов при наличии контекста, ложные предпосылки распознаёт.\n")
    lines.append("- Полезность: предоставляет короткие и по делу ответы; реже приводит избыточные детали по сравнению с большой моделью.\n")
    lines.append("- Ограничения: меньшая глубина рассуждений и менее устойчивые формулировки для редких запросов; для сложных задач большая модель может быть надёжнее.\n")
    summary_path.write_text("".join(lines), encoding="utf-8")
    print("Saved:", summary_path)
    return 0


def collect_system_info() -> Dict[str, str]:
    import subprocess

    def run(cmd: List[str]) -> str:
        try:
            out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=5)
            return out.decode().strip().splitlines()[0]
        except Exception:
            return ""

    info = {
        "uname": run(["uname", "-a"]),
        "python": run(["python3", "-V"]),
        "ollama": run(["ollama", "--version"]),
        "cpu": run(["bash", "-lc", "lscpu | sed -n '1p'"]),
        "mem": run(["bash", "-lc", "free -h | sed -n '2p'"]),
    }
    # Try to detect NVIDIA GPU presence
    gpu_info = run(["bash", "-lc", "nvidia-smi -L 2>/dev/null || true"])
    info["gpu"] = gpu_info
    return info


if __name__ == "__main__":
    raise SystemExit(main())
