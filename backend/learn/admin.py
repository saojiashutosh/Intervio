from django.contrib import admin

from .models import CardState, Concept, Drill, Level, Progress, Question, SqlExercise, Track, WeekPlan

admin.site.register([Track, Level, Drill, WeekPlan, SqlExercise, Progress, CardState])


@admin.register(Concept)
class ConceptAdmin(admin.ModelAdmin):
    list_display = ("n", "title", "level", "viz")
    list_filter = ("level",)


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("q", "topic", "concept")
    list_filter = ("topic",)
    search_fields = ("q", "a")
