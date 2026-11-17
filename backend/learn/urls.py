from django.urls import path

from . import views

urlpatterns = [
    path("content/", views.ContentView.as_view()),
    path("auth/register/", views.RegisterView.as_view()),
    path("auth/login/", views.LoginView.as_view()),
    path("auth/me/", views.MeView.as_view()),
    path("profile/", views.ProfileView.as_view()),
    path("roadmap/", views.RoadmapView.as_view()),
    path("progress/", views.ProgressView.as_view()),
    path("progress/toggle/", views.ProgressToggleView.as_view()),
    path("flashcards/", views.FlashcardsView.as_view()),
    path("flashcards/<int:pk>/review/", views.FlashcardReviewView.as_view()),
]
