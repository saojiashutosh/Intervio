import django.db.models.deletion
from django.db import migrations, models


def assign_database_track(apps, schema_editor):
    Track = apps.get_model("learn", "Track")
    Level = apps.get_model("learn", "Level")
    db, _ = Track.objects.get_or_create(
        slug="database",
        defaults={"title": "Database engineering", "blurb": "How databases really work, with the Django ORM angle.", "sort": 0},
    )
    Level.objects.filter(track__isnull=True).update(track=db)


class Migration(migrations.Migration):
    dependencies = [("learn", "0003_sources_domains")]

    operations = [
        migrations.CreateModel(
            name="Track",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(unique=True)),
                ("title", models.CharField(max_length=100)),
                ("blurb", models.CharField(max_length=300)),
                ("sort", models.PositiveSmallIntegerField(default=0)),
            ],
            options={"ordering": ["sort", "id"]},
        ),
        migrations.AddField(
            model_name="level",
            name="track",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, related_name="levels", to="learn.track"),
        ),
        migrations.AddField(
            model_name="concept",
            name="scenes",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(assign_database_track, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="level",
            name="track",
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="levels", to="learn.track"),
        ),
    ]
