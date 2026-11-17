"""Personalised roadmap generator.

A deterministic scheduler (no AI, no randomness): same profile + same content = same plan.

1. Turn every concept into three tasks (learn / practice / interview) sized from its beginner
   hours, shrunk by experience. Add level projects, revision, capstone and mock interviews.
2. Compare the total with the time the learner actually has.
3. If it does not fit, cut things in a fixed order and RECORD every cut so nothing disappears silently.
4. Pack what is left into real calendar days.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date, timedelta
from math import ceil

DOMAINS = {"django", "backend", "student"}
GOALS = {"interview", "learn"}
WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
# Which weekdays are study days for N days/week (Mon=0). Spread out, weekends used last.
STUDY_WEEKDAYS = {1: [5], 2: [2, 5], 3: [0, 2, 5], 4: [0, 1, 3, 5], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6]}
SPLIT = (("learn", 0.50), ("practice", 0.35), ("interview", 0.15))
FOUNDATION_MAX_N = 7  # concepts 1-7 are the basics that experience compresses most
PROJECT_HOURS = {1: 10, 2: 10, 3: 12, 4: 6, 5: 16}  # level 5's project is the capstone
CAPSTONE_LEVEL = 5
CAPSTONE_HOURS = 16  # used only if the content has no level 5
# Lessons that are specific to Django. For learners on another stack they drop to "nice to have".
DJANGO_ONLY = {"django-orm", "drf-api"}
MOCK_HOURS = 2
MOCK_COUNT = 2
REVIEW_HOURS = 1
# Which numbered SQL exercises (Practice page) belong with which concept.
EXERCISES_FOR = {"er-modelling": [1, 2, 3], "data-types": [4, 5, 6, 7, 8, 9, 10, 14, 15], "constraints": [13], "acid": [11], "indexing": [12]}


def parse_profile(data: dict) -> dict:
    """Validate raw input. Raises ValueError with a user-readable message."""
    def num(key, lo, hi, default, integer=False):
        raw = data.get(key, default)
        try:
            v = float(raw)
        except (TypeError, ValueError):
            raise ValueError(f"{key.replace('_', ' ')} must be a number.")
        if not lo <= v <= hi:
            raise ValueError(f"{key.replace('_', ' ')} must be between {lo} and {hi}.")
        return int(v) if integer else round(v * 2) / 2 if key == "hours_per_day" else round(v, 1)

    domain = data.get("domain", "django")
    goal = data.get("goal", "interview")
    if domain not in DOMAINS:
        raise ValueError("Unknown domain.")
    if goal not in GOALS:
        raise ValueError("Unknown goal.")
    start = data.get("start_date") or date.today().isoformat()
    try:
        start_date = date.fromisoformat(str(start))
    except ValueError:
        raise ValueError("start date must look like 2026-12-01.")
    if abs((start_date - date.today()).days) > 366:
        raise ValueError("start date must be within a year of today.")
    return {
        "domain": domain,
        "goal": goal,
        "experience_years": num("experience_years", 0, 30, 0),
        "weeks": num("weeks", 1, 52, 12, integer=True),
        "hours_per_day": num("hours_per_day", 0.5, 12, 2),
        "days_per_week": num("days_per_week", 1, 7, 6, integer=True),
        "start_date": start_date,
    }


@dataclass(frozen=True)
class Task:
    id: str
    kind: str          # learn | practice | interview | project | capstone | review | mock
    title: str
    minutes: int
    route: str
    detail: str
    concept: str | None = None
    priority: int = 1  # 1 core .. 3 nice-to-have (concept tasks only)


def _q15(minutes: float) -> int:
    return max(15, int(round(minutes / 15.0)) * 15)


def _ranges(nums: list[int]) -> str:
    out, i = [], 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        out.append(str(nums[i]) if i == j else f"{nums[i]}–{nums[j]}")
        i = j + 1
    return ", ".join(out)


def _exp_factor(years: float, n: int) -> float:
    if years < 1:
        return 1.0
    if years < 3:
        return 0.75 if n <= FOUNDATION_MAX_N else 1.0
    return 0.55 if n <= FOUNDATION_MAX_N else 0.85


def _build_tasks(p: dict, concepts: list[dict], levels: list[dict]) -> list[Task]:
    django = p["domain"] == "django"
    tasks: list[Task] = []
    by_level: dict[int, list[dict]] = {}
    for c in concepts:
        by_level.setdefault(c["level"], []).append(c)

    for c in concepts:
        total = max(1.0, c["hours"] * _exp_factor(p["experience_years"], c["n"])) * 60
        mins = {kind: _q15(total * share) for kind, share in SPLIT}
        ex = EXERCISES_FOR.get(c["slug"])
        learn_detail = ("Read the concept, run the animation, type the SQL yourself" if c["viz"] else "Read the concept and type the SQL yourself")
        learn_detail += " and study the Django ORM section." if django else ". The Django section is optional for you."
        tasks.append(Task(f"{c['slug']}:learn", "learn", f"Learn: {c['title']}", mins["learn"], f"/concept/{c['slug']}", learn_detail, c["slug"], c["priority"]))
        tasks.append(Task(
            f"{c['slug']}:practice", "practice", f"Practice: {c['title']}", mins["practice"],
            "/practice" if ex else f"/concept/{c['slug']}",
            f"Do SQL exercises {_ranges(ex)}, then the concept's practice task." if ex else "Do the practice task at the bottom of the concept page. Run it for real; do not just read it.",
            c["slug"], c["priority"]))
        tasks.append(Task(f"{c['slug']}:interview", "interview", f"Interview drill: {c['title']}", mins["interview"], "/interview",
                          f"Answer the {c['q_count']} question(s) out loud before revealing, then do your due flashcards.", c["slug"], c["priority"]))

        last_of_level = by_level[c["level"]][-1]["slug"] == c["slug"]
        if last_of_level:
            lv = next((x for x in levels if x["level"] == c["level"]), None)
            if lv:
                is_capstone = lv["level"] == CAPSTONE_LEVEL
                name = lv["project"] if is_capstone else f"Project: {lv['project']}"
                if is_capstone and not django:
                    name = name.replace("Django ", "")
                tasks.append(Task(f"project:{lv['level']}", "capstone" if is_capstone else "project", name, PROJECT_HOURS.get(lv["level"], 8) * 60, "/projects",
                                  "Migrations, transactions, idempotent POST /orders, caching, background jobs, tests." if is_capstone
                                  else "Build it, keep the SQL, query plans and tests in Git."))
            tasks.append(Task(f"review:{c['level']}", "review", f"Revision: Level {c['level']}", REVIEW_HOURS * 60, "/interview",
                              "Redo the questions you missed and re-run the animations without looking at notes."))

    if CAPSTONE_LEVEL not in by_level:  # content without a level 5: fall back to a standalone capstone
        tasks.append(Task("capstone", "capstone", "Capstone: Django e-commerce API" if django else "Capstone: e-commerce backend API", CAPSTONE_HOURS * 60, "/projects",
                          "Migrations, transactions, idempotent POST /orders, caching, tests."))
    if p["goal"] == "interview":
        for i in range(1, MOCK_COUNT + 1):
            tasks.append(Task(f"mock:{i}", "mock", f"Mock interview {i}", MOCK_HOURS * 60, "/practice",
                              "Pick a system-design drill, talk 10 minutes aloud: clarify, estimate, model, architecture, flows, operations, trade-offs."))
    return tasks


def _cut_steps(tasks: list[Task], concepts: list[dict]):
    """Ordered single-item cuts, least valuable first: (category, label, transform).

    Cutting one item at a time (instead of a whole group) means we stop as soon as the plan fits,
    so the learner keeps as much as their time allows.
    """
    n_of = {c["slug"]: c["n"] for c in concepts}
    title = {c["slug"]: c["title"] for c in concepts}
    prio = {c["slug"]: c["priority"] for c in concepts}

    def drop_ids(pred):
        return lambda ts: [t for t in ts if not pred(t)]

    def scale_practice(factor, only_prio=None):
        return lambda ts: [replace(t, minutes=_q15(t.minutes * factor)) if t.kind == "practice" and (only_prio is None or t.priority == only_prio) else t for t in ts]

    steps = [("capstone", "capstone", drop_ids(lambda t: t.kind == "capstone"))]
    for lv in sorted({int(t.id.split(":")[1]) for t in tasks if t.kind == "project"}, reverse=True):
        steps.append(("project", f"Level {lv}", drop_ids(lambda t, lv=lv: t.id == f"project:{lv}")))
    for slug in sorted((c for c in prio if prio[c] == 3), key=lambda c: -n_of[c]):
        steps.append(("p3", title[slug], drop_ids(lambda t, slug=slug: t.concept == slug)))
    steps.append(("review", "", drop_ids(lambda t: t.kind == "review")))
    steps.append(("p2_half", "", scale_practice(0.5, only_prio=2)))
    for slug in sorted((c for c in prio if prio[c] == 2), key=lambda c: -n_of[c]):
        steps.append(("p2_drop", title[slug], drop_ids(lambda t, slug=slug: t.concept == slug)))
    steps.append(("mock", "", drop_ids(lambda t: t.kind == "mock")))
    steps.append(("p1_trim", "", scale_practice(0.7)))
    return steps


def _describe_cuts(events: list[tuple[str, str]]) -> list[str]:
    """Merge single-item cut events into short, readable sentences."""
    by: dict[str, list[str]] = {}
    for cat, label in events:
        by.setdefault(cat, []).append(label)
    out = []
    if "capstone" in by:
        out.append("Skipped the capstone project.")
    if "project" in by:
        out.append("Skipped the level projects for: " + ", ".join(by["project"]) + ".")
    if "p3" in by:
        out.append("Skipped nice-to-have topics: " + ", ".join(by["p3"]) + ".")
    if "review" in by:
        out.append("Skipped level revision sessions.")
    if "p2_half" in by:
        out.append("Halved practice time on important (priority-2) topics.")
    if "p2_drop" in by:
        out.append("Dropped important (priority-2) topics: " + ", ".join(by["p2_drop"]) + ".")
    if "mock" in by:
        out.append("Dropped the mock interviews.")
    if "p1_trim" in by:
        out.append("Trimmed practice time on core topics by 30%.")
    return out


def build_roadmap(p: dict, concepts: list[dict], levels: list[dict]) -> dict:
    cap = max(15, int(round(p["hours_per_day"] * 60 / 15)) * 15)
    start: date = p["start_date"]
    weekdays = set(STUDY_WEEKDAYS[p["days_per_week"]])
    study_days = [start + timedelta(days=i) for i in range(p["weeks"] * 7) if (start + timedelta(days=i)).weekday() in weekdays]
    budget = cap * len(study_days)

    notes: list[str] = []
    if p["domain"] != "django":
        demoted = [c["title"] for c in concepts if c["slug"] in DJANGO_ONLY and c["priority"] < 3]
        if demoted:
            concepts = [{**c, "priority": 3} if c["slug"] in DJANGO_ONLY else c for c in concepts]
            notes.append("These lessons are Django-specific, so they are marked nice-to-have for your stack: " + ", ".join(demoted) + ". The ideas (N+1, serializers, pagination) transfer to other frameworks.")

    tasks = _build_tasks(p, concepts, levels)
    needed = sum(t.minutes for t in tasks)

    if p["experience_years"] >= 1:
        pct = 25 if p["experience_years"] < 3 else 45
        notes.append(f"With {p['experience_years']:g} years of experience the basics (concepts 1–7) are shortened by about {pct}%; skim what you already know and slow down on the hard parts.")

    events: list[tuple[str, str]] = []
    for cat, label, transform in _cut_steps(tasks, concepts):
        if sum(t.minutes for t in tasks) <= budget:
            break
        new = transform(tasks)
        if new != tasks:
            events.append((cat, label))
            tasks = new
    cuts = _describe_cuts(events)

    planned = sum(t.minutes for t in tasks)
    feasible = planned <= budget
    suggestion = None
    if not feasible or cuts:
        suggestion = min(12, max(0.5, ceil((needed / 60 / max(len(study_days), 1)) * 2) / 2))

    # ---- pack into days ----
    chunks: list[tuple[int, int]] = []          # (task index, minutes)
    day_chunks: list[list[tuple[int, int]]] = [[] for _ in study_days]
    ti, remaining = 0, tasks[0].minutes if tasks else 0
    for di in range(len(study_days)):
        room = cap
        while ti < len(tasks) and room >= 15:
            take = min(remaining, room)
            day_chunks[di].append((ti, take))
            chunks.append((ti, take))
            room -= take
            remaining -= take
            if remaining == 0:
                ti += 1
                remaining = tasks[ti].minutes if ti < len(tasks) else 0
        if ti >= len(tasks):
            break
    unscheduled = [t for t in tasks[ti:]] if ti < len(tasks) else []
    if unscheduled and not feasible:
        notes.append(f"Even after cuts you are about {ceil((planned - budget) / 60)} hour(s) short; the plan stops at '{unscheduled[0].title}'.")

    parts_total: dict[int, int] = {}
    for idx, _m in chunks:
        parts_total[idx] = parts_total.get(idx, 0) + 1
    seen_parts: dict[int, int] = {}

    monday0 = start - timedelta(days=start.weekday())
    weeks: dict[int, list[dict]] = {}
    last_session_day = None
    for di, d in enumerate(study_days):
        sessions = []
        for idx, m in day_chunks[di]:
            t = tasks[idx]
            seen_parts[idx] = seen_parts.get(idx, 0) + 1
            sessions.append({
                "id": f"{t.id}#{seen_parts[idx]}", "kind": t.kind, "title": t.title, "minutes": m, "route": t.route, "detail": t.detail,
                "concept": t.concept, "part": [seen_parts[idx], parts_total[idx]],
            })
        if sessions:
            last_session_day = d
        wk = (d - monday0).days // 7 + 1
        weeks.setdefault(wk, []).append({"date": d.isoformat(), "weekday": WEEKDAY_NAMES[d.weekday()], "minutes": sum(s["minutes"] for s in sessions), "buffer": not sessions, "sessions": sessions})

    kept = {t.concept for t in tasks if t.concept}
    reading = [{"slug": c["slug"], "title": c["title"], "priority": c["priority"], "references": c["references"]} for c in concepts if c["slug"] in kept]
    skipped = [{"slug": c["slug"], "title": c["title"]} for c in concepts if c["slug"] not in kept]
    if skipped and p["goal"] == "interview":
        notes.append("Skipped topics are still available on the Roadmap page; come back to them if you finish early.")

    return {
        "profile": {**p, "start_date": start.isoformat()},
        "summary": {
            "needed_hours": round(needed / 60, 1),
            "planned_hours": round(sum(m for _i, m in chunks) / 60, 1),
            "budget_hours": round(budget / 60, 1),
            "study_days": len(study_days),
            "days_used": sum(1 for dc in day_chunks if dc),
            "end_date": last_session_day.isoformat() if last_session_day else None,
            "feasible": feasible,
            "suggested_hours_per_day": suggestion,
        },
        "cuts": cuts,
        "notes": notes,
        "weeks": [{"week": w, "days": days} for w, days in sorted(weeks.items())],
        "reading": reading,
        "skipped": skipped,
    }
