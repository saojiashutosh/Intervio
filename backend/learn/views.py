import re
from collections.abc import Mapping
from datetime import timedelta

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import ParseError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import CardState, Concept, Domain, Drill, Level, LevelBand, Note, Profile, Progress, Question, Source, SqlExercise, Track, WeekPlan
from .roadmap import build_roadmap, parse_profile
from .serializers import (
    ConceptSerializer, DomainSerializer, DrillSerializer, LevelBandSerializer, LevelSerializer, QuestionSerializer,
    SourceSerializer, SqlExerciseSerializer, TrackSerializer, WeekPlanSerializer,
)

User = get_user_model()
PROGRESS_KEY_RE = re.compile(r"^[a-z]+(:[A-Za-z0-9_.-]{1,40}){1,3}$")


def _text(value):
    """A string from user input, or "" if it is not a string or holds a NUL byte (PostgreSQL cannot put one in a query)."""
    return value if isinstance(value, str) and "\x00" not in value else ""


class ObjectBodyView(APIView):
    """Views that read fields from the request body. A body that is valid JSON but not an object (a list, a number, null)
    is a client mistake: answer 400 instead of crashing on `.get`."""

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method in ("POST", "PUT", "PATCH") and not isinstance(request.data, Mapping):
            raise ParseError("Send a JSON object.")


class PublicView(APIView):
    """Open to everyone. Credentials are not read at all, so a stale or invalid token kept in the browser cannot make a public
    page fail (DRF answers 401 to any request that carries a bad token, even to an AllowAny view)."""

    authentication_classes: list = []
    permission_classes = [AllowAny]


class ContentView(PublicView):
    """All learning content in one request (about 70 KB). Public."""

    def get(self, request):
        concepts = Concept.objects.select_related("level").prefetch_related("questions", "sources")
        general = Question.objects.filter(concept__isnull=True)
        return Response(
            {
                "tracks": TrackSerializer(Track.objects.all(), many=True).data,
                "levels": LevelSerializer(Level.objects.select_related("track"), many=True).data,
                "concepts": ConceptSerializer(concepts, many=True).data,
                "plan": WeekPlanSerializer(WeekPlan.objects.all(), many=True).data,
                "exercises": SqlExerciseSerializer(SqlExercise.objects.all(), many=True).data,
                "drills": DrillSerializer(Drill.objects.all(), many=True).data,
                "general_questions": QuestionSerializer(general, many=True).data,
                "sources": SourceSerializer(Source.objects.all(), many=True).data,
                "level_bands": LevelBandSerializer(LevelBand.objects.prefetch_related("sources"), many=True).data,
                "domains": DomainSerializer(Domain.objects.prefetch_related("sources", "topics__sources"), many=True).data,
                "notes": {n.key: n.text for n in Note.objects.all()},
            }
        )


def _token_response(user):
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "username": user.get_username()})


class AuthThrottled(ObjectBodyView, PublicView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class RegisterView(AuthThrottled):
    def post(self, request):
        username = _text(request.data.get("username")).strip()
        password = _text(request.data.get("password"))
        if not re.fullmatch(r"[A-Za-z0-9_.-]{3,30}", username):
            return Response({"error": "Username must be 3-30 letters, digits, _ . or -"}, status=400)
        # "Sam" and "sam" look like the same person to everyone else, so they count as one name.
        if User.objects.filter(username__iexact=username).exists():
            return Response({"error": "That username is taken."}, status=status.HTTP_409_CONFLICT)
        try:
            validate_password(password, user=User(username=username))
        except ValidationError as e:
            return Response({"error": " ".join(e.messages)}, status=400)
        try:
            with transaction.atomic():
                user = User.objects.create_user(username=username, password=password)
        except IntegrityError:
            return Response({"error": "That username is taken."}, status=status.HTTP_409_CONFLICT)
        return _token_response(user)


class LoginView(AuthThrottled):
    def post(self, request):
        user = authenticate(username=_text(request.data.get("username")), password=_text(request.data.get("password")))
        if user is None:
            return Response({"error": "Invalid username or password."}, status=400)
        return _token_response(user)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"username": request.user.get_username()})


def _profile_dict(profile):
    return {
        "domain": profile.domain, "goal": profile.goal, "experience_years": float(profile.experience_years),
        "weeks": profile.weeks, "hours_per_day": float(profile.hours_per_day),
        "days_per_week": profile.days_per_week, "start_date": profile.start_date.isoformat(),
    }


class ProfileView(ObjectBodyView):
    """The signed-in learner's saved answers. GET returns null if they haven't set any."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = Profile.objects.filter(user=request.user).first()
        return Response({"profile": _profile_dict(profile) if profile else None})

    def put(self, request):
        try:
            p = parse_profile(request.data)
        except ValueError as e:
            return Response({"error": str(e)}, status=400)
        profile, _ = Profile.objects.update_or_create(user=request.user, defaults=p)
        return Response({"profile": _profile_dict(profile)})

    def delete(self, request):
        """Delete the saved profile and the roadmap session tick-marks ('rm:*'). Concept completion is kept."""
        with transaction.atomic():
            Profile.objects.filter(user=request.user).delete()
            Progress.objects.filter(user=request.user, key__startswith="rm:").delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RoadmapView(ObjectBodyView, PublicView):
    """Stateless: profile in, schedule out. Public so it works before sign-up."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "roadmap"

    def post(self, request):
        try:
            p = parse_profile(request.data)
        except ValueError as e:
            return Response({"error": str(e)}, status=400)
        concepts = [
            {
                "slug": c.slug, "n": c.n, "title": c.title, "level": c.level.level, "hours": float(c.hours), "priority": c.priority,
                "viz": c.viz, "references": c.references, "q_count": len(c.questions.all()), "track": c.level.track.slug,
            }
            for c in Concept.objects.select_related("level__track").prefetch_related("questions")
        ]
        levels = list(Level.objects.values("level", "project"))
        return Response(build_roadmap(p, concepts, levels, {t.slug: t.title for t in Track.objects.all()}))


class ProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"keys": list(Progress.objects.filter(user=request.user).values_list("key", flat=True))})


class ProgressToggleView(ObjectBodyView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        key = str(request.data.get("key", ""))
        if not PROGRESS_KEY_RE.fullmatch(key):
            return Response({"error": "Invalid key."}, status=400)
        deleted, _ = Progress.objects.filter(user=request.user, key=key).delete()
        if deleted:
            return Response({"key": key, "done": False})
        Progress.objects.get_or_create(user=request.user, key=key)
        return Response({"key": key, "done": True})


class FlashcardsView(APIView):
    """Cards due for review: never-seen questions plus those whose due_at has passed."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        topic = request.query_params.get("topic")
        try:
            limit = max(1, min(int(request.query_params.get("limit", 20)), 100))
        except ValueError:
            limit = 20
        now = timezone.now()
        questions = Question.objects.select_related("concept")
        if topic:
            questions = questions.filter(topic=topic)
        states = {s.question_id: s for s in CardState.objects.filter(user=request.user)}

        cards, new, due, mastered = [], 0, 0, 0
        for q in questions:
            s = states.get(q.id)
            if s is None:
                new += 1
                is_due = True
            else:
                is_due = s.due_at <= now
                due += is_due
                mastered += s.box == 5
            if is_due:
                cards.append(
                    {
                        "id": q.id, "q": q.q, "a": q.a, "topic": q.topic,
                        "concept": q.concept.title if q.concept else None,
                        "box": s.box if s else 0, "is_new": s is None,
                    }
                )
        # reviewed-and-due first (lowest box first), then new ones
        cards.sort(key=lambda c: (c["is_new"], c["box"]))
        return Response(
            {"cards": cards[:limit], "stats": {"total": questions.count(), "new": new, "due": due, "mastered": mastered}}
        )


class FlashcardReviewView(ObjectBodyView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        correct = request.data.get("correct")
        if not isinstance(correct, bool):
            return Response({"error": "'correct' must be true or false."}, status=400)
        try:
            question = Question.objects.get(pk=pk)
        except Question.DoesNotExist:
            return Response({"error": "Unknown question."}, status=404)

        now = timezone.now()
        with transaction.atomic():
            state, _ = CardState.objects.select_for_update().get_or_create(
                user=request.user, question=question, defaults={"box": 1, "due_at": now}
            )
            state.box = min(state.box + 1, 5) if correct else 1
            state.due_at = now + timedelta(days=CardState.BOX_DAYS[state.box])
            state.reviews += 1
            state.save(update_fields=["box", "due_at", "reviews"])
        return Response({"id": question.id, "box": state.box, "due_at": state.due_at})


class ProblemListView(PublicView):
    """The problem bank. Public: the problems and their cases are teaching material, and the cases run in the browser."""

    def get(self, request):
        from .models import Problem
        rows = Problem.objects.select_related("concept").all()
        return Response([{"slug": p.slug, "title": p.title, "difficulty": p.difficulty, "concept": p.concept.slug if p.concept else None,
                          "concept_title": p.concept.title if p.concept else None, "cases": len(p.cases)} for p in rows])


class ProblemDetailView(PublicView):

    def get(self, request, slug):
        from django.shortcuts import get_object_or_404
        from .models import Problem
        p = get_object_or_404(Problem.objects.select_related("concept"), slug=slug)
        return Response({"slug": p.slug, "title": p.title, "difficulty": p.difficulty, "concept": p.concept.slug if p.concept else None,
                         "concept_title": p.concept.title if p.concept else None, "statement": p.statement, "examples": p.examples, "starter": p.starter,
                         "prelude": p.prelude, "cases": p.cases, "hints": p.hints, "solution": p.solution, "notes": p.notes})

