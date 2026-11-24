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

# The learner's background. Each one studies the tracks that matter for that path (a frontend learner does not need
# the database track, and a Django developer does not need the ML track).
TRACKS_FOR_DOMAIN = {
    # Order matters: it breaks ties when the tracks are mixed, so the track listed first moves first.
    "sde": ["dsa", "system-design", "lld", "cs-core", "swe-core", "database", "delivery"],
    "django": ["dsa", "database", "python-django", "system-design", "lld", "cs-core", "swe-core", "delivery"],
    "backend": ["dsa", "database", "python-django", "system-design", "lld", "cs-core", "swe-core", "delivery"],
    "student": ["dsa", "database", "python-django", "system-design", "lld", "cs-core", "swe-core", "delivery"],
    "fullstack": ["frontend", "dsa", "database", "system-design", "lld", "cs-core", "swe-core", "delivery"],
    "frontend": ["frontend", "dsa", "cs-core", "swe-core", "delivery"],
    "data": ["data", "database", "dsa", "swe-core"],
    "devops": ["devops", "system-design", "cs-core", "delivery", "dsa"],
    "ml": ["ml", "dsa", "swe-core"],
}
# Lessons left out of a role entirely, inside a track the role otherwise uses (a frontend role wants the networking lesson of
# the fundamentals track, not scheduling and virtual memory).
_DSA_SPECIALIST = {"dynamic-programming", "recursion-backtracking", "heaps-priority-queues", "linked-lists"}
EXCLUDE_FOR_DOMAIN = {
    "frontend": {"os-processes-memory", "concurrency-basics"},
    # Their coding rounds are real but shorter than a general SDE loop, and the role's own track is the point of the plan.
    "ml": {"os-processes-memory", "concurrency-basics"} | _DSA_SPECIALIST,
    "data": {"os-processes-memory", "concurrency-basics"} | _DSA_SPECIALIST,
}
DOMAINS = set(TRACKS_FOR_DOMAIN)
GOALS = {"interview", "learn"}
WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
# Which weekdays are study days for N days/week (Mon=0). Spread out, weekends used last.
STUDY_WEEKDAYS = {1: [5], 2: [2, 5], 3: [0, 2, 5], 4: [0, 1, 3, 5], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6]}
# Database share of a cut plan, per role (my judgment). The big-company loops I read list databases as one topic among
# many (Amazon lists it beside data structures, algorithms, object-oriented design, distributed computing, operating
# systems and internet topics), so for a general SDE it is a small slice; a backend role keeps more.
DB_SHARE_CAP = 0.55
DB_SHARE_CAP_FOR = {"sde": 0.15, "django": 0.40, "backend": 0.40, "student": 0.40, "fullstack": 0.30, "frontend": 0.30, "data": 0.60, "devops": 0.30, "ml": 0.30}
DB_CUT_WEIGHT = 1.5 # >1 means the database track gives up optional lessons before other tracks do
SPLIT = (("learn", 0.50), ("practice", 0.35), ("interview", 0.15))
FOUNDATION_MAX_N = 7  # concepts 1-7 are the basics that experience compresses most
# Beginner lessons in the other tracks that experience compresses the same way.
FOUNDATION_SLUGS = {"big-o-structures", "python-internals", "git-workflow", "http-networking-basics", "js-event-loop", "sql-analytics", "ml-fundamentals", "request-path", "scaling-stateless"}
PROJECT_HOURS = {1: 10, 2: 10, 3: 12, 4: 6, 5: 16, 14: 8, 15: 8, 16: 6}  # level 5's project is the capstone
CAPSTONE_LEVEL = 5
CAPSTONE_HOURS = 16  # used only if the content has no level 5
# Lessons that are specific to Django. For learners on another stack they drop to "nice to have".
DJANGO_ONLY = {"django-orm", "drf-api", "django-request-cycle"}
# How much each lesson matters for each role (1 core, 2 important, 3 nice to have). The lesson files carry the priority
# for a Django backend learner; these override it for other roles. All of this is my judgment, informed by which topics
# the company pages and prep guides I read list for each kind of role; none of them gives hours or weights.
_DSA_CORE = {"big-o-structures": 1, "coding-patterns": 1, "arrays-hashing": 1, "stacks-queues": 1, "linked-lists": 1, "sorting-searching": 1,
             "trees-bst": 1, "graphs-traversal": 1, "heaps-priority-queues": 2, "recursion-backtracking": 1, "dynamic-programming": 2}
_DSA_LIGHT = {"big-o-structures": 1, "coding-patterns": 1, "arrays-hashing": 1, "stacks-queues": 2, "linked-lists": 2, "sorting-searching": 2,
              "trees-bst": 2, "graphs-traversal": 2, "heaps-priority-queues": 3, "recursion-backtracking": 3, "dynamic-programming": 3}
_DSA_MINIMAL = {"big-o-structures": 2, "coding-patterns": 2, "arrays-hashing": 2, "stacks-queues": 3, "linked-lists": 3, "sorting-searching": 3,
                "trees-bst": 3, "graphs-traversal": 3, "heaps-priority-queues": 3, "recursion-backtracking": 3, "dynamic-programming": 3}
PRIORITY_OVERRIDES = {
    # General SDE (Amazon, Google, Meta, Microsoft style loops): coding first, then design, then stories; database is one topic.
    "sde": {
        **_DSA_CORE,
        "oop-solid": 1, "lld-parking-lot": 1, "lld-lru-cache": 1, "design-patterns": 2, "lld-state-machine": 2,
        "load-balancing": 1, "caching-at-scale": 1, "design-url-shortener": 1, "message-queues": 1, "scaling-stateless": 1,
        "sd-interview-framework": 1, "back-of-envelope-estimation": 1, "cap-consistency-patterns": 1, "design-news-feed": 1, "design-chat-system": 1,
        "latency-throughput-availability": 2, "dns-cdn-reverse-proxy": 2, "microservices-communication": 2, "design-key-value-store": 2, "design-notification-system": 2,
        "design-web-crawler": 2, "design-autocomplete": 2, "design-file-storage": 2, "design-payment-system": 2, "design-video-streaming": 3, "design-proximity-service": 3,
        "request-path": 2, "rate-limiting": 2, "consistent-hashing": 2, "timeouts-retries": 2, "consensus-leader-election": 3,
        "behavioral-star": 1,
        "indexing": 1, "acid": 1, "keys": 2, "normalization": 2, "er-modelling": 2, "isolation": 2, "sql-vs-nosql": 2, "replication": 2,
        "sharding": 2, "consistency": 2, "system-design": 2,
        "constraints": 3, "explain": 3, "locks-mvcc": 3, "django-orm": 3, "drf-api": 3, "celery-async": 3, "web-security": 3,
        "denormalization": 3, "data-types": 3, "prod-ops": 3,
        "os-processes-memory": 2, "concurrency-basics": 2, "llm-system-design": 3, "frontend-system-design": 3, "js-utility-functions": 3, "ui-coding-components": 3,
        "http-networking-basics": 2, "git-workflow": 3, "docker-containers": 3, "ci-cd-deploy": 3, "cloud-basics": 3,
    },
    # Backend roles keep the database and framework core, and add the coding and design rounds big companies also run.
    "django": {**_DSA_LIGHT, "sd-interview-framework": 1, "oop-solid": 2, "lld-parking-lot": 2, "lld-lru-cache": 2},
    "backend": {**_DSA_LIGHT, "sd-interview-framework": 1, "oop-solid": 2, "lld-parking-lot": 2, "lld-lru-cache": 2},
    "student": {**_DSA_CORE, "oop-solid": 1, "lld-parking-lot": 2, "lld-lru-cache": 2},
    "fullstack": {**_DSA_LIGHT, "oop-solid": 2, "lld-parking-lot": 3, "lld-lru-cache": 3, "js-utility-functions": 2, "ui-coding-components": 2, "frontend-system-design": 3, "css-layout-responsive": 2, "react-state-management": 2},
    # Amazon's front end page names data structures and algorithms as a core focus; the Front End Interview Handbook lists
    # algorithmic coding as one of five round types, asked at Amazon, Google and Microsoft.
    "frontend": {**_DSA_LIGHT, "js-utility-functions": 1, "ui-coding-components": 1, "frontend-system-design": 2, "css-layout-responsive": 1, "react-state-management": 1},
    "data": {**_DSA_MINIMAL},
    "devops": {**_DSA_MINIMAL, "os-processes-memory": 2, "concurrency-basics": 2},
    # ML engineer loops include coding rounds close to software engineering ones (Huyen's book; summaries of Google and Meta loops),
    # but the ML track is the point of the role, so only the first patterns are important here.
    "ml": {**_DSA_MINIMAL, "coding-patterns": 1, "arrays-hashing": 1, "llm-system-design": 1, "ml-generalization-regularization": 1, "ml-metrics-experimentation": 1, "recommender-system-design": 2},
}
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
    # isinstance first: a list or object is not hashable, so `in DOMAINS` would raise TypeError (a 500) instead of this message.
    if not isinstance(domain, str) or domain not in DOMAINS:
        raise ValueError("Unknown domain.")
    if not isinstance(goal, str) or goal not in GOALS:
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
        "weeks": num("weeks", 0, 52, 12, integer=True),   # 0 means no deadline: keep every lesson and report how long it takes
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


def _is_foundation(c: dict) -> bool:
    return c["n"] <= FOUNDATION_MAX_N or c["slug"] in FOUNDATION_SLUGS


def _exp_factor(years: float, c: dict) -> float:
    if years < 1:
        return 1.0
    if years < 3:
        return 0.75 if _is_foundation(c) else 1.0
    return 0.55 if _is_foundation(c) else 0.85


def _build_tasks(p: dict, concepts: list[dict], levels: list[dict]) -> list[Task]:
    django = p["domain"] == "django"
    tasks: list[Task] = []
    by_level: dict[int, list[dict]] = {}
    for c in concepts:
        by_level.setdefault(c["level"], []).append(c)

    for c in concepts:
        total = max(1.0, c["hours"] * _exp_factor(p["experience_years"], c)) * 60
        mins = {kind: _q15(total * share) for kind, share in SPLIT}
        ex = EXERCISES_FOR.get(c["slug"])
        if c.get("track", "database") == "database":
            learn_detail = ("Read the concept, run the animation, type the SQL yourself" if c["viz"] else "Read the concept and type the SQL yourself")
            learn_detail += " and study the Django ORM section." if django else ". The Django section is optional for you."
        else:
            learn_detail = "Read the lesson, work through the animation, then type out the code examples and run them yourself."
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

    if "database" in {c.get("track", "database") for c in concepts} and CAPSTONE_LEVEL not in by_level:  # database content without a level 5: standalone capstone
        tasks.append(Task("capstone", "capstone", "Capstone: Django e-commerce API" if django else "Capstone: e-commerce backend API", CAPSTONE_HOURS * 60, "/projects",
                          "Migrations, transactions, idempotent POST /orders, caching, tests."))
    if p["goal"] == "interview":
        for i in range(1, MOCK_COUNT + 1):
            tasks.append(Task(f"mock:{i}", "mock", f"Mock interview {i}", MOCK_HOURS * 60, "/practice",
                              "Alternate two kinds. Coding: one 45-minute problem aloud (brute force, pattern, complexity, tests). Design: a system-design drill or a low-level design (classes, relationships, main flow, extension)."))
    return tasks


def _cut_steps(tasks: list[Task], concepts: list[dict]):
    """Ordered single-item cuts, least valuable first: (category, label, transform).

    Cutting one item at a time (instead of a whole group) means we stop as soon as the plan fits,
    so the learner keeps as much as their time allows.
    """
    n_of = {c["slug"]: c["n"] for c in concepts}
    title = {c["slug"]: c["title"] for c in concepts}
    prio = {c["slug"]: c["priority"] for c in concepts}
    track_of = {c["slug"]: c.get("track", "database") for c in concepts}
    minutes_of: dict[str, int] = {}
    for t in tasks:
        if t.concept:
            minutes_of[t.concept] = minutes_of.get(t.concept, 0) + t.minutes

    def balanced(slugs):
        """Cut order that takes from every track in proportion to its size, instead of always the highest lesson numbers
        (which are the non-database tracks, so they would be cut first)."""
        by: dict[str, list[str]] = {}
        for sl in sorted(slugs, key=lambda c: -n_of[c]):
            by.setdefault(track_of[sl], []).append(sl)
        out: list[str] = []
        # the database track is the biggest by far, so it is weighted to give up time first
        weight = lambda t: DB_CUT_WEIGHT if t == "database" else 1.0
        while any(by.values()):
            tr = max((t for t in by if by[t]), key=lambda t: weight(t) * sum(minutes_of.get(x, 0) for x in by[t]))
            out.append(by[tr].pop(0))
        return out

    # The first lesson of every track is kept until nothing else is left to cut, so a short plan still touches every subject.
    first_of: dict[str, str] = {}
    for c in sorted(concepts, key=lambda c: c["n"]):
        if c["priority"] <= 2:
            first_of.setdefault(track_of[c["slug"]], c["slug"])
    anchors = set(first_of.values())

    def drop_ids(pred):
        return lambda ts: [t for t in ts if not pred(t)]

    def scale_practice(factor, only_prio=None):
        return lambda ts: [replace(t, minutes=_q15(t.minutes * factor)) if t.kind == "practice" and (only_prio is None or t.priority == only_prio) else t for t in ts]

    steps = [("capstone", "capstone", drop_ids(lambda t: t.kind == "capstone"))]
    for lv in sorted({int(t.id.split(":")[1]) for t in tasks if t.kind == "project"}, reverse=True):
        steps.append(("project", f"Level {lv}", drop_ids(lambda t, lv=lv: t.id == f"project:{lv}")))
    for slug in balanced([c for c in prio if prio[c] == 3]):
        steps.append(("p3", title[slug], drop_ids(lambda t, slug=slug: t.concept == slug)))
    steps.append(("review", "", drop_ids(lambda t: t.kind == "review")))
    steps.append(("p2_half", "", scale_practice(0.5, only_prio=2)))
    for slug in balanced([c for c in prio if prio[c] == 2 and c not in anchors]):
        steps.append(("p2_drop", title[slug], drop_ids(lambda t, slug=slug: t.concept == slug)))
    steps.append(("mock", "", drop_ids(lambda t: t.kind == "mock")))
    steps.append(("p1_trim", "", scale_practice(0.7)))
    for slug in balanced([c for c in anchors if prio[c] == 2]):
        steps.append(("p2_drop", title[slug], drop_ids(lambda t, slug=slug: t.concept == slug)))
    return steps


def _interleave(tasks: list[Task], concepts: list[dict], order: list[str]) -> list[Task]:
    """Mix the tracks so one subject does not hog the first weeks.

    A "unit" is one lesson with its practice and interview drill (plus a level project or revision that follows it).
    Within a track the order is unchanged. Across tracks the next unit always comes from the track that is
    furthest behind (smallest fraction of its own minutes done), so every track moves at the same relative pace.
    The capstone and mock interviews stay at the end.
    """
    track_of = {c["slug"]: c.get("track", "database") for c in concepts}
    units: list[tuple[str, list[Task]]] = []
    tail: list[Task] = []
    cur: tuple[str, list[Task]] | None = None
    for t in tasks:
        if t.concept is None and t.kind in ("capstone", "mock"):
            tail.append(t)
        elif t.kind == "learn" and t.concept:
            cur = (track_of.get(t.concept, "database"), [t])
            units.append(cur)
        elif cur is not None:
            cur[1].append(t)
        else:
            tail.append(t)
    queues: dict[str, list[list[Task]]] = {}
    total: dict[str, int] = {}
    for tr, ts in units:
        queues.setdefault(tr, []).append(ts)
        total[tr] = total.get(tr, 0) + sum(x.minutes for x in ts)
    done = {tr: 0 for tr in queues}
    rank = {tr: i for i, tr in enumerate(order)}
    out: list[Task] = []
    while any(queues.values()):
        tr = min((t for t in queues if queues[t]), key=lambda t: (done[t] / max(total[t], 1), rank.get(t, 99)))
        unit = queues[tr].pop(0)
        done[tr] += sum(x.minutes for x in unit)
        out.extend(unit)
    return out + tail


def _rebalance(tasks: list[Task], original: list[Task], concepts: list[dict], budget: int, cap: float = DB_SHARE_CAP) -> tuple[list[Task], bool]:
    """Cap the database share of a tight plan.

    If, after cutting, the database track still takes more than `cap` (DB_SHARE_CAP_FOR) of the planned minutes, trim database
    practice to 60% and spend the freed minutes on lessons from other tracks that were cut (their practice at half time).
    Returns (tasks, changed). Order follows the original task order.
    """
    track_of = {c["slug"]: c.get("track", "database") for c in concepts}
    prio = {c["slug"]: c["priority"] for c in concepts}
    is_db = lambda t: t.concept is not None and track_of.get(t.concept) == "database"
    total = sum(t.minutes for t in tasks)
    if total == 0 or sum(t.minutes for t in tasks if is_db(t)) / total <= cap:
        return tasks, False
    kept = {t.concept for t in tasks if t.concept}
    trimmed = [replace(t, minutes=_q15(t.minutes * 0.6)) if t.kind == "practice" and is_db(t) else t for t in tasks]
    room = budget - sum(t.minutes for t in trimmed)
    add: dict[str, list[Task]] = {}
    lessons = sorted((c for c in concepts if c["slug"] not in kept and track_of[c["slug"]] != "database" and prio[c["slug"]] <= 2), key=lambda c: (c["priority"], c["n"]))
    for c in lessons:
        unit = [replace(t, minutes=_q15(t.minutes * 0.5)) if t.kind == "practice" else t for t in original if t.concept == c["slug"] and t.kind in ("learn", "practice")]
        cost = sum(t.minutes for t in unit)
        if unit and cost <= room:
            add[c["slug"]] = unit
            room -= cost
    if not add and trimmed == tasks:
        return tasks, False
    new_ids = {t.id for u in add.values() for t in u}
    by_id = {t.id: t for t in trimmed}
    out = []
    for t in original:
        if t.id in by_id:
            out.append(by_id[t.id])
        elif t.id in new_ids:
            out.append(next(x for u in add.values() for x in u if x.id == t.id))
    return out, True


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


def build_roadmap(p: dict, concepts: list[dict], levels: list[dict], track_titles: dict[str, str] | None = None) -> dict:
    wanted = TRACKS_FOR_DOMAIN[p["domain"]]
    concepts = [c for c in concepts if c.get("track", "database") in wanted and c["slug"] not in EXCLUDE_FOR_DOMAIN.get(p["domain"], set())]
    cap = max(15, int(round(p["hours_per_day"] * 60 / 15)) * 15)
    start: date = p["start_date"]
    weekdays = set(STUDY_WEEKDAYS[p["days_per_week"]])
    no_deadline = p["weeks"] == 0
    study_days = [start + timedelta(days=i) for i in range(p["weeks"] * 7) if (start + timedelta(days=i)).weekday() in weekdays]
    budget = cap * len(study_days)

    notes: list[str] = []
    if track_titles:
        notes.append("Your roadmap covers: " + ", ".join(track_titles.get(t, t) for t in wanted if any(c.get("track", "database") == t for c in concepts)) + ".")
    if p["domain"] != "django":
        demoted = [c["title"] for c in concepts if c["slug"] in DJANGO_ONLY and c["priority"] < 3]
        if demoted:
            concepts = [{**c, "priority": 3} if c["slug"] in DJANGO_ONLY else c for c in concepts]
            notes.append("These lessons are Django-specific, so they are marked nice-to-have for your stack: " + ", ".join(demoted) + ". The ideas (N+1, serializers, pagination) transfer to other frameworks.")

    over = PRIORITY_OVERRIDES.get(p["domain"], {})
    if over:
        concepts = [{**c, "priority": over[c["slug"]]} if c["slug"] in over else c for c in concepts]
        if p["domain"] == "sde":
            notes.append("This plan follows the shape of big-company software engineer loops: coding (data structures and algorithms) comes first, then system design and low-level design, then your behavioral stories. Databases are kept to the fundamentals that come up in interviews. The weights are my judgment from reading those companies' prep pages; none of them publishes hours or percentages.")

    tasks = _build_tasks(p, concepts, levels)
    needed = sum(t.minutes for t in tasks)
    if no_deadline:
        # No time limit: nothing is cut. Lay out exactly as many study days as the whole plan needs and report how long that is.
        n_days, d = max(1, ceil(needed / cap)), 0
        while len(study_days) < n_days and d < 3650:
            day = start + timedelta(days=d)
            if day.weekday() in weekdays:
                study_days.append(day)
            d += 1
        budget = cap * len(study_days)
        notes.append(f"No deadline: this plan keeps every lesson and cuts nothing. At {p['hours_per_day']:g} h a day on {p['days_per_week']} days a week it takes about {ceil(len(study_days) / p['days_per_week'])} weeks "
                     f"({round(needed / 60)} hours in total). Raise your hours per day or days per week to finish sooner.")

    if p["experience_years"] >= 1:
        pct = 25 if p["experience_years"] < 3 else 45
        notes.append(f"With {p['experience_years']:g} years of experience the beginner lessons (database concepts 1–7, Big-O, Python internals, Git, HTTP, the JavaScript event loop, analytical SQL, ML fundamentals) are shortened by about {pct}%; skim what you already know and slow down on the hard parts.")

    original = tasks
    db_cap = DB_SHARE_CAP_FOR.get(p["domain"], DB_SHARE_CAP)
    events: list[tuple[str, str]] = []
    for cat, label, transform in _cut_steps(tasks, concepts):
        if sum(t.minutes for t in tasks) <= budget:
            break
        new = transform(tasks)
        if new != tasks:
            events.append((cat, label))
            tasks = new
    cuts = _describe_cuts(events)
    if events:
        tasks, rebalanced = _rebalance(tasks, original, concepts, budget, db_cap)
        if rebalanced:
            cuts.append(f"Database practice was shortened to leave room for other tracks, so the database stays under about {round(db_cap * 100)}% of the plan.")

    planned = sum(t.minutes for t in tasks)
    feasible = planned <= budget
    suggestion = None
    if not feasible or cuts:
        suggestion = min(12, max(0.5, ceil((needed / 60 / max(len(study_days), 1)) * 2) / 2))

    tracks_in_plan = {c.get("track", "database") for c in concepts}
    if len(tracks_in_plan) > 1:
        tasks = _interleave(tasks, concepts, wanted)
        notes.append("Topics from different tracks are mixed through the plan, so no single subject (for example the database track) uses up your first weeks. Lessons stay in order within each track.")

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
        "profile": {**p, "start_date": start.isoformat(), **({"weeks": ceil(len(study_days) / p["days_per_week"]), "no_deadline": True} if no_deadline else {})},
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
