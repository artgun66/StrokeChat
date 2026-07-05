from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('threads', '0003_alter_thread_system_prompt'),
    ]

    operations = [
        migrations.AddField(
            model_name='thread',
            name='session_key',
            field=models.UUIDField(blank=True, db_index=True, null=True),
        ),
    ]
