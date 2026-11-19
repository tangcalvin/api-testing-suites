package com.philomath.api.dto;

public final class ShipmentCodes {

    public static final String OK = "0";
    public static final String MISSING = "ERR001";
    public static final String TYPE = "ERR002";
    public static final String VALUE = "ERR003";
    public static final String NOT_FOUND = "ERR004";
    public static final String MALFORMED = "ERR005";

    public static final String TYPE_ERROR = "E";
    public static final String TYPE_WARNING = "W";
    public static final String TYPE_INFO = "I";

    private ShipmentCodes() {
    }
}
