import json

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from learn.models import Concept, Domain, DomainTopic, Drill, Level, LevelBand, Note, Question, Source, SqlExercise, WeekPlan


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

        levels = {}
        for d in load("levels.json"):
            levels[d["level"]], _ = Level.objects.update_or_create(
                level=d["level"],
                defaults={
                    "title": d["title"],
                    "weeks": d["weeks"],
                    "blurb": d["blurb"],
                    "project": d["project"],
                    "project_goals": d["projectGoals"],
                    "acceptance": d["acceptance"],
                },
            )

        n_q = 0
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
                    key_points=c["keyPoints"],
                    sql=c["sql"],
                    django=c["django"],
                    exercise=c["exercise"],
                    pitfalls=c["pitfalls"],
                    viz=c.get("viz", ""),
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
