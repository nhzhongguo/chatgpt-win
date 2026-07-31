package com.nhzhongguo.codexmax;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class TaskStateTrackerTest {
    @Test
    public void notifiesOnceAfterRunningCompletes() {
        TaskStateTracker tracker = new TaskStateTracker();
        assertEquals(TaskStateTracker.Event.NONE, tracker.accept(snapshot(true, "running", "")));
        assertEquals(TaskStateTracker.Event.COMPLETED, tracker.accept(snapshot(false, "complete", "done")));
        assertEquals(TaskStateTracker.Event.NONE, tracker.accept(snapshot(false, "complete", "done")));
    }

    @Test
    public void doesNotNotifyForOldCompletionOnStartup() {
        TaskStateTracker tracker = new TaskStateTracker();
        assertEquals(TaskStateTracker.Event.NONE, tracker.accept(snapshot(false, "complete", "old")));
    }

    @Test
    public void reportsFailureAfterActiveTask() {
        TaskStateTracker tracker = new TaskStateTracker();
        tracker.accept(snapshot(true, "waiting", ""));
        assertEquals(TaskStateTracker.Event.FAILED, tracker.accept(snapshot(false, "error", "failed")));
    }

    private static TaskStateTracker.Snapshot snapshot(boolean active, String status, String completedAt) {
        return new TaskStateTracker.Snapshot(active, status, "thread-1", completedAt);
    }
}
