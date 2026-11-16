package com.philomath.api.store;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HexFormat;

public final class ShipmentCursors {

    public static final String START = "0";
    private static final byte[] SECRET = "shipment-page-key".getBytes(StandardCharsets.UTF_8);

    private ShipmentCursors() {
    }

    public static long startId(String cursor) {
        if (cursor == null) {
            return 0L;
        }
        String text = cursor.trim();
        if (text.isEmpty() || START.equals(text)) {
            return 0L;
        }
        int dot = text.lastIndexOf('.');
        if (dot <= 0 || dot == text.length() - 1) {
            throw new IllegalArgumentException("nextCursor");
        }
        String payload = text.substring(0, dot);
        String given = text.substring(dot + 1);
        long id;
        try {
            id = Long.parseLong(new String(Base64.getUrlDecoder().decode(payload), StandardCharsets.UTF_8));
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("nextCursor");
        }
        if (id < 0 || !sign(id).equals(given)) {
            throw new IllegalArgumentException("nextCursor");
        }
        return id;
    }

    public static String encode(long id) {
        String payload = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(Long.toString(id).getBytes(StandardCharsets.UTF_8));
        return payload + "." + sign(id);
    }

    private static String sign(long id) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(SECRET, "HmacSHA256"));
            byte[] hash = mac.doFinal(Long.toString(id).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash).substring(0, 16);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}
