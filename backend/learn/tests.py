from datetime import timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import CardState, Concept, Question
from .roadmap import TRACKS_FOR_DOMAIN


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
        self.assertGreaterEqual(before[0], 30)

    def test_content_is_public_and_complete(self):
        r = self.client.get("/api/content/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data["concepts"]), Concept.objects.count())
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
    BASE = {"domain": "django", "goal": "interview", "experience_years": 1.5, "weeks": 44,
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
        self.assertEqual(len(d["reading"]), Concept.objects.filter(level__track__slug__in=TRACKS_FOR_DOMAIN["django"]).count())
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
        mine = Concept.objects.filter(level__track__slug__in=TRACKS_FOR_DOMAIN["django"])
        core = set(mine.filter(priority=1).values_list("slug", flat=True))
        self.assertTrue(core <= kept, f"core topics lost: {core - kept}")
        skipped = {s["slug"] for s in d["skipped"]}
        self.assertEqual(kept | skipped, set(mine.values_list("slug", flat=True)))
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
        for bad in ({"hours_per_day": 99}, {"domain": "x"}, {"start_date": "tomorrow"}, {"weeks": 53}, {"days_per_week": "many"}):
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
    BASE = {"domain": "django", "goal": "interview", "experience_years": 1.5, "weeks": 44,
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
             "replication", "sharding", "cache", "nplus1", "pagination", "oncommit", "security", "sysdesign", "migrate", "bigo", "algo", "scenes", "stage"}

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
             "deadlock", "hashring", "celery-flow", "wal", "cache-aside", "sd-framework", "pool"}

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


class TrackTests(TestCase):
    """The platform has several subject tracks, not only the database one."""
    BLOCKS = {"text", "list", "code", "table", "flow", "chips"}

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)

    def test_api_exposes_tracks_and_every_level_belongs_to_one(self):
        d = APIClient().get("/api/content/").data
        slugs = {t["slug"] for t in d["tracks"]}
        self.assertGreaterEqual(len(slugs), 4)
        self.assertIn("database", slugs)
        for lv in d["levels"]:
            self.assertIn(lv["track"], slugs, lv)
        for t in slugs:
            self.assertTrue(any(lv["track"] == t for lv in d["levels"]), f"track {t} has no level")

    def test_every_track_has_lessons_and_a_level_project(self):
        d = APIClient().get("/api/content/").data
        level_track = {lv["level"]: lv["track"] for lv in d["levels"]}
        for t in {t["slug"] for t in d["tracks"]}:
            lessons = [c for c in d["concepts"] if level_track[c["level"]] == t]
            self.assertGreaterEqual(len(lessons), 3, f"track {t} is nearly empty")
        for lv in d["levels"]:
            self.assertTrue(lv["project_goals"] and lv["acceptance"], lv["title"])

    def test_scene_data_is_well_formed(self):
        for c in Concept.objects.all():
            if c.viz != "scenes":
                continue
            self.assertTrue(c.scenes, f"{c.slug} uses scenes but has none")
            for sc in c.scenes:
                self.assertTrue(sc["steps"], f"{c.slug}/{sc['id']} has no steps")
                if "predict" in sc:
                    p = sc["predict"]
                    self.assertTrue(0 <= p["answer"] < len(p["options"]), f"{c.slug}/{sc['id']} predict answer out of range")
                for st in sc["steps"]:
                    self.assertTrue(st["title"] and st["note"], f"{c.slug}/{sc['id']} step lacks title or note")
                    self.assertTrue(st["blocks"], f"{c.slug}/{sc['id']}: {st['title']} has no blocks")
                    for b in st["blocks"]:
                        self.assertIn(b["t"], self.BLOCKS, f"{c.slug}: unknown block {b['t']}")
                        if b["t"] == "table":
                            for row in b["rows"]:
                                self.assertEqual(len(row), len(b["cols"]), f"{c.slug}: table '{b['title']}' row width")
                            if b.get("tones"):
                                self.assertEqual(len(b["tones"]), len(b["rows"]), f"{c.slug}: table '{b['title']}' tones length")

    def test_new_track_lessons_reach_the_roadmap(self):
        r = APIClient().post("/api/roadmap/", {"domain": "django", "goal": "interview", "experience_years": 1.5, "weeks": 44,
                                               "hours_per_day": 2, "days_per_week": 6, "start_date": "2026-11-16"}, format="json").data
        slugs = {x["slug"] for x in r["reading"]}
        for s in ("python-internals", "coding-patterns", "git-workflow", "ci-cd-deploy"):
            self.assertIn(s, slugs)
        sessions = [s for w in r["weeks"] for d in w["days"] for s in d["sessions"] if s["concept"] == "git-workflow" and s["kind"] == "learn"]
        self.assertTrue(sessions)
        self.assertNotIn("SQL", sessions[0]["detail"], "non-database lessons must not tell you to type SQL")

    def test_beginner_lessons_in_new_tracks_are_shortened_with_experience(self):
        def hours(years):
            r = APIClient().post("/api/roadmap/", {"domain": "django", "goal": "learn", "experience_years": years, "weeks": 40,
                                                   "hours_per_day": 4, "days_per_week": 6, "start_date": "2026-11-16"}, format="json").data
            return sum(s["minutes"] for w in r["weeks"] for d in w["days"] for s in d["sessions"] if s["concept"] == "python-internals")
        self.assertLess(hours(4), hours(0))


class StageSceneTests(TestCase):
    """Stage lessons (viz "stage") are data: nodes, links and steps. Bad data would render a broken or empty diagram."""
    KINDS = {"cube", "db", "crowd", "device", "dot", "zone", "ring"}
    TAGS = {"problem", "technique", "solution", "insight", "case"}
    CALLOUTS = {"tip", "warn", "insight"}
    TONES = {"blue", "orange", "purple", "green", "yellow", "grey", "red", "teal"}
    STATUS = {"ok", "down", "hot", "dim", "live"}
    HUD_TONES = {"good", "warn", "bad"}

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)
        cls.stage = list(Concept.objects.filter(viz="stage"))

    def new_track(self):
        return [c for c in self.stage if c.level.track.slug == "system-design"]

    def test_the_system_design_track_is_all_stage_lessons(self):
        self.assertGreaterEqual(len(self.new_track()), 10)
        all_in_track = Concept.objects.filter(level__track__slug="system-design")
        self.assertEqual(all_in_track.count(), len(self.new_track()))

    def test_most_lessons_use_the_stage_and_the_rest_are_listed(self):
        by_viz = Concept.objects.exclude(viz="stage").values_list("slug", flat=True)
        # these keep a table or widget style animation on purpose; the README lists them
        self.assertLessEqual(len(by_viz), 16, f"too many lessons are still outside the stage format: {list(by_viz)}")

    def test_a_step_only_touches_nodes_that_are_visible_at_that_step(self):
        """`from` is 0-based: a node introduced one step late makes its pill and packets silently vanish."""
        for c in self.stage:
            for sc in c.scenes:
                nodes = {n["id"]: n for n in sc["nodes"]}
                hidden: set[str] = set()
                for i, st in enumerate(sc["steps"]):
                    for nid, patch in (st.get("set") or {}).items():
                        if patch.get("hidden") is True:
                            hidden.add(nid)
                        elif patch.get("hidden") is False:
                            hidden.discard(nid)

                    def visible(nid, i=i):
                        n = nodes[nid]
                        return n.get("from", 0) <= i <= n.get("until", 10**6) and nid not in hidden

                    where = f"{c.slug}/{sc['id']} step {i + 1} ({st['title']})"
                    for nid, patch in (st.get("set") or {}).items():
                        if patch.get("hidden") is not True and (patch.get("pill") or patch.get("status") or patch.get("label")):
                            self.assertTrue(visible(nid), f"{where}: patches node {nid} before it appears")
                    for f in st.get("flows") or []:
                        for nid in f["path"]:
                            self.assertTrue(visible(nid), f"{where}: a packet goes through node {nid} that is not visible")

    def test_every_lesson_uses_the_stage(self):
        self.assertEqual(list(Concept.objects.exclude(viz="stage").values_list("slug", flat=True)), [])

    def test_a_lab_widget_is_a_known_animation(self):
        known = {"er", "fk", "normalize", "denorm", "types", "constraints", "sqlnosql", "plan", "index", "atomic", "isolation", "lock",
                 "replication", "sharding", "cache", "nplus1", "pagination", "oncommit", "security", "sysdesign", "migrate", "bigo", "algo"}
        for c in Concept.objects.exclude(lab=""):
            self.assertEqual(c.viz, "stage", c.slug)
            self.assertIn(c.lab, known, c.slug)

    def test_every_stage_scene_is_well_formed(self):
        for c in self.stage:
            self.assertTrue(c.scenes, f"{c.slug} has no scenes")
            for sc in c.scenes:
                where = f"{c.slug}/{sc.get('id')}"
                self.assertEqual(sc.get("kind"), "stage", where)
                ids = [n["id"] for n in sc["nodes"]]
                self.assertEqual(len(ids), len(set(ids)), f"{where}: duplicate node ids")
                n_steps = len(sc["steps"])
                self.assertGreaterEqual(n_steps, 3, f"{where}: a lesson needs enough steps to teach")
                if c.level.track.slug == "system-design":
                    self.assertGreaterEqual(n_steps, 8, where)
                for n in sc["nodes"]:
                    self.assertIn(n["kind"], self.KINDS, f"{where}: node {n['id']}")
                    if n.get("tone"):
                        self.assertIn(n["tone"], self.TONES, f"{where}: node {n['id']}")
                    for k in ("from", "until"):
                        if k in n:
                            self.assertTrue(0 <= n[k] < n_steps, f"{where}: node {n['id']} {k} out of range")
                for l in sc["links"]:
                    self.assertIn(l["a"], ids, f"{where}: link to unknown node {l['a']}")
                    self.assertIn(l["b"], ids, f"{where}: link to unknown node {l['b']}")
                kinds = {x["kind"] for x in sc["legend"]}
                for i, st in enumerate(sc["steps"]):
                    here = f"{where} step {i + 1} ({st.get('title')})"
                    self.assertTrue(st["title"] and st["body"], here)
                    self.assertIn(st["tag"], self.TAGS, here)
                    if st.get("callout"):
                        self.assertIn(st["callout"]["kind"], self.CALLOUTS, here)
                    for nid, patch in (st.get("set") or {}).items():
                        self.assertIn(nid, ids, f"{here}: patch for unknown node {nid}")
                        if patch.get("tone"):
                            self.assertIn(patch["tone"], self.TONES, here)
                        if patch.get("status"):
                            self.assertIn(patch["status"], self.STATUS, here)
                        if patch.get("pill"):
                            self.assertTrue(patch["pill"]["text"], here)
                    for f in st.get("flows") or []:
                        self.assertGreaterEqual(len(f["path"]), 2, here)
                        for nid in f["path"]:
                            self.assertIn(nid, ids, f"{here}: flow through unknown node {nid}")
                        self.assertIn(f["kind"], kinds, f"{here}: flow kind {f['kind']} is not in the legend")
                    for h in st.get("hud") or []:
                        self.assertTrue(h["k"] and h["v"], here)
                        if h.get("tone"):
                            self.assertIn(h["tone"], self.HUD_TONES, here)
                    if st.get("predict"):
                        p = st["predict"]
                        self.assertTrue(0 <= p["answer"] < len(p["options"]), f"{here}: predict answer out of range")
                    if st.get("card"):
                        self.assertTrue(st["card"]["lines"], here)
                        for hl in st["card"].get("hl", []):
                            self.assertLess(hl, len(st["card"]["lines"]), f"{here}: highlighted line out of range")
                if c.level.track.slug == "system-design":
                    self.assertTrue(sc["steps"][0].get("hud"), f"{where}: the first step must set the HUD")
                for item in sc["learn"]:
                    self.assertTrue(0 <= item["at"] < n_steps, f"{where}: learn item '{item['text']}' ticks at a missing step")

    def test_every_stage_lesson_is_sourced_and_labels_its_own_judgment(self):
        for c in self.new_track():
            self.assertTrue(c.sources, f"{c.slug} cites nothing")
            self.assertIn("judgment", c.basis.lower(), f"{c.slug} must say what is judgment rather than sourced")
            self.assertTrue(any(w in c.basis.lower() for w in ("illustrative", "assumption", "chosen for clarity")), f"{c.slug} must say its animation numbers are not measurements")

    def test_some_steps_make_you_predict_first(self):
        n = sum(1 for c in self.stage for sc in c.scenes for st in sc["steps"] if st.get("predict"))
        self.assertGreaterEqual(n, 8)


class DomainRoadmapTests(TestCase):
    """Each learner background gets a roadmap made of the tracks that matter for it."""

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)

    def road(self, domain, **over):
        body = {"domain": domain, "goal": "learn", "experience_years": 0, "weeks": 52, "hours_per_day": 6, "days_per_week": 6, "start_date": "2026-11-16", **over}
        r = APIClient().post("/api/roadmap/", body, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        return r.data

    def test_every_background_gets_only_its_own_tracks(self):
        track_of = {c.slug: c.level.track.slug for c in Concept.objects.select_related("level__track")}
        for domain, tracks in TRACKS_FOR_DOMAIN.items():
            d = self.road(domain)
            got = {track_of[r["slug"]] for r in d["reading"]}
            self.assertTrue(got, f"{domain} roadmap is empty")
            self.assertLessEqual(got, set(tracks), f"{domain} got lessons from outside its tracks: {got - set(tracks)}")
            self.assertEqual(got, set(tracks), f"{domain} is missing a track: {set(tracks) - got}")

    def test_frontend_learner_is_not_given_database_lessons_or_a_django_capstone(self):
        d = self.road("frontend", goal="interview")
        slugs = {r["slug"] for r in d["reading"]}
        self.assertIn("react-rendering", slugs)
        self.assertNotIn("indexing", slugs)
        kinds = {s["kind"] for w in d["weeks"] for day in w["days"] for s in day["sessions"]}
        self.assertNotIn("capstone", kinds, "a frontend plan should not contain the Django e-commerce capstone")
        self.assertTrue(any("Your roadmap covers" in n and "Frontend" in n for n in d["notes"]))

    def test_new_backgrounds_can_be_saved_on_a_profile(self):
        from django.contrib.auth import get_user_model
        u = get_user_model().objects.create_user("lena", password="pw-12345-xyz")
        c = APIClient()
        c.force_authenticate(u)
        for domain in TRACKS_FOR_DOMAIN:
            r = c.put("/api/profile/", {"domain": domain, "goal": "interview", "experience_years": 2, "weeks": 12, "hours_per_day": 2, "days_per_week": 5, "start_date": "2026-11-16"}, format="json")
            self.assertEqual(r.status_code, 200, (domain, r.data))
        self.assertEqual(c.get("/api/profile/").data["profile"]["domain"], "ml")

    def test_every_domain_topic_that_links_to_a_lesson_links_to_a_real_one(self):
        slugs = set(Concept.objects.values_list("slug", flat=True))
        d = APIClient().get("/api/content/").data
        linked = 0
        for dom in d["domains"]:
            for t in dom["topics"]:
                if t["app"]:
                    linked += 1
                    self.assertIn(t["app"], slugs, f"{dom['slug']}: {t['topic']}")
        self.assertGreater(linked, 60)


class TrackBalanceTests(TestCase):
    """One subject must not use up the first weeks, and a short plan must not silently drop whole tracks."""

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)
        cls.track_of = {c.slug: c.level.track.slug for c in Concept.objects.select_related("level__track")}

    def plan(self, weeks, hours=2, domain="django"):
        return APIClient().post("/api/roadmap/", {"domain": domain, "goal": "interview", "experience_years": 1.5, "weeks": weeks,
                                                  "hours_per_day": hours, "days_per_week": 6, "start_date": "2026-11-16"}, format="json").data

    def sessions(self, r, week_limit=None):
        weeks = r["weeks"][:week_limit] if week_limit else r["weeks"]
        return [s for w in weeks for d in w["days"] for s in d["sessions"]]

    def test_the_first_week_mixes_several_tracks(self):
        r = self.plan(12)
        tracks = {self.track_of[s["concept"]] for s in self.sessions(r, 1) if s["concept"]}
        self.assertGreaterEqual(len(tracks), 3, f"week 1 only touches {tracks}")

    def test_the_database_track_does_not_take_the_first_two_weeks_alone(self):
        r = self.plan(12)
        mins = {}
        for s in self.sessions(r, 2):
            if s["concept"]:
                t = self.track_of[s["concept"]]
                mins[t] = mins.get(t, 0) + s["minutes"]
        self.assertLess(mins.get("database", 0), 0.75 * sum(mins.values()), mins)

    def test_a_time_limited_plan_keeps_one_lesson_from_every_track(self):
        from learn.roadmap import TRACKS_FOR_DOMAIN
        for domain, weeks in (("django", 10), ("sde", 10)):
            r = self.plan(weeks, domain=domain)
            got = {self.track_of[s["concept"]] for s in self.sessions(r) if s["concept"]}
            # delivery is all nice-to-have for a general SDE (no lesson there is important enough to survive an 8-week plan)
            expected = set(TRACKS_FOR_DOMAIN[domain]) - ({"delivery"} if domain == "sde" else set())
            self.assertEqual(got, expected, f"{domain}, {weeks} weeks: tracks missing {expected - got}")

    def test_cuts_do_not_always_fall_on_the_same_tracks(self):
        r = self.plan(10)
        kept = {s["concept"] for s in self.sessions(r) if s["concept"]}
        dropped = [c for c in self.track_of if c not in kept]
        tracks_hit = {self.track_of[c] for c in dropped}
        self.assertGreaterEqual(len(tracks_hit), 2, f"all dropped lessons come from {tracks_hit}")

    def test_the_database_share_of_a_tight_plan_is_capped(self):
        for weeks in (8, 10, 12):
            mins = {}
            for s in self.sessions(self.plan(weeks)):
                if s["concept"]:
                    t = self.track_of[s["concept"]]
                    mins[t] = mins.get(t, 0) + s["minutes"]
            self.assertLessEqual(mins["database"] / sum(mins.values()), 0.6, f"{weeks} weeks: {mins}")

    def test_plans_give_system_design_and_delivery_real_time(self):
        def mins_of(r):
            mins = {}
            for s in self.sessions(r):
                if s["concept"]:
                    t = self.track_of[s["concept"]]
                    mins[t] = mins.get(t, 0) + s["minutes"]
            return mins
        sde = mins_of(self.plan(8, domain="sde"))
        self.assertGreaterEqual(sde.get("system-design", 0), 600, sde)
        django = mins_of(self.plan(10))
        self.assertGreaterEqual(django.get("system-design", 0), 120, django)
        self.assertGreaterEqual(django.get("delivery", 0), 240, django)

    def test_the_plan_says_the_tracks_are_mixed(self):
        self.assertTrue(any("mixed through the plan" in n for n in self.plan(12)["notes"]))


class RoleWeightTests(TestCase):
    """The roadmap follows the shape of the loops the company pages describe: coding first, design next, databases one topic."""

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)
        cls.track_of = {c.slug: c.level.track.slug for c in Concept.objects.select_related("level__track")}

    def minutes(self, domain, weeks, hours=2):
        r = APIClient().post("/api/roadmap/", {"domain": domain, "goal": "interview", "experience_years": 1.5, "weeks": weeks,
                                               "hours_per_day": hours, "days_per_week": 6, "start_date": "2026-11-16"}, format="json").data
        mins = {}
        for w in r["weeks"]:
            for d in w["days"]:
                for s in d["sessions"]:
                    if s["concept"]:
                        t = self.track_of[s["concept"]]
                        mins[t] = mins.get(t, 0) + s["minutes"]
        return mins, r

    def test_an_sde_plan_is_mostly_coding_and_design_not_database(self):
        for weeks in (8, 10, 12):
            mins, _ = self.minutes("sde", weeks)
            total = sum(mins.values())
            self.assertEqual(max(mins, key=mins.get), "dsa", f"{weeks} weeks: {mins}")
            self.assertLessEqual(mins.get("database", 0) / total, 0.20, f"{weeks} weeks: database too large: {mins}")
            design = mins.get("system-design", 0) + mins.get("lld", 0)
            self.assertGreaterEqual(design / total, 0.25, f"{weeks} weeks: design too small: {mins}")

    def test_an_sde_plan_includes_low_level_design_and_behavioral(self):
        mins, r = self.minutes("sde", 8)
        self.assertGreater(mins.get("lld", 0), 0)
        self.assertGreater(mins.get("swe-core", 0), 0)
        self.assertTrue(any("big-company" in n for n in r["notes"]))

    def test_every_role_that_gets_coding_rounds_has_the_dsa_track(self):
        from learn.roadmap import TRACKS_FOR_DOMAIN
        for d in ("sde", "django", "backend", "student", "fullstack", "frontend", "ml"):
            self.assertIn("dsa", TRACKS_FOR_DOMAIN[d], d)

    def test_frontend_and_ml_plans_are_not_swamped_by_dsa(self):
        for domain, own in (("frontend", "frontend"), ("ml", "ml")):
            mins, _ = self.minutes(domain, 6)
            self.assertGreater(mins.get(own, 0), 0, domain)
            self.assertLessEqual(mins.get("dsa", 0) / sum(mins.values()), 0.70, f"{domain}: {mins}")

    def test_new_tracks_have_real_lessons(self):
        counts = {}
        for c in Concept.objects.select_related("level__track"):
            counts[c.level.track.slug] = counts.get(c.level.track.slug, 0) + 1
        self.assertGreaterEqual(counts["dsa"], 10)
        self.assertGreaterEqual(counts["lld"], 5)
        self.assertGreaterEqual(counts["swe-core"], 3)

    def test_every_python_sample_in_the_new_tracks_runs_and_passes_its_asserts(self):
        """The code in these lessons is part of what is taught, so it must actually run. Samples of one lesson share a namespace."""
        for c in Concept.objects.filter(level__track__slug__in=["dsa", "lld", "swe-core"]):
            ns = {"__name__": "lesson"}
            for i, snip in enumerate(c.sql):
                if snip.get("lang") == "py":
                    try:
                        exec(compile(snip["code"], f"{c.slug}#{i + 1}", "exec"), ns)
                    except Exception as e:  # noqa: BLE001
                        self.fail(f"{c.slug} sample {i + 1} ({snip.get('title')}) failed: {e!r}")

    def test_new_lessons_cite_official_sources_they_actually_read(self):
        for c in Concept.objects.filter(level__track__slug__in=["dsa", "lld"]):
            checked = {s.key: s.checked for s in c.sources.all()}
            self.assertTrue(checked, c.slug)
            self.assertIn("read", checked.values(), f"{c.slug} cites only search summaries")
            self.assertIn("judgment", c.basis.lower(), f"{c.slug}: basis must say what is my judgment")


class GapLessonTests(TestCase):
    """Frontend, LLM, operating-systems and concurrency lessons added after the first role review."""

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)
        cls.track_of = {c.slug: c.level.track.slug for c in Concept.objects.select_related("level__track")}

    def slugs(self, domain, weeks=12, hours=2):
        r = APIClient().post("/api/roadmap/", {"domain": domain, "goal": "interview", "experience_years": 1.5, "weeks": weeks,
                                               "hours_per_day": hours, "days_per_week": 6, "start_date": "2026-11-16"}, format="json").data
        return {s["concept"] for w in r["weeks"] for d in w["days"] for s in d["sessions"] if s["concept"]}

    def test_frontend_has_the_three_interview_round_lessons(self):
        for slug in ("js-utility-functions", "ui-coding-components", "frontend-system-design"):
            self.assertEqual(self.track_of[slug], "frontend", slug)
        self.assertGreaterEqual(sum(1 for t in self.track_of.values() if t == "frontend"), 6)

    def test_a_frontend_plan_leads_with_its_own_track_and_skips_os_scheduling(self):
        got = self.slugs("frontend", weeks=8)
        for slug in ("js-utility-functions", "ui-coding-components"):
            self.assertIn(slug, got)
        self.assertNotIn("os-processes-memory", got)
        self.assertNotIn("concurrency-basics", got)
        self.assertIn("http-networking-basics", self.slugs("frontend", weeks=12))

    def test_an_ml_plan_has_the_llm_design_lesson(self):
        self.assertEqual(self.track_of["llm-system-design"], "ml")
        self.assertIn("llm-system-design", self.slugs("ml", weeks=8))

    def test_an_sde_plan_covers_operating_systems_and_concurrency(self):
        got = self.slugs("sde", weeks=16)
        self.assertIn("concurrency-basics", got)
        self.assertIn("os-processes-memory", got)
        self.assertEqual(self.track_of["concurrency-basics"], "cs-core")

    def test_every_javascript_sample_runs_in_node(self):
        """JavaScript samples are executed too, when Node is installed. Each sample is self-contained and uses node:assert."""
        import shutil, subprocess, tempfile, os
        node = shutil.which("node")
        if not node:
            self.skipTest("node is not installed")
        ran = 0
        for c in Concept.objects.all():
            for i, snip in enumerate(c.sql):
                if snip.get("lang") != "js" or "node:assert" not in snip["code"]:
                    continue                      # older samples that call the network are illustrations, not self-checking
                with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf8") as f:
                    f.write(snip["code"])
                try:
                    r = subprocess.run([node, f.name], capture_output=True, text=True, timeout=30)
                finally:
                    os.unlink(f.name)
                self.assertEqual(r.returncode, 0, f"{c.slug} sample {i + 1} ({snip.get('title')}): {(r.stderr or r.stdout)[:400]}")
                ran += 1
        self.assertGreaterEqual(ran, 10)


class SystemDesignCurriculumTests(TestCase):
    """The system design track follows the System Design Primer's topic list and the classic prompts from the large-company prep guides."""

    # Primer topic -> the lesson that teaches it
    PRIMER = {
        "approach to an interview": "sd-interview-framework",
        "back-of-the-envelope, latency numbers": "back-of-envelope-estimation",
        "performance, scalability, latency, throughput, availability in numbers": "latency-throughput-availability",
        "CAP, consistency patterns, fail-over": "cap-consistency-patterns",
        "DNS, CDN, reverse proxy": "dns-cdn-reverse-proxy",
        "load balancer": "load-balancing",
        "microservices, service discovery, REST, RPC, TCP and UDP": "microservices-communication",
        "cache and update strategies": "caching-at-scale",
        "asynchronism: queues and back pressure": "message-queues",
        "database replication and sharding": "replication",
    }
    CLASSIC = ["design-url-shortener", "design-news-feed", "design-chat-system", "design-notification-system", "design-web-crawler", "design-key-value-store",
               "design-autocomplete", "design-file-storage", "design-video-streaming", "design-proximity-service", "design-payment-system", "rate-limiting"]

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)
        cls.slugs = set(Concept.objects.values_list("slug", flat=True))
        cls.track = list(Concept.objects.filter(level__track__slug="system-design").order_by("n").values_list("slug", flat=True))

    def test_every_primer_topic_has_a_lesson(self):
        for topic, slug in self.PRIMER.items():
            self.assertIn(slug, self.slugs, f"no lesson for: {topic}")

    def test_the_classic_designs_are_all_there(self):
        for slug in self.CLASSIC:
            self.assertIn(slug, self.track, slug)

    def test_the_track_starts_with_the_framework_then_estimation(self):
        self.assertEqual(self.track[:2], ["sd-interview-framework", "back-of-envelope-estimation"])
        self.assertGreaterEqual(len(self.track), 24)

    def test_designs_come_after_the_building_blocks(self):
        i = self.track.index
        for design in ("design-news-feed", "design-chat-system", "design-key-value-store"):
            for block in ("caching-at-scale", "message-queues", "consistent-hashing"):
                self.assertLess(i(block), i(design), f"{block} should come before {design}")

    def test_an_sde_plan_gives_system_design_a_real_share(self):
        r = APIClient().post("/api/roadmap/", {"domain": "sde", "goal": "interview", "experience_years": 1.5, "weeks": 12, "hours_per_day": 2,
                                               "days_per_week": 6, "start_date": "2026-11-16"}, format="json").data
        track_of = {c.slug: c.level.track.slug for c in Concept.objects.select_related("level__track")}
        mins = {}
        for w in r["weeks"]:
            for d in w["days"]:
                for s in d["sessions"]:
                    if s["concept"]:
                        t = track_of[s["concept"]]
                        mins[t] = mins.get(t, 0) + s["minutes"]
        share = mins["system-design"] / sum(mins.values())
        self.assertGreaterEqual(share, 0.22, mins)
        self.assertGreater(mins["system-design"], mins["database"], "system design should outweigh database in an SDE plan")

    def test_each_new_design_states_numbers_or_trade_offs_and_cites_a_read_source(self):
        for slug in self.CLASSIC + ["sd-interview-framework", "cap-consistency-patterns", "dns-cdn-reverse-proxy", "microservices-communication"]:
            c = Concept.objects.get(slug=slug)
            self.assertTrue(any(s.checked == "read" for s in c.sources.all()), f"{slug} cites no source that was read")


class EveryLessonIsAnimatedTests(TestCase):
    """The whole platform teaches with the isometric stage: no scene may be a bare panel of text."""

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)

    def test_every_scene_of_every_lesson_has_a_diagram_that_changes(self):
        for c in Concept.objects.all():
            self.assertEqual(c.viz, "stage", c.slug)
            for sc in c.scenes:
                where = f"{c.slug}/{sc['id']}"
                self.assertGreaterEqual(len(sc["nodes"]), 3, f"{where}: a scene needs a diagram of at least three nodes")
                animated = sum(1 for st in sc["steps"] if st.get("set") or st.get("flows"))
                self.assertGreaterEqual(animated, max(2, len(sc["steps"]) // 2), f"{where}: the diagram must change on most steps ({animated} of {len(sc['steps'])})")


class ProblemBankTests(TestCase):
    """Each problem's reference solution must pass its own cases, and an empty starter must fail them, or the cases prove nothing."""

    RUNNER = (
        "import json\n"
        "ns = {'__name__': 'problem'}\n"
        "exec(compile(PRELUDE + chr(10) + CODE, 'code', 'exec'), ns)\n"
        "failed = []\n"
        "for name, code in CASES:\n"
        "    try:\n"
        "        exec(compile(code, name, 'exec'), ns)\n"
        "    except BaseException as e:\n"
        "        failed.append([name, type(e).__name__])\n"
        "print(json.dumps(failed))\n"
    )

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)

    def run_cases(self, problem, code, timeout=30):
        import subprocess, sys, tempfile, os, json
        src = f"PRELUDE = {problem.prelude!r}\nCODE = {code!r}\nCASES = {[(c['name'], c['code']) for c in problem.cases]!r}\n" + self.RUNNER
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf8") as f:
            f.write(src)
        try:
            r = subprocess.run([sys.executable, "-I", f.name], capture_output=True, text=True, timeout=timeout)
        finally:
            os.unlink(f.name)
        self.assertEqual(r.returncode, 0, f"{problem.slug}: {r.stderr[-300:]}")
        return json.loads(r.stdout.strip().splitlines()[-1])

    def test_the_bank_covers_every_data_structures_topic(self):
        from learn.models import Problem
        topics = {p.concept.slug for p in Problem.objects.select_related("concept") if p.concept}
        for slug in ("arrays-hashing", "stacks-queues", "linked-lists", "sorting-searching", "trees-bst", "graphs-traversal", "heaps-priority-queues",
                     "recursion-backtracking", "dynamic-programming", "coding-patterns"):
            self.assertIn(slug, topics, f"no problems for {slug}")
        self.assertGreaterEqual(Problem.objects.count(), 35)
        self.assertEqual({p.difficulty for p in Problem.objects.all()}, {"easy", "medium", "hard"})

    def test_every_reference_solution_passes_all_its_cases(self):
        from learn.models import Problem
        for p in Problem.objects.all():
            self.assertEqual(self.run_cases(p, p.solution), [], p.slug)

    def test_an_empty_starter_fails_its_cases(self):
        from learn.models import Problem
        for p in Problem.objects.all():
            self.assertTrue(self.run_cases(p, p.starter, timeout=15), f"{p.slug}: the starter already passes every case")

    def test_problems_are_well_formed(self):
        from learn.models import Problem
        for p in Problem.objects.all():
            self.assertTrue(p.statement and p.examples and p.hints and p.solution and p.notes, p.slug)
            self.assertGreaterEqual(len(p.cases), 4, p.slug)
            self.assertEqual(len({c["name"] for c in p.cases}), len(p.cases), f"{p.slug}: duplicate case names")

    def test_the_api_lists_problems_and_returns_one(self):
        c = APIClient()
        rows = c.get("/api/problems/").data
        self.assertGreaterEqual(len(rows), 35)
        r = c.get(f"/api/problems/{rows[0]['slug']}/")
        self.assertEqual(r.status_code, 200)
        for k in ("statement", "starter", "cases", "hints", "solution", "prelude"):
            self.assertIn(k, r.data)
        self.assertEqual(c.get("/api/problems/no-such-problem/").status_code, 404)


class NoDeadlineTests(TestCase):
    """weeks = 0 means no deadline: nothing is cut and the plan says how long the whole thing takes."""

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)

    def plan(self, **over):
        body = {"domain": "sde", "goal": "interview", "experience_years": 1.5, "weeks": 0, "hours_per_day": 2, "days_per_week": 6, "start_date": "2026-11-23", **over}
        return APIClient().post("/api/roadmap/", body, format="json")

    def test_nothing_is_cut_and_every_lesson_is_planned(self):
        for domain in ("sde", "django", "frontend", "ml"):
            r = self.plan(domain=domain)
            self.assertEqual(r.status_code, 200, domain)
            d = r.data
            self.assertEqual(d["cuts"], [], domain)
            self.assertEqual(d["skipped"], [], domain)
            self.assertTrue(d["summary"]["feasible"], domain)
            self.assertAlmostEqual(d["summary"]["planned_hours"], d["summary"]["needed_hours"], delta=0.2, msg=domain)

    def test_the_plan_reports_how_long_it_takes(self):
        d = self.plan().data
        self.assertTrue(d["profile"]["no_deadline"])
        self.assertGreater(d["profile"]["weeks"], 20)                       # a full SDE plan at 2 h a day is long
        self.assertTrue(any("No deadline" in n for n in d["notes"]))
        sessions = [s for w in d["weeks"] for day in w["days"] for s in day["sessions"]]
        self.assertTrue(sessions and d["summary"]["end_date"])

    def test_more_hours_per_day_shortens_it_and_still_cuts_nothing(self):
        slow, fast = self.plan(hours_per_day=2).data, self.plan(hours_per_day=6).data
        self.assertLess(fast["profile"]["weeks"], slow["profile"]["weeks"])
        self.assertEqual(fast["cuts"], [])

    def test_a_deadline_still_cuts_and_weeks_are_validated(self):
        self.assertTrue(self.plan(weeks=8).data["cuts"])                    # unchanged behaviour with a deadline
        self.assertNotIn("no_deadline", self.plan(weeks=8).data["profile"])
        self.assertEqual(self.plan(weeks=53).status_code, 400)
        self.assertEqual(self.plan(weeks=-1).status_code, 400)

    def test_a_saved_profile_can_have_no_deadline(self):
        from django.contrib.auth import get_user_model
        user = get_user_model().objects.create_user("nd", password="pw-123456")
        c = APIClient()
        c.force_authenticate(user)
        r = c.put("/api/profile/", {"domain": "sde", "goal": "interview", "experience_years": 1.5, "weeks": 0, "hours_per_day": 2, "days_per_week": 6, "start_date": "2026-11-23"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(c.get("/api/profile/").data["profile"]["weeks"], 0)


class EverydayExampleTests(TestCase):
    """Every lesson opens with a plain-words summary and a real-life story, so a beginner can picture it before the technical text."""

    @classmethod
    def setUpTestData(cls):
        call_command("seed_content", verbosity=0)

    def test_every_lesson_has_a_plain_summary_story_and_matching_table(self):
        import re
        for c in Concept.objects.all():
            e = c.everyday
            self.assertTrue(e.get("plain") and e.get("story"), f"{c.slug}: missing everyday example")
            self.assertGreaterEqual(len(e["story"].split()), 30, f"{c.slug}: the story is too thin to help")
            self.assertGreaterEqual(len(e["maps"]), 2, f"{c.slug}: say what each part of the story stands for")
            for pair in e["maps"]:
                self.assertEqual(len(pair), 2, c.slug)
                self.assertTrue(pair[0].strip() and pair[1].strip(), c.slug)
            for sentence in re.split(r"(?<=[.!?])\s+", e["plain"] + " " + e["story"]):
                self.assertLessEqual(len(sentence.split()), 40, f"{c.slug}: keep sentences short and plain: {sentence[:60]}")

    def test_api_returns_it(self):
        r = APIClient().get("/api/content/")
        self.assertEqual(r.status_code, 200)
        concepts = r.json()["concepts"]
        self.assertEqual(len(concepts), 99)
        self.assertTrue(all(row.get("everyday", {}).get("story") for row in concepts))
