package com.nhzhongguo.codexmax;

import android.content.Context;
import android.content.SharedPreferences;

public final class ConnectionStore {
    private static final String PREFERENCES = "codex_max_connection";
    private static final String LAST_URL = "last_url";

    private final SharedPreferences preferences;

    public ConnectionStore(Context context) {
        preferences = context.getApplicationContext()
                .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    public String load() {
        return preferences.getString(LAST_URL, "");
    }

    public void save(String url) {
        preferences.edit().putString(LAST_URL, url).apply();
    }

    public void clear() {
        preferences.edit().remove(LAST_URL).apply();
    }
}
