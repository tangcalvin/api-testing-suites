package com.philomath.api.store;

final class Text {

    private Text() {
    }

    static String trim(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
