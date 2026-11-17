from django.conf import settings
from django.db import models


class Level(models.Model):
    level = models.PositiveSmallIntegerField(unique=True)
    title = models.CharField(max_length=100)
    weeks = models.CharField(max_length=40)
    blurb = models.CharField(max_length=200)
    project = models.CharField(max_length=200)
    project_goals = models.JSONField(default=list)
    acceptance = models.JSONField(default=list)

    class Meta:
        ordering = ["level"]

    def __str__(self):
        return f"L{self.level} {self.title}"


class Concept(models.Model):
    slug = models.SlugField(unique=True)
    n = models.PositiveSmallIntegerField(unique=True)
    level = models.ForeignKey(Level, on_delete=models.PROTECT, related_name="concepts")
    week = models.CharField(max_length=40)
    title = models.CharField(max_length=200)
    tagline = models.CharField(max_length=300)
    explain = models.JSONField(default=list)
    key_points = models.JSONField(default=list)
    sql = models.JSONField(default=list)
    django = models.JSONField(default=dict)
    exercise = models.TextField()
    pitfalls = models.JSONField(default=list)
    viz = models.CharField(max_length=30, blank=True)
    # Roadmap inputs: beginner hours, 1 = interview-critical .. 3 = nice-to-have, reading links.
    hours = models.DecimalField(max_digits=4, decimal_places=1, default=3)
    priority = models.PositiveSmallIntegerField(default=2)
    references = models.JSONField(default=list)
    basis = models.TextField(blank=True)
    sources = models.ManyToManyField("Source", blank=True, related_name="concepts")

    class Meta:
        ordering = ["n"]
        constraints = [
            models.CheckConstraint(condition=models.Q(priority__gte=1, priority__lte=3), name="concept_priority_range"),
            models.CheckConstraint(condition=models.Q(hours__gt=0), name="concept_hours_positive"),
        ]

    def __str__(self):
        return f"{self.n}. {self.title}"


class Question(models.Model):
    """Interview question. concept is NULL for general / Django questions."""

    key = models.CharField(max_length=80, unique=True)
    concept = models.ForeignKey(Concept, null=True, blank=True, on_delete=models.CASCADE, related_name="questions")
    topic = models.CharField(max_length=30)
    q = models.TextField()
    a = models.TextField()

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.q[:60]


class WeekPlan(models.Model):
    week = models.PositiveSmallIntegerField(unique=True)
    title = models.CharField(max_length=200)
    days = models.JSONField(default=list)
    deliverable = models.CharField(max_length=300)

    class Meta:
        ordering = ["week"]


class SqlExercise(models.Model):
    n = models.PositiveSmallIntegerField(unique=True)
    prompt = models.TextField()
    hint = models.TextField()
    solution = models.TextField()

    class Meta:
        ordering = ["n"]


class Drill(models.Model):
    name = models.CharField(max_length=200, unique=True)
    strong = models.TextField()


class Progress(models.Model):
    """One row per completed item, e.g. 'concept:acid', 'plan:3:2', 'exercise:5'."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="progress")
    key = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "key"], name="uq_progress_user_key")]


class Profile(models.Model):
    """What the learner told us; the roadmap is computed from it (see roadmap.py)."""

    DOMAINS = [("django", "Django / Python backend"), ("backend", "Other backend"), ("student", "Student / new to backend")]
    GOALS = [("interview", "Prepare for interviews"), ("learn", "Learn in depth")]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    domain = models.CharField(max_length=20, choices=DOMAINS, default="django")
    goal = models.CharField(max_length=20, choices=GOALS, default="interview")
    experience_years = models.DecimalField(max_digits=3, decimal_places=1, default=0)
    weeks = models.PositiveSmallIntegerField(default=12)
    hours_per_day = models.DecimalField(max_digits=3, decimal_places=1, default=2)
    days_per_week = models.PositiveSmallIntegerField(default=6)
    start_date = models.DateField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(weeks__gte=1, weeks__lte=52), name="profile_weeks_range"),
            models.CheckConstraint(condition=models.Q(days_per_week__gte=1, days_per_week__lte=7), name="profile_days_range"),
            models.CheckConstraint(condition=models.Q(hours_per_day__gte=0.5, hours_per_day__lte=12), name="profile_hours_range"),
            models.CheckConstraint(condition=models.Q(experience_years__gte=0, experience_years__lte=30), name="profile_exp_range"),
        ]


class CardState(models.Model):
    """Leitner spaced-repetition state for one user and one question."""

    BOX_DAYS = {1: 0, 2: 1, 3: 3, 4: 7, 5: 21}

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cards")
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="states")
    box = models.PositiveSmallIntegerField(default=1)
    due_at = models.DateTimeField()
    reviews = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "question"], name="uq_card_user_question"),
            models.CheckConstraint(condition=models.Q(box__gte=1, box__lte=5), name="card_box_range"),
        ]
        indexes = [models.Index(fields=["user", "due_at"], name="idx_card_user_due")]


class Source(models.Model):
    """Something we relied on. `checked` is honest about HOW: read in full vs only a search snippet."""

    KINDS = [("official", "Official"), ("survey", "Survey"), ("book", "Book"), ("curriculum", "Curriculum"),
             ("community-guide", "Community guide"), ("prep-guide", "Prep guide"), ("job-post", "Job postings")]
    CHECKED = [("read", "Read directly"), ("snippet", "Search summary only")]

    key = models.SlugField(unique=True)
    title = models.CharField(max_length=250)
    url = models.URLField(max_length=500)
    publisher = models.CharField(max_length=120)
    kind = models.CharField(max_length=20, choices=KINDS)
    checked = models.CharField(max_length=10, choices=CHECKED)
    used_for = models.TextField()

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.title


class LevelBand(models.Model):
    band = models.CharField(max_length=5, unique=True)  # "0-2" | "2-5" | "5+"
    label = models.CharField(max_length=30)
    title = models.CharField(max_length=60)
    focus = models.TextField()
    sources = models.ManyToManyField(Source, blank=True)

    class Meta:
        ordering = ["id"]


class Note(models.Model):
    key = models.SlugField(unique=True)
    text = models.TextField()


class Domain(models.Model):
    slug = models.SlugField(unique=True)
    title = models.CharField(max_length=120)
    blurb = models.TextField()
    sort = models.PositiveSmallIntegerField(default=0)
    sources = models.ManyToManyField(Source, blank=True)

    class Meta:
        ordering = ["sort"]

    def __str__(self):
        return self.title


class DomainTopic(models.Model):
    """One 'you should know this' item for a domain at an experience band. Must cite at least one source."""

    domain = models.ForeignKey(Domain, on_delete=models.CASCADE, related_name="topics")
    band = models.CharField(max_length=5)
    area = models.CharField(max_length=60)
    topic = models.CharField(max_length=160)
    detail = models.TextField()
    app = models.SlugField(blank=True)  # concept slug if Intervio teaches it; blank = not covered yet
    sort = models.PositiveSmallIntegerField(default=0)
    sources = models.ManyToManyField(Source, related_name="topics")

    class Meta:
        ordering = ["domain__sort", "sort"]
        constraints = [models.CheckConstraint(condition=models.Q(band__in=["0-2", "2-5", "5+"]), name="topic_band_valid")]
