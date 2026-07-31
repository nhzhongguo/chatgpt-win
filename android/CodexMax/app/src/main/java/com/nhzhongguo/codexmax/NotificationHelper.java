package com.nhzhongguo.codexmax;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

final class NotificationHelper {
    static final int MONITOR_NOTIFICATION_ID = 4101;
    private static final int RESULT_NOTIFICATION_ID = 4102;
    private static final String MONITOR_CHANNEL = "codex_max_monitor";
    private static final String RESULT_CHANNEL = "codex_max_results";

    private final Context context;

    NotificationHelper(Context context) {
        this.context = context.getApplicationContext();
        createChannels();
    }

    Notification ongoing(String text) {
        return base(MONITOR_CHANNEL)
                .setContentTitle(context.getString(R.string.monitor_title))
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    void showFinished(TaskStateTracker.Event event) {
        boolean failed = event == TaskStateTracker.Event.FAILED;
        Notification notification = base(RESULT_CHANNEL)
                .setContentTitle(failed
                        ? context.getString(R.string.task_failed)
                        : context.getString(R.string.task_completed))
                .setContentText(context.getString(R.string.tap_to_open))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build();
        try {
            NotificationManagerCompat.from(context)
                    .notify(RESULT_NOTIFICATION_ID, notification);
        } catch (SecurityException ignored) {
        }
    }

    private NotificationCompat.Builder base(String channel) {
        Intent intent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(context, channel)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentIntent(pendingIntent)
                .setColor(context.getColor(R.color.primary))
                .setCategory(NotificationCompat.CATEGORY_SERVICE);
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel monitor = new NotificationChannel(
                MONITOR_CHANNEL,
                context.getString(R.string.monitor_channel),
                NotificationManager.IMPORTANCE_LOW
        );
        monitor.setDescription(context.getString(R.string.monitor_channel_description));
        NotificationChannel results = new NotificationChannel(
                RESULT_CHANNEL,
                context.getString(R.string.result_channel),
                NotificationManager.IMPORTANCE_HIGH
        );
        manager.createNotificationChannel(monitor);
        manager.createNotificationChannel(results);
    }
}
