package com.philomath.api.web;

public class ShipmentNotFoundException extends RuntimeException {

    private final long id;

    public ShipmentNotFoundException(long id) {
        super("Shipment " + id + " was not found");
        this.id = id;
    }

    public long id() {
        return id;
    }
}
