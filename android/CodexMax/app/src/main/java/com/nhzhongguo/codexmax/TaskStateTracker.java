package com.nhzhongguo.codexmax;

final class TaskStateTracker {
    enum Event {
        NONE,
        COMPLETED,
        FAILED
    }

    static final class Snapshot {
        final boolean active;
        final String status;
        final String threadId;
        final String completedAt;

        Snapshot(boolean active, String status, String threadId, String completedAt) {
            this.active = active;
            this.status = status == null ? "" : status;
            this.threadId = threadId == null ? "" : threadId;
            this.completedAt = completedAt == null ? "" : completedAt;
        }
    }

    private boolean sawActive;
    private String lastNotificationKey = "";

    synchronized Event accept(Snapshot snapshot) {
        boolean running = snapshot.active
                || "running".equalsIgnoreCase(snapshot.status)
                || "waiting".equalsIgnoreCase(snapshot.status);
        if (running) {
            sawActive = true;
            return Event.NONE;
        }

        if (!sawActive) return Event.NONE;
        sawActive = false;

        Event event;
        if ("error".equalsIgnoreCase(snapshot.status)
                || "failed".equalsIgnoreCase(snapshot.status)) {
            event = Event.FAILED;
        } else if ("complete".equalsIgnoreCase(snapshot.status)
                || "completed".equalsIgnoreCase(snapshot.status)) {
            event = Event.COMPLETED;
        } else {
            return Event.NONE;
        }

        String key = snapshot.threadId + ":" + snapshot.completedAt + ":" + event;
        if (key.equals(lastNotificationKey)) return Event.NONE;
        lastNotificationKey = key;
        return event;
    }
}
