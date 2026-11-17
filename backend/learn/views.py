import re
from datetime import timedelta

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import CardState, Concept, Domain, Drill, Level, LevelBand, Note, Profile, Progress, Question, Source, SqlExercise, WeekPlan
from .roadmap import build_roadmap, parse_profile
from .serializers import (
    ConceptSerializer, DomainSerializer, DrillSerializer, LevelBandSerializer, LevelSerializer, QuestionSerializer,
    SourceSerializer, SqlExerciseSerializer, WeekPlanSerializer,
)

User = get_user_model()
PROGRESS_KEY_RE = re.compile(r"^[a-z]+(:[A-Za-z0-9_.-]{1,40}){1,3}$")


class ContentView(APIView):
    """All learning content in one request (about 70 KB). Public."""

    permission_classes = [AllowAny]

    def get(self, request):
        concepts = Concept.objects.select_related("level").prefetch_related("questions", "sources")
        general = Question.objects.filter(concept__isnull=True)
        return Response(
            {
                "levels": LevelSerializer(Level.objects.all(), many=True).data,
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


class AuthThrottled(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class RegisterView(AuthThrottled):
    def post(self, request):
        username = str(request.data.get("username", "")).strip()
        password = str(request.data.get("password", ""))
        if not re.fullmatch(r"[A-Za-z0-9_.-]{3,30}", username):
            return Response({"error": "Username must be 3-30 letters, digits, _ . or -"}, status=400)
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
        user = authenticate(username=request.data.get("username", ""), password=request.data.get("password", ""))
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


class ProfileView(APIView):
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


class RoadmapView(APIView):
    """Stateless: profile in, schedule out. Public so it works before sign-up."""

    permission_classes = [AllowAny]
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
                "viz": c.viz, "references": c.references, "q_count": len(c.questions.all()),
            }
            for c in Concept.objects.select_related("level").prefetch_related("questions")
        ]
        levels = list(Level.objects.values("level", "project"))
        return Response(build_roadmap(p, concepts, levels))


class ProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"keys": list(Progress.objects.filter(user=request.user).values_list("key", flat=True))})


class ProgressToggleView(APIView):
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


class FlashcardReviewView(APIView):
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
