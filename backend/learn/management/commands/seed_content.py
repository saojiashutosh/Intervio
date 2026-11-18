import json

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import models, transaction

from learn.models import Concept, Domain, Problem, DomainTopic, Drill, Level, LevelBand, Note, Question, Source, SqlExercise, Track, WeekPlan


def load(name):
    return json.loads((settings.CONTENT_DIR / name).read_text(encoding="utf-8"))


class Command(BaseCommand):
    help = "Load/refresh learning content from backend/content/*.json (idempotent; keeps user data)."

    @transaction.atomic
    def handle(self, *args, **opts):
        meta = load("sources.json")
        sources = {}
        for d in meta["sources"]:
            sources[d["key"]], _ = Source.objects.update_or_create(
                key=d["key"], defaults={k: d[k] for k in ("title", "url", "publisher", "kind", "checked", "used_for")})
        for lb in meta["levels"]:
            band, _ = LevelBand.objects.update_or_create(
                band=lb["band"], defaults={"label": lb["label"], "title": lb["title"], "focus": lb["focus"]})
            band.sources.set([sources[k] for k in lb["sources"]])
        Note.objects.update_or_create(key="level-note", defaults={"text": meta["level_note"]})
        Note.objects.update_or_create(key="basis-note", defaults={"text": meta["basis_note"]})

        for i, dom in enumerate(load("domains.json")):
            domain, _ = Domain.objects.update_or_create(
                slug=dom["slug"], defaults={"title": dom["title"], "blurb": dom["blurb"], "sort": i})
            domain.sources.set([sources[k] for k in dom["sources"]])
            keep = []
            for j, tp in enumerate(dom["topics"]):
                topic, _ = DomainTopic.objects.update_or_create(
                    domain=domain, band=tp["band"], topic=tp["topic"],
                    defaults={"area": tp["area"], "detail": tp["detail"], "app": tp["app"] or "", "sort": j})
                topic.sources.set([sources[k] for k in tp["sources"]])
                keep.append(topic.pk)
            domain.topics.exclude(pk__in=keep).delete()

        tracks = {}
        for i, t in enumerate(load("tracks.json")):
            tracks[t["slug"]], _ = Track.objects.update_or_create(
                slug=t["slug"], defaults={"title": t["title"], "blurb": t["blurb"], "sort": i})

        levels = {}
        for d in load("levels.json"):
            levels[d["level"]], _ = Level.objects.update_or_create(
                level=d["level"],
                defaults={
                    "track": tracks[d["track"]],
                    "title": d["title"],
                    "weeks": d["weeks"],
                    "blurb": d["blurb"],
                    "project": d["project"],
                    "project_goals": d["projectGoals"],
                    "acceptance": d["acceptance"],
                },
            )

        n_q = 0
        # `n` is unique. When lessons are renumbered, updating one at a time can briefly give two lessons the same number,
        # so move every existing number out of the way first; each lesson then gets its real number below.
        Concept.objects.update(n=models.F("n") + 100000)
        for c in load("concepts.json"):
            concept, _ = Concept.objects.update_or_create(
                slug=c["id"],
                defaults=dict(
                    n=c["n"],
                    level=levels[c["level"]],
                    week=c["week"],
                    title=c["title"],
                    tagline=c["tagline"],
                    explain=c["explain"],
                    everyday=c.get("everyday", {}),
                    key_points=c["keyPoints"],
                    sql=c["sql"],
                    django=c["django"],
                    exercise=c["exercise"],
                    pitfalls=c["pitfalls"],
                    viz=c.get("viz", ""),
                    lab=c.get("lab", ""),
                    scenes=c.get("scenes", []),
                    hours=c["hours"],
                    priority=c["priority"],
                    references=c["references"],
                    basis=c["basis"],
                ),
            )
            concept.sources.set([sources[k] for k in c["sources"]])
            for i, qa in enumerate(c["interview"]):
                Question.objects.update_or_create(
                    key=f"{c['id']}:{i}",
                    defaults=dict(concept=concept, topic="concept", q=qa["q"], a=qa["a"]),
                )
                n_q += 1

        for i, pr in enumerate(load("problems.json")):
            Problem.objects.update_or_create(
                slug=pr["slug"],
                defaults=dict(
                    concept=Concept.objects.filter(slug=pr["concept"]).first(), title=pr["title"], difficulty=pr["difficulty"], statement=pr["statement"],
                    examples=pr["examples"], starter=pr["starter"], prelude=pr.get("prelude", ""), cases=pr["cases"], hints=pr["hints"],
                    solution=pr["solution"], notes=pr.get("notes", ""), sort=i,
                ),
            )

        for i, g in enumerate(load("general_questions.json")):
            Question.objects.update_or_create(
                key=f"general:{i}",
                defaults=dict(concept=None, topic=g["topic"], q=g["q"], a=g["a"]),
            )
            n_q += 1

        for w in load("plan.json"):
            WeekPlan.objects.update_or_create(
                week=w["week"],
                defaults=dict(title=w["title"], days=w["days"], deliverable=w["deliverable"]),
            )
        for e in load("exercises.json"):
            SqlExercise.objects.update_or_create(
                n=e["n"], defaults=dict(prompt=e["prompt"], hint=e["hint"], solution=e["solution"])
            )
        for d in load("drills.json"):
            Drill.objects.update_or_create(name=d["name"], defaults=dict(strong=d["strong"]))

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {len(levels)} levels, {Concept.objects.count()} concepts, {n_q} questions, "
                f"{WeekPlan.objects.count()} weeks, {SqlExercise.objects.count()} exercises, "
                f"{Source.objects.count()} sources, {Domain.objects.count()} domains, {DomainTopic.objects.count()} domain topics."
            )
        )
