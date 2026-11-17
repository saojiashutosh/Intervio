from rest_framework import serializers

from .models import Concept, Domain, DomainTopic, Drill, Level, LevelBand, Question, Source, SqlExercise, WeekPlan


class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ["id", "topic", "q", "a"]


class LevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Level
        fields = ["level", "title", "weeks", "blurb", "project", "project_goals", "acceptance"]


class ConceptSerializer(serializers.ModelSerializer):
    level = serializers.SlugRelatedField(slug_field="level", read_only=True)
    interview = QuestionSerializer(source="questions", many=True, read_only=True)
    sources = serializers.SlugRelatedField(many=True, slug_field="key", read_only=True)

    class Meta:
        model = Concept
        fields = [
            "slug", "n", "level", "week", "title", "tagline", "explain", "key_points",
            "sql", "django", "exercise", "pitfalls", "viz", "interview", "hours", "priority", "references", "basis", "sources",
        ]


class WeekPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeekPlan
        fields = ["week", "title", "days", "deliverable"]


class SqlExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = SqlExercise
        fields = ["n", "prompt", "hint", "solution"]


class DrillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Drill
        fields = ["name", "strong"]


class SourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Source
        fields = ["key", "title", "url", "publisher", "kind", "checked", "used_for"]


class LevelBandSerializer(serializers.ModelSerializer):
    sources = serializers.SlugRelatedField(many=True, slug_field="key", read_only=True)

    class Meta:
        model = LevelBand
        fields = ["band", "label", "title", "focus", "sources"]


class DomainTopicSerializer(serializers.ModelSerializer):
    sources = serializers.SlugRelatedField(many=True, slug_field="key", read_only=True)

    class Meta:
        model = DomainTopic
        fields = ["band", "area", "topic", "detail", "app", "sources"]


class DomainSerializer(serializers.ModelSerializer):
    sources = serializers.SlugRelatedField(many=True, slug_field="key", read_only=True)
    topics = DomainTopicSerializer(many=True, read_only=True)

    class Meta:
        model = Domain
        fields = ["slug", "title", "blurb", "sources", "topics"]
