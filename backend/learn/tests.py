from datetime import timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import CardState, Concept, Question


class ApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)

    def setUp(self):
        self.client = APIClient()

    def auth(self, username="alice"):
        r = self.client.post("/api/auth/register/", {"username": username, "password": "correct-horse-9"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {r.data['token']}")

    def test_seed_is_idempotent(self):
        before = (Concept.objects.count(), Question.objects.count())
        call_command("seed_content", verbosity=0)
        self.assertEqual(before, (Concept.objects.count(), Question.objects.count()))
        self.assertEqual(before[0], 19)

    def test_content_is_public_and_complete(self):
        r = self.client.get("/api/content/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data["concepts"]), 19)
        self.assertEqual(len(r.data["plan"]), 12)
        self.assertEqual(len(r.data["exercises"]), 15)
        self.assertTrue(r.data["concepts"][0]["interview"])

    def test_register_validation_and_duplicate(self):
        r = self.client.post("/api/auth/register/", {"username": "x", "password": "correct-horse-9"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/auth/register/", {"username": "bob", "password": "123"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.auth("bob")
        r = APIClient().post("/api/auth/register/", {"username": "bob", "password": "correct-horse-9"}, format="json")
        self.assertEqual(r.status_code, 409)

    def test_login(self):
        self.auth("carol")
        r = APIClient().post("/api/auth/login/", {"username": "carol", "password": "wrong"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = APIClient().post("/api/auth/login/", {"username": "carol", "password": "correct-horse-9"}, format="json")
        self.assertEqual(r.status_code, 200)

    def test_progress_requires_auth_and_toggles(self):
        self.assertEqual(self.client.get("/api/progress/").status_code, 401)
        self.auth()
        r = self.client.post("/api/progress/toggle/", {"key": "concept:acid"}, format="json")
        self.assertTrue(r.data["done"])
        self.assertEqual(self.client.get("/api/progress/").data["keys"], ["concept:acid"])
        r = self.client.post("/api/progress/toggle/", {"key": "concept:acid"}, format="json")
        self.assertFalse(r.data["done"])
        self.assertEqual(self.client.post("/api/progress/toggle/", {"key": "../../x"}, format="json").status_code, 400)

    def test_progress_is_per_user(self):
        self.auth("dave")
        self.client.post("/api/progress/toggle/", {"key": "exercise:1"}, format="json")
        other = APIClient()
        t = other.post("/api/auth/register/", {"username": "erin", "password": "correct-horse-9"}, format="json").data["token"]
        other.credentials(HTTP_AUTHORIZATION=f"Token {t}")
        self.assertEqual(other.get("/api/progress/").data["keys"], [])

    def test_flashcard_leitner_flow(self):
        self.auth()
        data = self.client.get("/api/flashcards/?limit=5").data
        self.assertEqual(len(data["cards"]), 5)
        self.assertEqual(data["stats"]["new"], data["stats"]["total"])
        qid = data["cards"][0]["id"]

        r = self.client.post(f"/api/flashcards/{qid}/review/", {"correct": True}, format="json")
        self.assertEqual(r.data["box"], 2)
        self.assertTrue(CardState.objects.get(question_id=qid).due_at > timezone.now() + timedelta(hours=23))
        ids = [c["id"] for c in self.client.get("/api/flashcards/?limit=100").data["cards"]]
        self.assertNotIn(qid, ids)  # scheduled for tomorrow

        r = self.client.post(f"/api/flashcards/{qid}/review/", {"correct": False}, format="json")
        self.assertEqual(r.data["box"], 1)  # wrong answer drops back to box 1, due now
        self.assertEqual(self.client.post(f"/api/flashcards/{qid}/review/", {"correct": "yes"}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/flashcards/999999/review/", {"correct": True}, format="json").status_code, 404)


class RoadmapTests(TestCase):
    BASE = {"domain": "django", "goal": "interview", "experience_years": 1.5, "weeks": 16,
            "hours_per_day": 2, "days_per_week": 6, "start_date": "2026-11-16"}

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)

    def road(self, **over):
        r = APIClient().post("/api/roadmap/", {**self.BASE, **over}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        return r.data

    def sessions(self, data):
        return [s for w in data["weeks"] for d in w["days"] for s in d["sessions"]]

    def test_default_fits_and_covers_every_concept(self):
        d = self.road()
        self.assertTrue(d["summary"]["feasible"])
        self.assertEqual(d["cuts"], [])
        self.assertEqual(len(d["reading"]), 19)
        self.assertEqual(d["skipped"], [])
        self.assertLessEqual(d["summary"]["planned_hours"], d["summary"]["budget_hours"])
        self.assertTrue(all(r["references"] for r in d["reading"]))

    def test_no_day_exceeds_daily_capacity_and_minutes_add_up(self):
        d = self.road(hours_per_day=1.5)
        total = 0
        for w in d["weeks"]:
            for day in w["days"]:
                self.assertLessEqual(day["minutes"], 90)
                self.assertEqual(day["minutes"], sum(s["minutes"] for s in day["sessions"]))
                total += day["minutes"]
        self.assertAlmostEqual(total / 60, d["summary"]["planned_hours"], delta=0.06)  # summary is rounded to 1 decimal

    def test_only_chosen_weekdays_are_study_days(self):
        d = self.road(days_per_week=3)
        names = {day["weekday"] for w in d["weeks"] for day in w["days"]}
        self.assertEqual(names, {"Mon", "Wed", "Sat"})

    def test_experience_shortens_the_plan(self):
        self.assertGreater(self.road(experience_years=0)["summary"]["needed_hours"],
                           self.road(experience_years=5)["summary"]["needed_hours"])

    def test_tight_budget_cuts_in_order_and_keeps_core_topics(self):
        d = self.road(weeks=4, hours_per_day=1.5, days_per_week=5)
        self.assertTrue(d["cuts"])
        self.assertTrue(d["cuts"][0].startswith("Skipped the capstone"))
        self.assertLessEqual(d["summary"]["planned_hours"], d["summary"]["budget_hours"])
        kept = {r["slug"] for r in d["reading"]}
        core = set(Concept.objects.filter(priority=1).values_list("slug", flat=True))
        self.assertTrue(core <= kept, f"core topics lost: {core - kept}")
        skipped = {s["slug"] for s in d["skipped"]}
        self.assertEqual(kept | skipped, set(Concept.objects.values_list("slug", flat=True)))
        self.assertTrue(d["summary"]["suggested_hours_per_day"] > 1.5)

    def test_impossible_budget_is_reported_not_hidden(self):
        d = self.road(weeks=1, hours_per_day=0.5, days_per_week=1)
        self.assertFalse(d["summary"]["feasible"])
        self.assertTrue(any("short" in n for n in d["notes"]))

    def test_deterministic(self):
        self.assertEqual(self.road(), self.road())

    def test_learn_goal_has_no_mock_interviews(self):
        kinds = {s["kind"] for s in self.sessions(self.road(goal="learn", weeks=30))}
        self.assertNotIn("mock", kinds)
        kinds = {s["kind"] for s in self.sessions(self.road(goal="interview", weeks=30))}
        self.assertIn("mock", kinds)

    def test_validation(self):
        c = APIClient()
        for bad in ({"hours_per_day": 99}, {"domain": "x"}, {"start_date": "tomorrow"}, {"weeks": 0}, {"days_per_week": "many"}):
            r = c.post("/api/roadmap/", {**self.BASE, **bad}, format="json")
            self.assertEqual(r.status_code, 400, bad)

    def test_profile_endpoint(self):
        c = APIClient()
        self.assertEqual(c.get("/api/profile/").status_code, 401)
        t = c.post("/api/auth/register/", {"username": "frank", "password": "correct-horse-9"}, format="json").data["token"]
        c.credentials(HTTP_AUTHORIZATION=f"Token {t}")
        self.assertIsNone(c.get("/api/profile/").data["profile"])
        r = c.put("/api/profile/", self.BASE, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(c.get("/api/profile/").data["profile"]["hours_per_day"], 2.0)
        self.assertEqual(c.put("/api/profile/", {**self.BASE, "weeks": 99}, format="json").status_code, 400)

    def test_cuts_are_minimal_not_wholesale(self):
        # 8 weeks x 2h x 6d = 96h budget vs ~126h needed. Cutting one item at a time must keep
        # most of the budget in use (the old group-at-a-time logic left ~25h idle).
        d = self.road(weeks=8)
        s = d["summary"]
        self.assertTrue(d["cuts"])
        self.assertLessEqual(s["planned_hours"], s["budget_hours"])
        self.assertGreater(s["planned_hours"], s["budget_hours"] - 8)


class SourcesAndDomainsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)

    def setUp(self):
        self.d = APIClient().get("/api/content/").data

    def test_every_domain_topic_cites_a_real_source(self):
        keys = {s["key"] for s in self.d["sources"]}
        n = 0
        for dom in self.d["domains"]:
            self.assertTrue(dom["sources"], dom["slug"])
            for t in dom["topics"]:
                n += 1
                self.assertTrue(t["sources"], f"uncited topic: {dom['slug']}/{t['topic']}")
                self.assertTrue(set(t["sources"]) <= keys)
        self.assertGreaterEqual(n, 70)

    def test_every_domain_covers_every_experience_band(self):
        for dom in self.d["domains"]:
            bands = {t["band"] for t in dom["topics"]}
            self.assertGreaterEqual(bands, {"0-2", "2-5", "5+"} if dom["slug"] != "x" else set(), dom["slug"])

    def test_every_concept_has_basis_and_sources(self):
        for c in self.d["concepts"]:
            self.assertTrue(c["basis"], c["slug"])
            self.assertTrue(c["sources"], c["slug"])

    def test_app_links_point_at_real_concepts(self):
        slugs = {c["slug"] for c in self.d["concepts"]}
        for dom in self.d["domains"]:
            for t in dom["topics"]:
                if t["app"]:
                    self.assertIn(t["app"], slugs)

    def test_sources_are_honestly_labelled_and_https(self):
        self.assertGreaterEqual(len(self.d["sources"]), 30)
        for s in self.d["sources"]:
            self.assertTrue(s["url"].startswith("https://"), s["key"])
            self.assertIn(s["checked"], {"read", "snippet"})
        self.assertTrue(any(s["checked"] == "snippet" for s in self.d["sources"]))
        self.assertEqual({b["band"] for b in self.d["level_bands"]}, {"0-2", "2-5", "5+"})
        self.assertIn("basis-note", self.d["notes"])


class DjangoTrackTests(TestCase):
    SLUGS = ["django-orm", "drf-api", "celery-async", "web-security"]
    BASE = {"domain": "django", "goal": "interview", "experience_years": 1.5, "weeks": 16,
            "hours_per_day": 2, "days_per_week": 6, "start_date": "2026-11-16"}

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)

    def test_lessons_are_complete_and_in_level_5(self):
        for slug in self.SLUGS:
            c = Concept.objects.get(slug=slug)
            self.assertEqual(c.level.level, 5)
            for field in ("explain", "key_points", "sql", "django", "pitfalls", "references", "basis"):
                self.assertTrue(getattr(c, field), f"{slug}.{field} is empty")
            self.assertGreaterEqual(c.questions.count(), 7, slug)
            self.assertTrue(c.sources.exists(), slug)
            for ref in c.references:
                self.assertTrue(ref["url"].startswith("https://"), ref)

    def test_level_5_project_is_the_capstone_and_is_not_duplicated(self):
        r = APIClient().post("/api/roadmap/", self.BASE, format="json").data
        titles = [s["title"] for w in r["weeks"] for d in w["days"] for s in d["sessions"] if s["kind"] == "capstone"]
        self.assertEqual(len(set(titles)), 1, titles)
        self.assertTrue(titles[0].startswith("Capstone"))
        self.assertIn("Django", titles[0])

    def test_django_only_lessons_are_optional_on_other_stacks(self):
        r = APIClient().post("/api/roadmap/", {**self.BASE, "domain": "backend", "weeks": 3, "hours_per_day": 2}, format="json").data
        self.assertTrue(any("Django-specific" in n for n in r["notes"]))
        skipped = {x["slug"] for x in r["skipped"]}
        self.assertIn("django-orm", skipped)
        self.assertIn("drf-api", skipped)
        kept = {x["slug"] for x in r["reading"]}
        self.assertIn("web-security", kept)  # transferable, stays core
        capstone = [s["title"] for w in r["weeks"] for d in w["days"] for s in d["sessions"] if s["kind"] == "capstone"]
        self.assertTrue(all("Django" not in t for t in capstone))

    def test_backend_domain_links_to_the_new_lessons(self):
        d = APIClient().get("/api/content/").data
        linked = {t["app"] for dom in d["domains"] if dom["slug"] == "backend" for t in dom["topics"] if t["app"]}
        for slug in self.SLUGS:
            self.assertIn(slug, linked)


class DeleteRoadmapTests(TestCase):
    BASE = {"domain": "django", "goal": "interview", "experience_years": 1.5, "weeks": 8,
            "hours_per_day": 2, "days_per_week": 6, "start_date": "2026-11-16"}

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)

    def login(self, name):
        c = APIClient()
        t = c.post("/api/auth/register/", {"username": name, "password": "correct-horse-9"}, format="json").data["token"]
        c.credentials(HTTP_AUTHORIZATION=f"Token {t}")
        return c

    def test_requires_auth(self):
        self.assertEqual(APIClient().delete("/api/profile/").status_code, 401)

    def test_deletes_profile_and_roadmap_ticks_but_keeps_concept_progress(self):
        c = self.login("gina")
        c.put("/api/profile/", self.BASE, format="json")
        for key in ("rm:django-orm:learn.1", "rm:project:1.1", "concept:acid", "exercise:3"):
            c.post("/api/progress/toggle/", {"key": key}, format="json")
        self.assertEqual(c.delete("/api/profile/").status_code, 204)
        self.assertIsNone(c.get("/api/profile/").data["profile"])
        self.assertEqual(sorted(c.get("/api/progress/").data["keys"]), ["concept:acid", "exercise:3"])

    def test_only_deletes_my_own_data(self):
        a, b = self.login("hank"), self.login("iris")
        for c in (a, b):
            c.put("/api/profile/", self.BASE, format="json")
            c.post("/api/progress/toggle/", {"key": "rm:acid:learn.1"}, format="json")
        a.delete("/api/profile/")
        self.assertIsNotNone(b.get("/api/profile/").data["profile"])
        self.assertEqual(b.get("/api/progress/").data["keys"], ["rm:acid:learn.1"])

    def test_delete_with_nothing_saved_is_fine(self):
        self.assertEqual(self.login("joan").delete("/api/profile/").status_code, 204)


class EveryConceptHasAnAnimationTests(TestCase):
    KNOWN = {"er", "fk", "normalize", "denorm", "types", "constraints", "sqlnosql", "plan", "index", "atomic", "isolation", "lock",
             "replication", "sharding", "cache", "nplus1", "pagination", "oncommit", "security"}

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)

    def test_every_concept_has_a_known_animation(self):
        for c in Concept.objects.all():
            self.assertIn(c.viz, self.KNOWN, f"{c.slug} has no valid animation ({c.viz!r})")
        self.assertEqual(Concept.objects.exclude(viz="").count(), Concept.objects.count())


class LessonDepthTests(TestCase):
    """The platform must be enough to study from: no concept may shrink back to a few-sentence summary."""
    MIN_WORDS = 350

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)

    def test_every_concept_has_a_full_lesson(self):
        for c in Concept.objects.all():
            words = len(" ".join(c.explain).split())
            self.assertGreaterEqual(words, self.MIN_WORDS, f"{c.slug} lesson is only {words} words")


class InlineVisualMarkerTests(TestCase):
    """Lessons embed visuals with '@viz:<id>' lines. An unknown id would silently render nothing."""
    KNOWN = {"er-anatomy", "er-notation", "er-design", "fk-side", "joins", "decompose", "composite-index", "mvcc",
             "deadlock", "hashring", "celery-flow", "wal", "cache-aside"}

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)

    def test_every_marker_names_a_real_visual(self):
        used = set()
        for c in Concept.objects.all():
            for block in c.explain:
                if block.startswith("@viz:"):
                    vid = block[5:].strip()
                    self.assertIn(vid, self.KNOWN, f"{c.slug} embeds unknown visual {vid!r}")
                    used.add(vid)
        self.assertEqual(used, self.KNOWN, "a visual exists that no lesson embeds")
